import { inputAlphabet, isDeterministic } from './analyze';
import { autoLayout } from './layout';
import { rawFA } from './model';
import { EPS, type FA, type StateId } from './types';

const setName = (names: string[]) => `{${names.join(',')}}`;

/** AFN → AFD por construção de subconjuntos (com fecho-ε). O conjunto vazio é omitido. */
export function nfaToDfa(a: FA): FA {
  if (!a.initial) throw new Error('Estado de partida não definido.');
  const order = new Map(a.states.map((s, i) => [s.id, i]));
  const byId = new Map(a.states.map((s) => [s.id, s]));
  const sort = (xs: Iterable<StateId>) => [...new Set(xs)].sort((x, y) => order.get(x)! - order.get(y)!);

  const closure = (xs: StateId[]) => {
    const out = new Set(xs);
    const stack = [...xs];
    while (stack.length) {
      const s = stack.pop()!;
      for (const t of a.transitions)
        if (t.from === s && t.label.read === EPS && !out.has(t.to)) out.add(t.to), stack.push(t.to);
    }
    return sort(out);
  };
  const label = (set: StateId[]) => setName(set.map((s) => byId.get(s)!.name));

  const sigma = inputAlphabet(a);
  const start = closure([a.initial]);
  const sets = new Map([[label(start), start]]);
  const queue = [start];
  const edges: [string, string, string][] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const sym of sigma) {
      const next = closure(a.transitions.filter((t) => cur.includes(t.from) && t.label.read === sym).map((t) => t.to));
      if (!next.length) continue;
      const k = label(next);
      if (!sets.has(k)) sets.set(k, next), queue.push(next);
      edges.push([label(cur), sym, k]);
    }
  }
  const accepting = [...sets].filter(([, set]) => set.some((s) => byId.get(s)!.accepting)).map(([k]) => k);
  return autoLayout(rawFA([...sets.keys()], label(start), accepting, edges));
}

export interface Minimization {
  dfa: FA;
  /** Partições a cada rodada do algoritmo (nomes dos estados originais; ∅ = estado de erro implícito). */
  rounds: string[][][];
}

/** Minimização de AFD por refinamento de partições (Moore). */
export function minimizeDfa(a: FA): Minimization {
  if (!a.initial) throw new Error('Estado de partida não definido.');
  if (!isDeterministic(a))
    throw new Error('O autômato não é determinístico. Converta para AFD antes de minimizar.');
  const sigma = inputAlphabet(a);
  const TRAP = '∅';

  // Só estados alcançáveis; completa com o estado de erro se faltar transição.
  const reach = [a.initial];
  const delta = new Map<string, string>();
  for (let i = 0; i < reach.length; i++)
    for (const t of a.transitions)
      if (t.from === reach[i]) {
        delta.set(t.from + '\u0000' + t.label.read, t.to);
        if (!reach.includes(t.to)) reach.push(t.to);
      }
  const states = [...reach];
  const d = (s: string, sym: string) => delta.get(s + '\u0000' + sym) ?? TRAP;
  const trapUsed = states.some((s) => sigma.some((sym) => !delta.has(s + '\u0000' + sym)));
  if (trapUsed) states.push(TRAP);

  const byId = new Map(a.states.map((s) => [s.id, s]));
  const name = (s: string) => (s === TRAP ? TRAP : byId.get(s)!.name);
  const acc = (s: string) => s !== TRAP && byId.get(s)!.accepting;

  let groups = [states.filter(acc), states.filter((s) => !acc(s))].filter((g) => g.length);
  const rounds = [groups.map((g) => g.map(name))];
  for (;;) {
    const groupOf = new Map<string, number>();
    groups.forEach((g, i) => g.forEach((s) => groupOf.set(s, i)));
    const next: string[][] = [];
    for (const g of groups) {
      const split = new Map<string, string[]>();
      for (const s of g) {
        const sig = sigma.map((sym) => groupOf.get(d(s, sym))).join(',');
        split.set(sig, [...(split.get(sig) ?? []), s]);
      }
      next.push(...split.values());
    }
    if (next.length === groups.length) break;
    groups = next;
    rounds.push(groups.map((g) => g.map(name)));
  }

  // O grupo do estado de erro que nós criamos é descartado (fica um AFD parcial, como o original).
  const rank = (g: string[]) => Math.min(...g.map((s) => (s === TRAP ? Infinity : reach.indexOf(s))));
  const kept = groups
    .filter((g) => !(trapUsed && g.includes(TRAP) && !g.includes(a.initial!)))
    .sort((x, y) => rank(x) - rank(y));
  const gname = (g: string[]) => (g.length === 1 ? name(g[0]) : setName(g.map(name)));
  const of = new Map<string, string>();
  kept.forEach((g) => g.forEach((s) => of.set(s, gname(g))));
  const edges: [string, string, string][] = [];
  for (const g of kept)
    for (const sym of sigma) {
      const to = of.get(d(g[0], sym));
      if (to) edges.push([gname(g), sym, to]);
    }
  const dfa = rawFA(
    kept.map(gname),
    of.get(a.initial)!,
    kept.filter((g) => acc(g[0])).map(gname),
    edges,
  );
  return { dfa: autoLayout(dfa), rounds };
}
