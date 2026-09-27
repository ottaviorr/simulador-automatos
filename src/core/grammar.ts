import { rawFA } from './model';
import { faSymbol } from './symbols';
import { autoLayout } from './layout';
import { EPS, type FA, type Grammar, type ParseError, type Parsed, type Production } from './types';

export const isVariable = (tok: string) => /^[A-Z]$/.test(tok) || /^<[^<>\s]+>$/.test(tok);

const ARROW = /->|→|::=/;
const EPSILONS = new Set([EPS, 'ε', 'λ']);

/** Separa um lado direito em símbolos. Retorna null se for ε. */
function tokenize(alt: string): string[] | null {
  const s = alt.trim();
  if (EPSILONS.has(s)) return null;
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (/\s/.test(c)) i++;
    else if (c === '{' && s.indexOf('}', i) > i + 1) {
      // terminal nomeado, ex.: {outro}
      const j = s.indexOf('}', i);
      out.push(s.slice(i + 1, j));
      i = j + 1;
    } else if (c === '<' && s.indexOf('>', i) > i + 1) {
      const j = s.indexOf('>', i);
      out.push(s.slice(i, j + 1));
      i = j + 1;
    } else {
      const ch = String.fromCodePoint(s.codePointAt(i)!);
      out.push(ch);
      i += ch.length;
    }
  }
  return out;
}

const validSymbol = (t: string) => {
  try {
    faSymbol(t);
    return true;
  } catch {
    return false;
  }
};

/** Lê produções no formato "S -> aA | b | ?" (uma ou mais por linha). Exige linear à direita. */
export function parseGrammar(text: string): Parsed<Grammar> {
  const productions: Production[] = [];
  const errors: ParseError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const m = raw.split(ARROW);
    if (m.length !== 2) return errors.push({ line, msg: 'Use o formato "S -> aA | b".' });
    const head = m[0].trim();
    if (!isVariable(head))
      return errors.push({ line, msg: `"${head}" não é uma variável (use letra maiúscula ou <nome>).` });
    for (const alt of m[1].split('|')) {
      if (!alt.trim()) {
        errors.push({ line, msg: `Alternativa vazia; use ${EPS} para a palavra vazia.` });
        continue;
      }
      const body = tokenize(alt) ?? [];
      if (body.some((t) => EPSILONS.has(t)))
        errors.push({ line, msg: `"${alt.trim()}": ${EPS} só pode aparecer sozinho.` });
      else if (body.some((t, j) => isVariable(t) && j !== body.length - 1))
        errors.push({
          line,
          msg: `"${alt.trim()}" não é linear à direita: a variável deve ser o último símbolo.`,
        });
      else {
        const bad = body.find((t) => !isVariable(t) && [...t].length > 1 && !validSymbol(t));
        if (bad) errors.push({ line, msg: `Terminal inválido "{${bad}}": use {outro}, {L}, {D} ou uma classe como {[a-z]}.` });
        else productions.push({ head, body: body.map((t) => (isVariable(t) || [...t].length === 1 ? t : faSymbol(t))) });
      }
    }
  });
  if (errors.length) return { ok: false, errors };
  if (!productions.length) return { ok: false, errors: [{ msg: 'A gramática não tem produções.' }] };
  return { ok: true, value: { start: productions[0].head, productions } };
}

export function printGrammar(g: Grammar): string {
  const heads = [...new Set([g.start, ...g.productions.map((p) => p.head)])];
  return heads
    .map((h) => {
      const alts = g.productions.filter((p) => p.head === h).map((p) => (p.body.length ? p.body.map((t) => (!isVariable(t) && [...t].length > 1 ? `{${t}}` : t)).join('') : EPS));
      return alts.length ? `${h} -> ${alts.join(' | ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** AF → gramática linear à direita. O estado de partida vira S. */
export function faToGrammar(a: FA): Grammar {
  if (!a.initial) throw new Error('Estado de partida não definido.');
  const others = a.states.filter((s) => s.id !== a.initial);
  const letters = [...'ABCDEFGHIJKLMNOPQRTUVWXYZ'];
  const varOf = new Map<string, string>([[a.initial, 'S']]);
  others.forEach((s, i) => varOf.set(s.id, others.length <= letters.length ? letters[i] : `<${s.name}>`));
  const ordered = [a.states.find((s) => s.id === a.initial)!, ...others];
  const productions: Production[] = [];
  for (const s of ordered) {
    for (const t of a.transitions)
      if (t.from === s.id)
        productions.push({
          head: varOf.get(s.id)!,
          body: t.label.read === EPS ? [varOf.get(t.to)!] : [t.label.read, varOf.get(t.to)!],
        });
    if (s.accepting) productions.push({ head: varOf.get(s.id)!, body: [] });
  }
  return { start: 'S', productions };
}

/** Gramática linear à direita → AF (um estado por variável + estado final qf). */
export function grammarToFa(g: Grammar): FA {
  const vars = [...new Set([g.start, ...g.productions.flatMap((p) => [p.head, ...p.body.filter(isVariable)])])];
  const names = [...vars];
  const accepting = new Set<string>();
  const edges: [string, string, string][] = [];
  const FINAL = 'qf';
  let fresh = 0;
  const newState = () => {
    let n: string;
    do n = `q${fresh++}`;
    while (names.includes(n));
    names.push(n);
    return n;
  };
  let needFinal = false;
  for (const { head, body } of g.productions) {
    if (!body.length) {
      accepting.add(head);
      continue;
    }
    const last = body[body.length - 1];
    const target = isVariable(last) ? last : FINAL;
    if (target === FINAL) needFinal = true;
    const terms = isVariable(last) ? body.slice(0, -1) : body;
    if (!terms.length) {
      edges.push([head, EPS, target]);
      continue;
    }
    let cur = head;
    terms.forEach((sym, i) => {
      const next = i === terms.length - 1 ? target : newState();
      edges.push([cur, sym, next]);
      cur = next;
    });
  }
  if (needFinal) {
    names.push(FINAL);
    accepting.add(FINAL);
  }
  return autoLayout(rawFA(names, g.start, [...accepting], edges));
}
