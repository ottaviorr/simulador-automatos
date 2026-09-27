import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { grammarToFa, parseGrammar } from '../core/grammar';
import type { Doc, GrammarDoc } from '../core/types';
import { copyShareLink } from '../files';
import { openAndRemember, useStore } from '../store';
import { Button, cx } from './ui';

export function GrammarEditor({ doc }: { doc: Doc & { data: GrammarDoc } }) {
  const { update, rename } = useStore.getState();
  const parsed = useMemo(() => parseGrammar(doc.data.text), [doc.data.text]);
  const lines = doc.data.text.split('\n').length;
  const errLines = new Set(parsed.ok ? [] : parsed.errors.map((e) => e.line));

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-auto p-4 md:flex-row md:p-8">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <input
          className="bg-transparent text-2xl font-semibold outline-none"
          value={doc.title}
          onChange={(e) => rename(doc.id, e.target.value)}
          aria-label="Título da gramática"
        />
        <div className="flex min-h-80 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="select-none border-r border-zinc-100 px-3 py-4 text-right font-mono text-sm leading-7 text-zinc-400 dark:border-zinc-800" aria-hidden>
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={cx(errLines.has(i + 1) && 'text-red-500')}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            className="flex-1 resize-none bg-transparent px-4 py-4 font-mono text-sm leading-7 outline-none"
            value={doc.data.text}
            onChange={(e) => update(() => ({ kind: 'grammar', text: e.target.value }), false)}
            spellCheck={false}
            placeholder={'S -> aA | b | ?\nA -> bS'}
            aria-label="Produções da gramática"
          />
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-4 md:w-72">
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {parsed.ok ? (
            <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 size={16} /> Gramática regular válida ({parsed.value.productions.length} produções)
            </p>
          ) : (
            <ul className="space-y-1.5">
              {parsed.errors.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {e.line ? `Linha ${e.line}: ` : ''}
                  {e.msg}
                </li>
              ))}
            </ul>
          )}
          <Button variant="primary" className="w-full" disabled={!parsed.ok} onClick={() => parsed.ok && openAndRemember(`${doc.title} (AF)`, grammarToFa(parsed.value))}>
            Converter para Autômato Finito
          </Button>
          <Button className="w-full" onClick={() => copyShareLink(doc)}>
            Copiar link
          </Button>
        </div>
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Como escrever</h3>
          <ul className="space-y-1">
            <li>
              Uma variável por linha: <code className="font-mono">S -&gt; aA | b</code>
            </li>
            <li>Variáveis: letras maiúsculas ou &lt;nome&gt;</li>
            <li>Terminais: um caractere cada</li>
            <li>
              <code className="font-mono">?</code> = palavra vazia (ε)
            </li>
            <li>Linear à direita: a variável só pode aparecer no fim</li>
            <li>A primeira variável é o símbolo inicial</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
