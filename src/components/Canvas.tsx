import * as CM from '@radix-ui/react-context-menu';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { Analysis } from '../core/analyze';
import { autoLayout } from '../core/layout';
import {
  addState, addTransitions, formatLabel, formatLabels, isStateUsed, parseLabels, removeEdge, removeStates,
  renameState, reverseEdge, setEdgeLabels, setInitial, setNote, toggleAccepting,
} from '../core/model';
import type { Automaton, Label, Point, StateId, TransId } from '../core/types';
import { distToSegment, dragLine, edgeGeom, radius } from './geometry';
import { cx } from './ui';

export type Tool = 'select' | 'state' | 'transition';
export interface Selection {
  states: StateId[];
  edge: { from: StateId; to: StateId } | null;
}
export interface View {
  x: number;
  y: number;
  k: number;
}
export interface Highlight {
  states: Set<StateId>;
  trans: Set<TransId>;
  /** Passo atual e velocidade (passos/s): reinicia e cronometra a animação do percurso. */
  step: number;
  speed: number;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  a: Automaton;
  update(fn: (a: Automaton) => Automaton, record?: boolean): void;
  checkpoint(): void;
  undo(): void;
  tool: Tool;
  setTool(t: Tool): void;
  sel: Selection;
  setSel(s: Selection): void;
  view: View;
  setView(fn: (v: View) => View): void;
  highlight: Highlight | null;
  analysis: Analysis;
  svgRef: RefObject<SVGSVGElement | null>;
}

const GRID = 10;
const snap = (p: Point) => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID });
const NO_SEL: Selection = { states: [], edge: null };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View }
  | { kind: 'link'; from: StateId; start: Point; moved: boolean }
  | { kind: 'move'; start: Point; orig: Map<StateId, Point>; moved: boolean }
  | { kind: 'box'; start: Point; base: StateId[] };

type Editing =
  | { kind: 'edge'; from: StateId; to: StateId; isNew: boolean; text: string; at: Point }
  | { kind: 'rename' | 'note'; id: StateId; text: string; at: Point };

type Ctx = { kind: 'state'; id: StateId } | { kind: 'edge'; from: StateId; to: StateId } | { kind: 'empty'; p: Point };

const HELP: Record<Automaton['kind'], string> = {
  fa: 'Separe por vírgula · L = letra · D = dígito · outro · [a-z] · ? = vazio (ε)',
  pda: 'lido, topo, empilha — ex.: a, Z, AZ · várias com ; · ? = vazio',
  tm: 'lido, gravado, direção (E/D/P) — ex.: a, b, D · várias com ; · ? = branco',
};

export function fitView(a: Automaton, w: number, h: number): View {
  if (!a.states.length) return { x: w / 2 - 100, y: h / 2 - 200, k: 1 };
  const xs = a.states.map((s) => s.pos.x),
    ys = a.states.map((s) => s.pos.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 80, Math.max(...xs) + 80, Math.min(...ys) - 110, Math.max(...ys) + 80];
  const k = Math.min(1.5, Math.max(0.2, Math.min(w / (x1 - x0), h / (y1 - y0))));
  return { k, x: (w - (x1 + x0) * k) / 2, y: (h - (y1 + y0) * k) / 2 };
}

