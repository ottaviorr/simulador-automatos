import type { Automaton, StateId } from './types';

/** Layout em camadas por BFS a partir do estado de partida (estados soltos vão para o fim). */
export function autoLayout<A extends Automaton>(a: A, gapX = 190, gapY = 130): A {
  const layer = new Map<StateId, number>();
  const order = [a.initial, ...a.states.map((s) => s.id)].filter((x): x is StateId => !!x);
  for (const root of order) {
    if (layer.has(root)) continue;
    const base = layer.size ? Math.max(...layer.values()) + 1 : 0;
    layer.set(root, base);
    const queue = [root];
    while (queue.length) {
      const s = queue.shift()!;
      for (const t of a.transitions)
        if (t.from === s && !layer.has(t.to)) {
          layer.set(t.to, layer.get(s)! + 1);
          queue.push(t.to);
        }
    }
  }
  const cols = new Map<number, StateId[]>();
  for (const s of a.states) {
    const l = layer.get(s.id)!;
    cols.set(l, [...(cols.get(l) ?? []), s.id]);
  }
  const tallest = Math.max(1, ...[...cols.values()].map((c) => c.length));
  const pos = new Map<StateId, { x: number; y: number }>();
  for (const [l, ids] of cols)
    ids.forEach((id, i) =>
      pos.set(id, { x: 100 + l * gapX, y: 100 + ((tallest - ids.length) * gapY) / 2 + i * gapY }),
    );
  return { ...a, states: a.states.map((s) => ({ ...s, pos: pos.get(s.id)! })) };
}
