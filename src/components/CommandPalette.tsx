import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './ui';

export interface Command {
  label: string;
  group: string;
  shortcut?: string;
  run(): void;
}

const norm = (s: string) => s.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Abre a paleta de qualquer lugar (ex.: botão no topo). */
export const openPalette = () => window.dispatchEvent(new Event('open-palette'));

/** Paleta de comandos (Ctrl+K): busca sem acento, setas para navegar, Enter executa. */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  // O próprio <dialog> é a fonte da verdade de aberto/fechado (Esc fecha nativamente).
  useEffect(() => {
    const d = dialog.current!;
    const show = () => {
      if (d.open) return d.close();
      setQ('');
      setSel(0);
      d.showModal();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-palette', show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-palette', show);
    };
  }, []);
  const onClose = () => dialog.current?.open && dialog.current.close();

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return commands.filter((c) => words.every((w) => norm(`${c.group} ${c.label}`).includes(w)));
  }, [q, commands]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const exec = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <dialog
      ref={dialog}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <Search size={16} className="text-zinc-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(shown.length - 1, s + 1));
            else if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
            else if (e.key === 'Enter') exec(shown[sel]);
            else return;
            e.preventDefault();
          }}
          placeholder="Digite um comando… (ex.: tabela, minimizar, exportar)"
          aria-label="Buscar comando"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          className="h-12 flex-1 bg-transparent text-sm outline-none"
        />
        <kbd className="rounded bg-zinc-100 px-1.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">Esc</kbd>
      </div>
      <ul ref={list} id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
        {!shown.length && <li className="px-3 py-6 text-center text-sm text-zinc-500">Nenhum comando encontrado.</li>}
        {shown.map((c, i) => (
          <li
            key={c.group + c.label}
            role="option"
            aria-selected={i === sel}
            onMouseMove={() => setSel(i)}
            onClick={() => exec(c)}
            className={cx('flex cursor-default items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm', i === sel && 'bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100')}
          >
            <span>
              <span className="mr-2 text-xs text-zinc-500">{c.group}</span>
              {c.label}
            </span>
            {c.shortcut && <kbd className="font-mono text-[11px] text-zinc-400">{c.shortcut}</kbd>}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
