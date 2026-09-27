import { Circle, Columns2, FileImage, FileType2, LayoutGrid, Maximize, MousePointer2, PanelRightClose, PanelRightOpen, Redo2, Spline, Table2, Undo2, Workflow, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../core/analyze';
import { EXAMPLES } from '../core/examples';
import { autoLayout } from '../core/layout';
import type { Automaton, Doc } from '../core/types';
import { exportPng, exportSvg } from '../files';
import { useStore } from '../store';
import { Canvas, fitView, type Highlight, type Selection, type Tool, type View } from './Canvas';
import { ConvertPanel, PropsPanel } from './Panels';
import { SimPanel } from './SimPanel';
import { TransitionTable } from './TransitionTable';
import { Badge, IconButton, cx } from './ui';

type Tab = 'sim' | 'props' | 'convert';
export type ViewMode = 'diagram' | 'table' | 'split';

/** Ações do editor ativo, usadas pela paleta de comandos (Ctrl+K). */
export const editorApi: {
  current: null | { setMode(m: ViewMode): void; setTab(t: Tab): void; exportPng(): void; exportSvg(): void; fit(): void; layout(): void; togglePanel(): void };
} = { current: null };
const TABS: [Tab, string][] = [
  ['sim', 'Simular'],
  ['props', 'Propriedades'],
  ['convert', 'Ferramentas'],
];

export function Editor({ doc }: { doc: Doc & { data: Automaton } }) {
  const a = doc.data;
  const { update, checkpoint, undo, redo, rename } = useStore.getState();
  const history = useStore((s) => s.history[doc.id]);
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Selection>({ states: [], edge: null });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [panel, setPanel] = useState(() => window.innerWidth >= 768);
  const [tab, setTab] = useState<Tab>('props');
  const [mode, setMode] = useState<ViewMode>('diagram');
  const svgRef = useRef<SVGSVGElement>(null);
  const analysis = useMemo(() => analyze(a), [a]);

  const upd = useCallback((fn: (a: Automaton) => Automaton, record?: boolean) => update((d) => fn(d as Automaton), record), [update]);
  const fit = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) setView(fitView(useStore.getState().docs.find((d) => d.id === doc.id)!.data as Automaton, r.width, r.height));
  }, [doc.id]);

  // Ao trocar de documento: enquadra o diagrama e limpa a seleção.
  useEffect(() => {
    fit();
    setSel({ states: [], edge: null });
  }, [doc.id, fit]);

  const zoom = (f: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    setView((v) => {
      const k = Math.min(4, Math.max(0.2, v.k * f));
      return { k, x: r.width / 2 - ((r.width / 2 - v.x) * k) / v.k, y: r.height / 2 - ((r.height / 2 - v.y) * k) / v.k };
    });
  };

  // a exportação mede o SVG: com só a tabela visível ele não tem tamanho, então mostra o diagrama antes
  const doExport = useCallback(
    (fn: typeof exportPng) => {
      setMode((m) => (m === 'table' ? 'split' : m));
      requestAnimationFrame(() => fn(svgRef.current!, doc.title));
    },
    [doc.title],
  );

  useEffect(() => {
    editorApi.current = {
      setMode,
      setTab: (t) => {
        setTab(t);
        setPanel(true);
      },
      exportPng: () => doExport(exportPng),
      exportSvg: () => doExport(exportSvg),
      fit,
      layout: () => upd((x) => autoLayout(x)),
      togglePanel: () => setPanel((p) => !p),
    };
    return () => {
      editorApi.current = null;
    };
  }, [doExport, fit, upd]);

  const kindBadge = a.kind === 'fa' ? (analysis.deterministic ? 'AFD' : 'AFN') : a.kind === 'pda' ? 'Autômato com Pilha' : 'Máquina de Turing';

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1">
        {mode !== 'diagram' && (
          <div className={cx('min-w-0 bg-white dark:bg-zinc-950', mode === 'table' ? 'flex-1' : 'w-1/2 border-r border-zinc-200 dark:border-zinc-800')}>
            <TransitionTable a={a} update={upd} highlight={highlight} />
          </div>
        )}
        <div className={cx('relative min-w-0 flex-1', mode === 'table' && 'hidden')}>
        <Canvas
          a={a}
          update={upd}
          checkpoint={checkpoint}
          undo={undo}
          tool={tool}
          setTool={setTool}
          sel={sel}
          setSel={setSel}
          view={view}
          setView={setView}
          highlight={highlight}
          analysis={analysis}
          svgRef={svgRef}
        />
        </div>

        <div className="absolute left-3 top-16 flex items-center gap-2 md:top-3">
          <Badge tone="accent" className="px-3 py-1 text-sm shadow-sm">
            {kindBadge}
          </Badge>
        </div>

        <div role="toolbar" aria-label="Ferramentas" className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-zinc-200 bg-white/90 p-1 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <IconButton label="Diagrama" active={mode === 'diagram'} onClick={() => setMode('diagram')}>
            <Workflow size={17} />
          </IconButton>
          <IconButton label="Tabela de transições" active={mode === 'table'} onClick={() => setMode('table')}>
            <Table2 size={17} />
          </IconButton>
          <IconButton label="Lado a lado" active={mode === 'split'} onClick={() => setMode('split')} className="max-md:hidden">
            <Columns2 size={17} />
          </IconButton>
          <Divider />
          <IconButton label="Selecionar / mover" shortcut="V" active={tool === 'select'} onClick={() => setTool('select')}>
            <MousePointer2 size={17} />
          </IconButton>
          <IconButton label="Criar estado" shortcut="S" active={tool === 'state'} onClick={() => setTool('state')}>
            <Circle size={17} />
          </IconButton>
          <IconButton label="Criar transição" shortcut="T" active={tool === 'transition'} onClick={() => setTool('transition')}>
            <Spline size={17} />
          </IconButton>
          <Divider />
          <IconButton label="Desfazer" shortcut="Ctrl+Z" onClick={undo} disabled={!history?.past.length}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Refazer" shortcut="Ctrl+Y" onClick={redo} disabled={!history?.future.length}>
            <Redo2 size={17} />
          </IconButton>
          <Divider />
          <IconButton label="Diminuir zoom" onClick={() => zoom(1 / 1.2)} className="max-sm:hidden">
            <ZoomOut size={17} />
          </IconButton>
          <IconButton label="Aumentar zoom" onClick={() => zoom(1.2)} className="max-sm:hidden">
            <ZoomIn size={17} />
          </IconButton>
          <IconButton label="Enquadrar diagrama" onClick={fit}>
            <Maximize size={17} />
          </IconButton>
          <IconButton label="Organizar layout automaticamente" onClick={() => upd((x) => autoLayout(x))} disabled={!a.states.length}>
            <LayoutGrid size={17} />
          </IconButton>
          <Divider />
          <IconButton label="Exportar PNG" onClick={() => doExport(exportPng)} disabled={!a.states.length} className="max-sm:hidden">
            <FileImage size={17} />
          </IconButton>
          <IconButton label="Exportar SVG" onClick={() => doExport(exportSvg)} disabled={!a.states.length} className="max-sm:hidden">
            <FileType2 size={17} />
          </IconButton>
        </div>

        <div className="absolute right-3 top-3">
          <IconButton label={panel ? 'Esconder painel' : 'Mostrar painel'} onClick={() => setPanel(!panel)} className="bg-white/90 shadow-sm dark:bg-zinc-900/90">
            {panel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </IconButton>
        </div>

        <div hidden={mode === 'table'} className="absolute bottom-3 left-3 rounded-lg bg-white/80 px-2 py-1 font-mono text-xs text-zinc-500 dark:bg-zinc-900/80">{Math.round(view.k * 100)}%</div>
      </div>

      {panel && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-white max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:w-[min(100%,20rem)] max-md:shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <div role="tablist" className="flex gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  'flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
                  tab === id ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
                )}
              >
                {label}
              </button>
            ))}
            <button className="rounded-lg px-2 text-zinc-500 md:hidden" onClick={() => setPanel(false)} aria-label="Fechar painel">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'sim' && <SimPanel key={doc.id} a={a} onHighlight={setHighlight} suggest={EXAMPLES.find((e) => e.title === doc.title)?.tests} />}
            {tab === 'props' && <PropsPanel doc={doc} a={a} sel={sel} analysis={analysis} update={upd} rename={(t) => rename(doc.id, t)} />}
            {tab === 'convert' && <ConvertPanel doc={doc} a={a} />}
          </div>
        </aside>
      )}
    </div>
  );
}

const Divider = () => <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-800" />;
