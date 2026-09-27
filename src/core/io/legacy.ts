import type { Loaded } from './native';

// Importador dos arquivos do programa original (Delphi).
// O executável usa TSimpleGraph, que grava no formato de streaming binário do Delphi ("TPF0"),
// com as classes TStateNode (StateID, Inicial, Final) e TTransition (Symbols).
// ponytail: aguardando arquivos de exemplo para implementar a leitura; até lá só detecta.

const TPF0 = [0x54, 0x50, 0x46, 0x30];

/** Heurística: contém a assinatura TPF0 ou não parece texto/JSON. */
export function isLegacy(bytes: Uint8Array): boolean {
  for (let i = 0; i + 4 <= Math.min(bytes.length, 4096); i++)
    if (TPF0.every((b, k) => bytes[i + k] === b)) return true;
  return bytes.subarray(0, 512).some((b) => b === 0);
}

export function parseLegacy(name: string, _bytes: Uint8Array): Loaded {
  throw new Error(
    `"${name}" é um arquivo do Simulador de Autômatos antigo. A importação desse formato ainda não está disponível.`,
  );
}
