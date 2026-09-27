/** Símbolo vazio (ε/λ), como no programa original. Vale em qualquer campo de rótulo. */
export const EPS = '?';

/** Um símbolo é sempre um único caractere. */
export type Sym = string;
export type StateId = string;
export type TransId = string;

export interface Point {
  x: number;
  y: number;
}

export interface State {
  id: StateId;
  /** Nome exibido no diagrama (q0, {q0,q1}, …). */
  name: string;
  pos: Point;
  accepting: boolean;
  /** Rótulo livre mostrado sob o estado (ex.: ERRO, NUM_INT). */
  note?: string;
}

export interface FaLabel {
  read: Sym;
}
/** push: sequência a empilhar; o 1º caractere vira o novo topo. '?' = não empilha. */
export interface PdaLabel {
  read: Sym;
  pop: Sym;
  push: string;
}
/** E = esquerda, D = direita, P = parado. */
export type Move = 'E' | 'D' | 'P';
export interface TmLabel {
  read: Sym;
  write: Sym;
  move: Move;
}

/** Uma transição por rótulo; o canvas agrupa as de mesmo (from, to). */
export interface Transition<L> {
  id: TransId;
  from: StateId;
  to: StateId;
  label: L;
}

interface Base<K extends string, L> {
  kind: K;
  states: State[];
  transitions: Transition<L>[];
  initial: StateId | null;
  /** Alfabeto de entrada declarado (opcional). Se presente, símbolos fora dele geram aviso. */
  alphabet?: Sym[];
}

export type FA = Base<'fa', FaLabel>;
export type PDA = Base<'pda', PdaLabel> & { stackStart?: Sym };
export type TM = Base<'tm', TmLabel> & { blank: Sym };
export type Automaton = FA | PDA | TM;
export type AutomatonKind = Automaton['kind'];
export type Label = FaLabel | PdaLabel | TmLabel;
export type AnyTransition = Automaton['transitions'][number];

/** Documento de gramática guarda o texto (pode estar inválido durante a edição). */
export interface GrammarDoc {
  kind: 'grammar';
  text: string;
}

/** Gramática já analisada. body [] = ε. Variáveis: A–Z ou <nome>; terminais: 1 caractere. */
export interface Production {
  head: string;
  body: string[];
}
export interface Grammar {
  start: string;
  productions: Production[];
}

export type Regex =
  | { t: 'eps' }
  | { t: 'empty' }
  | { t: 'sym'; s: Sym }
  | { t: 'cat'; a: Regex; b: Regex }
  | { t: 'alt'; a: Regex; b: Regex }
  | { t: 'star'; a: Regex };

export type DocData = Automaton | GrammarDoc;
export type DocKind = DocData['kind'];

export interface Doc {
  id: string;
  title: string;
  data: DocData;
  updatedAt: number;
}

/** Resultado de parsers: valor ou lista de erros legíveis. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: ParseError[] };
export interface ParseError {
  line?: number;
  col?: number;
  msg: string;
}
