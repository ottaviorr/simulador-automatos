import { describe, expect, it } from 'vitest';
import {
  addState, addTransitions, build, buildFA, edgeTransitions, emptyAutomaton, formatLabels, isStateUsed,
  moveStates, parseLabels, removeEdge, removeStates, removeTransitions, renameState, reverseEdge,
  setEdgeLabels, setInitial, setNote, setTargets, stateByName, toggleAccepting, updateTransition,
} from './model';
import { autoLayout } from './layout';
import type { FA, TM } from './types';

const id = (a: FA, n: string) => stateByName(a, n)!.id;

describe('edição', () => {
  it('cria estados q0, q1… e o primeiro vira partida', () => {
    const r0 = addState(emptyAutomaton('fa'), { x: 0, y: 0 });
    let a = addState(r0.a, { x: 10, y: 0 }).a;
    expect(a.states.map((s) => s.name)).toEqual(['q0', 'q1']);
    expect(a.initial).toBe(r0.id);
    a = removeStates(a, [r0.id]);
    expect(a.initial).toBeNull();
    // o nome livre é reaproveitado
    expect(addState(a, { x: 0, y: 0 }).a.states.map((s) => s.name)).toEqual(['q1', 'q0']);
  });

  it('MT vem com branco padrão', () => {
    expect((emptyAutomaton('tm') as TM).blank).toBe('□');
    expect(emptyAutomaton('pda').kind).toBe('pda');
  });

  it('excluir estado remove transições ligadas', () => {
    const a = buildFA({ states: ['q0', 'q1', 'q2'], transitions: [['q0', 'a', 'q1'], ['q1', 'b', 'q2'], ['q2', 'c', 'q2']] });
    expect(isStateUsed(a, id(a, 'q1'))).toBe(true);
    const b = removeStates(a, [id(a, 'q1')]);
    expect(b.transitions.map((t) => t.label.read)).toEqual(['c']);
    expect(isStateUsed(b, id(a, 'q0'))).toBe(false);
  });

  it('renomear valida vazio e duplicado', () => {
    const a = buildFA({ states: ['q0', 'q1'], transitions: [] });
    expect(renameState(a, id(a, 'q0'), ' A ').states[0].name).toBe('A');
    expect(() => renameState(a, id(a, 'q0'), 'q1')).toThrow(/já está sendo usado/);
    expect(() => renameState(a, id(a, 'q0'), '  ')).toThrow(/vazio/);
    expect(renameState(a, id(a, 'q0'), 'q0').states[0].name).toBe('q0');
  });

  it('partida, aceitação e mover', () => {
    let a = buildFA({ states: ['q0', 'q1'], transitions: [] });
    a = setInitial(toggleAccepting(a, id(a, 'q1')), id(a, 'q1'));
    expect(a.initial).toBe(id(a, 'q1'));
    expect(a.states[1].accepting).toBe(true);
    expect(toggleAccepting(a, id(a, 'q1')).states[1].accepting).toBe(false);
    a = moveStates(a, [id(a, 'q0')], 5, -5);
    expect(a.states[0].pos).toEqual({ x: 105, y: 195 });
    expect(a.states[1].pos).toEqual({ x: 250, y: 200 });
  });

  it('arestas: agrupar, editar, inverter, excluir', () => {
    let a = buildFA({ states: ['q0', 'q1'], transitions: [['q0', 'a, b', 'q1'], ['q1', 'c', 'q0']] });
    const [p, q] = [id(a, 'q0'), id(a, 'q1')];
    a = addTransitions(a, p, q, [{ read: 'a' }]); // duplicado é ignorado
    expect(edgeTransitions(a, p, q)).toHaveLength(2);
    a = setEdgeLabels(a, p, q, [{ read: 'x' }]);
    expect(edgeTransitions(a, p, q).map((t) => t.label.read)).toEqual(['x']);
    a = reverseEdge(a, p, q); // junta com a aresta q1→q0 existente
    expect(edgeTransitions(a, q, p).map((t) => t.label.read).sort()).toEqual(['c', 'x']);
    expect(edgeTransitions(a, p, q)).toHaveLength(0);
    a = removeTransitions(a, [edgeTransitions(a, q, p)[0].id]);
    expect(a.transitions).toHaveLength(1);
    expect(removeEdge(a, q, p).transitions).toHaveLength(0);
  });

  it('rótulo do estado: define, apara e remove', () => {
    const a = buildFA({ states: ['q0'], transitions: [] });
    const b = setNote(a, id(a, 'q0'), '  ERRO ');
    expect(b.states[0].note).toBe('ERRO');
    expect('note' in setNote(b, id(a, 'q0'), ' ').states[0]).toBe(false);
    expect(setNote(b, 'outro', 'x').states[0].note).toBe('ERRO');
  });

  it('altera uma transição isolada', () => {
    const a = build('tm', ['q0', 'q1'], 'q0', [], [['q0', 'a, b, D', 'q1']]);
    const t = a.transitions[0];
    const b = updateTransition(a, t.id, { to: a.initial!, label: { read: 'x', write: 'y', move: 'E' } });
    expect(b.transitions[0]).toEqual({ id: t.id, from: t.from, to: a.initial, label: { read: 'x', write: 'y', move: 'E' } });
    expect(updateTransition(a, 'nada', { to: 'x' }).transitions[0]).toEqual(t);
  });

  it('tabela: substitui destinos de (estado, símbolo)', () => {
    const a = buildFA({ states: ['q0', 'q1', 'q2'], transitions: [['q0', 'a', 'q1'], ['q0', 'b', 'q1']] });
    const [p, q, r] = ['q0', 'q1', 'q2'].map((n) => id(a, n));
    const b = setTargets(a, p, 'a', [q, r, r]);
    expect(b.transitions.filter((t) => t.label.read === 'a').map((t) => t.to).sort()).toEqual([q, r].sort());
    expect(b.transitions.filter((t) => t.label.read === 'b')).toHaveLength(1);
    expect(setTargets(b, p, 'a', []).transitions).toHaveLength(1);
  });

  it('build acusa estado inexistente e rótulo inválido', () => {
    expect(() => build('fa', ['q0'], undefined, [], [['q0', 'a', 'x']])).toThrow(/inexistente/);
    expect(() => build('fa', ['q0'], undefined, [], [['q0', 'ab', 'q0']])).toThrow(/inválido/);
  });
});

