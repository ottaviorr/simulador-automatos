# Simulador de Autômatos (web)

Versão web do antigo *Simulador de Autômatos* (Delphi), usado em Compiladores / Linguagens Formais.
Roda 100% no navegador: sem backend, com autosave no `localStorage`.

- Autômato Finito (AFD/AFN), Autômato com Pilha, Máquina de Turing e Gramática Regular
- Editor visual: duplo clique cria estado, arraste da borda de um estado até outro cria transição,
  botão direito para partida/aceitação/renomear/inverter, `?` = transição vazia (ε) / branco na MT
- Simulação passo a passo com todos os ramos (AFN, pilha, fita), teste de várias palavras
- Conversões: AFN → AFD, minimização, AF ↔ gramática, AF ↔ expressão regular, definição formal (texto/LaTeX)
- Arquivos `.af`, `.afp`, `.mt`, `.gr` (JSON), exportação PNG/SVG, link compartilhável

## Rodar localmente

Requer Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes da lógica (src/core)
npm run coverage   # cobertura
npm run build      # gera dist/
```

## Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em vercel.com → *Add New… → Project*, importe o repositório.
3. A Vercel detecta Vite sozinha (build `npm run build`, saída `dist`). Clique em *Deploy*.

Ou pela linha de comando: `npx vercel` (e `npx vercel --prod` para produção).

## Organização

- `src/core/` — lógica pura e testada (modelo, simulação, conversões, gramática, ER, arquivos)
- `src/core/io/legacy.ts` — importador dos arquivos do programa antigo (aguardando arquivos de exemplo)
- `src/components/` — canvas, painéis e editores
