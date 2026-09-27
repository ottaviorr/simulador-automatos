// Regressões encontradas na revisão de código.
import { describe, expect, it } from 'vitest';
import { isDeterministic } from './analyze';
import { parseGrammar } from './grammar';
import { validateData } from './io/native';
import { buildFA } from './model';
import { parseRegex, printRegex, regexToNfa } from './regex';
import { accepts } from './testutil';

const re = (s: string) => {
  const r = parseRegex(s);
  if (!r.ok) throw new Error(r.errors[0].msg);
  return r.value;
};

describe('revisão', () => {
  it('ER: letras L e D dentro de [A-Z] são literais, não classes', () => {
    const nfa = regexToNfa(re('[A-Z]+'));
    expect(accepts(nfa, 'LD')).toBe(true);
    expect(accepts(nfa, 'ABC')).toBe(true);
    expect(accepts(nfa, '5')).toBe(false);
    expect(accepts(nfa, 'x')).toBe(false);
  });

  it('ER: \\? é o caractere ?, não a palavra vazia; L solto é a classe', () => {
    const q = regexToNfa(re('a\\?'));
    expect(accepts(q, 'a?')).toBe(true);
    expect(accepts(q, 'a')).toBe(false);
    expect(printRegex(re('\\L'))).toBe('\\L');
    const cls = regexToNfa(re('L(L|D)*'));
    expect(accepts(cls, 'x9')).toBe(true);
    expect(accepts(cls, '9x')).toBe(false);
  });

  it('ER e gramática: {nome} precisa ser um símbolo válido', () => {
    expect(parseRegex('{abc}')).toMatchObject({ ok: false, errors: [{ msg: expect.stringMatching(/inválido/) }] });
    expect(printRegex(re('{letra}{outro}'))).toBe('L{outro}');
    expect(parseGrammar('S -> {abc}S')).toMatchObject({ ok: false, errors: [{ line: 1, msg: expect.stringMatching(/Terminal inválido/) }] });
    const g = parseGrammar('S -> {letra}S | {outro}');
    expect(g.ok && g.value.productions.map((p) => p.body[0])).toEqual(['L', 'outro']);
  });

  it('arquivo com nomes de estado repetidos é recusado', () => {
    const a = buildFA({ states: ['q0', 'q1'], transitions: [] });
    const dup = { ...a, states: a.states.map((s) => ({ ...s, name: 'q0' })) };
    expect(() => validateData(dup)).toThrow(/nome de estado repetido/);
  });

  it('AFD/AFN considera símbolos que se sobrepõem', () => {
    const d = (spec: [string, string, string][]) => isDeterministic(buildFA({ states: ['q0', 'q1', 'q2'], transitions: spec }));
    expect(d([['q0', 'L', 'q1'], ['q0', 'a', 'q2']])).toBe(false);
    expect(d([['q0', 'L', 'q1'], ['q0', '[x-z]', 'q2']])).toBe(false);
    expect(d([['q0', 'L', 'q1'], ['q0', 'D', 'q2']])).toBe(true);
    expect(d([['q0', 'L', 'q1'], ['q0', 'outro', 'q2']])).toBe(true);
    expect(d([['q0', '\\L', 'q1'], ['q0', 'D', 'q2']])).toBe(true);
  });
});
