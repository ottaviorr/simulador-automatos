import * as Tooltip from '@radix-ui/react-tooltip';
import { Command as CommandIcon, FolderOpen, Home as HomeIcon, Info, Link2, Monitor, Moon, Plus, Save, Sun, X } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { CommandPalette, openPalette, type Command } from './components/CommandPalette';
import { Editor, editorApi } from './components/Editor';
import { GrammarEditor } from './components/GrammarEditor';
import { Home } from './components/Home';
import { IconButton, cx } from './components/ui';
import { minimizeDfa, nfaToDfa } from './core/convert';
import { EXAMPLES } from './core/examples';
import { faToGrammar, printGrammar } from './core/grammar';
import { decodeShare } from './core/io/share';
import { emptyAutomaton } from './core/model';
import type { Automaton, DocKind, FA, GrammarDoc } from './core/types';
import { copyShareLink, openFiles, saveDoc } from './files';
import { KIND_NAME, newTitle, openAndRemember, useActiveDoc, useStore, type Theme } from './store';

const THEMES: { t: Theme; icon: typeof Sun; label: string }[] = [
  { t: 'light', icon: Sun, label: 'Tema claro' },
  { t: 'dark', icon: Moon, label: 'Tema escuro' },
  { t: 'system', icon: Monitor, label: 'Tema do sistema' },
];

