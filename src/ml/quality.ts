// Image-quality gate (SPEC §5.7): runs before the model.
export const QUALITY = { minLum: 40, maxLum: 230, minBlur: 60, size: 256 };
// v1.1 "leaf fills the frame" hint (warning only, never blocks). Share of plant-coloured pixels: hue 15–175°
// (yellow/orange/brown to green, so diseased leaves count), saturation >= 0.18, value >= 0.12.
// 0.20 chosen on public/samples + fixtures: lowest coffee sample (08_phoma) = 0.26, so no coffee sample warns.
export const PLANT_FILL_MIN = 0.2;

export interface QualityResult {
  ok: boolean;
  reason?: 'dark' | 'bright' | 'blur';
  luminance: number;
  sharpness: number;
  plantFraction: number;
  fillWarn: boolean;
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
  let plant = 0;
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4] / 255;
    const gg = d[i * 4 + 1] / 255;
    const b = d[i * 4 + 2] / 255;
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    sum += g[i];
    const mx = Math.max(r, gg, b);
    const dd = mx - Math.min(r, gg, b);
    if (mx >= 0.12 && dd / (mx || 1) >= 0.18 && dd > 1e-6) {
      let hh = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
      if (hh < 0) hh += 6;
      const deg = hh * 60;
      if (deg >= 15 && deg <= 175) plant++;
    }
  }
  const plantFraction = plant / (w * h);
  const fillWarn = plantFraction < PLANT_FILL_MIN;
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
  if (luminance < QUALITY.minLum) return { ok: false, reason: 'dark', luminance, sharpness, plantFraction, fillWarn };
  if (luminance > QUALITY.maxLum) return { ok: false, reason: 'bright', luminance, sharpness, plantFraction, fillWarn };
  if (sharpness < QUALITY.minBlur) return { ok: false, reason: 'blur', luminance, sharpness, plantFraction, fillWarn };
  return { ok: true, luminance, sharpness, plantFraction, fillWarn };
}
