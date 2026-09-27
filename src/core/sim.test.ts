import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { build, buildFA, stateByName } from './model';
import { path, run, runMany, tapeText } from './sim';
import type { Automaton, TM } from './types';

const ex = (i: number) => EXAMPLES[i].data() as Automaton;

describe('AF', () => {
  it('AFD número par de 0s', () => {
    const a = ex(0);
    expect(runMany(a, ['', '00', '1010', '0', '10', '1']).map((r) => r.verdict)).toEqual([
      'accept', 'accept', 'accept', 'reject', 'reject', 'accept',
    ]);
    expect(run(a, '0110').frames).toHaveLength(5);
  });

  it('AFN com ε acompanha todos os ramos', () => {
    const a = ex(1);
    const r = run(a, 'aab');
    expect(r.verdict).toBe('accept');
    const names = (f: number) => r.frames[f].configs.map((c) => a.states.find((s) => s.id === c.state)!.name).sort();
    expect(names(0)).toEqual(['q0', 'q1']);
    expect(names(1)).toEqual(['q0', 'q1', 'q2']);
    expect(names(3)).toEqual(['q0', 'q1', 'q3']);
    // o caminho de aceitação passa pela transição vazia
    const p = path(r, r.accepted!);
    expect(p[0].parent).toBeNull();
    expect(p.at(-1)!.state).toBe(stateByName(a, 'q3')!.id);
    expect(p.some((c) => c.via && a.transitions.find((t) => t.id === c.via)!.label.read === '?')).toBe(true);
    expect(r.frames[1].used.length).toBeGreaterThan(0);
    expect(run(a, 'aba').verdict).toBe('reject');
  });

  it('para cedo quando todos os ramos morrem', () => {
    const a = buildFA({ states: ['q0'], accepting: ['q0'], transitions: [['q0', 'a', 'q0']] });
    const r = run(a, 'aba');
    expect(r.verdict).toBe('reject');
    expect(r.frames).toHaveLength(3);
    expect(r.frames[2].configs).toEqual([]);
  });

  it('sem estado de partida', () => {
    const a = { ...buildFA({ states: ['q0'], transitions: [] }), initial: null };
    expect(run(a, 'a')).toMatchObject({ verdict: 'reject', error: expect.stringMatching(/partida/) });
  });
});

describe('exemplos da Aula 03', () => {
  const get = (t: string) => EXAMPLES.find((e) => e.title.startsWith('Aula 03 — ' + t))!;
  const verdicts = (t: string, words: string[]) => runMany(get(t).data() as Automaton, words).map((r) => r.verdict === 'accept');
  const nameAtEnd = (t: string, w: string) => {
    const a = get(t).data() as Automaton;
    const r = run(a, w);
    return r.accepted && a.states.find((s) => s.id === r.frames[r.accepted!.frame].configs[r.accepted!.index].state)!.name;
  };

  it('identificador: letra (letra|dígito)* + outro', () => {
    expect(verdicts('Identificador', ['soma;', 'x1+', 'item2)', 'valor', '1abc;', ';'])).toEqual([true, true, true, false, false, false]);
  });

  it('NUM_INT, NUM_REAL e ERRO caem nos estados do slide', () => {
    expect(nameAtEnd('NUM_INT', '42;')).toBe('q5');
    expect(nameAtEnd('NUM_INT', '3.14;')).toBe('q6');
    expect(nameAtEnd('NUM_INT', '12a')).toBe('q4');
    expect(nameAtEnd('NUM_INT', '3.;')).toBe('q4');
    expect(nameAtEnd('NUM_INT', '3.')).toBeNull();
  });

  it('COMP, ER a(b|c)*, ab*|c e número real', () => {
    expect(nameAtEnd('Token COMP', '<=')).toBe('q2');
    expect(nameAtEnd('Token COMP', '>1')).toBe('q6');
    expect(nameAtEnd('Token COMP', '<<')).toBe('q3'); // < seguido de outro = LT
    expect(verdicts('Token COMP', ['=', '<'])).toEqual([false, false]);
    expect(verdicts('ER a(b|c)*', ['a', 'ab', 'acb', 'b', 'aa', ''])).toEqual([true, true, true, false, false, false]);
    expect(verdicts('ER ab*|c', ['a', 'abbb', 'c', 'ac', 'bc'])).toEqual([true, true, true, false, false]);
    expect(verdicts('Número real', ['0.5', '99.9', '123.456', '7', '3.', '.5'])).toEqual([true, true, true, false, false, false]);
  });

  it('todas as palavras sugeridas terminam como o texto do exemplo indica', () => {
    const idf = get('Identificador');
    expect(runMany(idf.data() as Automaton, idf.tests!).filter((r) => r.verdict === 'accept')).toHaveLength(3);
  });

  it('todo exemplo tem palavras sugeridas válidas', () => {
    for (const ex of EXAMPLES.filter((e) => e.group)) expect(ex.tests?.length).toBeGreaterThan(0);
  });
});

