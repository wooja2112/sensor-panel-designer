// Background images are stored as data URLs on BackgroundOptions (plain,
// JSON-serializable — flows through autosave/project-file save/load for
// free) but <canvas> drawImage needs a decoded HTMLImageElement. This module
// decodes each data URL once and caches the result so repeated renders
// (zoom, gauge drags, pattern tweaks, ...) don't redecode every frame, and
// exposes a synchronous lookup so the pure renderBackground() stays sync.
const cache = new Map<string, HTMLImageElement>();
const inFlight = new Map<string, Promise<HTMLImageElement>>();

// Project files / autosaves should only carry inlined images. A remote URL
// in `background.image` would fetch on load (privacy) and could be huge.
export function isAllowedImageSrc(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('blob:');
}

export function sanitizeImageSrc(src: string | null | undefined): string | null {
  if (typeof src !== 'string' || !src || !isAllowedImageSrc(src)) return null;
  return src;
}

export function getCachedImage(src: string): HTMLImageElement | undefined {
  return cache.get(src);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!isAllowedImageSrc(src)) {
    return Promise.reject(new Error('Image source is not an inlined data URL.'));
  }
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(src);
  if (pending) return pending;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      inFlight.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      inFlight.delete(src);
      reject(new Error('Failed to load image.'));
    };
    img.src = src;
  });
  inFlight.set(src, promise);
  return promise;
}

// localStorage autosave is capped around 5MB/origin and base64 inflates
// binary size by ~1/3, so a full-resolution photo can blow the quota on its
// own — downscale anything past MAX_DIMENSION (or already large on disk)
// and re-encode as JPEG before it ever reaches BackgroundOptions/state.
const MAX_DIMENSION = 2048;
const SKIP_REENCODE_BYTES = 1.5 * 1024 * 1024;

export async function readBackgroundImageFile(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(rawDataUrl);
  if (img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION && file.size <= SKIP_REENCODE_BYTES) {
    return rawDataUrl;
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  await loadImage(optimizedDataUrl);
  return optimizedDataUrl;
}
