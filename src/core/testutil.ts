import { run } from './sim';
import type { Automaton } from './types';

/** Todas as palavras sobre o alfabeto até o tamanho n. */
export function words(sigma: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => sigma.map((s) => w + s));
    out.push(...level);
  }
  return out;
}

export const accepts = (a: Automaton, w: string) => run(a, w).verdict === 'accept';

/** Palavras em que dois autômatos discordam (vazia = equivalentes até o tamanho n). */
export const differences = (a: Automaton, b: Automaton, sigma: string[], n = 6) =>
  words(sigma, n).filter((w) => accepts(a, w) !== accepts(b, w));
