import { rawFA } from './model';
import { autoLayout } from './layout';
import { faSymbol } from './symbols';
import { EPS, type FA, type Parsed, type Regex, type StateId, type Sym } from './types';

/** Caracteres com significado especial como símbolo de AF (L = letra, D = dígito, ? = vazio) viram literais escapados. */
const lit = (c: string) => (c === 'L' || c === 'D' || c === EPS ? '\\' + c : c);

// Sintaxe (a mesma do Flex/da aula): união "|", concatenação por justaposição, "*" (zero ou mais),
// "+" (uma ou mais), "?" depois de algo (opcional), parênteses, classes [a-z0-9_], "\x" = x literal.
// "?" sozinho, ε ou λ = palavra vazia; "∅" = linguagem vazia. Espaços são ignorados.

export const R = {
  eps: { t: 'eps' } as Regex,
  empty: { t: 'empty' } as Regex,
  sym: (s: Sym): Regex => ({ t: 'sym', s }),
  /** Construtores com simplificações algébricas básicas. */
  alt(a: Regex, b: Regex): Regex {
    if (a.t === 'empty') return b;
    if (b.t === 'empty') return a;
    if (printRegex(a) === printRegex(b)) return a;
    if (a.t === 'eps' && b.t === 'star') return b;
    if (b.t === 'eps' && a.t === 'star') return a;
    return { t: 'alt', a, b };
  },
  cat(a: Regex, b: Regex): Regex {
    if (a.t === 'empty' || b.t === 'empty') return R.empty;
    if (a.t === 'eps') return b;
    if (b.t === 'eps') return a;
    return { t: 'cat', a, b };
  },
  star(a: Regex): Regex {
    if (a.t === 'empty' || a.t === 'eps') return R.eps;
    if (a.t === 'star') return a;
    if (a.t === 'alt' && a.a.t === 'eps') return R.star(a.b);
    if (a.t === 'alt' && a.b.t === 'eps') return R.star(a.a);
    return { t: 'star', a };
  },
};

const SPECIAL = new Set(['(', ')', '|', '+', '*', '?', '[', ']', '{', '}', '\\']);