export function Canvas({ a, update, checkpoint, undo, tool, setTool, sel, setSel, view, setView, highlight, analysis, svgRef }: Props) {
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  const [link, setLink] = useState<{ from: StateId; p: Point } | null>(null);
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const [pending, setPending] = useState<StateId | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // O menu de contexto devolve o foco ao fechar; foca o campo depois disso.
  const editKey = editing && (editing.kind === 'edge' ? editing.from + editing.to : editing.kind + editing.id);
  useEffect(() => {
    if (!editKey) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [editKey]);

  const byId = useMemo(() => new Map(a.states.map((s) => [s.id, s])), [a.states]);
  const edges = useMemo(() => {
    const m = new Map<string, { from: StateId; to: StateId; labels: Label[]; ids: TransId[] }>();
    for (const t of a.transitions) {
      const k = t.from + '>' + t.to;
      if (!m.has(k)) m.set(k, { from: t.from, to: t.to, labels: [], ids: [] });
      m.get(k)!.labels.push(t.label);
      m.get(k)!.ids.push(t.id);
    }
    return [...m.values()];
  }, [a.transitions]);
  const hasEdge = (f: StateId, t: StateId) => a.transitions.some((x) => x.from === f && x.to === t);
  const geomOf = (f: StateId, t: StateId) => {
    const A = byId.get(f)!,
      B = byId.get(t)!;
    let bend = f !== t && hasEdge(t, f) ? 34 : 0;
    // reta que atravessaria outro estado vira curva
    if (f !== t && !bend)
      for (const s of a.states)
        if (s !== A && s !== B && distToSegment(s.pos, A.pos, B.pos) < radius(s.name) + 6)
          // desvia por baixo, já que os laços ficam em cima
          bend = (B.pos.x >= A.pos.x ? 1 : -1) * Math.max(Math.abs(bend), 2 * (radius(s.name) + 24));
    return edgeGeom(A.pos, B.pos, bend, radius(A.name), radius(B.name));
  };

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const stateAt = (p: Point) => [...a.states].reverse().find((s) => Math.hypot(s.pos.x - p.x, s.pos.y - p.y) <= radius(s.name) + 2);
  const hit = (e: { target: EventTarget }) => {
    const el = e.target as Element;
    const s = el.closest('[data-sid]')?.getAttribute('data-sid');
    const ed = el.closest('[data-eid]')?.getAttribute('data-eid');
    return { state: s ?? null, edge: ed ? { from: ed.split('>')[0], to: ed.split('>')[1] } : null };
  };

  // ---- ações ----

  const createState = (p: Point) => {
    let id = '';
    update((x) => {
      const r = addState(x, snap(p));
      id = r.id;
      return r.a;
    });
    setSel({ states: [id], edge: null });
  };

  const startEdge = (from: StateId, to: StateId) => {
    setEditing({ kind: 'edge', from, to, isNew: true, text: '', at: geomOf(from, to).label });
    setSel({ states: [], edge: { from, to } });
  };
  const editEdge = (from: StateId, to: StateId) => {
    const labels = a.transitions.filter((t) => t.from === from && t.to === to).map((t) => t.label);
    setEditing({ kind: 'edge', from, to, isNew: false, text: a.kind === 'fa' ? formatLabels('fa', labels) : labels.map(formatLabel).join('; '), at: geomOf(from, to).label });
  };
  const startRename = (id: StateId) => {
    const s = byId.get(id)!;
    setEditing({ kind: 'rename', id, text: s.name, at: s.pos });
  };

  const startNote = (id: StateId) => {
    const s = byId.get(id)!;
    setEditing({ kind: 'note', id, text: s.note ?? '', at: { x: s.pos.x, y: s.pos.y + radius(s.name) + 16 } });
  };

  const commit = () => {
    if (!editing) return;
    if (editing.kind === 'note') {
      update((x) => setNote(x, editing.id, editing.text));
      setEditing(null);
      return;
    }
    if (editing.kind === 'rename') {
      try {
        update((x) => renameState(x, editing.id, editing.text));
        setEditing(null);
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    if (editing.kind !== 'edge') return;
    const { from, to, isNew, text } = editing;
    if (!text.trim()) {
      if (!isNew) update((x) => removeEdge(x, from, to));
      setEditing(null);
      return;
    }
    const r = parseLabels(a.kind, text);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    update((x) => (isNew ? addTransitions(x, from, to, r.labels) : setEdgeLabels(x, from, to, r.labels)));
    setEditing(null);
  };

  const deleteSelection = () => {
    const ids = sel.states.filter((id) => byId.has(id));
    if (ids.length) {
      const used = ids.some((id) => isStateUsed(a, id));
      const names = ids.map((id) => byId.get(id)!.name).join(', ');
      update((x) => removeStates(x, ids));
      toast(`${ids.length > 1 ? 'Estados' : 'Estado'} ${names} excluído${ids.length > 1 ? 's' : ''}${used ? ' com as transições ligadas' : ''}.`, {
        action: { label: 'Desfazer', onClick: undo },
      });
    } else if (sel.edge) {
      const { from, to } = sel.edge;
      update((x) => removeEdge(x, from, to));
    }
    setSel(NO_SEL);
  };

  // ---- ponteiro ----

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2 || editing) return;
    const p = toWorld(e);
    const h = hit(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current || (e.pointerType === 'touch' && !h.state && !h.edge)) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: view };
      setPanning(true);
      return;
    }
    if (h.state) {
      const s = byId.get(h.state)!;
      const border = Math.hypot(p.x - s.pos.x, p.y - s.pos.y) > radius(s.name) - 8;
      if (tool === 'transition' || (border && !e.shiftKey)) {
        drag.current = { kind: 'link', from: s.id, start: p, moved: false };
        return;
      }
      // a seleção pode ter estados apagados por desfazer/tabela: ignora os que não existem
      const current = sel.states.filter((id) => byId.has(id));
      const states = current.includes(s.id) ? current : e.shiftKey ? [...current, s.id] : [s.id];
      setSel({ states, edge: null });
      drag.current = { kind: 'move', start: p, orig: new Map(states.map((id) => [id, byId.get(id)!.pos])), moved: false };
      return;
    }
    if (h.edge) {
      setSel({ states: [], edge: h.edge });
      return;
    }
    setPending(null);
    if (tool === 'state') return createState(p);
    if (!e.shiftKey) setSel(NO_SEL);
    drag.current = { kind: 'box', start: p, base: e.shiftKey ? sel.states : [] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setView(() => ({ ...d.v, x: d.v.x + e.clientX - d.sx, y: d.v.y + e.clientY - d.sy }));
      return;
    }
    const p = toWorld(e);
    if (d.kind === 'link') {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 4) d.moved = true;
      if (d.moved) setLink({ from: d.from, p });
    } else if (d.kind === 'move') {
      const dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      if (!d.moved) checkpoint();
      d.moved = true;
      update((x) => ({ ...x, states: x.states.map((s) => (d.orig.has(s.id) ? { ...s, pos: snap({ x: d.orig.get(s.id)!.x + dx, y: d.orig.get(s.id)!.y + dy }) } : s)) }), false);
    } else if (d.kind === 'box') {
      setBox({ a: d.start, b: p });
      const [x0, x1] = [Math.min(d.start.x, p.x), Math.max(d.start.x, p.x)];
      const [y0, y1] = [Math.min(d.start.y, p.y), Math.max(d.start.y, p.y)];
      const inside = a.states.filter((s) => s.pos.x >= x0 && s.pos.x <= x1 && s.pos.y >= y0 && s.pos.y <= y1).map((s) => s.id);
      setSel({ states: [...new Set([...d.base, ...inside])], edge: null });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    setLink(null);
    setBox(null);
    if (d?.kind !== 'link') return;
    if (d.moved) {
      const target = stateAt(toWorld(e));
      if (target) startEdge(d.from, target.id);
      return;
    }
    // clique simples: no modo transição define Fonte e depois Destino
    if (tool === 'transition') {
      if (pending) {
        startEdge(pending, d.from);
        setPending(null);
      } else {
        setPending(d.from);
        setSel({ states: [d.from], edge: null });
      }
    } else setSel({ states: [d.from], edge: null });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const h = hit(e);
    if (h.state && (e.target as Element).closest('[data-note]')) startNote(h.state);
    else if (h.state) startRename(h.state);
    else if (h.edge) editEdge(h.edge.from, h.edge.to);
    else createState(toWorld(e));
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const h = hit(e);
    if (h.state) {
      setCtx({ kind: 'state', id: h.state });
      if (!sel.states.includes(h.state)) setSel({ states: [h.state], edge: null });
    } else if (h.edge) {
      setCtx({ kind: 'edge', ...h.edge });
      setSel({ states: [], edge: h.edge });
    } else setCtx({ kind: 'empty', p: toWorld(e) });
  };

  // ---- zoom com a roda e teclado ----

  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(4, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgRef, setView]);

  const keys = useRef({ deleteSelection, setTool, setSel, a });
  keys.current = { deleteSelection, setTool, setSel, a };
  useEffect(() => {
    // teclas não valem enquanto se digita, num diálogo aberto, ou (espaço) sobre um botão focado
    const typing = (e: KeyboardEvent) =>
      (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') ||
      document.querySelector('dialog[open]') ||
      (e.key === ' ' && (e.target as HTMLElement).closest('button'));
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = keys.current;
      if (e.key === ' ') {
        space.current = true;
        setPanning(true);
        e.preventDefault();
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          k.setSel({ states: k.a.states.map((s) => s.id), edge: null });
        }
        return;
      }
      const tools: Record<string, Tool> = { v: 'select', s: 'state', t: 'transition' };
      if (tools[e.key.toLowerCase()]) {
        k.setTool(tools[e.key.toLowerCase()]);
        setPending(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') k.deleteSelection();
      else if (e.key === 'Escape') {
        setPending(null);
        k.setSel(NO_SEL);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        space.current = false;
        setPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => setPending(null), [tool]);

  // ---- desenho ----

  const unreachable = new Set(analysis.unreachable);
  const dead = new Set(analysis.dead);
  const init = a.initial ? byId.get(a.initial) : undefined;
  const screen = (p: Point) => ({ left: p.x * view.k + view.x, top: p.y * view.k + view.y });
  const hint =
    tool === 'transition'
      ? `Clique em algum estado para defini-lo como ${pending ? 'Destino' : 'Fonte'}`
      : tool === 'state'
        ? 'Clique no canvas para criar um estado'
        : null;

  return (
    <CM.Root modal={false} onOpenChange={(o) => !o && setCtx(null)}>
      <CM.Trigger asChild>
        <div className="relative h-full w-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
          <svg
            ref={svgRef}
            className={cx('h-full w-full touch-none select-none', panning ? 'cursor-grab' : tool === 'state' ? 'cursor-crosshair' : 'cursor-default')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            role="img"
            aria-label="Diagrama de estados"
          >
            <defs>
              <pattern id="dots" width={20 * view.k} height={20 * view.k} x={view.x} y={view.y} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={1} fill="var(--c-grid)" />
              </pattern>
              {(['stroke', 'accent'] as const).map((c) => (
                <marker key={c} id={`arrow-${c}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill={`var(--c-${c})`} />
                </marker>
              ))}
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" data-export-hide />
            <g data-content transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {init && (
                <path d={`M ${init.pos.x - radius(init.name) - 40} ${init.pos.y} L ${init.pos.x - radius(init.name) - 2} ${init.pos.y}`} stroke="var(--c-stroke)" strokeWidth={1.75} markerEnd="url(#arrow-stroke)" />
              )}
              {edges.map((ed) => {
                const g = geomOf(ed.from, ed.to);
                const used = ed.ids.some((id) => highlight?.trans.has(id));
                const selected = sel.edge?.from === ed.from && sel.edge?.to === ed.to;
                const lines = a.kind === 'fa' ? [compactSymbols(ed.labels.map(formatLabel))] : ed.labels.map(formatLabel);
                const bad = ed.ids.some((id) => analysis.outOfAlphabet.includes(id));
                return (
                  <g key={ed.from + ed.to} data-eid={`${ed.from}>${ed.to}`} className="cursor-pointer">
                    <path d={g.d} fill="none" stroke="transparent" strokeWidth={14} data-export-hide />
                    <path
                      d={g.d}
                      fill="none"
                      stroke={used || selected ? 'var(--c-accent)' : 'var(--c-stroke)'}
                      strokeWidth={used ? 2.5 : 1.5}
                      markerEnd={`url(#arrow-${used || selected ? 'accent' : 'stroke'})`}
                      className={used ? 'flow' : undefined}
                    />
                    <Chip at={g.label} lines={lines} active={used || selected} warn={bad} />
                    {used && highlight!.step > 0 && !reducedMotion() && (
                      // ponto que percorre a transição usada neste passo
                      <circle key={highlight!.step} r={5} fill="var(--c-accent)" data-export-hide>
                        <animateMotion ref={(el) => (el as SVGAnimationElement | null)?.beginElement()} begin="indefinite" dur={`${Math.min(0.6, 0.8 / highlight!.speed)}s`} fill="freeze" path={g.d} />
                      </circle>
                    )}
                  </g>
                );
              })}
              {a.states.map((s) => {
                const active = highlight?.states.has(s.id);
                const selected = sel.states.includes(s.id) || pending === s.id;
                const r = radius(s.name);
                return (
                  <g key={s.id} data-sid={s.id} transform={`translate(${s.pos.x} ${s.pos.y})`} className="cursor-pointer" opacity={dead.has(s.id) ? 0.55 : 1}>
                    {active && <circle r={r + 7} fill="none" stroke="var(--c-accent)" strokeWidth={4} className="pulse-ring" data-export-hide />}
                    {selected && <circle r={r + 5} fill="none" stroke="var(--c-accent)" strokeWidth={2} opacity={0.6} data-export-hide />}
                    <circle
                      r={r}
                      fill={active ? 'var(--c-accent-soft)' : 'var(--c-state)'}
                      stroke={active ? 'var(--c-accent)' : 'var(--c-stroke)'}
                      strokeWidth={active ? 2.25 : 1.5}
                      strokeDasharray={unreachable.has(s.id) ? '4 3' : undefined}
                    />
                    {s.accepting && <circle r={r - 5} fill="none" stroke={active ? 'var(--c-accent)' : 'var(--c-stroke)'} strokeWidth={1.5} />}
                    <text textAnchor="middle" dominantBaseline="central" fontSize={[...s.name].length > 4 ? 12 : 14} fontFamily="var(--font-mono)" fill="var(--c-text)" pointerEvents="none">
                      {s.name}
                    </text>
                    {s.note && <Note text={s.note} y={r + 16} />}
                  </g>
                );
              })}
              {link && byId.get(link.from) && (
                <path d={dragLine(byId.get(link.from)!.pos, link.p, radius(byId.get(link.from)!.name))} stroke="var(--c-accent)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#arrow-accent)" data-export-hide />
              )}
              {box && (
                <rect
                  x={Math.min(box.a.x, box.b.x)}
                  y={Math.min(box.a.y, box.b.y)}
                  width={Math.abs(box.a.x - box.b.x)}
                  height={Math.abs(box.a.y - box.b.y)}
                  fill="var(--c-accent)"
                  fillOpacity={0.08}
                  stroke="var(--c-accent)"
                  strokeDasharray="4 3"
                  data-export-hide
                />
              )}
            </g>
          </svg>

          {!a.states.length && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-zinc-400">
              <div>
                <p className="text-lg font-medium">Dê duplo clique para criar o primeiro estado</p>
                <p className="mt-1 text-sm">ou use a ferramenta Estado (S)</p>
              </div>
            </div>
          )}

          {hint && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/85 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100/90 dark:text-zinc-900">
              {hint}
            </div>
          )}

          {editing && (
            <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={screen(editing.at)}>
              <input
                autoFocus
                ref={inputRef}
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                onBlur={commit}
                onFocus={(e) => e.target.select()}
                aria-label={editing.kind === 'rename' ? 'Nome do estado' : editing.kind === 'note' ? 'Rótulo do estado' : 'Símbolos da transição'}
                placeholder={editing.kind === 'edge' ? (a.kind === 'fa' ? 'ex.: L, D  ou  outro' : a.kind === 'pda' ? 'a, Z, AZ' : 'a, b, D') : editing.kind === 'note' ? 'ex.: ERRO (vazio remove)' : ''}
                className="w-48 rounded-lg border border-violet-500 bg-white px-2 py-1 text-center font-mono text-sm shadow-lg outline-none ring-4 ring-violet-500/20 dark:bg-zinc-900"
              />
              {editing.kind === 'edge' && (
                <p className="mt-1 w-64 -translate-x-8 rounded-lg bg-zinc-900/90 px-2 py-1 text-center text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">{HELP[a.kind]}</p>
              )}
            </div>
          )}
        </div>
      </CM.Trigger>

      <CM.Portal>
        <CM.Content onCloseAutoFocus={(e) => e.preventDefault()} className="z-50 min-w-52 rounded-xl border border-zinc-200 bg-white p-1 text-sm shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          {ctx?.kind === 'state' && (
            <>
              <Item onSelect={() => update((x) => setInitial(x, ctx.id))} disabled={a.initial === ctx.id}>
                Marcar como estado de partida
              </Item>
              <Item onSelect={() => update((x) => toggleAccepting(x, ctx.id))}>
                {byId.get(ctx.id)?.accepting ? 'Desmarcar' : 'Marcar como'} estado de aceitação
              </Item>
              <Item onSelect={() => startEdge(ctx.id, ctx.id)}>Criar laço</Item>
              <Item onSelect={() => startRename(ctx.id)}>Renomear</Item>
              <Item onSelect={() => startNote(ctx.id)}>{byId.get(ctx.id)?.note ? 'Editar rótulo' : 'Adicionar rótulo (ex.: ERRO)'}</Item>
              <CM.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <Item danger onSelect={deleteSelection} shortcut="Del">
                Excluir
              </Item>
            </>
          )}
          {ctx?.kind === 'edge' && (
            <>
              <Item onSelect={() => editEdge(ctx.from, ctx.to)}>Editar símbolos</Item>
              <Item onSelect={() => update((x) => reverseEdge(x, ctx.from, ctx.to))} disabled={ctx.from === ctx.to}>
                Inverter o sentido
              </Item>
              <CM.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <Item danger onSelect={deleteSelection} shortcut="Del">
                Excluir
              </Item>
            </>
          )}
          {ctx?.kind === 'empty' && (
            <>
              <Item onSelect={() => createState(ctx.p)}>Criar estado aqui</Item>
              <Item onSelect={() => update((x) => autoLayout(x))} disabled={!a.states.length}>
                Organizar layout automaticamente
              </Item>
              <Item onSelect={() => setSel({ states: a.states.map((s) => s.id), edge: null })} shortcut="Ctrl+A">
                Selecionar tudo
              </Item>
            </>
          )}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

function Item({ children, onSelect, disabled, danger, shortcut }: { children: React.ReactNode; onSelect(): void; disabled?: boolean; danger?: boolean; shortcut?: string }) {
  return (
    <CM.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cx(
        'flex cursor-default items-center justify-between gap-4 rounded-lg px-2.5 py-1.5 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800',
        danger && 'text-red-600 dark:text-red-400',
      )}
    >
      {children}
      {shortcut && <span className="font-mono text-xs text-zinc-400">{shortcut}</span>}
    </CM.Item>
  );
}

/** "0, 1, 2, …, 9" → "0-9" (só na exibição; 3+ caracteres consecutivos viram intervalo). */
function compactSymbols(syms: string[]): string {
  const sorted = [...syms].sort((x, y) => x.codePointAt(0)! - y.codePointAt(0)!);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    const single = (x: string) => [...x].length === 1 && x !== 'L' && x !== 'D';
    while (j + 1 < sorted.length && single(sorted[j]) && single(sorted[j + 1]) && sorted[j + 1].codePointAt(0) === sorted[j].codePointAt(0)! + 1) j++;
    out.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/** Caixinha de rótulo sob o estado, como "ERRO" / "NUM_INT" nos slides. */
function Note({ text, y }: { text: string; y: number }) {
  const w = [...text].length * 6.9 + 14;
  return (
    <g data-note transform={`translate(0 ${y})`} className="cursor-text">
      <rect x={-w / 2} y={-10} width={w} height={20} rx={5} fill="var(--c-accent-soft)" stroke="var(--c-accent)" strokeWidth={1} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fontFamily="var(--font-mono)" fill="var(--c-accent)">
        {text}
      </text>
    </g>
  );
}

function Chip({ at, lines, active, warn }: { at: Point; lines: string[]; active: boolean; warn: boolean }) {
  const w = Math.max(...lines.map((l) => l.length)) * 7.3 + 14;
  const h = lines.length * 16 + 6;
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7} fill="var(--c-chip)" stroke={warn ? 'var(--c-reject)' : active ? 'var(--c-accent)' : 'var(--c-grid)'} strokeWidth={1} />
      {lines.map((l, i) => (
        <text key={i} y={-h / 2 + 11 + i * 16} textAnchor="middle" dominantBaseline="central" fontSize={12} fontFamily="var(--font-mono)" fill={active ? 'var(--c-accent)' : 'var(--c-text)'}>
          {l}
        </text>
      ))}
    </g>
  );
}
