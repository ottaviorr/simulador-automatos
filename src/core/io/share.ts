import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { DocData } from '../types';
import { fromJson, serialize, type Loaded } from './native';

/** Documento inteiro comprimido para caber no #hash da URL. */
export const encodeShare = (title: string, data: DocData) => compressToEncodedURIComponent(serialize(title, data));

export function decodeShare(hash: string): Loaded {
  const json = decompressFromEncodedURIComponent(hash.replace(/^#/, ''));
  if (!json) throw new Error('Link inválido ou corrompido.');
  try {
    return fromJson(JSON.parse(json));
  } catch (e) {
    throw e instanceof SyntaxError ? new Error('Link inválido ou corrompido.') : e;
  }
}
