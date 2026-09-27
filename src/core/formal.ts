import { inputAlphabet, isDeterministic } from './analyze';
import { describeSymbol, literal, OUTRO } from './symbols';
import { EPS, type Automaton } from './types';

/** Resultado de δ: um item (tupla) ou um conjunto de itens. */
interface Row {
  args: string[];
  set: boolean;
  items: string[][];
}

/** Definição formal: (Q, Σ, δ, q0, F) e equivalentes para AP e MT, em texto e LaTeX. */
export function formalDefinition(a: Automaton): { text: string; latex: string } {
  const name = new Map(a.states.map((s) => [s.id, s.name]));
  const Q = a.states.map((s) => s.name);
  const F = a.states.filter((s) => s.accepting).map((s) => s.name);
  const q0 = a.initial ? name.get(a.initial)! : '—';
  const sigma = inputAlphabet(a);

  const grouped = new Map<string, Row>();
  const put = (args: string[], item: string[], set: boolean) => {
    const k = args.join('\u0000');
    if (!grouped.has(k)) grouped.set(k, { args, set, items: [] });
    grouped.get(k)!.items.push(item);
  };
  let tuple: string[];
  let gamma: string[] | null = null;

  if (a.kind === 'fa') {
    const det = isDeterministic(a);
    for (const t of a.transitions) put([name.get(t.from)!, t.label.read], [name.get(t.to)!], !det);
    tuple = ['Q', 'Σ', 'δ', q0, 'F'];
  } else if (a.kind === 'pda') {
    const g = new Set<string>(a.stackStart ? [a.stackStart] : []);
    for (const t of a.transitions) {
      const { read, pop, push } = t.label;
      if (pop !== EPS) g.add(pop);
      if (push !== EPS) [...push].forEach((c) => g.add(c));
      put([name.get(t.from)!, read, pop], [name.get(t.to)!, push], true);
    }
    gamma = [...g].sort();
    tuple = ['Q', 'Σ', 'Γ', 'δ', q0, ...(a.stackStart ? [a.stackStart] : []), 'F'];
  } else {
    const b = (s: string) => (s === EPS ? a.blank : s);
    const g = new Set<string>([...sigma, a.blank]);
    for (const t of a.transitions) {
      g.add(b(t.label.read)).add(b(t.label.write));
      put([name.get(t.from)!, b(t.label.read)], [name.get(t.to)!, b(t.label.write), t.label.move], false);
    }
    gamma = [...g].sort();
    tuple = ['Q', 'Σ', 'Γ', 'δ', q0, a.blank, 'F'];
  }
  const rows = [...grouped.values()];
  const sets: [string, string[]][] = [['Q', Q], ['Σ', sigma], ...(gamma ? [['Γ', gamma] as [string, string[]]] : []), ['F', F]];

  const show = (r: Row, f: (s: string) => string, open: string, close: string) => {
    const items = r.items.map((it) => (it.length === 1 ? f(it[0]) : `(${it.map(f).join(', ')})`));
    return r.set ? `${open}${items.join(', ')}${close}` : items.join(', ');
  };

  // Σ com as classes das aulas (L, D, [..], outro): mostra o que cada uma contém.
  const rank = (x: string) => (x === 'L' ? 0 : x === 'D' ? 1 : x === OUTRO ? 3 : 2);
  const classes = a.kind === 'fa' ? sigma.filter((x) => describeSymbol(x)).sort((x, y) => rank(x) - rank(y)) : [];
  const literals = sigma.filter((x) => !classes.includes(x)).map(literal);
  const NAMES: Record<string, string> = { L: 'letra', D: 'dígito' };
  const legend = classes.map((c) => `${c} = ${c === OUTRO ? '' : `${NAMES[c] ?? 'classe'} `}${describeSymbol(c)!.text}`);
  const sigmaParts = (fmt: 'text' | 'latex', lits: string) => {
    const parts = classes.filter((c) => c !== OUTRO).map((c) => describeSymbol(c)![fmt]);
    if (literals.length) parts.push(lits);
    if (classes.includes(OUTRO)) parts.push(fmt === 'text' ? '{demais caracteres}' : '\\{\\text{demais caracteres}\\}');
    return parts.join(fmt === 'text' ? ' ∪ ' : ' \\cup ');
  };

  const eps = (s: string) => (s === EPS ? 'ε' : literal(s));
  const text = [
    `M = (${tuple.join(', ')})`,
    ...sets.flatMap(([k, v]) =>
      k === 'Σ' && classes.length ? [`Σ = ${sigmaParts('text', `{${literals.join(', ')}}`)}`, `  onde ${legend.join('; ')}`] : [`${k} = {${v.join(', ')}}`],
    ),
    `q0 = ${q0}`,
    'δ:',
    ...rows.map((r) => `  δ(${r.args.map(eps).join(', ')}) = ${show(r, eps, '{', '}')}`),
  ].join('\n');

  const SPECIAL: Record<string, string> = {
    Σ: '\\Sigma', Γ: '\\Gamma', δ: '\\delta', ε: '\\varepsilon', [EPS]: '\\varepsilon',
    '□': '\\sqcup', '∅': '\\emptyset', '\\': '\\backslash',
  };
  const tex = (s: string) =>
    [...s]
      .map((c) => SPECIAL[c] ?? ('{}_#$%&'.includes(c) ? '\\' + c : '^~'.includes(c) ? `\\text{\\${c}{}}` : c))
      .join('');
  const states = new Set(Q);
  // Nome de estado: q0 → q_{0}; os demais em \text{}.
  const tok = (s: string) => {
    // símbolo de várias letras (outro, [a-z]) vai em \text{}; \L vira L
    if (!states.has(s)) return [...s].length > 1 && s[0] !== '\\' ? `\\text{${tex(s)}}` : tex(literal(s));
    const m = /^([a-zA-Z]+)(\d+)$/.exec(s);
    return m ? `${m[1]}_{${m[2]}}` : `\\text{${tex(s)}}`;
  };
  const set = (v: string[]) => `\\{${v.map(tok).join(', ')}\\}`;

  const latex = [
    '\\begin{aligned}',
    `M &= (${tuple.map(tok).join(', ')}) \\\\`,
    ...sets.map(([k, v]) => `${tex(k)} &= ${k === 'Σ' && classes.length ? sigmaParts('latex', `\\{${literals.map(tex).join(', ')}\\}`) : set(v)} \\\\`),
    ...(legend.length ? [`&\\text{onde } ${classes.map((c) => `${tok(c)} = ${describeSymbol(c)!.latex}`).join(',\\ ')} \\\\`] : []),
    ...rows.map((r) => `\\delta(${r.args.map(tok).join(', ')}) &= ${show(r, tok, '\\{', '\\}')} \\\\`),
    '\\end{aligned}',
  ].join('\n');

  return { text, latex };
}
