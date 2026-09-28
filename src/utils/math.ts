export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export const randInt = (min: number, max: number): number =>
  Math.floor(rand(min, max + 1));

export const chance = (p: number): boolean => Math.random() < p;

export interface Vec2 {
  x: number;
  y: number;
}

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/** In-place compact — avoids allocating a new array every frame. */
export function compact<T>(arr: T[], pred: (item: T) => boolean): void {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (pred(item)) arr[w++] = item;
  }
  arr.length = w;
}
