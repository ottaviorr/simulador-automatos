import { describe, expect, it } from 'vitest';
import { classSet, describeSymbol, faSymbol, literal, symMatches } from './symbols';

describe('símbolos de transição do AF', () => {
  it('normaliza apelidos e valida', () => {
    expect(faSymbol(' a ')).toBe('a');
    expect(faSymbol('letra')).toBe('L');
    expect(faSymbol('Dígito')).toBe('D');
    expect(faSymbol('OUTRO')).toBe('outro');
    expect(faSymbol('outros')).toBe('outro');
    expect(faSymbol('\\L')).toBe('\\L');
    expect(faSymbol('[a-c]')).toBe('[a-c]');
    expect(() => faSymbol('abc')).toThrow(/inválido/);
    expect(() => faSymbol('[^a]')).toThrow(/Negação/);
    expect(() => faSymbol('[z-a]')).toThrow(/invertido/);
  });

  it('casamento', () => {
    expect(symMatches('L', 'q')).toBe(true);
    expect(symMatches('L', '1')).toBe(false);
    expect(symMatches('D', '1')).toBe(true);
    expect(symMatches('\\L', 'L')).toBe(true);
    expect(symMatches('\\L', 'x')).toBe(false);
    expect(symMatches('[a\\-z]', '-')).toBe(true);
    expect(symMatches('[a\\-z]', 'b')).toBe(false);
    expect(symMatches('[0-2x]', 'x')).toBe(true);
    expect(symMatches('outro', 'x')).toBe(false);
    expect(symMatches('?', '?')).toBe(false);
    expect(symMatches('a', undefined)).toBe(false);
    expect(symMatches('a', 'a')).toBe(true);
    expect([...classSet('[a-c]')]).toEqual(['a', 'b', 'c']);
    expect(classSet('[a-c]')).toBe(classSet('[a-c]')); // cache
  });

  it('descrição para a definição formal', () => {
    expect(describeSymbol('L')!.text).toBe('{a, …, z, A, …, Z}');
    expect(describeSymbol('D')!.text).toBe('{0, 1, …, 9}');
    expect(describeSymbol('outro')!.text).toMatch(/sem outra transição/);
    expect(describeSymbol('[xy]')!.text).toBe('{x, y}');
    expect(describeSymbol('a')).toBeNull();
    expect(literal('\\L')).toBe('L');
    expect(literal('ab')).toBe('ab');
  });
});
