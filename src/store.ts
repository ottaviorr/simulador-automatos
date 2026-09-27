import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { validateData } from './core/io/native';
import { newId } from './core/model';
import type { Doc, DocData, DocKind } from './core/types';

interface History {
  past: DocData[];
  future: DocData[];
}
export interface Recent {
  title: string;
  data: DocData;
  at: number;
}
export type Theme = 'light' | 'dark' | 'system';

interface Store {
  docs: Doc[];
  active: string | null; // null = tela inicial
  recent: Recent[];
  theme: Theme;
  history: Record<string, History>;
  open(title: string, data: DocData): void;
  close(id: string): void;
  activate(id: string | null): void;
  rename(id: string, title: string): void;
  /** Altera o documento ativo. record=false não cria ponto de desfazer (ex.: durante o arraste). */
  update(fn: (d: DocData) => DocData, record?: boolean): void;
  checkpoint(): void;
  undo(): void;
  redo(): void;
  setTheme(t: Theme): void;
}

export const KIND_NAME: Record<DocKind, string> = {
  fa: 'Autômato Finito',
  pda: 'Autômato com Pilha',
  tm: 'Máquina de Turing',
  grammar: 'Gramática Regular',
};
const SHORT: Record<DocKind, string> = { fa: 'AF', pda: 'AP', tm: 'MT', grammar: 'Gramática' };

export function newTitle(docs: Doc[], kind: DocKind) {
  for (let i = 1; ; i++) {
    const t = `${SHORT[kind]} ${i}`;
    if (!docs.some((d) => d.title === t)) return t;
  }
}

const LIMIT = 100;
const pushRecent = (recent: Recent[], title: string, data: DocData) =>
  [{ title, data, at: Date.now() }, ...recent.filter((r) => r.title !== title)].slice(0, 6);

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const activeDoc = () => get().docs.find((d) => d.id === get().active);
      const hist = (id: string) => get().history[id] ?? { past: [], future: [] };
      const setHist = (id: string, h: History) => set((s) => ({ history: { ...s.history, [id]: h } }));
      const setData = (id: string, data: DocData) =>
        set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, data, updatedAt: Date.now() } : d)) }));

      return {
        docs: [],
        active: null,
        recent: [],
        theme: 'system',
        history: {},
        open(title, data) {
          const id = newId();
          set((s) => ({ docs: [...s.docs, { id, title, data, updatedAt: Date.now() }], active: id }));
        },
        close(id) {
          const d = get().docs.find((x) => x.id === id);
          set((s) => {
            const docs = s.docs.filter((x) => x.id !== id);
            const idx = s.docs.findIndex((x) => x.id === id);
            const history = { ...s.history };
            delete history[id];
            return {
              docs,
              history,
              active: s.active === id ? (docs[Math.min(idx, docs.length - 1)]?.id ?? null) : s.active,
              recent: d ? pushRecent(s.recent, d.title, d.data) : s.recent,
            };
          });
        },
        activate: (id) => set({ active: id }),
        rename: (id, title) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, title } : d)) })),
        update(fn, record = true) {
          const d = activeDoc();
          if (!d) return;
          const next = fn(d.data);
          if (next === d.data) return;
          if (record) {
            const h = hist(d.id);
            setHist(d.id, { past: [...h.past, d.data].slice(-LIMIT), future: [] });
          }
          setData(d.id, next);
        },
        checkpoint() {
          const d = activeDoc();
          if (!d) return;
          const h = hist(d.id);
          setHist(d.id, { past: [...h.past, d.data].slice(-LIMIT), future: [] });
        },
        undo() {
          const d = activeDoc();
          const h = d && hist(d.id);
          if (!d || !h?.past.length) return;
          setHist(d.id, { past: h.past.slice(0, -1), future: [d.data, ...h.future] });
          setData(d.id, h.past[h.past.length - 1]);
        },
        redo() {
          const d = activeDoc();
          const h = d && hist(d.id);
          if (!d || !h?.future.length) return;
          setHist(d.id, { past: [...h.past, d.data], future: h.future.slice(1) });
          setData(d.id, h.future[0]);
        },
        setTheme: (theme) => set({ theme }),
      };
    },
    {
      name: 'simulador-automatos',
      // O histórico de desfazer não vai para o autosave.
      partialize: ({ docs, active, recent, theme }) => ({ docs, active, recent, theme }),
      // O autosave vem do navegador e pode estar corrompido ou ser de outra versão:
      // valida documento por documento e descarta só os inválidos, em vez de travar o app.
      merge(persisted, current) {
        const p = (persisted ?? {}) as Partial<Store>;
        const clean = <T extends { title: string; data: DocData }>(xs: unknown): T[] =>
          (Array.isArray(xs) ? xs : []).flatMap((x) => {
            try {
              if (typeof x?.title !== 'string') return [];
              return [{ ...x, data: validateData(x.data) } as T];
            } catch (e) {
              console.warn('Documento do autosave descartado:', (e as Error).message);
              return [];
            }
          });
        const docs = clean<Doc>(p.docs).filter((d) => typeof d.id === 'string');
        return {
          ...current,
          docs,
          recent: clean<Recent>(p.recent),
          active: docs.some((d) => d.id === p.active) ? p.active! : null,
          theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
        };
      },
    },
  ),
);

export const useActiveDoc = () => useStore((s) => s.docs.find((d) => d.id === s.active));

/** Abre um documento e registra nos recentes (arquivos, exemplos, links). */
export function openAndRemember(title: string, data: DocData) {
  const s = useStore.getState();
  s.open(title, data);
  useStore.setState({ recent: pushRecent(useStore.getState().recent, title, data) });
}