export function parseRegex(text: string): Parsed<Regex> {
  const toks = [...text].map((c, col) => ({ c, col: col + 1 })).filter((t) => !/\s/.test(t.c));
  let i = 0;
  const fail = (msg: string, col = toks[i]?.col ?? text.length + 1): never => {
    throw { col, msg };
  };
  const peek = () => toks[i]?.c;
  const alts = (xs: Regex[]) => xs.reduce((a, b) => ({ t: 'alt', a, b }));

  // Aqui não simplificamos: a ER mostrada ao usuário deve refletir o que ele digitou.
  const alt = (): Regex => {
    let r = cat();
    while (peek() === '|') {
      i++;
      r = { t: 'alt', a: r, b: cat() };
    }
    return r;
  };
  const cat = (): Regex => {
    let r: Regex | null = null;
    while (i < toks.length && peek() !== ')' && peek() !== '|') {
      const s = postfix();
      r = r ? { t: 'cat', a: r, b: s } : s;
    }
    return r ?? fail('Faltou uma expressão aqui.');
  };
  const postfix = (): Regex => {
    let r = atom();
    for (;;) {
      const c = peek();
      if (c === '*') r = { t: 'star', a: r };
      else if (c === '+') r = { t: 'cat', a: r, b: { t: 'star', a: r } }; // r+ = rr*
      else if (c === '?') r = { t: 'alt', a: r, b: R.eps }; // r? = r|ε
      else return r;
      i++;
    }
  };
  // Caractere literal; com escape (\L, \?) vira o literal protegido para o AF.
  const literal = () => {
    const t = toks[i++];
    if (t.c !== '\\') return t.c;
    if (i >= toks.length) fail('"\\" precisa de um caractere depois.', t.col);
    return lit(toks[i++].c);
  };
  const charClass = (open: number): Regex => {
    if (peek() === '^') fail('Negação [^...] não é suportada: o alfabeto do autômato não é fixo.');
    const syms: string[] = [];
    while (i < toks.length && peek() !== ']') {
      const from = literal();
      if (peek() === '-' && toks[i + 1] && toks[i + 1].c !== ']') {
        i++;
        const to = literal();
        const [a, b] = [from.codePointAt(0)!, to.codePointAt(0)!];
        if (b < a) fail(`Intervalo invertido: ${from}-${to}.`);
        if (b - a > 200) fail(`Intervalo grande demais: ${from}-${to}.`);
        for (let c = a; c <= b; c++) syms.push(String.fromCodePoint(c));
      } else syms.push(from);
    }
    if (peek() !== ']') fail('Colchete não fechado.', open);
    i++;
    if (!syms.length) fail('Classe vazia [].', open);
    // dentro de [..] tudo é literal: [A-Z] contém a letra L, não a classe L
    return alts([...new Set(syms)].map((c) => R.sym(c.length === 1 ? lit(c) : c)));
  };
  const atom = (): Regex => {
    const t = toks[i];
    if (!t) return fail('Expressão incompleta.');
    if (t.c === '(') {
      i++;
      const r = alt();
      if (peek() !== ')') fail('Parêntese não fechado.', t.col);
      i++;
      return r;
    }
    if (t.c === '[') {
      i++;
      return charClass(t.col);
    }
    // {nome}: símbolo nomeado, como {outro} (notação de macro do Flex)
    if (t.c === '{') {
      let j = i + 1;
      while (j < toks.length && toks[j].c !== '}') j++;
      if (j >= toks.length || j === i + 1) fail('Use {nome}, ex.: {outro}.', t.col);
      const name = toks.slice(i + 1, j).map((x) => x.c).join('');
      i = j + 1;
      try {
        return R.sym(faSymbol(name));
      } catch (e) {
        return fail((e as Error).message, t.col);
      }
    }
    if (t.c === '*' || t.c === '+') fail(`"${t.c}" precisa de algo antes.`);
    if (t.c === EPS || t.c === 'ε' || t.c === 'λ') return i++, R.eps;
    if (t.c === '∅') return i++, R.empty;
    if (t.c !== '\\' && SPECIAL.has(t.c)) fail(`"${t.c}" inesperado.`);
    return R.sym(literal());
  };

  try {
    if (!toks.length) fail('Digite uma expressão regular.', 1);
    const r = alt();
    if (i < toks.length) fail(peek() === ')' ? 'Parêntese fechado sem abrir.' : `"${peek()}" inesperado.`);
    return { ok: true, value: r };
  } catch (e) {
    return { ok: false, errors: [e as { col: number; msg: string }] };
  }
}

/** Imprime com o mínimo de parênteses (prec: 0 união, 1 concatenação, 2 fecho). */
export function printRegex(r: Regex, prec = 0): string {
  const wrap = (s: string, p: number) => (p < prec ? `(${s})` : s);
  switch (r.t) {
    case 'eps':
      return 'ε';
    case 'empty':
      return '∅';
    case 'sym':
      if ([...r.s].length > 1 && r.s[0] !== '\\') return `{${r.s}}`; // símbolo nomeado, ex.: {outro}
      return SPECIAL.has(r.s) || ['ε', 'λ', '∅'].includes(r.s) ? '\\' + r.s : r.s;
    case 'alt':
      return wrap(`${printRegex(r.a, 0)}|${printRegex(r.b, 0)}`, 0);
    case 'cat':
      return wrap(printRegex(r.a, 1) + printRegex(r.b, 1), 1);
    case 'star':
      return printRegex(r.a, 2) + '*';
  }
}

