import { useEffect, useRef } from 'react';
import type { Avatar, Dir } from '../../../shared/protocol';
import { FH, FW, frameRect, getSheet } from '../game/art/character';

/** Renders a character frame (or just the head) at an integer scale. */
export function Portrait({ avatar, size = 48, full = false, dir = 'down', animate = false }: {
  avatar: Avatar; size?: number; full?: boolean; dir?: Dir; animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const sheet = getSheet(avatar);
    let raf = 0;
    const draw = (t: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      const col = animate ? Math.floor(t / 160) % 4 : 0;
      const { sx, sy } = frameRect(dir, col);
      if (full) ctx.drawImage(sheet, sx, sy, FW, FH, 0, 0, c.width, c.height);
      else ctx.drawImage(sheet, sx + 2, sy + 1, 12, 12, 0, 0, c.width, c.height);
      if (animate) raf = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(raf);
  }, [avatar, full, dir, animate]);
  const h = full ? Math.round((size * FH) / FW) : size;
  return <canvas ref={ref} width={full ? FW * 6 : 48} height={full ? FH * 6 : 48} className="pixelated" style={{ width: size, height: h }} />;
}
