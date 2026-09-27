import { AlertTriangle, CheckCircle2, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Analysis } from '../core/analyze';
import { minimizeDfa, nfaToDfa } from '../core/convert';
import { formalDefinition } from '../core/formal';
import { faToGrammar, printGrammar } from '../core/grammar';
import { removeStates, renameState, setInitial, setNote, toggleAccepting } from '../core/model';
import { faToRegex, parseRegex, printRegex, regexToNfa } from '../core/regex';
import { EPS, type Automaton, type Doc } from '../core/types';
import { copyShareLink } from '../files';
import { openAndRemember } from '../store';
import type { Selection } from './Canvas';
import { Button, Section, cx, inputCls } from './ui';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

const symList = (s: string) => s.split(/[\s,]+/).filter(Boolean);

export function PropsPanel({ doc, a, sel, analysis, update, rename }: { doc: Doc; a: Automaton; sel: Selection; analysis: Analysis; update(fn: (a: Automaton) => Automaton): void; rename(t: string): void }) {
  const state = sel.states.length === 1 ? a.states.find((s) => s.id === sel.states[0]) : undefined;
  const name = (id: string) => a.states.find((s) => s.id === id)?.name ?? '?';
  const warnings: string[] = [];
  if (analysis.noInitial) warnings.push('Estado de partida não definido.');
  if (analysis.unreachable.length) warnings.push(`Inalcançáveis: ${analysis.unreachable.map(name).join(', ')}`);
  if (analysis.dead.length) warnings.push(`Estados mortos (não levam à aceitação): ${analysis.dead.map(name).join(', ')}`);
  if (!a.states.some((s) => s.accepting) && a.states.length) warnings.push('Nenhum estado de aceitação.');
  if (analysis.outOfAlphabet.length) warnings.push(`${analysis.outOfAlphabet.length} transição(ões) com símbolo fora do alfabeto.`);
  if (analysis.missing?.length)
    warnings.push(`AFD incompleto: ${analysis.missing.slice(0, 6).map((m) => `δ(${name(m.state)}, ${m.sym})`).join(', ')}${analysis.missing.length > 6 ? '…' : ''} indefinida(s).`);

  return (
    <>
      <Section title="Documento">
        <input className={inputCls} value={doc.title} onChange={(e) => rename(e.target.value)} aria-label="Título do documento" />
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-500">Alfabeto de entrada (opcional)</span>
          <input
            className={cx(inputCls, 'font-mono')}
            placeholder="automático — ex.: a, b"
            defaultValue={a.alphabet?.join(', ') ?? ''}
            key={doc.id + 'alpha'}
            onBlur={(e) => {
              const syms = symList(e.target.value);
              if (syms.some((s) => [...s].length !== 1 || s === EPS)) return toast.error('Use símbolos de um caractere, separados por vírgula.');
              update((x) => ({ ...x, alphabet: syms.length ? syms : undefined }));
            }}
          />
        </label>
        {a.kind === 'tm' && (
          <SymbolField label="Símbolo branco" value={a.blank} onSet={(v) => update((x) => ({ ...x, blank: v || '□' }) as Automaton)} />
        )}
        {a.kind === 'pda' && (
          <SymbolField label="Símbolo inicial da pilha (opcional)" value={a.stackStart ?? ''} placeholder="pilha começa vazia" onSet={(v) => update((x) => ({ ...x, stackStart: v || undefined }) as Automaton)} />
        )}
      </Section>

      {state && (
        <Section title="Estado selecionado">
          <input
            key={state.id}
            className={cx(inputCls, 'font-mono')}
            defaultValue={state.name}
            aria-label="Nome do estado"
            onBlur={(e) => {
              try {
                update((x) => renameState(x, state.id, e.target.value));
              } catch (err) {
                toast.error((err as Error).message);
                e.target.value = state.name;
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-500">Rótulo (ex.: ERRO, NUM_INT)</span>
            <input
              key={state.id + 'note'}
              className={cx(inputCls, 'font-mono')}
              defaultValue={state.note ?? ''}
              placeholder="sem rótulo"
              onBlur={(e) => e.target.value.trim() !== (state.note ?? '') && update((x) => setNote(x, state.id, e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={a.initial === state.id} onChange={() => update((x) => setInitial(x, state.id))} className="accent-violet-600" />
            Estado de partida
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={state.accepting} onChange={() => update((x) => toggleAccepting(x, state.id))} className="accent-violet-600" />
            Estado de aceitação
          </label>
          <Button variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => update((x) => removeStates(x, [state.id]))}>
            <Trash2 size={15} /> Excluir estado
          </Button>
        </Section>
      )}

      <Section title="Validação">
        {warnings.length ? (
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 size={16} /> Nenhum problema encontrado.
          </p>
        )}
        <p className="text-xs text-zinc-500">Tracejado = inalcançável · esmaecido = estado morto</p>
      </Section>

      <Section title="Ajuda rápida">
        <ul className="space-y-1 text-xs text-zinc-500">
          <li>Duplo clique no vazio: novo estado</li>
          <li>Arraste da borda de um estado até outro: transição</li>
          <li>Duplo clique no rótulo: editar símbolos</li>
          <li>Botão direito: partida, aceitação, renomear, rótulo, inverter…</li>
          <li>Duplo clique no rótulo do estado: editar o texto</li>
          <li>
            <b className="font-mono">?</b> = vazio (ε){a.kind === 'tm' ? ' / branco na MT' : ''}
          </li>
          {a.kind === 'fa' && (
            <li>
              Como nas aulas: <b className="font-mono">L</b> = letra, <b className="font-mono">D</b> = dígito, <b className="font-mono">outro</b> = qualquer
              caractere sem outra transição, <b className="font-mono">[a-z]</b> = classe (use <b className="font-mono">{'\\L'}</b> para a letra L)
            </li>
          )}
        </ul>
      </Section>
    </>
  );
}

function SymbolField({ label, value, placeholder, onSet }: { label: string; value: string; placeholder?: string; onSet(v: string): void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      <input
        className={cx(inputCls, 'font-mono')}
        defaultValue={value}
        key={value}
        placeholder={placeholder}
        maxLength={2}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && [...v].length !== 1) return toast.error('Use um único caractere.');
          if (v !== value) onSet(v);
        }}
      />
    </label>
  );
}

export function ConvertPanel({ doc, a }: { doc: Doc; a: Automaton }) {
  const [out, setOut] = useState<{ title: string; text: string; table?: string[][][] } | null>(null);
  const [latex, setLatex] = useState(false);
  const [re, setRe] = useState('');
  const reParsed = re.trim() ? parseRegex(re) : null;

  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const formal = formalDefinition(a);

  return (
    <>
      {a.kind === 'fa' && (
        <Section title="Conversões">
          <div className="grid gap-2">
            <Button onClick={() => attempt(() => openAndRemember(`${doc.title} (AFD)`, nfaToDfa(a)))}>AFN → AFD</Button>
            <Button
              onClick={() =>
                attempt(() => {
                  const m = minimizeDfa(a);
                  openAndRemember(`${doc.title} (mínimo)`, m.dfa);
                  setOut({ title: 'Minimização: partições por rodada', text: '', table: m.rounds });
                })
              }
            >
              Minimizar AFD
            </Button>
            <Button onClick={() => attempt(() => openAndRemember(`${doc.title} (gramática)`, { kind: 'grammar', text: printGrammar(faToGrammar(a)) }))}>AF → Gramática Regular</Button>
            <Button onClick={() => attempt(() => setOut({ title: 'Expressão regular', text: printRegex(faToRegex(a)) }))}>AF → Expressão Regular</Button>
          </div>
          {out && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                {out.title}
                {out.text && (
                  <button onClick={() => copy(out.text)} aria-label="Copiar" className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">
                    <Copy size={14} />
                  </button>
                )}
              </div>
              {out.text && <p className="break-all font-mono text-sm">{out.text}</p>}
              {out.table && (
                <ol className="space-y-1 text-sm">
                  {out.table.map((groups, i) => (
                    <li key={i} className="font-mono">
                      <span className="mr-2 text-xs text-zinc-500">P{i}</span>
                      {groups.map((g) => `{${g.join(',')}}`).join(' ')}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title="Expressão regular → AFN">
        <input className={cx(inputCls, 'font-mono')} placeholder="ex.: [0-9]+\.[0-9]+" value={re} onChange={(e) => setRe(e.target.value)} aria-label="Expressão regular" />
        {reParsed && !reParsed.ok && <p className="text-xs text-red-600 dark:text-red-400">Coluna {reParsed.errors[0].col}: {reParsed.errors[0].msg}</p>}
        <p className="text-xs text-zinc-500">Mesma notação da aula: | união · * zero ou mais · + uma ou mais · ? opcional · [a-z] classe · \. ponto literal · ε vazio</p>
        <Button disabled={!reParsed?.ok} onClick={() => reParsed?.ok && openAndRemember(`ER ${re.trim()}`, regexToNfa(reParsed.value))}>
          Gerar AFN (Thompson)
        </Button>
      </Section>

      <Section
        title="Definição formal"
        right={
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
            {['Texto', 'LaTeX'].map((l, i) => (
              <button key={l} onClick={() => setLatex(i === 1)} aria-pressed={latex === (i === 1)} className={cx('rounded-md px-2 py-0.5', latex === (i === 1) && 'bg-white shadow-sm dark:bg-zinc-700')}>
                {l}
              </button>
            ))}
          </div>
        }
      >
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:bg-zinc-900">{latex ? formal.latex : formal.text}</pre>
        <Button onClick={() => copy(latex ? formal.latex : formal.text)}>
          <Copy size={15} /> Copiar
        </Button>
      </Section>

      <Section title="Compartilhar">
        <Button onClick={() => copyShareLink(doc)}>Copiar link deste documento</Button>
      </Section>
    </>
  );
}
