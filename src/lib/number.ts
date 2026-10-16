/** Parses a number input. Unlike `+raw || fallback`, negatives stay negative. */
export function parseNumberInput(raw: string, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function parseIntegerInput(raw: string, fallback = 0): number {
  return Math.round(parseNumberInput(raw, fallback));
}
