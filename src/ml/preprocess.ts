// Mirrors ml/common.py::preprocess_pil — center square crop -> 224x224 -> ImageNet normalisation (CHW float32).
export const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export async function loadBitmap(src: Blob | string): Promise<ImageBitmap> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

export function cropSquare(bmp: ImageBitmap, size: number): HTMLCanvasElement {
  const s = Math.min(bmp.width, bmp.height);
  const sx = Math.floor((bmp.width - s) / 2);
  const sy = Math.floor((bmp.height - s) / 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, size, size);
  return c;
}

export function toTensorData(canvas: HTMLCanvasElement): Float32Array {
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, SIZE, SIZE);
  const n = SIZE * SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

export function thumbnail(bmp: ImageBitmap, size = 160): string {
  return cropSquare(bmp, size).toDataURL('image/jpeg', 0.7);
}
