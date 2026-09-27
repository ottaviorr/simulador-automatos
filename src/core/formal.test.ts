import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { formalDefinition } from './formal';
import { build } from './model';
import type { Automaton } from './types';

const ex = (i: number) => EXAMPLES[i].data() as Automaton;

describe('definição formal', () => {
  it('AFD', () => {
    const { text, latex } = formalDefinition(ex(0));
    expect(text).toBe(
      ['M = (Q, Σ, δ, q0, F)', 'Q = {q0, q1}', 'Σ = {0, 1}', 'F = {q0}', 'q0 = q0', 'δ:',
        '  δ(q0, 1) = q0', '  δ(q0, 0) = q1', '  δ(q1, 0) = q0', '  δ(q1, 1) = q1'].join('\n'),
    );
    expect(latex).toContain('M &= (Q, \\Sigma, \\delta, q_{0}, F)');
    expect(latex).toContain('\\delta(q_{0}, 1) &= q_{0} \\\\');
    expect(latex.startsWith('\\begin{aligned}')).toBe(true);
  });

  it('AFN usa conjuntos e ε', () => {
    const { text, latex } = formalDefinition(ex(1));
    expect(text).toContain('δ(q0, ε) = {q1}');
    expect(latex).toContain('\\delta(q_{0}, \\varepsilon) &= \\{q_{1}\\}');
  });

  it('AP com Γ e símbolo inicial', () => {
    const a = { ...ex(2), stackStart: 'Z' } as Automaton;
    const { text } = formalDefinition(a);
    expect(text).toContain('M = (Q, Σ, Γ, δ, q0, Z, F)');
    expect(text).toContain('Γ = {A, Z}');
    expect(text).toContain('δ(q1, b, A) = {(q2, ε)}');
    expect(formalDefinition(ex(2)).text).toContain('M = (Q, Σ, Γ, δ, q0, F)');
  });

  it('MT com branco', () => {
    const { text, latex } = formalDefinition(ex(3));
    expect(text).toContain('M = (Q, Σ, Γ, δ, q0, □, F)');
    expect(text).toContain('Γ = {0, 1, □}');
    expect(text).toContain('δ(q1, □) = (q2, 1, E)');
    expect(latex).toContain('\\sqcup');
  });

  it('escapa nomes e símbolos especiais no LaTeX; sem partida', () => {
    const a = { ...build('fa', ['{q0,q1}', 'x_1'], undefined, [], [['{q0,q1}', '#', 'x_1']]), initial: null };
    const { text, latex } = formalDefinition(a);
    expect(text).toContain('q0 = —');
    expect(latex).toContain('\\text{\\{q0,q1\\}}');
    expect(latex).toContain('\\text{x\\_1}');
    expect(latex).toContain('\\#');
    const tm = { ...build('tm', ['q0'], 'q0', [], [['q0', '?, ^, P', 'q0']]) } as Automaton;
    expect(formalDefinition(tm).latex).toContain('\\text{\\^{}}');
  });
});

describe('definição formal com a notação das aulas', () => {
  it('Σ mostra letras e dígitos e explica L, D e outro', () => {
    const a = EXAMPLES.find((e) => e.title.startsWith('Aula 03 — NUM_INT'))!.data() as Automaton;
    const { text, latex } = formalDefinition(a);
    expect(text).toContain('Σ = {a, …, z, A, …, Z} ∪ {0, 1, …, 9} ∪ {.} ∪ {demais caracteres}');
    expect(text).toContain('onde L = letra {a, …, z, A, …, Z}; D = dígito {0, 1, …, 9}; outro = qualquer símbolo sem outra transição saindo do estado');
    expect(text).toContain('δ(q1, outro) = q5');
    expect(latex).toContain('\\{a, \\dots, z, A, \\dots, Z\\} \\cup \\{0, 1, \\dots, 9\\}');
    expect(latex).toContain('\\delta(q_{1}, \\text{outro}) &= q_{5}');
    expect(latex).toContain('\\text{onde }');
  });

  it('sem literais nem outro: só as classes; \\L literal', () => {
    const a = build('fa', ['q0'], 'q0', [], [['q0', 'D', 'q0']]);
    expect(formalDefinition(a).text).toContain('Σ = {0, 1, …, 9}\n');
    const b = build('fa', ['q0'], 'q0', [], [['q0', '\\L, [xy]', 'q0']]);
    expect(formalDefinition(b).text).toContain('Σ = {x, y} ∪ {L}');
    expect(formalDefinition(b).text).toContain('δ(q0, L) = q0');
  });
});
