import { autoLayout } from './layout';
import { build } from './model';
import type { Automaton, DocData } from './types';

export interface Example {
  title: string;
  description: string;
  data: () => DocData;
  /** Agrupamento na tela inicial. */
  group?: string;
  /** Palavras sugeridas para testar. */
  tests?: string[];
}

// Exemplos dos slides usam a notação das aulas: L = letra, D = dígito,
// outro = qualquer caractere sem outra transição (encerra o lexema). Ver symbols.ts.
const AULA = 'Aula 03 — Compiladores (Prof. Gustavo Júlio)';
const CLASSES = 'L = letra, D = dígito, outro = qualquer outro caractere.';

/** Posições fixas (como no slide) e rótulos dos estados. */
function place(a: Automaton, pos: Record<string, [number, number]>, notes: Record<string, string> = {}): Automaton {
  return {
    ...a,
    states: a.states.map((s) => ({ ...s, pos: pos[s.name] ? { x: pos[s.name][0], y: pos[s.name][1] } : s.pos, ...(notes[s.name] && { note: notes[s.name] }) })),
  };
}

export const EXAMPLES: Example[] = [
  {
    title: 'AFD: número par de 0s',
    description: 'Aceita palavras sobre {0,1} com quantidade par de zeros.',
    data: () =>
      autoLayout(
        build('fa', ['q0', 'q1'], 'q0', ['q0'], [
          ['q0', '1', 'q0'],
          ['q0', '0', 'q1'],
          ['q1', '0', 'q0'],
          ['q1', '1', 'q1'],
        ]),
      ),
  },
  {
    title: 'AFN: termina com "ab"',
    description: 'Não determinístico, com transição vazia (?).',
    data: () =>
      autoLayout(
        build('fa', ['q0', 'q1', 'q2', 'q3'], 'q0', ['q3'], [
          ['q0', 'a, b', 'q0'],
          ['q0', '?', 'q1'],
          ['q1', 'a', 'q2'],
          ['q2', 'b', 'q3'],
        ]),
      ),
  },
  {
    title: 'AP: aⁿbⁿ',
    description: 'Autômato com pilha para aⁿbⁿ, n ≥ 0 (Z marca o fundo da pilha).',
    data: () =>
      autoLayout(
        build('pda', ['q0', 'q1', 'q2', 'q3'], 'q0', ['q3'], [
          ['q0', '?, ?, Z', 'q1'],
          ['q1', 'a, ?, A', 'q1'],
          ['q1', 'b, A, ?', 'q2'],
          ['q2', 'b, A, ?', 'q2'],
          ['q1', '?, Z, ?', 'q3'],
          ['q2', '?, Z, ?', 'q3'],
        ]),
      ),
  },
  {
    title: 'MT: incrementa binário',
    description: 'Soma 1 ao número binário da fita (ex.: 1011 → 1100).',
    data: () =>
      autoLayout(
        build('tm', ['q0', 'q1', 'q2', 'q3'], 'q0', ['q3'], [
          ['q0', '0, 0, D; 1, 1, D', 'q0'],
          ['q0', '□, □, E', 'q1'],
          ['q1', '1, 0, E', 'q1'],
          ['q1', '0, 1, E; □, 1, E', 'q2'],
          ['q2', '0, 0, E; 1, 1, E', 'q2'],
          ['q2', '□, □, D', 'q3'],
        ]),
      ),
  },
  {
    title: 'Gramática: (ab)*',
    description: 'Gramática regular linear à direita.',
    data: () => ({ kind: 'grammar', text: 'S -> aA | ?\nA -> bS' }),
  },
  {
    group: AULA,
    title: 'Aula 03 — Identificador',
    description: `letra (letra|dígito)* seguido de um separador. ${CLASSES}`,
    tests: ['soma;', 'x1+', 'item2)', 'valor', '1abc;', ';'],
    data: () =>
      place(
        build('fa', ['q0', 'q1', 'q2'], 'q0', ['q2'], [
          ['q0', 'L', 'q1'],
          ['q1', 'L, D', 'q1'],
          ['q1', 'outro', 'q2'],
        ]),
        { q0: [100, 200], q1: [330, 200], q2: [560, 200] },
        { q2: 'ID' },
      ),
  },
  {
    group: AULA,
    title: 'Aula 03 — NUM_INT / NUM_REAL',
    description: `D+ vira NUM_INT, D+\.D+ vira NUM_REAL e letra no meio do número vai para ERRO. ${CLASSES}`,
    tests: ['42;', '3.14;', '0.5)', '12a', '3.;', '3.14x'],
    data: () => {
      const a = build('fa', ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 'q0', ['q4', 'q5', 'q6'], [
        ['q0', 'D', 'q1'],
        ['q1', 'D', 'q1'],
        ['q1', '.', 'q2'],
        ['q2', 'D', 'q3'],
        ['q3', 'D', 'q3'],
        ['q1', 'L', 'q4'],
        ['q2', 'outro', 'q4'],
        ['q3', 'L', 'q4'],
        ['q1', 'outro', 'q5'],
        ['q3', 'outro', 'q6'],
      ]);
      return place(
        a,
        { q0: [100, 300], q1: [320, 300], q2: [540, 300], q3: [760, 300], q4: [540, 110], q5: [320, 480], q6: [760, 480] },
        { q4: 'ERRO', q5: 'NUM_INT', q6: 'NUM_REAL' },
      );
    },
  },
  {
    group: AULA,
    title: 'Aula 03 — Token COMP (<, <=, >, >=)',
    description: 'Operador de 1 caractere que pode virar 2 dependendo do próximo símbolo.',
    tests: ['<=', '<a', '>=', '>1', '<<', '='],
    data: () => {
      const a = build('fa', ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 'q0', ['q2', 'q3', 'q5', 'q6'], [
        ['q0', '<', 'q1'],
        ['q1', '=', 'q2'],
        ['q1', 'outro', 'q3'],
        ['q0', '>', 'q4'],
        ['q4', '=', 'q5'],
        ['q4', 'outro', 'q6'],
      ]);
      // rótulos: atributos do token no código do slide 11
      return place(
        a,
        { q0: [100, 270], q1: [320, 150], q2: [560, 80], q3: [560, 220], q4: [320, 390], q5: [560, 330], q6: [560, 470] },
        { q2: 'LE', q3: 'LT', q5: 'GE', q6: 'GT' },
      );
    },
  },
  {
    group: AULA,
    title: 'Aula 03 — ER a(b|c)*',
    description: 'Cadeias que começam com a, seguidas de qualquer sequência de b e c: {a, ab, ac, abb, abc, …}.',
    tests: ['a', 'ab', 'acb', 'abcbc', 'b', 'aa', ''],
    data: () =>
      autoLayout(
        build('fa', ['q0', 'q1'], 'q0', ['q1'], [
          ['q0', 'a', 'q1'],
          ['q1', 'b, c', 'q1'],
        ]),
      ),
  },
  {
    group: AULA,
    title: 'Aula 03 — ER ab*|c (precedência)',
    description: 'ab*|c significa (a(b*))|c, e não a(b*|c).',
    tests: ['a', 'abbb', 'c', 'ac', 'bc'],
    data: () =>
      autoLayout(
        build('fa', ['q0', 'q1', 'q2'], 'q0', ['q1', 'q2'], [
          ['q0', 'a', 'q1'],
          ['q1', 'b', 'q1'],
          ['q0', 'c', 'q2'],
        ]),
      ),
  },
  {
    group: AULA,
    title: 'Aula 03 — Número real D(D)*.D(D)*',
    description: 'Padrão do slide para 0.5, 99.9, 123.456. D = dígito.',
    tests: ['0.5', '99.9', '123.456', '7', '3.', '.5'],
    data: () =>
      autoLayout(
        build('fa', ['q0', 'q1', 'q2', 'q3'], 'q0', ['q3'], [
          ['q0', 'D', 'q1'],
          ['q1', 'D', 'q1'],
          ['q1', '.', 'q2'],
          ['q2', 'D', 'q3'],
          ['q3', 'D', 'q3'],
        ]),
      ),
  },
];
