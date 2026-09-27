import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { nfaToDfa } from './convert';
import { buildFA } from './model';
import { faToRegex, parseRegex, printRegex, R, regexToNfa } from './regex';
import { accepts, differences, words } from './testutil';
import type { FA, Regex } from './types';

const re = (s: string): Regex => {
  const r = parseRegex(s);
  if (!r.ok) throw new Error(r.errors[0].msg);
  return r.value;
};
/** Nossa sintaxe é a do JS, exceto ε/λ e ∅. */
const js = (s: string) => new RegExp('^(?:' + s.replace(/\s/g, '').replace(/[ελ]/g, '(?:)').replace(/∅/g, '(?!)') + ')$');
const ex = (title: string) => EXAMPLES.find((e) => e.title.startsWith(title))!.data() as FA;

describe('parser de ER', () => {
  it('precedência e impressão (ab*|c = (a(b*))|c, como no slide)', () => {
    expect(printRegex(re('ab*|c'))).toBe('ab*|c');
    expect(printRegex(re('a(b*|c)'))).toBe('a(b*|c)');
    expect(printRegex(re('(a|b)*abb'))).toBe('(a|b)*abb');
    expect(printRegex(re('(ab)*'))).toBe('(ab)*');
    expect(printRegex(re('a**'))).toBe('a**');
    expect(printRegex(re('?|∅'))).toBe('ε|∅');
    expect(printRegex(re('ε λ'))).toBe('εε');
  });

  it('+, ? pós-fixos, classes e escape', () => {
    expect(printRegex(re('a+'))).toBe('aa*');
    expect(printRegex(re('ab?'))).toBe('a(b|ε)');
    expect(printRegex(re('[a-c_]'))).toBe('a|b|c|_');
    expect(printRegex(re('[0-9]+\\.[0-9]'))).toBe('(0|1|2|3|4|5|6|7|8|9)(0|1|2|3|4|5|6|7|8|9)*.(0|1|2|3|4|5|6|7|8|9)');
    expect(printRegex(re('\\+\\*'))).toBe('\\+\\*');
    expect(printRegex(R.sym('ε'))).toBe('\\ε');
  });

  it('erros com coluna', () => {
    const err = (s: string) => {
      const r = parseRegex(s);
      return r.ok ? null : r.errors[0];
    };
    expect(err('')).toMatchObject({ msg: expect.stringMatching(/Digite/) });
    expect(err('(ab')).toMatchObject({ col: 1, msg: expect.stringMatching(/não fechado/) });
    expect(err('ab)')).toMatchObject({ col: 3, msg: expect.stringMatching(/sem abrir/) });
    expect(err('a|')).toMatchObject({ msg: expect.stringMatching(/Faltou/) });
    expect(err('*a')).toMatchObject({ col: 1, msg: expect.stringMatching(/precisa de algo/) });
    expect(err('+a')).toMatchObject({ col: 1, msg: expect.stringMatching(/precisa de algo/) });
    expect(err('a||b')).toMatchObject({ col: 3 });
    expect(err('()')).toMatchObject({ col: 2 });
    expect(err('(')).toMatchObject({ msg: expect.stringMatching(/Faltou|incompleta/) });
    expect(err('[abc')).toMatchObject({ col: 1, msg: expect.stringMatching(/Colchete/) });
    expect(err('[]')).toMatchObject({ msg: expect.stringMatching(/vazia/) });
    expect(err('[^a]')).toMatchObject({ msg: expect.stringMatching(/Negação/) });
    expect(err('[z-a]')).toMatchObject({ msg: expect.stringMatching(/invertido/) });
    expect(err('[\u0000-࿿]')).toMatchObject({ msg: expect.stringMatching(/grande demais/) });
    expect(err('a\\')).toMatchObject({ msg: expect.stringMatching(/precisa de um caractere/) });
    expect(err(']')).toMatchObject({ msg: expect.stringMatching(/inesperado/) });
    expect(err('{}')).toMatchObject({ msg: expect.stringMatching(/nome/) });
    expect(err('a{outro')).toMatchObject({ msg: expect.stringMatching(/nome/) });
  });

  it('simplificações dos construtores', () => {
    const a = R.sym('a');
    expect(R.alt(R.empty, a)).toBe(a);
    expect(R.alt(a, R.empty)).toBe(a);
    expect(R.alt(a, R.sym('a'))).toBe(a);
    expect(printRegex(R.alt(R.eps, R.star(a)))).toBe('a*');
    expect(printRegex(R.alt(R.star(a), R.eps))).toBe('a*');
    expect(R.cat(R.empty, a)).toBe(R.empty);
    expect(R.cat(a, R.eps)).toBe(a);
    expect(R.cat(R.eps, a)).toBe(a);
    expect(R.star(R.empty)).toBe(R.eps);
    expect(printRegex(R.star(R.star(a)))).toBe('a*');
    expect(printRegex(R.star(R.alt(R.eps, R.sym('b'))))).toBe('b*');
    expect(printRegex(R.star({ t: 'alt', a, b: R.eps }))).toBe('a*');
  });
});

