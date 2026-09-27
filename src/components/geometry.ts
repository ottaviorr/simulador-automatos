import type { Point } from '../core/types';

export const R = 26; // raio mínimo do estado

/** Raio que comporta o nome (nomes longos como {q0,q1,q2} ganham círculos maiores). */
export const radius = (name: string) => Math.max(R, [...name].length * 3.7 + 10);

export interface EdgeGeom {
  d: string;
  label: Point;
}

/** Caminho da aresta: laço acima do estado, reta (bend 0) ou curva. */
export function edgeGeom(a: Point, b: Point, bend: number, ra = R, rb = R): EdgeGeom {
  if (a.x === b.x && a.y === b.y) {
    const p = (deg: number) => ({ x: a.x + ra * Math.cos((deg * Math.PI) / 180), y: a.y + ra * Math.sin((deg * Math.PI) / 180) });
    const s = p(-125),
      e = p(-55);
    const top = a.y - ra - 58;
    return {
      d: `M ${s.x} ${s.y} C ${a.x - 44} ${top}, ${a.x + 44} ${top}, ${e.x} ${e.y}`,
      label: { x: a.x, y: top + 10 },
    };
  }
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const toward = (from: Point, to: Point, r: number) => {
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / l) * r, y: from.y + ((to.y - from.y) / l) * r };
  };
  const s = toward(a, c, ra);
  const e = toward(b, c, rb + 1);
  return {
    d: `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x} ${e.y}`,
    label: { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y },
  };
}

/** Distância do ponto p ao segmento ab. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Reta de a até o ponto p (usada ao arrastar uma nova transição). */
export function dragLine(a: Point, p: Point, r = R): string {
  const l = Math.hypot(p.x - a.x, p.y - a.y) || 1;
  return `M ${a.x + ((p.x - a.x) / l) * r} ${a.y + ((p.y - a.y) / l) * r} L ${p.x} ${p.y}`;
}
