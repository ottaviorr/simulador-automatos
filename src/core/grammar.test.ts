import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { faToGrammar, grammarToFa, parseGrammar, printGrammar } from './grammar';
import { buildFA } from './model';
import { accepts, differences } from './testutil';
import type { FA, Grammar, GrammarDoc } from './types';

const ok = (text: string): Grammar => {
  const r = parseGrammar(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe('parser de gramática', () => {
  it('lê alternativas, ε, variáveis <nome> e setas alternativas', () => {
    const g = ok('S -> aA | b | ?\nA → b<Q1> | ε\n\n<Q1> ::= abc | λ');
    expect(g.start).toBe('S');
    expect(g.productions).toEqual([
      { head: 'S', body: ['a', 'A'] },
      { head: 'S', body: ['b'] },
      { head: 'S', body: [] },
      { head: 'A', body: ['b', '<Q1>'] },
      { head: 'A', body: [] },
      { head: '<Q1>', body: ['a', 'b', 'c'] },
      { head: '<Q1>', body: [] },
    ]);
  });

  it('erros com número da linha', () => {
    const r = parseGrammar('S -> Aa\nx -> a\nS a\nS -> a |  \nS -> a?');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
    expect(r.errors[0].msg).toMatch(/linear à direita/);
    expect(r.errors[1].msg).toMatch(/não é uma variável/);
    expect(parseGrammar('   ')).toMatchObject({ ok: false, errors: [{ msg: expect.stringMatching(/não tem produções/) }] });
  });

  it('"<" sem fechamento é terminal', () => {
    expect(ok('S -> <').productions[0].body).toEqual(['<']);
  });

  it('imprime agrupando por variável', () => {
    expect(printGrammar(ok('S -> aA\nA -> b\nS -> ?'))).toBe('S -> aA | ?\nA -> b');
    // variável inicial sem produções não gera linha vazia
    expect(printGrammar({ start: 'S', productions: [{ head: 'A', body: [] }] })).toBe('A -> ?');
  });
});

describe('AF ↔ gramática', () => {
  it('AF → GR → AF preserva a linguagem', () => {
    for (const i of [0, 1]) {
      const a = EXAMPLES[i].data() as FA;
      const g = faToGrammar(a);
      expect(g.start).toBe('S');
      expect(differences(a, grammarToFa(g), ['a', 'b', '0', '1'], 5)).toEqual([]);
    }
  });

  it('AF → GR: formato das produções', () => {
    const a = EXAMPLES[1].data() as FA;
    expect(printGrammar(faToGrammar(a))).toBe('S -> aS | bS | A\nA -> aB\nB -> bC\nC -> ?');
    expect(() => faToGrammar({ ...a, initial: null })).toThrow(/partida/);
  });

  it('AF com muitos estados usa <nome>', () => {
    const names = Array.from({ length: 30 }, (_, i) => `q${i}`);
    const a = buildFA({ states: names, accepting: ['q29'], transitions: names.slice(1).map((n, i) => [names[i], 'a', n] as [string, string, string]) });
    const g = faToGrammar(a);
    expect(g.productions[1].body).toEqual(['a', '<q2>']);
    expect(accepts(grammarToFa(g), 'a'.repeat(29))).toBe(true);
  });

  it('GR → AF com terminais em sequência', () => {
    const fa = grammarToFa(ok('S -> abS | c | ?\nS -> A\nA -> dd'));
    for (const w of ['', 'c', 'abc', 'ababab', 'dd', 'abdd']) expect(accepts(fa, w)).toBe(true);
    for (const w of ['a', 'ab c', 'd', 'ca']) expect(accepts(fa, w)).toBe(false);
  });

  it('exemplo (ab)*', () => {
    const text = (EXAMPLES[4].data() as GrammarDoc).text;
    const fa = grammarToFa(ok(text));
    expect(['', 'ab', 'abab'].every((w) => accepts(fa, w))).toBe(true);
    expect(accepts(fa, 'aba')).toBe(false);
  });
});