export default function App() {
  const docs = useStore((s) => s.docs);
  const active = useStore((s) => s.active);
  const theme = useStore((s) => s.theme);
  const doc = useActiveDoc();
  const about = useRef<HTMLDialogElement>(null);

  const commands = useMemo((): Command[] => {
    const s = useStore.getState();
    const attempt = (fn: () => void) => () => {
      try {
        fn();
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    const kinds: DocKind[] = ['fa', 'pda', 'tm', 'grammar'];
    const cmds: Command[] = [
      { group: 'Geral', label: 'Ir para o início', run: () => s.activate(null) },
      ...kinds.map((k) => ({
        group: 'Novo',
        label: KIND_NAME[k],
        run: () => s.open(newTitle(useStore.getState().docs, k), k === 'grammar' ? { kind: k, text: '' } : emptyAutomaton(k)),
      })),
      { group: 'Arquivo', label: 'Abrir arquivo', shortcut: 'Ctrl+O', run: openFiles },
      ...THEMES.map((t) => ({ group: 'Tema', label: t.label, run: () => s.setTheme(t.t) })),
      { group: 'Geral', label: 'Sobre o simulador', run: () => about.current?.showModal() },
      ...docs.filter((d) => d.id !== active).map((d) => ({ group: 'Abas', label: `Ir para "${d.title}"`, run: () => s.activate(d.id) })),
      ...EXAMPLES.map((e) => ({ group: 'Exemplo', label: e.title, run: () => openAndRemember(e.title, e.data()) })),
    ];
    if (doc) {
      const ed = () => editorApi.current;
      cmds.push(
        { group: 'Arquivo', label: 'Salvar', shortcut: 'Ctrl+S', run: () => saveDoc(doc) },
        { group: 'Arquivo', label: 'Copiar link de compartilhamento', run: () => copyShareLink(doc) },
        { group: 'Arquivo', label: 'Fechar aba', run: () => s.close(doc.id) },
      );
      if (doc.data.kind !== 'grammar') {
        const a = doc.data;
        cmds.push(
          { group: 'Exibir', label: 'Diagrama', run: () => ed()?.setMode('diagram') },
          { group: 'Exibir', label: 'Tabela de transições', run: () => ed()?.setMode('table') },
          { group: 'Exibir', label: 'Diagrama e tabela lado a lado', run: () => ed()?.setMode('split') },
          { group: 'Exibir', label: 'Enquadrar diagrama', run: () => ed()?.fit() },
          { group: 'Exibir', label: 'Mostrar/esconder painel', run: () => ed()?.togglePanel() },
          { group: 'Painel', label: 'Simular', run: () => ed()?.setTab('sim') },
          { group: 'Painel', label: 'Propriedades e validação', run: () => ed()?.setTab('props') },
          { group: 'Painel', label: 'Ferramentas e definição formal', run: () => ed()?.setTab('convert') },
          { group: 'Editar', label: 'Desfazer', shortcut: 'Ctrl+Z', run: s.undo },
          { group: 'Editar', label: 'Refazer', shortcut: 'Ctrl+Y', run: s.redo },
          { group: 'Editar', label: 'Organizar layout automaticamente', run: () => ed()?.layout() },
          { group: 'Exportar', label: 'Imagem PNG', run: () => ed()?.exportPng() },
          { group: 'Exportar', label: 'Imagem SVG', run: () => ed()?.exportSvg() },
        );
        if (a.kind === 'fa')
          cmds.push(
            { group: 'Converter', label: 'AFN → AFD', run: attempt(() => openAndRemember(`${doc.title} (AFD)`, nfaToDfa(a as FA))) },
            { group: 'Converter', label: 'Minimizar AFD', run: attempt(() => openAndRemember(`${doc.title} (mínimo)`, minimizeDfa(a as FA).dfa)) },
            { group: 'Converter', label: 'AF → Gramática Regular', run: attempt(() => openAndRemember(`${doc.title} (gramática)`, { kind: 'grammar', text: printGrammar(faToGrammar(a as FA)) })) },
          );
      }
    }
    return cmds;
  }, [docs, active, doc]);

  // Tema: classe .dark no <html>, seguindo o sistema quando "system".
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Link compartilhado: #<documento comprimido>
  useEffect(() => {
    const load = () => {
      if (location.hash.length < 2) return;
      try {
        const { title, data } = decodeShare(location.hash);
        openAndRemember(title, data);
        toast.success(`"${title}" aberto a partir do link.`);
      } catch (e) {
        toast.error((e as Error).message);
      }
      history.replaceState(null, '', location.pathname);
    };
    load();
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, []);

  // Atalhos globais.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const s = useStore.getState();
      const d = s.docs.find((x) => x.id === s.active);
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if (k === 's') {
        e.preventDefault();
        if (d) saveDoc(d);
      } else if (k === 'o') {
        e.preventDefault();
        openFiles();
      } else if (!typing && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { activate, close, setTheme } = useStore.getState();
  const nextTheme = THEMES[(THEMES.findIndex((x) => x.t === theme) + 1) % THEMES.length];
  const ThemeIcon = THEMES.find((x) => x.t === theme)!.icon;

  return (
    <MotionConfig reducedMotion="user">
    <Tooltip.Provider>
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-950">
          <IconButton label="Início" active={!active} onClick={() => activate(null)}>
            <HomeIcon size={17} />
          </IconButton>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Documentos abertos">
            {docs.map((d) => (
              <div
                key={d.id}
                className={cx(
                  'group flex h-8 shrink-0 items-center gap-1 rounded-lg pl-3 pr-1 text-sm transition-colors',
                  d.id === active ? 'bg-zinc-100 font-medium dark:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900',
                )}
              >
                <button role="tab" aria-selected={d.id === active} onClick={() => activate(d.id)} className="max-w-44 truncate" onAuxClick={(e) => e.button === 1 && close(d.id)}>
                  {d.title || 'Sem título'}
                </button>
                <button onClick={() => close(d.id)} aria-label={`Fechar ${d.title}`} className="grid size-5 place-items-center rounded opacity-60 hover:bg-zinc-200 hover:opacity-100 dark:hover:bg-zinc-700">
                  <X size={13} />
                </button>
              </div>
            ))}
            <IconButton label="Novo documento" onClick={() => activate(null)} className="size-8">
              <Plus size={16} />
            </IconButton>
          </nav>
          <IconButton label="Comandos" shortcut="Ctrl+K" onClick={openPalette}>
            <CommandIcon size={17} />
          </IconButton>
          <IconButton label="Abrir arquivo" shortcut="Ctrl+O" onClick={openFiles}>
            <FolderOpen size={17} />
          </IconButton>
          <IconButton label="Salvar arquivo" shortcut="Ctrl+S" onClick={() => doc && saveDoc(doc)} disabled={!doc}>
            <Save size={17} />
          </IconButton>
          <IconButton label="Copiar link" onClick={() => doc && copyShareLink(doc)} disabled={!doc}>
            <Link2 size={17} />
          </IconButton>
          <IconButton label={`${THEMES.find((x) => x.t === theme)!.label} (clique: ${nextTheme.label.toLowerCase()})`} onClick={() => setTheme(nextTheme.t)}>
            <ThemeIcon size={17} />
          </IconButton>
          <IconButton label="Sobre" onClick={() => about.current?.showModal()}>
            <Info size={17} />
          </IconButton>
        </header>

        <main className="min-h-0 flex-1">
          {!doc ? (
            <Home />
          ) : doc.data.kind === 'grammar' ? (
            <GrammarEditor key={doc.id} doc={doc as typeof doc & { data: GrammarDoc }} />
          ) : (
            <Editor doc={doc as typeof doc & { data: Automaton }} />
          )}
        </main>
      </div>

      <dialog
        ref={about}
        onClick={(e) => e.target === about.current && about.current.close()}
        className="m-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="space-y-4 p-6">
          <h2 className="text-xl font-semibold">Sobre o Simulador de Autômatos</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Versão web do antigo Simulador de Autômatos, usado em Compiladores e Linguagens Formais. Tudo roda no navegador: seus documentos ficam salvos
            automaticamente neste computador.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Autômatos finitos (AFD/AFN), com pilha e máquinas de Turing</li>
            <li>Simulação passo a passo, com todos os ramos do não determinismo</li>
            <li>Conversões: AFN → AFD, minimização, AF ↔ gramática regular, AF ↔ expressão regular</li>
            <li>Validação em tempo real e definição formal em texto/LaTeX</li>
            <li>Arquivos .af, .afp, .mt, .gr; exportação PNG/SVG; link compartilhável</li>
          </ul>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            O símbolo <code className="font-mono">?</code> representa a transição vazia (ε/λ) — e o branco na Máquina de Turing.
          </p>
          <div className="text-right">
            <button onClick={() => about.current?.close()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              Fechar
            </button>
          </div>
        </div>
      </dialog>

      <CommandPalette commands={commands} />
      <Toaster position="bottom-right" richColors closeButton theme={theme} />
    </Tooltip.Provider>
    </MotionConfig>
  );
}