describe('símbolos das aulas: L, D, outro, classes', () => {
  const a = build('fa', ['q0', 'q1', 'q2', 'q3'], 'q0', ['q1', 'q2', 'q3'], [
    ['q0', 'L', 'q1'],
    ['q0', 'D', 'q2'],
    ['q0', '[+-]', 'q3'],
    ['q1', 'outro', 'q3'],
  ]);
  const end = (w: string) => {
    const r = run(a, w);
    return r.accepted ? a.states.find((s) => s.id === r.frames[r.accepted!.frame].configs[r.accepted!.index].state)!.name : null;
  };
  it('L = letra, D = dígito, [..] classe', () => {
    expect(end('x')).toBe('q1');
    expect(end('Z')).toBe('q1');
    expect(end('7')).toBe('q2');
    expect(end('+')).toBe('q3');
    expect(end('-')).toBe('q3');
    expect(end('ç')).toBeNull();
  });
  it('outro: só quando nenhuma outra transição do estado casa', () => {
    expect(end('x;')).toBe('q3');
    expect(end('x ')).toBe('q3');
    // em q0 não há "outro": caractere desconhecido rejeita
    expect(end(';')).toBeNull();
  });
});

describe('AP', () => {
  it('aⁿbⁿ', () => {
    const a = ex(2);
    expect(runMany(a, ['', 'ab', 'aabb', 'aaabbb']).every((r) => r.verdict === 'accept')).toBe(true);
    expect(runMany(a, ['a', 'b', 'aab', 'abb', 'ba', 'abab']).every((r) => r.verdict === 'reject')).toBe(true);
    const r = run(a, 'aabb');
    const p = path(r, r.accepted!);
    expect(p.map((c) => c.stack!.join(''))).toEqual(['', 'Z', 'ZA', 'ZAA', 'ZA', 'Z', '']);
  });

  it('empilha sequência com o 1º caractere no topo e usa o símbolo inicial', () => {
    const a = { ...build('pda', ['q0', 'q1'], 'q0', ['q1'], [['q0', 'a, Z, XY', 'q1']]), stackStart: 'Z' } as Automaton;
    const r = run(a, 'a');
    expect(r.verdict).toBe('accept');
    expect(r.frames[1].configs[0].stack).toEqual(['Y', 'X']);
  });

  it('não determinismo: palíndromos pares wwᴿ', () => {
    const a = {
      ...build('pda', ['q0', 'q1', 'q2'], 'q0', ['q2'], [
        ['q0', 'a, ?, a; b, ?, b', 'q0'],
        ['q0', '?, ?, ?', 'q1'],
        ['q1', 'a, a, ?; b, b, ?', 'q1'],
        ['q1', '?, Z, ?', 'q2'],
      ]),
      stackStart: 'Z',
    } as Automaton;
    expect(run(a, 'abba').verdict).toBe('accept');
    expect(run(a, '').verdict).toBe('accept');
    expect(run(a, 'abab').verdict).toBe('reject');
  });

  it('limites: pilha crescendo em laço ε e excesso de ramos', () => {
    const a = build('pda', ['q0', 'q1'], 'q0', ['q1'], [['q0', '?, ?, A', 'q0']]);
    expect(run(a, 'a', { maxSteps: 50 }).verdict).toBe('limit');
    const wide = build('pda', ['q0'], 'q0', [], [['q0', '?, ?, A; ?, ?, B', 'q0']]);
    expect(run(wide, 'a', { maxConfigs: 100 }).verdict).toBe('limit');
  });
});

describe('MT', () => {
  const inc = ex(3) as TM;
  const out = (w: string) => {
    const r = run(inc, w);
    expect(r.verdict).toBe('accept');
    const c = r.frames[r.accepted!.frame].configs[r.accepted!.index];
    return tapeText(c.tape!.cells, inc.blank);
  };

  it('incrementa binário', () => {
    expect(out('1011')).toBe('1100');
    expect(out('111')).toBe('1000');
    expect(out('0')).toBe('1');
    expect(out('')).toBe('1');
  });

  it('? é o branco; laço infinito atinge o limite; P fica parado', () => {
    const loop = build('tm', ['q0'], 'q0', [], [['q0', '?, ?, D', 'q0']]);
    expect(run(loop, '', { maxSteps: 30 }).verdict).toBe('limit');
    const stay = build('tm', ['q0', 'q1'], 'q0', ['q1'], [['q0', 'a, b, P', 'q1']]);
    expect(run(stay, 'a').frames[1].configs[0].tape).toEqual({ cells: ['b'], head: 0 });
    expect(run(stay, 'x').verdict).toBe('reject');
    // andar para a esquerda na borda cria uma célula branca
    const left = build('tm', ['q0', 'q1'], 'q0', ['q1'], [['q0', 'a, a, E', 'q1']]);
    expect(run(left, 'a').frames[1].configs[0].tape).toEqual({ cells: ['□', 'a'], head: 0 });
  });

  it('aceita de imediato se o estado inicial é de aceitação', () => {
    const a = build('tm', ['q0'], 'q0', ['q0'], []);
    expect(run(a, 'abc')).toMatchObject({ verdict: 'accept', accepted: { frame: 0, index: 0 } });
  });

  it('tapeText apara brancos das pontas', () => {
    expect(tapeText(['□', 'a', '□', 'b', '□'], '□')).toBe('a□b');
    expect(tapeText(['□'], '□')).toBe('');
  });
});
