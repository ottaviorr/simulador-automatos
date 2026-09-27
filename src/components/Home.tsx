import { BookOpen, Clock, FolderOpen, Layers, type LucideIcon, Spline, SquareStack, Tally4 } from 'lucide-react';
import { EXAMPLES } from '../core/examples';
import { emptyAutomaton } from '../core/model';
import type { DocData, DocKind } from '../core/types';
import { openFiles } from '../files';
import { KIND_NAME, newTitle, openAndRemember, useStore } from '../store';

const NEW: { kind: DocKind; icon: LucideIcon; desc: string }[] = [
  { kind: 'fa', icon: Spline, desc: 'AFD e AFN, com transições vazias' },
  { kind: 'pda', icon: Layers, desc: 'Lê, desempilha e empilha símbolos' },
  { kind: 'tm', icon: Tally4, desc: 'Fita infinita com cabeçote de leitura e escrita' },
  { kind: 'grammar', icon: BookOpen, desc: 'Produções lineares à direita' },
];

const blank = (kind: DocKind): DocData => (kind === 'grammar' ? { kind, text: '' } : emptyAutomaton(kind));

export function Home() {
  const recent = useStore((s) => s.recent);
  const open = (kind: DocKind) => useStore.getState().open(newTitle(useStore.getState().docs, kind), blank(kind));

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 md:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Simulador de Autômatos</h1>
          <p className="text-zinc-500">Crie, simule e converta autômatos finitos, com pilha, máquinas de Turing e gramáticas regulares.</p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Novo</h2>
            <button onClick={openFiles} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
              <FolderOpen size={15} /> Abrir arquivo (.af, .afp, .mt, .gr)
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NEW.map(({ kind, icon: Icon, desc }) => (
              <Card key={kind} onClick={() => open(kind)}>
                <div className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="font-medium">{KIND_NAME[kind]}</p>
                  <p className="text-sm text-zinc-500">{desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {[...new Set(EXAMPLES.map((e) => e.group ?? 'Exemplos prontos'))].map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.filter((e) => (e.group ?? 'Exemplos prontos') === group).map((ex) => (
              <Card key={ex.title} onClick={() => openAndRemember(ex.title, ex.data())}>
                <SquareStack size={18} className="text-zinc-400" />
                <div>
                  <p className="font-medium">{ex.title}</p>
                  <p className="text-sm text-zinc-500">{ex.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
        ))}

        {recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recentes</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((r) => (
                <Card key={r.title + r.at} onClick={() => useStore.getState().open(r.title, r.data)}>
                  <Clock size={18} className="text-zinc-400" />
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-zinc-500">
                      {KIND_NAME[r.data.kind]} · {new Date(r.at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Card({ children, onClick }: { children: React.ReactNode; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-500/50"
    >
      {children}
    </button>
  );
}
