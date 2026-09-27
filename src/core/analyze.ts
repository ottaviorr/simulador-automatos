import { OUTRO, overlaps } from './symbols';
import { EPS, type Automaton, type FA, type StateId, type Sym, type TransId } from './types';

export interface Analysis {
  noInitial: boolean;
  /** Inalcançáveis a partir do estado de partida. */
  unreachable: StateId[];
  /** Estados a partir dos quais nenhum estado de aceitação é alcançável. */
  dead: StateId[];
  /** Transições cujo símbolo lido está fora do alfabeto declarado. */
  outOfAlphabet: TransId[];
  /** Só para AF. */
  deterministic?: boolean;
  /** Só para AF determinístico: pares (estado, símbolo) sem transição. */
  missing?: { state: StateId; sym: Sym }[];
}

function reach(start: StateId[], edges: [StateId, StateId][]): Set<StateId> {
  const seen = new Set(start);
  const stack = [...start];
  while (stack.length) {
    const s = stack.pop()!;
    for (const [f, t] of edges) if (f === s && !seen.has(t)) seen.add(t), stack.push(t);
  }
  return seen;
}

/** Símbolos de entrada: declarados ou, se não houver, os lidos nas transições (sem '?'). */
export function inputAlphabet(a: Automaton): Sym[] {
  if (a.alphabet?.length) return a.alphabet;
  const blank = a.kind === 'tm' ? a.blank : null;
  const syms = new Set<Sym>();
  for (const t of a.transitions) if (t.label.read !== EPS && t.label.read !== blank) syms.add(t.label.read);
  return [...syms].sort();
}

export function isDeterministic(a: FA): boolean {
  const bySource = new Map<StateId, string[]>();
  for (const t of a.transitions) {
    if (t.label.read === EPS) return false;
    const syms = bySource.get(t.from) ?? [];
    // mesmo símbolo duas vezes, ou símbolos que se sobrepõem (ex.: L e a)
    if (syms.some((s) => overlaps(s, t.label.read))) return false;
    bySource.set(t.from, [...syms, t.label.read]);
  }
  return true;
}

export function analyze(a: Automaton): Analysis {
  const edges = a.transitions.map((t): [StateId, StateId] => [t.from, t.to]);
  const reachable = a.initial ? reach([a.initial], edges) : new Set<StateId>();
  const alive = reach(
    a.states.filter((s) => s.accepting).map((s) => s.id),
    edges.map(([f, t]) => [t, f]),
  );
  const declared = a.alphabet?.length && a.kind !== 'tm' ? new Set(a.alphabet) : null;

  const out: Analysis = {
    noInitial: !a.initial,
    unreachable: a.initial ? a.states.filter((s) => !reachable.has(s.id)).map((s) => s.id) : [],
    dead: a.kind === 'tm' ? [] : a.states.filter((s) => !alive.has(s.id)).map((s) => s.id),
    outOfAlphabet: declared
      ? a.transitions.filter((t) => t.label.read !== EPS && !declared.has(t.label.read)).map((t) => t.id)
      : [],
  };
  if (a.kind === 'fa') {
    out.deterministic = isDeterministic(a);
    if (out.deterministic) {
      const sigma = inputAlphabet(a);
      out.missing = a.states
        // um estado com "outro" já cobre qualquer símbolo
        .filter((s) => !a.transitions.some((t) => t.from === s.id && t.label.read === OUTRO))
        .flatMap((s) =>
        sigma
          .filter((sym) => sym !== OUTRO && !a.transitions.some((t) => t.from === s.id && t.label.read === sym))
          .map((sym) => ({ state: s.id, sym })),
      );
    }
  }
  return out;
}
