import { faSymbol } from './symbols';
import {
  EPS,
  type Automaton,
  type AutomatonKind,
  type AnyTransition,
  type FA,
  type FaLabel,
  type Label,
  type Move,
  type PdaLabel,
  type Point,
  type StateId,
  type TmLabel,
  type TransId,
} from './types';

export const newId = () => crypto.randomUUID();

export const DEFAULT_BLANK = '□';

export function emptyAutomaton(kind: AutomatonKind): Automaton {
  const base = { states: [], transitions: [], initial: null };
  if (kind === 'tm') return { kind, ...base, blank: DEFAULT_BLANK };
  return { kind, ...base };
}

// Operações de edição: puras, sempre retornam um novo autômato.

const trans = (a: Automaton) => a.transitions as AnyTransition[];
const withTrans = <A extends Automaton>(a: A, t: AnyTransition[]): A => ({ ...a, transitions: t }) as A;

export function stateByName(a: Automaton, name: string) {
  return a.states.find((s) => s.name === name);
}

export function nextStateName(a: Automaton, prefix = 'q'): string {
  for (let i = 0; ; i++) if (!stateByName(a, prefix + i)) return prefix + i;
}

export function addState<A extends Automaton>(a: A, pos: Point, name = nextStateName(a)): { a: A; id: StateId } {
  const id = newId();
  const initial = a.initial ?? id; // o primeiro estado criado vira o de partida
  return { a: { ...a, initial, states: [...a.states, { id, name, pos, accepting: false }] }, id };
}

/** Estados ligados por alguma transição. A UI usa para avisar antes de excluir. */
export const isStateUsed = (a: Automaton, id: StateId) => trans(a).some((t) => t.from === id || t.to === id);

export function removeStates<A extends Automaton>(a: A, ids: StateId[]): A {
  const del = new Set(ids);
  return withTrans(
    {
      ...a,
      states: a.states.filter((s) => !del.has(s.id)),
      initial: a.initial && del.has(a.initial) ? null : a.initial,
    },
    trans(a).filter((t) => !del.has(t.from) && !del.has(t.to)),
  );
}

export function renameState<A extends Automaton>(a: A, id: StateId, name: string): A {
  name = name.trim();
  if (!name) throw new Error('O nome do estado não pode ser vazio.');
  const other = stateByName(a, name);
  if (other && other.id !== id) throw new Error('Este nome já está sendo usado em outro estado.');
  return { ...a, states: a.states.map((s) => (s.id === id ? { ...s, name } : s)) };
}

export const setInitial = <A extends Automaton>(a: A, id: StateId | null): A => ({ ...a, initial: id });

export const toggleAccepting = <A extends Automaton>(a: A, id: StateId): A => ({
  ...a,
  states: a.states.map((s) => (s.id === id ? { ...s, accepting: !s.accepting } : s)),
});

/** Define o rótulo livre do estado; texto vazio remove. */
export function setNote<A extends Automaton>(a: A, id: StateId, note: string): A {
  const n = note.trim();
  return {
    ...a,
    states: a.states.map((s) => {
      if (s.id !== id) return s;
      const { note: _, ...rest } = s;
      return n ? { ...rest, note: n } : rest;
    }),
  };
}

/** Tabela de transições do AF: substitui os destinos de (estado, símbolo). */
export function setTargets<A extends Automaton & { kind: 'fa' }>(a: A, from: StateId, read: string, to: StateId[]): A {
  const kept = a.transitions.filter((t) => !(t.from === from && t.label.read === read));
  return { ...a, transitions: [...kept, ...[...new Set(to)].map((t) => ({ id: newId(), from, to: t, label: { read } }))] };
}

/** Altera origem, destino ou rótulo de uma transição (tabela do AP/MT). */
export function updateTransition<A extends Automaton>(a: A, id: TransId, patch: Partial<Pick<AnyTransition, 'from' | 'to' | 'label'>>): A {
  return withTrans(
    a,
    trans(a).map((t) => (t.id === id ? ({ ...t, ...patch } as AnyTransition) : t)),
  );
}

export function moveStates<A extends Automaton>(a: A, ids: StateId[], dx: number, dy: number): A {
  const set = new Set(ids);
  return {
    ...a,
    states: a.states.map((s) => (set.has(s.id) ? { ...s, pos: { x: s.pos.x + dx, y: s.pos.y + dy } } : s)),
  };
}

const sameLabel = (x: Label, y: Label) => JSON.stringify(x) === JSON.stringify(y);

/** Adiciona rótulos à aresta from→to, ignorando duplicados. */
export function addTransitions<A extends Automaton>(a: A, from: StateId, to: StateId, labels: Label[]): A {
  const t = [...trans(a)];
  for (const label of labels) {
    if (t.some((x) => x.from === from && x.to === to && sameLabel(x.label, label))) continue;
    t.push({ id: newId(), from, to, label } as AnyTransition);
  }
  return withTrans(a, t);
}

/** Substitui todos os rótulos da aresta from→to (edição inline do chip). Lista vazia remove a aresta. */
export function setEdgeLabels<A extends Automaton>(a: A, from: StateId, to: StateId, labels: Label[]): A {
  return addTransitions(removeEdge(a, from, to), from, to, labels);
}

