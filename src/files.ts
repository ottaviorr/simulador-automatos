import { toast } from 'sonner';
import { EXT, fileName, readFile, serialize } from './core/io/native';
import { encodeShare } from './core/io/share';
import type { Doc } from './core/types';
import { openAndRemember } from './store';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveDoc(doc: Doc) {
  download(fileName(doc.title, doc.data), new Blob([serialize(doc.title, doc.data)], { type: 'application/json' }));
  toast.success(`"${fileName(doc.title, doc.data)}" salvo.`);
}

const ACCEPT = [...Object.values(EXT).map((e) => '.' + e), '.json'].join(',');

export function openFiles() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT, multiple: true });
  input.onchange = async () => {
    for (const f of input.files ?? []) {
      try {
        const loaded = readFile(f.name, new Uint8Array(await f.arrayBuffer()));
        openAndRemember(loaded.title, loaded.data);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  };
  input.click();
}

export async function copyShareLink(doc: Doc) {
  const url = `${location.origin}${location.pathname}#${encodeShare(doc.title, doc.data)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado! Quem abrir verá este documento.');
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

// ---- exportação do diagrama ----

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'];

/** Copia o SVG com estilos calculados inline e recorta no conteúdo. */
function standaloneSvg(svg: SVGSVGElement): { text: string; w: number; h: number } {
  const content = svg.querySelector<SVGGElement>('[data-content]')!;
  const box = content.getBBox();
  const pad = 24;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    dst[i].setAttribute('style', style);
    dst[i].removeAttribute('class');
  });
  clone.querySelectorAll('[data-export-hide]').forEach((e) => e.remove());
  const g = clone.querySelector('[data-content]')!;
  g.removeAttribute('transform');
  const w = Math.ceil(box.width + pad * 2);
  const h = Math.ceil(box.height + pad * 2);
  clone.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${w} ${h}`);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: box.x - pad, y: box.y - pad, width: w, height: h, fill: getComputedStyle(svg).getPropertyValue('--c-bg') }).forEach(([k, v]) =>
    bg.setAttribute(k, String(v)),
  );
  clone.insertBefore(bg, clone.firstChild);
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

export function exportSvg(svg: SVGSVGElement, title: string) {
  download(`${title}.svg`, new Blob([standaloneSvg(svg).text], { type: 'image/svg+xml' }));
}

export function exportPng(svg: SVGSVGElement, title: string) {
  const { text, w, h } = standaloneSvg(svg);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = Object.assign(document.createElement('canvas'), { width: w * scale, height: h * scale });
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((b) => b && download(`${title}.png`, b));
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
}