/** Símbolos de uma união formada só por símbolos (a|b|c), ou null. */
function symbolsOnly(r: Regex): Sym[] | null {
  if (r.t === 'sym') return [r.s];
  if (r.t !== 'alt') return null;
  const a = symbolsOnly(r.a),
    b = symbolsOnly(r.b);
  return a && b ? [...new Set([...a, ...b])] : null;
}

/** Construção de Thompson. */
export function regexToNfa(r: Regex): FA {
  let n = 0;
  const edges: [string, string, string][] = [];
  const go = (r: Regex): [string, string] => {
    if (r.t === 'cat') {
      const [a1, a2] = go(r.a);
      const [b1, b2] = go(r.b);
      edges.push([a2, EPS, b1]);
      return [a1, b2];
    }
    const s = `t${n++}`;
    const e = `t${n++}`;
    const syms = symbolsOnly(r);
    if (r.t === 'eps') edges.push([s, EPS, e]);
    // símbolo, ou união só de símbolos (classe [0-9]): uma aresta com todos, em vez de um ramo por símbolo
    else if (syms) for (const x of syms) edges.push([s, x, e]);
    else if (r.t === 'alt') {
      for (const [x1, x2] of [go(r.a), go(r.b)]) edges.push([s, EPS, x1], [x2, EPS, e]);
    } else if (r.t === 'star') {
      const [a1, a2] = go(r.a);
      edges.push([s, EPS, a1], [s, EPS, e], [a2, EPS, a1], [a2, EPS, e]);
    }
    return [s, e];
  };
  const [start, end] = go(r);
  // Renomeia em ordem de BFS para ficar legível: q0, q1, …
  const order = [start];
  for (let k = 0; k < order.length; k++)
    for (const [f, , t] of edges) if (f === order[k] && !order.includes(t)) order.push(t);
  if (!order.includes(end)) order.push(end);
  const name = new Map(order.map((x, k) => [x, `q${k}`]));
  const nm = (x: string) => name.get(x)!;
  return autoLayout(
    rawFA(
      order.map(nm),
      nm(start),
      [nm(end)],
      edges.filter(([f]) => name.has(f)).map(([f, s, t]) => [nm(f), s, nm(t)]),
    ),
  );
}

/** AF → ER por eliminação de estados (elimina primeiro quem gera menos arestas novas). */
export function faToRegex(a: FA): Regex {
  if (!a.initial) throw new Error('Estado de partida não definido.');
  const S = '\u0000start',
    F = '\u0000final';
  const edge = new Map<string, Map<string, Regex>>();
  const get = (p: string, q: string) => edge.get(p)?.get(q) ?? R.empty;
  const set = (p: string, q: string, r: Regex) => {
    if (!edge.has(p)) edge.set(p, new Map());
    edge.get(p)!.set(q, r);
  };
  const add = (p: string, q: string, r: Regex) => set(p, q, R.alt(get(p, q), r));

  add(S, a.initial, R.eps);
  for (const s of a.states) if (s.accepting) add(s.id, F, R.eps);
  for (const t of a.transitions) add(t.from, t.to, t.label.read === EPS ? R.eps : R.sym(t.label.read));

  const remaining = new Set<StateId>(a.states.map((s) => s.id));
  const ins = (k: string) => [S, ...remaining].filter((p) => p !== k && get(p, k).t !== 'empty');
  const outs = (k: string) => [F, ...remaining].filter((q) => q !== k && get(k, q).t !== 'empty');
  while (remaining.size) {
    let k = '',
      best = Infinity;
    for (const x of remaining) {
      const cost = ins(x).length * outs(x).length;
      if (cost < best) (best = cost), (k = x);
    }
    const loop = R.star(get(k, k));
    const [I, O] = [ins(k), outs(k)];
    remaining.delete(k);
    for (const p of I) for (const q of O) add(p, q, R.cat(R.cat(get(p, k), loop), get(k, q)));
    edge.delete(k);
    for (const m of edge.values()) m.delete(k);
  }
  return get(S, F);
}
