const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const WHEEL_SCALE_STEP = 0.09;

export function clampScale(scale: number): number {
  return Number.isFinite(scale) ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)) : 1;
}

export function scaleStorageKey(modelUrl: string, mode: string): string {
  return `live2d-scale:${mode}:${modelUrl}`;
}

export function readSavedScale(key: string, fallback: number): number {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (typeof value === "number" && Number.isFinite(value)) return clampScale(value);
  } catch {
    // Storage can be unavailable or contain an invalid value.
  }
  return clampScale(fallback);
}

export function saveScale(key: string, scale: number): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(clampScale(scale)));
  } catch {
    // Keep zoom usable when storage is unavailable.
  }
}

export function nextWheelScale(target: number, deltaY: number): number {
  return clampScale(target - Math.sign(deltaY) * WHEEL_SCALE_STEP);
}