export const edgeTransitions = (a: Automaton, from: StateId, to: StateId) =>
  trans(a).filter((t) => t.from === from && t.to === to);

export const removeEdge = <A extends Automaton>(a: A, from: StateId, to: StateId): A =>
  withTrans(
    a,
    trans(a).filter((t) => !(t.from === from && t.to === to)),
  );

export const removeTransitions = <A extends Automaton>(a: A, ids: TransId[]): A =>
  withTrans(
    a,
    trans(a).filter((t) => !ids.includes(t.id)),
  );

/** Inverte o sentido da aresta from→to, juntando com a aresta oposta se já existir. */
export function reverseEdge<A extends Automaton>(a: A, from: StateId, to: StateId): A {
  const labels = edgeTransitions(a, from, to).map((t) => t.label);
  return addTransitions(removeEdge(a, from, to), to, from, labels);
}

// Rótulos em texto: AF "a, b"; AP "a, Z, AZ"; MT "a, b, D". Vários rótulos de AP/MT por linha ou ';'.

export function formatLabel(label: Label): string {
  if ('move' in label) return `${label.read}, ${label.write}, ${label.move}`;
  if ('pop' in label) return `${label.read}, ${label.pop}, ${label.push}`;
  return label.read;
}

export function formatLabels(kind: AutomatonKind, labels: Label[]): string {
  return labels.map(formatLabel).join(kind === 'fa' ? ', ' : '\n');
}

const MOVES: Record<string, Move> = { E: 'E', L: 'E', D: 'D', R: 'D', P: 'P', S: 'P' };

export function parseLabels(
  kind: AutomatonKind,
  text: string,
): { ok: true; labels: Label[] } | { ok: false; error: string } {
  const one = (s: string, what: string) => {
    if ([...s].length !== 1) throw new Error(`${what} deve ser um único caractere (use ${EPS} para vazio): "${s}"`);
    return s;
  };
  try {
    if (kind === 'fa') {
      const tokens = text.split(/[\s,;]+/).filter(Boolean);
      if (!tokens.length) throw new Error(`Informe ao menos um símbolo (use ${EPS} para transição vazia).`);
      return { ok: true, labels: tokens.map((s): FaLabel => ({ read: faSymbol(s) })) };
    }
    const groups = text
      .split(/[;\n]/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (!groups.length) throw new Error('Informe ao menos uma transição.');
    const labels = groups.map((g): Label => {
      const f = g.split(/[,/]/).map((x) => x.trim() || EPS);
      if (f.length !== 3)
        throw new Error(
          kind === 'pda'
            ? `Use "lido, topo, empilha" (ex.: a, Z, AZ): "${g}"`
            : `Use "lido, gravado, direção" (ex.: a, b, D): "${g}"`,
        );
      if (kind === 'pda') {
        return { read: one(f[0], 'Símbolo lido'), pop: one(f[1], 'Topo da pilha'), push: f[2] } satisfies PdaLabel;
      }
      const move = MOVES[f[2].toUpperCase()];
      if (!move) throw new Error(`Direção deve ser E, D ou P: "${f[2]}"`);
      return { read: one(f[0], 'Símbolo lido'), write: one(f[1], 'Símbolo gravado'), move } satisfies TmLabel;
    });
    return { ok: true, labels };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** AF a partir de nomes e triplas [de, símbolo, para], sem interpretar texto (usado nas conversões). */
export function rawFA(names: string[], initial: string, accepting: string[], edges: [string, string, string][]): FA {
  const ids = new Map(names.map((n) => [n, newId()]));
  const acc = new Set(accepting);
  return {
    kind: 'fa',
    states: names.map((n, i) => ({ id: ids.get(n)!, name: n, pos: { x: 100 + 150 * i, y: 200 }, accepting: acc.has(n) })),
    transitions: edges.map(([f, read, t]) => ({ id: newId(), from: ids.get(f)!, to: ids.get(t)!, label: { read } })),
    initial: ids.get(initial)!,
  };
}

/** Monta um AF a partir de uma lista compacta. Usado em testes, exemplos e conversões. */
export function buildFA(spec: {
  states: string[];
  initial?: string;
  accepting?: string[];
  transitions: [string, string, string][]; // [de, símbolo(s) "a,b", para]
}): FA {
  return build('fa', spec.states, spec.initial, spec.accepting, spec.transitions) as FA;
}

export function build(
  kind: AutomatonKind,
  names: string[],
  initial: string | undefined,
  accepting: string[] = [],
  transitions: [string, string, string][],
): Automaton {
  let a = emptyAutomaton(kind);
  names.forEach((n, i) => (a = addState(a, { x: 100 + 150 * i, y: 200 }, n).a));
  a = { ...a, initial: initial ? stateByName(a, initial)!.id : a.states[0]?.id ?? null };
  a = { ...a, states: a.states.map((s) => ({ ...s, accepting: accepting.includes(s.name) })) };
  for (const [from, text, to] of transitions) {
    const p = parseLabels(kind, text);
    if (!p.ok) throw new Error(p.error);
    const f = stateByName(a, from),
      t = stateByName(a, to);
    if (!f || !t) throw new Error(`Estado inexistente em ${from} -> ${to}`);
    a = addTransitions(a, f.id, t.id, p.labels);
  }
  return a;
}
