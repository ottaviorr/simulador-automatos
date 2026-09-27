import { describe, expect, it } from 'vitest';
import { analyze, inputAlphabet, isDeterministic } from './analyze';
import { minimizeDfa, nfaToDfa } from './convert';
import { EXAMPLES } from './examples';
import { build, buildFA, stateByName } from './model';
import { differences } from './testutil';
import type { FA } from './types';

const afn = EXAMPLES[1].data() as FA;

describe('análise', () => {
  it('detecta inalcançáveis, mortos e AFD incompleto', () => {
    const a = buildFA({
      states: ['q0', 'q1', 'morto', 'solto'],
      accepting: ['q1'],
      transitions: [['q0', 'a', 'q1'], ['q1', 'b', 'morto'], ['solto', 'a', 'q1']],
    });
    const r = analyze(a);
    const names = (ids: string[]) => ids.map((i) => a.states.find((s) => s.id === i)!.name);
    expect(r.noInitial).toBe(false);
    expect(names(r.unreachable)).toEqual(['solto']);
    expect(names(r.dead)).toEqual(['morto']);
    expect(r.deterministic).toBe(true);
    expect(r.missing!.map((m) => names([m.state])[0] + m.sym)).toEqual(['q0b', 'q1a', 'mortoa', 'mortob', 'soltob']);
  });

  it('AFN não informa transições faltando', () => {
    expect(analyze(afn).deterministic).toBe(false);
    expect(analyze(afn).missing).toBeUndefined();
    const dup = buildFA({ states: ['q0', 'q1'], transitions: [['q0', 'a', 'q0'], ['q0', 'a', 'q1']] });
    expect(isDeterministic(dup)).toBe(false);
  });

  it('sem partida, alfabeto declarado e MT', () => {
    const a: FA = { ...buildFA({ states: ['q0'], transitions: [['q0', 'a, x', 'q0']] }), initial: null, alphabet: ['a'] };
    const r = analyze(a);
    expect(r.noInitial).toBe(true);
    expect(r.unreachable).toEqual([]);
    expect(r.outOfAlphabet).toHaveLength(1);
    expect(inputAlphabet(a)).toEqual(['a']);
    const tm = EXAMPLES[3].data() as FA;
    expect(analyze(tm).dead).toEqual([]);
    expect(analyze(tm).deterministic).toBeUndefined();
    expect(inputAlphabet(tm)).toEqual(['0', '1']); // sem o branco
  });
});

describe('AFN → AFD', () => {
  it('construção de subconjuntos com fecho-ε', () => {
    const d = nfaToDfa(afn);
    expect(isDeterministic(d)).toBe(true);
    expect(d.states.map((s) => s.name)).toEqual(['{q0,q1}', '{q0,q1,q2}', '{q0,q1,q3}']);
    expect(stateByName(d, '{q0,q1,q3}')!.accepting).toBe(true);
    expect(differences(afn, d, ['a', 'b'])).toEqual([]);
  });

  it('omite o conjunto vazio e exige partida', () => {
    const a = buildFA({ states: ['q0', 'q1'], accepting: ['q1'], transitions: [['q0', 'a', 'q1']] });
    expect(nfaToDfa(a).transitions).toHaveLength(1);
    expect(() => nfaToDfa({ ...a, initial: null })).toThrow(/partida/);
  });
});

describe('minimização', () => {
  it('junta estados equivalentes e registra as rodadas', () => {
    // (a|b)*a — versão redundante com 4 estados
    const a = buildFA({
      states: ['A', 'B', 'C', 'D'],
      accepting: ['B', 'D'],
      transitions: [
        ['A', 'a', 'B'], ['A', 'b', 'C'],
        ['B', 'a', 'D'], ['B', 'b', 'C'],
        ['C', 'a', 'B'], ['C', 'b', 'A'],
        ['D', 'a', 'D'], ['D', 'b', 'C'],
      ],
    });
    const { dfa, rounds } = minimizeDfa(a);
    expect(dfa.states).toHaveLength(2);
    expect(dfa.states.map((s) => s.name).sort()).toEqual(['{A,C}', '{B,D}']);
    expect(rounds[0]).toEqual([['B', 'D'], ['A', 'C']]);
    expect(differences(a, dfa, ['a', 'b'])).toEqual([]);
  });

  it('AFD parcial: usa ∅ internamente e o descarta no final', () => {
    const a = buildFA({ states: ['q0', 'q1', 'q2', 'x'], accepting: ['q2'], transitions: [['q0', 'a', 'q1'], ['q1', 'b', 'q2']] });
    const { dfa, rounds } = minimizeDfa(a);
    expect(dfa.states.map((s) => s.name)).toEqual(['q0', 'q1', 'q2']); // x inalcançável sai
    expect(rounds[0].flat()).toContain('∅');
    expect(differences(a, dfa, ['a', 'b'])).toEqual([]);
  });

  it('linguagem vazia mantém o estado inicial', () => {
    const a = buildFA({ states: ['q0'], transitions: [['q0', 'a', 'q0'], ['q0', 'b', 'q0']] });
    expect(minimizeDfa(a).dfa.states).toHaveLength(1);
    const partial = buildFA({ states: ['q0'], transitions: [['q0', 'a', 'q0']] });
    expect(minimizeDfa(partial).dfa.initial).not.toBeNull();
  });

  it('recusa AFN e falta de partida', () => {
    expect(() => minimizeDfa(afn)).toThrow(/não é determinístico/);
    expect(() => minimizeDfa({ ...afn, initial: null })).toThrow(/partida/);
  });

  it('minimizar o AFD do exemplo par de 0s não muda nada', () => {
    const a = EXAMPLES[0].data() as FA;
    expect(minimizeDfa(a).dfa.states).toHaveLength(2);
    expect(minimizeDfa(nfaToDfa(afn)).dfa.states).toHaveLength(3);
  });

  it('build aceita AP sem quebrar tipos', () => {
    expect(build('pda', ['q0'], 'q0', [], []).kind).toBe('pda');
  });
});
