import { useEffect, useRef } from 'react';
import { TILE } from '../../../shared/protocol';
import { getSprite, sortY } from '../game/art/furniture';
import { paintStatic } from '../game/art/tiles';
import { buildMap, MAP_H, MAP_W } from '../game/map';

/** Slowly panning render of the office used behind the join screen. */
export function MapBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const map = buildMap();
    const base = paintStatic(map);
    const ctx = base.getContext('2d')!;
    [...map.furniture].filter((f) => f.layer === 'obj').sort((a, b) => sortY(a) - sortY(b)).forEach((f) => {
      const s = getSprite(f);
      ctx.drawImage(s.canvas, f.x * TILE - s.ox, f.y * TILE - s.oy);
    });
    const c = ref.current!;
    const out = c.getContext('2d')!;
    let raf = 0;
    const draw = (t: number) => {
      if (c.width !== window.innerWidth || c.height !== window.innerHeight) { c.width = window.innerWidth; c.height = window.innerHeight; }
      out.imageSmoothingEnabled = false;
      const z = Math.max(2, Math.ceil(Math.max(c.width / (MAP_W * TILE), c.height / (MAP_H * TILE))) + 1);
      const maxX = MAP_W * TILE * z - c.width, maxY = MAP_H * TILE * z - c.height;
      const k = (Math.sin(t / 14000) + 1) / 2;
      out.drawImage(base, -Math.round(maxX * k), -Math.round(maxY * (0.3 + 0.4 * k)), MAP_W * TILE * z, MAP_H * TILE * z);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="backdrop" />;
}
