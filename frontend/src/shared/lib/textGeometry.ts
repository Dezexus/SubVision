import type { BlurSettings } from '../../types';

export interface TextRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mirrors backend subvision/rendering/geometry.py estimate_text_width. */
export function estimateTextWidth(text: string, fontSizePx: number, multiplier: number): number {
  if (!text) return 0;

  let width = 0.0;
  for (const char of text) {
    if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/.test(char)) {
      width += 1.1;
    } else if (/[mwWM@OQG]/.test(char)) {
      width += 0.95;
    } else if (/[A-Z]/.test(char)) {
      width += 0.8;
    } else if (/[0-9]/.test(char)) {
      width += 0.65;
    } else if (/[il1.,!I|:;tfj]/.test(char)) {
      width += 0.35;
    } else {
      width += 0.65;
    }
  }
  return Math.ceil(width * fontSizePx * multiplier);
}

/** Mirrors backend calculate_text_roi (green frame). */
export function calculateTextRect(
  text: string,
  frameWidth: number,
  frameHeight: number,
  settings: Pick<BlurSettings, 'y' | 'font_size' | 'width_multiplier' | 'height_multiplier'>
): TextRect {
  if (!text) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let yPos = settings.y;
  if (yPos > frameHeight) {
    yPos = frameHeight - 50;
  }

  const fontSizePx = settings.font_size;
  const widthMultiplier = settings.width_multiplier ?? 1.0;
  const heightMultiplier = settings.height_multiplier ?? 1.5;

  const lines = text.split('\n');
  let maxLineWidth = 0;
  for (const line of lines) {
    const lineWidth = estimateTextWidth(line, fontSizePx, widthMultiplier);
    if (lineWidth > maxLineWidth) {
      maxLineWidth = lineWidth;
    }
  }
  const numLines = lines.length;

  const textH = Math.floor((fontSizePx + 4) * numLines * heightMultiplier);
  const textW = maxLineWidth;

  const x = Math.floor((frameWidth - textW) / 2);
  const y = yPos - textH;

  const finalX = Math.max(0, x);
  const finalY = Math.max(0, y);
  const finalW = Math.min(frameWidth - finalX, textW);
  const finalH = Math.min(frameHeight - finalY, textH);

  return { x: finalX, y: finalY, w: finalW, h: finalH };
}