describe('rótulos', () => {
  it('AF', () => {
    expect(parseLabels('fa', 'a, b ?')).toEqual({ ok: true, labels: [{ read: 'a' }, { read: 'b' }, { read: '?' }] });
    expect(parseLabels('fa', '  ').ok).toBe(false);
    expect(parseLabels('fa', 'ab').ok).toBe(false);
    expect(formatLabels('fa', [{ read: 'a' }, { read: '?' }])).toBe('a, ?');
  });

  it('AP', () => {
    expect(parseLabels('pda', 'a, Z, AZ; b/A/?\n , , ')).toEqual({
      ok: true,
      labels: [
        { read: 'a', pop: 'Z', push: 'AZ' },
        { read: 'b', pop: 'A', push: '?' },
        { read: '?', pop: '?', push: '?' },
      ],
    });
    expect(parseLabels('pda', 'a, Z')).toMatchObject({ ok: false, error: expect.stringMatching(/lido, topo, empilha/) });
    expect(parseLabels('pda', ';').ok).toBe(false);
    expect(
      formatLabels('pda', [
        { read: 'a', pop: 'Z', push: 'AZ' },
        { read: 'b', pop: '?', push: '?' },
      ]),
    ).toBe('a, Z, AZ\nb, ?, ?');
  });

  it('MT', () => {
    expect(parseLabels('tm', '0, 1, d; 1,0,L; □, □, s')).toEqual({
      ok: true,
      labels: [
        { read: '0', write: '1', move: 'D' },
        { read: '1', write: '0', move: 'E' },
        { read: '□', write: '□', move: 'P' },
      ],
    });
    expect(parseLabels('tm', '0, 1, X')).toMatchObject({ ok: false, error: expect.stringMatching(/E, D ou P/) });
    expect(parseLabels('tm', '0, 1')).toMatchObject({ ok: false, error: expect.stringMatching(/lido, gravado, direção/) });
    expect(formatLabels('tm', [{ read: '0', write: '1', move: 'D' }])).toBe('0, 1, D');
  });
});

describe('layout', () => {
  it('camadas por BFS, estados soltos no fim', () => {
    const a = autoLayout(buildFA({ states: ['q0', 'q1', 'q2', 'solto'], transitions: [['q0', 'a', 'q1'], ['q0', 'b', 'q2']] }));
    const pos = (n: string) => stateByName(a, n)!.pos;
    expect(pos('q0').x).toBeLessThan(pos('q1').x);
    expect(pos('q1').x).toBe(pos('q2').x);
    expect(pos('q1').y).not.toBe(pos('q2').y);
    expect(pos('solto').x).toBeGreaterThan(pos('q1').x);
    expect(autoLayout({ ...a, initial: null }).states).toHaveLength(4);
  });
});
