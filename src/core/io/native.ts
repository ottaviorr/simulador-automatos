import { DEFAULT_BLANK } from '../model';
import { faSymbol } from '../symbols';
import type { AnyTransition, Automaton, DocData, DocKind, Label, State } from '../types';
import { isLegacy, parseLegacy } from './legacy';

/** Extensões do programa original. */
export const EXT: Record<DocKind, string> = { fa: 'af', pda: 'afp', tm: 'mt', grammar: 'gr' };

const FORMAT = 'simulador-automatos';

export interface Loaded {
  title: string;
  data: DocData;
}

export const serialize = (title: string, data: DocData) =>
  JSON.stringify({ format: FORMAT, version: 1, title, data }, null, 2);

export const fileName = (title: string, data: DocData) =>
  `${title.replace(/[\/:*?"<>|]+/g, '_').trim() || 'automato'}.${EXT[data.kind]}`;

/** Lê um arquivo (JSON nosso ou binário do programa antigo). Lança Error com mensagem legível. */
export function readFile(name: string, bytes: Uint8Array): Loaded {
  const title = name.replace(/\.[^.]+$/, '');
  if (isLegacy(bytes)) return parseLegacy(name, bytes);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Arquivo não reconhecido: não é um documento do simulador.');
  }
  return fromJson(json, title);
}

export function fromJson(json: unknown, fallbackTitle = 'Sem título'): Loaded {
  const o = json as { format?: unknown; title?: unknown; data?: unknown };
  if (!o || typeof o !== 'object' || o.format !== FORMAT) throw new Error('Arquivo não é um documento do simulador.');
  return { title: typeof o.title === 'string' && o.title ? o.title : fallbackTitle, data: validateData(o.data) };
}

// ---- validação (entrada não confiável: arquivos e links) ----

const fail = (msg: string): never => {
  throw new Error(`Documento inválido: ${msg}`);
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, what: string) => (typeof x === 'string' ? x : fail(`${what} deve ser texto.`));
const sym = (x: unknown, what: string) =>
  typeof x === 'string' && [...x].length === 1 ? x : fail(`${what} deve ser um único caractere.`);
const num = (x: unknown, what: string) => (typeof x === 'number' && Number.isFinite(x) ? x : fail(`${what} inválido.`));

export function validateData(d: unknown): DocData {
  if (!isObj(d)) return fail('sem conteúdo.');
  if (d.kind === 'grammar') return { kind: 'grammar', text: str(d.text, 'texto da gramática') };
  if (d.kind !== 'fa' && d.kind !== 'pda' && d.kind !== 'tm') return fail(`tipo "${String(d.kind)}" desconhecido.`);
  const kind = d.kind;
  if (!Array.isArray(d.states) || !Array.isArray(d.transitions)) return fail('faltam estados ou transições.');

  const ids = new Set<string>();
  const names = new Set<string>();
  const states = d.states.map((s): State => {
    if (!isObj(s) || !isObj(s.pos)) return fail('estado malformado.');
    const id = str(s.id, 'id do estado');
    if (ids.has(id)) fail(`id de estado repetido "${id}".`);
    ids.add(id);
    const name = str(s.name, 'nome do estado');
    if (names.has(name)) fail(`nome de estado repetido "${name}".`);
    names.add(name);
    return {
      id,
      name,
      pos: { x: num(s.pos.x, 'posição'), y: num(s.pos.y, 'posição') },
      accepting: s.accepting === true,
      ...(s.note != null && { note: str(s.note, 'rótulo do estado') }),
    };
  });
  const stateRef = (x: unknown) => {
    const id = str(x, 'referência de estado');
    return ids.has(id) ? id : fail(`transição aponta para estado inexistente "${id}".`);
  };

  const label = (l: unknown): Label => {
    if (!isObj(l)) return fail('rótulo malformado.');
    if (kind === 'fa') {
      try {
        return { read: faSymbol(str(l.read, 'símbolo lido')) };
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    const read = sym(l.read, 'símbolo lido');
    if (kind === 'pda') return { read, pop: sym(l.pop, 'topo da pilha'), push: str(l.push, 'símbolos empilhados') || fail('empilha vazio; use ?.') };
    if (l.move !== 'E' && l.move !== 'D' && l.move !== 'P') return fail('direção deve ser E, D ou P.');
    return { read, write: sym(l.write, 'símbolo gravado'), move: l.move };
  };
  const transitions = d.transitions.map((t) => {
    if (!isObj(t)) return fail('transição malformada.');
    return { id: str(t.id, 'id da transição'), from: stateRef(t.from), to: stateRef(t.to), label: label(t.label) } as AnyTransition;
  });

  const a = {
    kind,
    states,
    transitions,
    initial: d.initial == null ? null : stateRef(d.initial),
    ...(d.alphabet !== undefined && {
      alphabet: Array.isArray(d.alphabet) ? d.alphabet.map((x) => sym(x, 'símbolo do alfabeto')) : fail('alfabeto inválido.'),
    }),
    ...(kind === 'pda' && d.stackStart != null && { stackStart: sym(d.stackStart, 'símbolo inicial da pilha') }),
    ...(kind === 'tm' && { blank: d.blank == null ? DEFAULT_BLANK : sym(d.blank, 'símbolo branco') }),
  };
  return a as Automaton;
}
