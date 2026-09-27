import { EPS } from './types';

// Símbolos de transição do AF, na notação das aulas:
//   a        caractere literal
//   L        qualquer letra (A–Z, a–z)
//   D        qualquer dígito (0–9)
//   [a-z_]   classe de caracteres
//   outro    qualquer caractere sem outra transição saindo do mesmo estado
//   \L       o caractere L literal (idem \D, \?, \[ …)
// Nas conversões (AFN→AFD, minimização, ER, gramática) cada um é tratado como um símbolo só.

export const OUTRO = 'outro';

const ALIASES: Record<string, string> = {
  letra: 'L', letras: 'L', dígito: 'D', digito: 'D', dígitos: 'D', digitos: 'D', outros: OUTRO, [OUTRO]: OUTRO,
};

/** Normaliza o texto digitado num símbolo válido de AF; lança Error se inválido. */
export function faSymbol(token: string): string {
  const t = token.trim();
  if ([...t].length === 1) return t;
  if (t.length === 2 && t[0] === '\\') return t;
  const alias = ALIASES[t.toLowerCase()];
  if (alias) return alias;
  if (/^\[.+\]$/.test(t)) {
    classSet(t); // valida
    return t;
  }
  throw new Error(`Símbolo inválido "${t}". Use um caractere, L (letra), D (dígito), outro, [a-z] ou ? para vazio.`);
}

const cache = new Map<string, Set<string>>();

/** Conjunto de caracteres de uma classe [..]. */
export function classSet(cls: string): Set<string> {
  let set = cache.get(cls);
  if (set) return set;
  const body = [...cls.slice(1, -1)];
  if (body[0] === '^') throw new Error('Negação [^...] não é suportada; use "outro".');
  set = new Set();
  for (let i = 0; i < body.length; i++) {
    let c = body[i];
    if (c === '\\' && i + 1 < body.length) c = body[++i];
    if (body[i + 1] === '-' && i + 2 < body.length) {
      let d = body[i + 2];
      i += 2;
      if (d === '\\' && i + 1 < body.length) d = body[++i];
      const [a, b] = [c.codePointAt(0)!, d.codePointAt(0)!];
      if (b < a) throw new Error(`Intervalo invertido em ${cls}: ${c}-${d}.`);
      for (let x = a; x <= b; x++) set.add(String.fromCodePoint(x));
    } else set.add(c);
  }
  cache.set(cls, set);
  return set;
}

/** Símbolo de transição casa com o caractere lido? ("outro" é tratado na simulação.) */
export function symMatches(sym: string, c: string | undefined): boolean {
  if (c === undefined || sym === EPS || sym === OUTRO) return false;
  if (sym === 'L') return /^[A-Za-z]$/.test(c);
  if (sym === 'D') return /^[0-9]$/.test(c);
  if (sym.length === 2 && sym[0] === '\\') return c === sym[1];
  if (sym[0] === '[' && sym.length > 2) return classSet(sym).has(c);
  return sym === c;
}

const LETTERS = new Set([...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']);
const DIGITS = new Set([...'0123456789']);

/** Caracteres que o símbolo aceita (outro/ε: nenhum fixo). */
function charsOf(sym: string): Set<string> {
  if (sym === EPS || sym === OUTRO) return new Set();
  if (sym === 'L') return LETTERS;
  if (sym === 'D') return DIGITS;
  if (sym.length === 2 && sym[0] === '\\') return new Set([sym[1]]);
  if (sym[0] === '[' && sym.length > 2) return classSet(sym);
  return new Set([sym]);
}

/** Dois símbolos diferentes aceitam algum caractere em comum? (ex.: L e a) */
export function overlaps(x: string, y: string): boolean {
  if (x === y) return true;
  const a = charsOf(x);
  for (const c of charsOf(y)) if (a.has(c)) return true;
  return false;
}

/** Descrição de uma classe para a definição formal, ou null se for literal. */
export function describeSymbol(sym: string): { text: string; latex: string } | null {
  if (sym === 'L') return { text: '{a, …, z, A, …, Z}', latex: '\\{a, \\dots, z, A, \\dots, Z\\}' };
  if (sym === 'D') return { text: '{0, 1, …, 9}', latex: '\\{0, 1, \\dots, 9\\}' };
  if (sym === OUTRO) return { text: 'qualquer símbolo sem outra transição saindo do estado', latex: '\\text{qualquer símbolo sem outra transição saindo do estado}' };
  if (sym[0] === '[' && sym.length > 2) {
    const s = [...classSet(sym)];
    return { text: `{${s.join(', ')}}`, latex: `\\{${s.join(', ')}\\}` };
  }
  return null;
}

/** Texto do símbolo literal (tira a barra de \L). */
export const literal = (sym: string) => (sym.length === 2 && sym[0] === '\\' ? sym[1] : sym);
