import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { inputAlphabet } from '../core/analyze';
import { addState, addTransitions, removeTransitions, setTargets, updateTransition } from '../core/model';
import { faSymbol } from '../core/symbols';
import { EPS, type AnyTransition, type Automaton, type FA, type Move, type StateId } from '../core/types';
import type { Highlight } from './Canvas';
import { Button, cx } from './ui';

interface Props {
  a: Automaton;
  update(fn: (a: Automaton) => Automaton): void;
  highlight: Highlight | null;
}

const cell = 'border border-zinc-200 px-2 py-1 dark:border-zinc-800';
const field =
  'w-full min-w-10 rounded-md bg-transparent px-1.5 py-1 font-mono text-sm outline-none focus:bg-white focus:ring-2 focus:ring-violet-500/40 dark:focus:bg-zinc-900';

/** Tabela de transições editável, sincronizada com o diagrama. */
export function TransitionTable(p: Props) {
  const newState = () =>
    p.update((x) => {
      const maxX = Math.max(0, ...x.states.map((s) => s.pos.x));
      return addState(x, { x: maxX + 170, y: 200 }).a;
    });
  return (
    <div className="h-full overflow-auto p-4 pt-16">
      {p.a.kind === 'fa' ? <FaTable {...p} a={p.a} /> : <ListTable {...p} />}
      <Button className="mt-3" onClick={newState}>
        <Plus size={15} /> Novo estado
      </Button>
    </div>
  );
}

