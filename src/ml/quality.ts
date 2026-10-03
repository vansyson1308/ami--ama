// Image-quality gate (SPEC §5.7): runs before the model.
export const QUALITY = { minLum: 40, maxLum: 230, minBlur: 60, size: 256 };

export interface QualityResult {
  ok: boolean;
  reason?: 'dark' | 'bright' | 'blur';
  luminance: number;
  sharpness: number;
}

export function checkQuality(bmp: ImageBitmap): QualityResult {
  const { size } = QUALITY;
  const r = size / Math.max(bmp.width, bmp.height);
  const w = Math.max(8, Math.round(bmp.width * r));
  const h = Math.max(8, Math.round(bmp.height * r));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    sum += g[i];
  }
  const luminance = sum / (w * h);
  // variance of the 4-neighbour Laplacian
  let s1 = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s1 += l;
      s2 += l * l;
      n++;
    }
  }
  const mean = s1 / n;
  const sharpness = s2 / n - mean * mean;
  if (luminance < QUALITY.minLum) return { ok: false, reason: 'dark', luminance, sharpness };
  if (luminance > QUALITY.maxLum) return { ok: false, reason: 'bright', luminance, sharpness };
  if (sharpness < QUALITY.minBlur) return { ok: false, reason: 'blur', luminance, sharpness };
  return { ok: true, luminance, sharpness };
}
