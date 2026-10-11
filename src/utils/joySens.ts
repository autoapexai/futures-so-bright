/**
 * Joystick sensitivity (SETTINGS menu): multiplies the virtual stick's output (clamped to full
 * push). 1.0x is the original feel; 0.1x moves the ship at one tenth speed; 2.0x reaches full
 * push with half the drag. Only the virtual (touch) stick is affected, never the keyboard.
 * New players start at the gentler JOY_SENS_DEFAULT.
 */
export const JOY_SENS_KEY = 'fsb_joystick_sens_v1';
export const JOY_SENS_MIN = 0.1;
export const JOY_SENS_MAX = 2.0;
export const JOY_SENS_STEP = 0.1;
export const JOY_SENS_DEFAULT = 0.5;
/** The original feel (every build before the setting existed). */
export const JOY_SENS_CLASSIC = 1.0;

export function clampJoySens(v: number): number {
  if (!Number.isFinite(v)) return JOY_SENS_DEFAULT;
  const c = Math.min(JOY_SENS_MAX, Math.max(JOY_SENS_MIN, v));
  return Math.round(c * 10) / 10;
}

export function loadJoySens(): number {
  try {
    const v = localStorage.getItem(JOY_SENS_KEY);
    if (v !== null && v.trim() !== '') return clampJoySens(parseFloat(v));
  } catch {
    /* ignore */
  }
  return JOY_SENS_DEFAULT;
}

export function saveJoySens(v: number): void {
  try {
    localStorage.setItem(JOY_SENS_KEY, clampJoySens(v).toFixed(1));
  } catch {
    /* ignore */
  }
}

export function fmtJoySens(v: number): string {
  return `${clampJoySens(v).toFixed(1)}x`;
}
