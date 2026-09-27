import { OUTRO, symMatches } from './symbols';
import { EPS, type Automaton, type FA, type PDA, type StateId, type Sym, type TM, type TransId } from './types';

export interface ConfigRef {
  frame: number;
  index: number;
}

export interface Config {
  state: StateId;
  /** Posição na entrada (AF/AP). */
  pos: number;
  /** AP: topo = último elemento. */
  stack?: Sym[];
  /** MT: células da fita e posição do cabeçote. */
  tape?: { cells: Sym[]; head: number };
  /** De qual configuração esta veio (null na inicial). No AF, o fecho-ε aponta para o mesmo frame. */
  parent: ConfigRef | null;
  via: TransId | null;
}

/** Um passo da simulação com todos os ramos ativos. */
export interface Frame {
  configs: Config[];
  used: TransId[];
}

export type Verdict = 'accept' | 'reject' | 'limit';

export interface SimRun {
  frames: Frame[];
  verdict: Verdict;
  /** Configuração que aceitou, se houver. */
  accepted: ConfigRef | null;
  /** Motivo legível quando nem começou (ex.: sem estado de partida). */
  error?: string;
}

export interface SimOptions {
  maxSteps: number;
  maxConfigs: number;
}

export const DEFAULT_SIM: SimOptions = { maxSteps: 1000, maxConfigs: 5000 };

const frame = (configs: Config[]): Frame => ({
  configs,
  used: configs.flatMap((c) => (c.via ? [c.via] : [])),
});

export function run(a: Automaton, input: string, opts: Partial<SimOptions> = {}): SimRun {
  const o = { ...DEFAULT_SIM, ...opts };
  if (!a.initial) return { frames: [], verdict: 'reject', accepted: null, error: 'Estado de partida não definido.' };
  const w = [...input];
  if (a.kind === 'fa') return runFA(a, w);
  if (a.kind === 'pda') return runPDA(a, w, o);
  return runTM(a, w, o);
}

/** AF (determinístico ou não): um frame por símbolo lido, com fecho-ε. */
function runFA(a: FA, w: Sym[]): SimRun {
  const accepting = new Set(a.states.filter((s) => s.accepting).map((s) => s.id));

  const closure = (cs: Config[], fi: number) => {
    const seen = new Set(cs.map((c) => c.state));
    for (let i = 0; i < cs.length; i++)
      for (const t of a.transitions)
        if (t.from === cs[i].state && t.label.read === EPS && !seen.has(t.to)) {
          seen.add(t.to);
          cs.push({ state: t.to, pos: cs[i].pos, parent: { frame: fi, index: i }, via: t.id });
        }
    return cs;
  };

  const frames = [frame(closure([{ state: a.initial!, pos: 0, parent: null, via: null }], 0))];
  for (let k = 0; k < w.length; k++) {
    const next: Config[] = [];
    const seen = new Set<StateId>();
    frames[k].configs.forEach((c, i) => {
      const out = a.transitions.filter((t) => t.from === c.state);
      let taken = out.filter((t) => symMatches(t.label.read, w[k]));
      // "outro": vale quando nenhuma outra transição do estado aceita o caractere
      if (!taken.length) taken = out.filter((t) => t.label.read === OUTRO);
      for (const t of taken)
        if (!seen.has(t.to)) {
          seen.add(t.to);
          next.push({ state: t.to, pos: k + 1, parent: { frame: k, index: i }, via: t.id });
        }
    });
    frames.push(frame(closure(next, k + 1)));
    if (!next.length) return { frames, verdict: 'reject', accepted: null };
  }
  const last = frames.length - 1;
  const index = frames[last].configs.findIndex((c) => accepting.has(c.state));
  return index >= 0
    ? { frames, verdict: 'accept', accepted: { frame: last, index } }
    : { frames, verdict: 'reject', accepted: null };
}

type Next = [TransId, Omit<Config, 'parent' | 'via'>];

