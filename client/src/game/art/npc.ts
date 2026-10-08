// Procedural sprites for the two non-human NPCs: Bit (corgi) and Quacky (rubber duck).
// Same technique as the existing office cat in engine.ts: tiny canvases, flat rects, auto-outline.
import { makeCanvas, outline, rect } from '../pixel';

const dogCache = new Map<number, HTMLCanvasElement>();
/** frame: 0 = idle/blink, 1/2 = walk cycle, 3 = sitting (napping) */
export function getDogSprite(frame: number): HTMLCanvasElement {
  let c = dogCache.get(frame);
  if (c) return c;
  const [canvas, ctx] = makeCanvas(18, 14);
  const o = '#d9924f', d = '#b8743a', w = '#fff6e6', belly = '#f2d9b0', nose = '#2b1d16';
  if (frame === 3) {
    // curled up, napping
    rect(ctx, 2, 7, 13, 5, o); rect(ctx, 3, 6, 10, 1, o);
    rect(ctx, 11, 4, 5, 4, o); rect(ctx, 11, 3, 1, 1, o); rect(ctx, 15, 3, 1, 1, o);
    rect(ctx, 4, 9, 6, 1, d); rect(ctx, 2, 11, 7, 1, w);
  } else {
    // body
    rect(ctx, 2, 5, 12, 6, o); rect(ctx, 2, 5, 12, 2, d); // back shading on top
    rect(ctx, 3, 9, 10, 2, belly);
    // head (right-facing)
    rect(ctx, 11, 1, 6, 6, o);
    rect(ctx, 11, 0, 2, 2, o); rect(ctx, 15, 0, 2, 2, o); // ears
    rect(ctx, 11, 0, 1, 1, d); rect(ctx, 16, 0, 1, 1, d);
    rect(ctx, 16, 3, 2, 2, w); // snout
    rect(ctx, 17, 4, 1, 1, nose);
    rect(ctx, 13, 3, 1, 1, nose); // eye
    // tail (curled, wags via frame)
    const tailUp = frame === 1;
    rect(ctx, 0, tailUp ? 2 : 4, 3, 3, o);
    // legs — alternate for walk cycle
    const legs = frame === 1 ? [4, 9] : [5, 10];
    legs.forEach((lx) => rect(ctx, lx, 11, 2, 2, d));
    rect(ctx, frame === 1 ? 7 : 3, 11, 2, 2, d);
  }
  outline(canvas);
  dogCache.set(frame, canvas);
  return canvas;
}

let duckSprite: HTMLCanvasElement | null = null;
export function getDuckSprite(): HTMLCanvasElement {
  if (duckSprite) return duckSprite;
  const [c, ctx] = makeCanvas(12, 11);
  const y = '#f6d365', yd = '#e0b24a', orange = '#e0923c', eye = '#2b1d16';
  rect(ctx, 1, 4, 9, 6, y); // body
  rect(ctx, 1, 4, 9, 2, '#fbe28a'); // highlight
  rect(ctx, 1, 8, 9, 1, yd); // belly shade
  rect(ctx, 7, 0, 5, 4, y); // head
  rect(ctx, 7, 0, 5, 1, '#fbe28a');
  rect(ctx, 10, 2, 2, 1, orange); // beak
  rect(ctx, 9, 1, 1, 1, eye); // eye
  outline(c);
  duckSprite = c;
  return c;
}