function StateHead({ a, id, active }: { a: Automaton; id: StateId; active: boolean }) {
  const s = a.states.find((x) => x.id === id)!;
  return (
    <th scope="row" className={cx(cell, 'whitespace-nowrap text-left font-mono font-medium', active && 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300')}>
      <span className="inline-block w-8 text-zinc-400" title="→ partida · * aceitação">
        {a.initial === id ? '→' : ''}
        {s.accepting ? '*' : ''}
      </span>
      {s.name}
      {s.note && <span className="ml-2 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">{s.note}</span>}
    </th>
  );
}

/** AF: matriz estado × símbolo → estados de destino (como no slide "Tabela de transição"). */
function FaTable({ a, update, highlight }: Props & { a: FA }) {
  const [extra, setExtra] = useState<string[]>([]);
  const base = inputAlphabet(a);
  const hasEps = a.transitions.some((t) => t.label.read === EPS);
  const cols = [...new Set([...base, ...extra, ...(hasEps ? [EPS] : [])])];
  const byName = new Map(a.states.map((s) => [s.name, s.id]));
  const name = new Map(a.states.map((s) => [s.id, s.name]));

  const commit = (from: StateId, sym: string, text: string) => {
    const names = text.split(/[\s,{}]+/).filter(Boolean);
    const missing = names.filter((n) => !byName.has(n));
    if (missing.length) return toast.error(`Estado inexistente: ${missing.join(', ')}`);
    update((x) => setTargets(x as FA, from, sym, names.map((n) => byName.get(n)!)));
  };

  return (
    <table className="border-collapse text-sm">
      <caption className="mb-2 text-left text-xs text-zinc-500">
        Cada célula: estado(s) de destino, separados por vírgula. Vazio = sem transição. → partida, * aceitação. L = letra, D = dígito, outro = demais caracteres.
      </caption>
      <thead>
        <tr className="bg-zinc-50 dark:bg-zinc-900">
          <th className={cell}>δ</th>
          {cols.map((c) => (
            <th key={c} className={cx(cell, 'min-w-20 font-mono')}>
              {c === EPS ? 'ε (?)' : c}
            </th>
          ))}
          <th className={cell}>
            <input
              className={cx(field, 'w-24')}
              placeholder="+ símbolo"
              title="Um caractere, L, D, outro ou [a-z]"
              aria-label="Adicionar símbolo"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                let v: string;
                try {
                  v = faSymbol(e.currentTarget.value);
                } catch (err) {
                  return toast.error((err as Error).message);
                }
                setExtra([...extra, v]);
                e.currentTarget.value = '';
              }}
            />
          </th>
        </tr>
      </thead>
      <tbody>
        {a.states.map((s) => (
          <tr key={s.id}>
            <StateHead a={a} id={s.id} active={!!highlight?.states.has(s.id)} />
            {cols.map((c) => {
              const ts = a.transitions.filter((t) => t.from === s.id && t.label.read === c);
              const used = ts.some((t) => highlight?.trans.has(t.id));
              return (
                <td key={c} className={cx(cell, 'p-0', used && 'bg-violet-100 dark:bg-violet-500/20')}>
                  <input
                    // chave = conteúdo da célula: só ela recarrega quando muda (o Tab não perde o foco)
                    key={ts.map((t) => t.to).join()}
                    className={field}
                    defaultValue={ts.map((t) => name.get(t.to)).join(', ')}
                    aria-label={`δ(${s.name}, ${c})`}
                    onBlur={(e) => e.target.value !== e.target.defaultValue && commit(s.id, c, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </td>
              );
            })}
            <td className={cell} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** AP e MT: uma linha por transição. */
function ListTable({ a, update, highlight }: Props) {
  const isPda = a.kind === 'pda';
  const set = (t: AnyTransition, patch: Record<string, string>) => {
    for (const [k, v] of Object.entries(patch)) {
      if (k !== 'push' && [...v].length !== 1) return toast.error('Use um único caractere (? = vazio).');
      if (k === 'push' && !v) return toast.error('Use ? para não empilhar nada.');
    }
    update((x) => updateTransition(x, t.id, { label: { ...t.label, ...patch } as AnyTransition['label'] }));
  };
  const add = () => {
    if (!a.initial) return toast.error('Defina um estado de partida primeiro.');
    const label = isPda ? { read: EPS, pop: EPS, push: EPS } : { read: EPS, write: EPS, move: 'D' as Move };
    update((x) => addTransitions(x, x.initial!, x.initial!, [label]));
  };
  const heads = isPda ? ['Lê', 'Topo', 'Empilha'] : ['Lê', 'Grava', 'Move'];
  const stateSelect = (t: AnyTransition, key: 'from' | 'to') => (
    <select
      className={cx(field, 'min-w-16')}
      value={t[key]}
      aria-label={key === 'from' ? 'Origem' : 'Destino'}
      onChange={(e) => update((x) => updateTransition(x, t.id, { [key]: e.target.value }))}
    >
      {a.states.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <table className="border-collapse text-sm">
        <caption className="mb-2 text-left text-xs text-zinc-500">
          {isPda ? 'lê, topo da pilha, empilha — ? = vazio' : 'lê, grava, direção (E/D/P) — ? = branco'}
        </caption>
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900">
            {['De', ...heads, 'Para', ''].map((h, i) => (
              <th key={i} className={cell}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.transitions.map((t) => {
            const l = t.label as unknown as Record<string, string>;
            const keys = isPda ? ['read', 'pop', 'push'] : ['read', 'write'];
            return (
              <tr key={t.id} className={cx(highlight?.trans.has(t.id) && 'bg-violet-100 dark:bg-violet-500/20')}>
                <td className={cx(cell, 'p-0')}>{stateSelect(t, 'from')}</td>
                {keys.map((k) => (
                  <td key={k} className={cx(cell, 'p-0')}>
                    <input
                      key={t.id + l[k]}
                      className={field}
                      defaultValue={l[k]}
                      aria-label={k}
                      onBlur={(e) => e.target.value !== l[k] && set(t, { [k]: e.target.value.trim() })}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </td>
                ))}
                {!isPda && (
                  <td className={cx(cell, 'p-0')}>
                    <select className={field} value={l.move} aria-label="Direção" onChange={(e) => set(t, { move: e.target.value })}>
                      <option value="E">E</option>
                      <option value="D">D</option>
                      <option value="P">P</option>
                    </select>
                  </td>
                )}
                <td className={cx(cell, 'p-0')}>{stateSelect(t, 'to')}</td>
                <td className={cx(cell, 'p-0')}>
                  <button className="grid size-8 place-items-center text-zinc-400 hover:text-red-600" aria-label="Excluir transição" onClick={() => update((x) => removeTransitions(x, [t.id]))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Button className="mr-2 mt-3" onClick={add}>
        <Plus size={15} /> Nova transição
      </Button>
    </>
  );
}