describe('ER → AFN (Thompson)', () => {
  const cases = ['(a|b)*abb', 'a*b*', '(ab|ε)(ba)*', 'a|∅', '∅', 'ε', '((a|b)(a|b))*', 'a(b|c)*', 'ab*|c', 'a+b?', '[ab]+c', 'a\\.b'];
  for (const s of cases) {
    it(s, () => {
      const nfa = regexToNfa(re(s));
      expect(nfa.states[0].name).toBe('q0');
      for (const w of words(['a', 'b', 'c', '.'], 4)) expect(accepts(nfa, w), w).toBe(js(s).test(w));
    });
  }

  it('espaços são ignorados, mas nenhuma letra some', () => {
    expect(printRegex(re(' s o m a | s+ '))).toBe('soma|ss*');
  });

  it('NUM_REAL da aula: [0-9]+\\.[0-9]+', () => {
    const nfa = regexToNfa(re('[0-9]+\\.[0-9]+'));
    for (const w of ['3.14', '0.5', '123.456']) expect(accepts(nfa, w)).toBe(true);
    for (const w of ['3', '3.', '.5', '3.1.4', 'a.1']) expect(accepts(nfa, w)).toBe(false);
  });
});

describe('AF → ER (eliminação de estados)', () => {
  const roundTrip = (a: FA, sigma: string[]) => {
    const r = faToRegex(a);
    const back = regexToNfa(re(printRegex(r)));
    expect(differences(a, back, sigma, 6)).toEqual([]);
    return printRegex(r);
  };

  it('exemplos', () => {
    roundTrip(ex('AFD: número par'), ['0', '1']);
    expect(roundTrip(ex('AFN: termina'), ['a', 'b'])).toBe('(a|b)*ab');
    roundTrip(nfaToDfa(regexToNfa(re('(a|b)*abb'))), ['a', 'b']);
    // outro sobrevive à ida e volta como símbolo nomeado
    expect(printRegex(faToRegex(ex('Aula 03 — Identificador')))).toBe('L(L|D)*{outro}');
    expect(printRegex(re('L(L|D)*{outro}'))).toBe('L(L|D)*{outro}');
  });

  it('casos simples', () => {
    expect(roundTrip(buildFA({ states: ['q0'], accepting: ['q0'], transitions: [] }), ['a'])).toBe('ε');
    expect(roundTrip(buildFA({ states: ['q0'], transitions: [['q0', 'a', 'q0']] }), ['a'])).toBe('∅');
    expect(roundTrip(buildFA({ states: ['q0'], accepting: ['q0'], transitions: [['q0', 'a, b', 'q0']] }), ['a', 'b'])).toBe('(a|b)*');
    expect(() => faToRegex({ ...ex('AFD: número par'), initial: null })).toThrow(/partida/);
  });
});