/** Busca em largura sobre configurações: um frame por transição aplicada, todos os ramos juntos. */
function bfs(
  start: Config,
  succ: (c: Config) => Next[],
  accept: (c: Config) => boolean,
  key: (c: Omit<Config, 'parent' | 'via'>) => string,
  o: SimOptions,
): SimRun {
  const frames = [frame([start])];
  if (accept(start)) return { frames, verdict: 'accept', accepted: { frame: 0, index: 0 } };
  const visited = new Set([key(start)]);
  for (let step = 1; ; step++) {
    if (step > o.maxSteps) return { frames, verdict: 'limit', accepted: null };
    const next: Config[] = [];
    let accepted: ConfigRef | null = null;
    frames[step - 1].configs.forEach((c, i) => {
      for (const [via, n] of succ(c)) {
        const k = key(n);
        if (visited.has(k)) continue;
        visited.add(k);
        const cfg = { ...n, parent: { frame: step - 1, index: i }, via };
        if (!accepted && accept(cfg)) accepted = { frame: step, index: next.length };
        next.push(cfg);
      }
    });
    if (!next.length) return { frames, verdict: 'reject', accepted: null };
    frames.push(frame(next));
    if (accepted) return { frames, verdict: 'accept', accepted };
    if (next.length > o.maxConfigs) return { frames, verdict: 'limit', accepted: null };
  }
}

/** AP com aceitação por estado final (e entrada toda lida). */
function runPDA(a: PDA, w: Sym[], o: SimOptions): SimRun {
  const accepting = new Set(a.states.filter((s) => s.accepting).map((s) => s.id));
  const start: Config = { state: a.initial!, pos: 0, stack: a.stackStart ? [a.stackStart] : [], parent: null, via: null };
  return bfs(
    start,
    (c) => {
      const out: Next[] = [];
      const stack = c.stack!;
      for (const t of a.transitions) {
        if (t.from !== c.state) continue;
        const { read, pop, push } = t.label;
        if (read !== EPS && w[c.pos] !== read) continue;
        if (pop !== EPS && stack[stack.length - 1] !== pop) continue;
        const s = pop === EPS ? [...stack] : stack.slice(0, -1);
        if (push !== EPS) s.push(...[...push].reverse());
        out.push([t.id, { state: t.to, pos: read === EPS ? c.pos : c.pos + 1, stack: s }]);
      }
      return out;
    },
    (c) => c.pos === w.length && accepting.has(c.state),
    (c) => `${c.state}|${c.pos}|${c.stack!.join('\u0000')}`,
    o,
  );
}

/** MT: aceita ao entrar num estado de aceitação. '?' na leitura/escrita significa o branco. */
function runTM(a: TM, w: Sym[], o: SimOptions): SimRun {
  const accepting = new Set(a.states.filter((s) => s.accepting).map((s) => s.id));
  const b = a.blank;
  const norm = (s: Sym) => (s === EPS ? b : s);
  const start: Config = {
    state: a.initial!,
    pos: 0,
    tape: { cells: w.length ? w : [b], head: 0 },
    parent: null,
    via: null,
  };
  return bfs(
    start,
    (c) => {
      const { cells, head } = c.tape!;
      const out: Next[] = [];
      for (const t of a.transitions) {
        if (t.from !== c.state || norm(t.label.read) !== cells[head]) continue;
        const nc = [...cells];
        nc[head] = norm(t.label.write);
        let h = head + (t.label.move === 'D' ? 1 : t.label.move === 'E' ? -1 : 0);
        if (h < 0) {
          nc.unshift(b);
          h = 0;
        }
        if (h === nc.length) nc.push(b);
        out.push([t.id, { state: t.to, pos: 0, tape: { cells: nc, head: h } }]);
      }
      return out;
    },
    (c) => accepting.has(c.state),
    (c) => `${c.state}|${c.tape!.head}|${c.tape!.cells.join('\u0000')}`,
    o,
  );
}

/** Caminho da configuração inicial até ref (para histórico e destaque). */
export function path(r: SimRun, ref: ConfigRef): Config[] {
  const out: Config[] = [];
  for (let cur: ConfigRef | null = ref; cur; ) {
    const c: Config = r.frames[cur.frame].configs[cur.index];
    out.unshift(c);
    cur = c.parent;
  }
  return out;
}

export function runMany(a: Automaton, words: string[], opts: Partial<SimOptions> = {}) {
  return words.map((word) => ({ word, verdict: run(a, word, opts).verdict }));
}

/** Fita da MT como texto, sem brancos nas pontas. */
export function tapeText(cells: Sym[], blank: Sym): string {
  let i = 0,
    j = cells.length;
  while (i < j && cells[i] === blank) i++;
  while (j > i && cells[j - 1] === blank) j--;
  return cells.slice(i, j).join('');
}
