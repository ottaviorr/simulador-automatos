import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples';
import { EXT, fileName, fromJson, readFile, serialize, validateData } from './native';
import { decodeShare, encodeShare } from './share';
import { isLegacy } from './legacy';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('formato nativo', () => {
  it('ida e volta de todos os exemplos', () => {
    for (const ex of EXAMPLES) {
      const data = ex.data();
      const loaded = readFile(`x.${EXT[data.kind]}`, bytes(serialize(ex.title, data)));
      expect(loaded).toEqual({ title: ex.title, data });
    }
  });

  it('nome de arquivo com a extensão do original', () => {
    expect(fileName('a/b: c', EXAMPLES[2].data())).toBe('a_b_ c.afp');
    expect(fileName('  ', EXAMPLES[4].data())).toBe('automato.gr');
  });

  it('título padrão e erros legíveis', () => {
    const data = EXAMPLES[0].data();
    expect(readFile('meu.af', bytes(JSON.stringify({ format: 'simulador-automatos', data }))).title).toBe('meu');
    expect(() => readFile('x.af', bytes('{oops'))).toThrow(/não reconhecido/);
    expect(() => fromJson({ format: 'outro' })).toThrow(/não é um documento/);
    expect(() => fromJson(null)).toThrow(/não é um documento/);
  });

  it('valida entrada não confiável', () => {
    const good = EXAMPLES[2].data() as { states: { id: string }[]; transitions: object[] };
    const bad = (patch: object) => () => validateData({ ...good, ...patch });
    expect(bad({ kind: 'xyz' })).toThrow(/desconhecido/);
    expect(bad({ states: 'x' })).toThrow(/faltam/);
    expect(bad({ states: [1] })).toThrow(/estado malformado/);
    expect(bad({ states: [good.states[0], good.states[0]] })).toThrow(/repetido/);
    expect(bad({ initial: 'nada' })).toThrow(/inexistente/);
    expect(bad({ transitions: [{ id: 't', from: good.states[0].id, to: 'nada', label: {} }] })).toThrow(/inexistente/);
    expect(bad({ transitions: [3] })).toThrow(/transição malformada/);
    expect(bad({ transitions: [{ id: 't', from: good.states[0].id, to: good.states[0].id, label: { read: 'ab' } }] })).toThrow(/único caractere/);
    expect(bad({ transitions: [{ id: 't', from: good.states[0].id, to: good.states[0].id, label: null }] })).toThrow(/rótulo/);
    expect(bad({ transitions: [{ id: 't', from: good.states[0].id, to: good.states[0].id, label: { read: 'a', pop: 'A', push: '' } }] })).toThrow(/empilha vazio/);
    expect(bad({ alphabet: 'ab' })).toThrow(/alfabeto/);
    expect(bad({ states: [{ id: 'a', name: 'a', pos: { x: 0, y: 0 }, note: 3 }], transitions: [], initial: null })).toThrow(/rótulo do estado/);
    expect(bad({ stackStart: 'ZZ' })).toThrow(/pilha/);
    expect(() => validateData({ kind: 'tm', states: [], transitions: [{ id: 't', from: 'a', to: 'a', label: { read: 'a', write: 'b', move: 'X' } }] })).toThrow();
    expect(() => validateData({ kind: 'grammar', text: 3 })).toThrow(/texto/);
    expect(() => validateData(undefined)).toThrow(/sem conteúdo/);
    expect(() => validateData({ ...good, states: [{ id: 'a', name: 'a', pos: { x: NaN, y: 0 } }], transitions: [] })).toThrow(/posição/);
  });

  it('descarta campos extras e completa o branco da MT', () => {
    const tm = validateData({ kind: 'tm', states: [{ id: 'a', name: 'q0', pos: { x: 0, y: 0 }, lixo: 1 }], transitions: [], initial: 'a' });
    expect(tm).toEqual({ kind: 'tm', states: [{ id: 'a', name: 'q0', pos: { x: 0, y: 0 }, accepting: false }], transitions: [], initial: 'a', blank: '□' });
    const fa = validateData({ kind: 'fa', states: [], transitions: [], alphabet: ['a'], stackStart: 'Z' });
    expect(fa).toEqual({ kind: 'fa', states: [], transitions: [], initial: null, alphabet: ['a'] });
  });
});

describe('link compartilhável', () => {
  it('ida e volta pelo hash', () => {
    const data = EXAMPLES[3].data();
    const hash = '#' + encodeShare('MT', data);
    expect(hash).toMatch(/^#[\w+\-$]+$/);
    expect(decodeShare(hash)).toEqual({ title: 'MT', data });
  });

  it('link corrompido ou com documento inválido', () => {
    expect(() => decodeShare('#@@@')).toThrow(/Link inválido/);
    expect(() => decodeShare('')).toThrow(/Link inválido/);
    expect(() => decodeShare(compressToEncodedURIComponent('{"format":"simulador-automatos","data":{"kind":"x"}}'))).toThrow(/desconhecido/);
  });
});

describe('arquivos do programa antigo', () => {
  it('detecta TPF0/binário e avisa', () => {
    const legacy = new Uint8Array([1, 2, 0x54, 0x50, 0x46, 0x30, 9]);
    expect(isLegacy(legacy)).toBe(true);
    expect(isLegacy(new Uint8Array([65, 0, 66]))).toBe(true);
    expect(isLegacy(bytes('{"a":1}'))).toBe(false);
    expect(() => readFile('velho.af', legacy)).toThrow(/programa antigo|Autômatos antigo/);
  });
});
