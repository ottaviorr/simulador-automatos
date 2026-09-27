import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { run, type Config, type SimRun, type Verdict } from '../core/sim';
import type { Automaton, TM } from '../core/types';
import type { Highlight } from './Canvas';
import { Badge, Button, IconButton, Section, cx, inputCls } from './ui';

const VERDICT: Record<Verdict, { label: string; tone: 'green' | 'red' | 'amber' }> = {
  accept: { label: 'ACEITA', tone: 'green' },
  reject: { label: 'REJEITA', tone: 'red' },
  limit: { label: 'Limite de passos atingido', tone: 'amber' },
};

export function SimPanel({ a, onHighlight, suggest }: { a: Automaton; onHighlight(h: Highlight | null): void; suggest?: string[] }) {
  const [input, setInput] = useState('');
  const [maxSteps, setMaxSteps] = useState(1000);
  const [sim, setSim] = useState<SimRun | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2); // passos por segundo
  const [batch, setBatch] = useState(() => suggest?.join('\n') ?? '');
  const [results, setResults] = useState<{ word: string; verdict: Verdict; end?: string }[] | null>(null);

  // Editou o autômato: a simulação atual deixa de valer.
  useEffect(() => {
    setSim(null);
    setResults(null);
    setPlaying(false);
  }, [a]);

  const last = sim ? sim.frames.length - 1 : 0;
  const cur = sim?.frames[frame];

  useEffect(() => {
    onHighlight(cur ? { states: new Set(cur.configs.map((c) => c.state)), trans: new Set(cur.used), step: frame, speed } : null);
  }, [cur, frame, speed, onHighlight]);
  useEffect(() => () => onHighlight(null), [onHighlight]);

  useEffect(() => {
    if (!playing) return;
    if (frame >= last) return setPlaying(false);
    const t = setTimeout(() => setFrame((f) => f + 1), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, frame, last, speed]);

  const start = () => {
    const r = run(a, input, { maxSteps });
    setSim(r);
    setFrame(0);
    return r;
  };
  const step = (d: number) => {
    if (!sim) return start();
    setFrame((f) => Math.max(0, Math.min(last, f + d)));
  };
  const name = useMemo(() => new Map(a.states.map((s) => [s.id, s.note ? `${s.name} (${s.note})` : s.name])), [a.states]);
  const w = [...input];
  const done = sim && frame === last;

  return (
    <>
      <Section title="Fita de entrada">
        <input
          className={cx(inputCls, 'font-mono')}
          value={input}
          placeholder="palavra (vazio = ε)"
          onChange={(e) => {
            setInput(e.target.value);
            setSim(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          aria-label="Palavra de entrada"
        />
        <div className="flex items-center gap-1">
          <Button variant="primary" onClick={start} className="mr-auto whitespace-nowrap px-2.5">
            Nova simulação
          </Button>
          <IconButton label="Reiniciar" onClick={() => (sim ? setFrame(0) : start())} side="top">
            <RotateCcw size={16} />
          </IconButton>
          <IconButton label="Passo anterior" onClick={() => step(-1)} disabled={!sim || frame === 0} side="top">
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton
            label={playing ? 'Pausar' : 'Reproduzir'}
            onClick={() => {
              if (!sim) start();
              else if (frame === last) setFrame(0);
              setPlaying(!playing);
            }}
            side="top"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </IconButton>
          <IconButton label="Próximo passo" onClick={() => step(1)} disabled={!!sim && frame === last} side="top">
            <ChevronRight size={18} />
          </IconButton>
          <IconButton label="Executar tudo" onClick={() => setFrame((sim ?? start()).frames.length - 1)} side="top">
            <SkipForward size={16} />
          </IconButton>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <label className="flex flex-1 items-center gap-2">
            Velocidade
            <input type="range" min={0.5} max={10} step={0.5} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="flex-1 accent-violet-600" />
          </label>
          {a.kind !== 'fa' && (
            <label className="flex items-center gap-1">
              Limite
              <input type="number" min={10} max={100000} value={maxSteps} onChange={(e) => setMaxSteps(Math.max(10, +e.target.value || 10))} className="w-16 rounded-lg border border-zinc-200 bg-transparent px-1.5 py-0.5 dark:border-zinc-800" />
            </label>
          )}
        </div>
      </Section>

      {sim?.error && (
        <Section title="Resultado">
          <Badge tone="red">{sim.error}</Badge>
        </Section>
      )}

      {sim && cur && !sim.error && (
        <Section title={`Passo ${frame} de ${last}`} right={
            done ? (
              <motion.span key={input + sim.verdict} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                <Badge tone={VERDICT[sim.verdict].tone} className="px-3 py-1 text-sm">
                  {VERDICT[sim.verdict].label}
                </Badge>
              </motion.span>
            ) : null
          }>
          {a.kind === 'fa' && (
            <Tape cells={w} head={Math.min(frame, w.length)} consumed={frame} />
          )}
          {!cur.configs.length && <p className="text-sm text-zinc-500">Nenhum ramo ativo: a palavra foi rejeitada.</p>}
          <ul className="space-y-2">
            {cur.configs.slice(0, 12).map((c, i) => (
              <ConfigView key={i} c={c} a={a} w={w} name={name.get(c.state) ?? '?'} winner={sim.accepted?.frame === frame && sim.accepted.index === i} />
            ))}
          </ul>
          {cur.configs.length > 12 && <p className="text-xs text-zinc-500">+ {cur.configs.length - 12} ramos</p>}
          <div className="flex flex-wrap gap-1 pt-1" role="list" aria-label="Linha do tempo">
            {sim.frames.slice(0, 200).map((f, i) => (
              <button
                key={i}
                onClick={() => setFrame(i)}
                aria-label={`Ir para o passo ${i}`}
                className={cx(
                  'h-6 min-w-6 rounded-md px-1 font-mono text-[11px] transition-colors',
                  i === frame ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
                  !f.configs.length && 'text-red-500',
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Testar várias palavras">
        <textarea
          className={cx(inputCls, 'h-24 resize-y py-2 font-mono')}
          placeholder={'uma palavra por linha\n(linha vazia = ε)'}
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          aria-label="Palavras para testar"
        />
        <Button
          onClick={() =>
            setResults(
              batch.split(/\r?\n/).map((word) => {
                word = word.trim();
                const r = run(a, word, { maxSteps });
                const c = r.accepted && r.frames[r.accepted.frame].configs[r.accepted.index];
                return { word, verdict: r.verdict, end: c ? name.get(c.state) : undefined };
              }),
            )
          }
        >
          Testar todas
        </Button>
        {results && (
          <ul className="max-h-64 space-y-1 overflow-auto">
            {results.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg px-2 py-1 odd:bg-zinc-50 dark:odd:bg-zinc-900">
                <span className="font-mono text-sm">{r.word || 'ε'}</span>
                {r.end && <span className="ml-auto mr-2 font-mono text-xs text-zinc-500">em {r.end}</span>}
                <Badge tone={VERDICT[r.verdict].tone}>{r.verdict === 'limit' ? 'LIMITE' : VERDICT[r.verdict].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function ConfigView({ c, a, w, name, winner }: { c: Config; a: Automaton; w: string[]; name: string; winner: boolean }) {
  return (
    <li className={cx('space-y-2 rounded-xl border p-2.5', winner ? 'border-green-500 bg-green-50 dark:bg-green-500/10' : 'border-zinc-200 dark:border-zinc-800')}>
      <div className="flex items-center justify-between text-sm">
        <span>
          Estado <b className="font-mono">{name}</b>
        </span>
        {a.kind !== 'tm' && (
          <span className="font-mono text-xs text-zinc-500">
            resta: {w.slice(c.pos).join('') || 'ε'}
          </span>
        )}
      </div>
      {c.stack && <Stack items={c.stack} />}
      {c.tape && <Tape cells={c.tape.cells} head={c.tape.head} blank={(a as TM).blank} />}
    </li>
  );
}

const CELL = 32; // px, largura de uma célula da fita

function Tape({ cells, head, consumed, blank }: { cells: string[]; head: number; consumed?: number; blank?: string }) {
  const shown = cells.length ? [...cells, ...(blank ? [] : [''])] : [''];
  const box = useRef<HTMLDivElement>(null);
  // mantém o cabeçote visível quando a fita é maior que o painel
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ left: head * CELL - el.clientWidth / 2 + CELL / 2, behavior: 'smooth' });
  }, [head]);
  return (
    <div ref={box} className="overflow-x-auto pb-5 pt-1" aria-label="Fita">
      <div className="relative flex w-max">
        {shown.map((s, i) => (
          <div
            key={i}
            className={cx(
              'grid size-8 shrink-0 place-items-center border-y border-r border-zinc-300 font-mono text-sm transition-colors duration-200 first:rounded-l-lg first:border-l last:rounded-r-lg dark:border-zinc-700',
              consumed !== undefined && i < consumed && 'text-zinc-400',
              s === blank && 'text-zinc-400',
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }}>
                {s}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
        {/* cabeçote: moldura que desliza entre as células */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 size-8 rounded-md border-2 border-violet-600 bg-violet-500/10 dark:border-violet-400"
          animate={{ x: head * CELL }}
          initial={false}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        >
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-violet-600 dark:text-violet-400">▲</span>
        </motion.div>
      </div>
    </div>
  );
}

function Stack({ items }: { items: string[] }) {
  return (
    <div className="flex items-end gap-2">
      <span className="text-xs text-zinc-500">Pilha</span>
      <div className="flex min-h-6 flex-col-reverse gap-0.5" aria-label="Pilha (topo em cima)">
        <AnimatePresence initial={false}>
          {items.map((s, i) => (
            <motion.div
              key={i + s}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={cx('grid h-6 w-10 place-items-center rounded-md font-mono text-sm', i === items.length - 1 ? 'bg-violet-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800')}
            >
              {s}
            </motion.div>
          ))}
        </AnimatePresence>
        {!items.length && <span className="font-mono text-xs text-zinc-400">vazia</span>}
      </div>
    </div>
  );
}
