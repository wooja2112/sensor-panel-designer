// Ported from Sensor Gauge Image Creator's src/app/App.tsx. Pure canvas
// drawing logic — no React dependency — so the same drawOn() call renders
// both the live preview and every exported frame.
import { drawImportedText } from './importedText';

export type ThemeColors = {
  zone: [string, string, string];
  mono: [string, string, string];
  solid: string;
};
export type ThemesMap = Record<string, ThemeColors>;

export const DEFAULT_THEMES: ThemesMap = {
  classic:   { zone: ["#2a78d6", "#eda100", "#e34948"], mono: ["#85B7EB", "#378ADD", "#0C447C"], solid: "#2a78d6" },
  ember:     { zone: ["#fbbf24", "#f97316", "#dc2626"], mono: ["#fde68a", "#fb923c", "#92400e"], solid: "#f97316" },
  ocean:     { zone: ["#67e8f9", "#22d3ee", "#0e7490"], mono: ["#bae6fd", "#38bdf8", "#0369a1"], solid: "#0ea5e9" },
  forest:    { zone: ["#a3e635", "#22c55e", "#15803d"], mono: ["#bbf7d0", "#4ade80", "#166534"], solid: "#22c55e" },
  neon:      { zone: ["#22d3ee", "#a855f7", "#ec4899"], mono: ["#e9d5ff", "#a855f7", "#6b21a8"], solid: "#a855f7" },
  slate:     { zone: ["#94a3b8", "#64748b", "#334155"], mono: ["#e2e8f0", "#94a3b8", "#475569"], solid: "#64748b" },
  grayscale: { zone: ["#999999", "#555555", "#111111"], mono: ["#aaaaaa", "#666666", "#333333"], solid: "#666666" },
  dracula:    { zone: ["#50fa7b", "#bd93f9", "#ff79c6"], mono: ["#d6acff", "#bd93f9", "#6c3fa8"], solid: "#bd93f9" },
  nord:       { zone: ["#8fbcbb", "#88c0d0", "#5e81ac"], mono: ["#d8dee9", "#88c0d0", "#4c566a"], solid: "#88c0d0" },
  solarized:  { zone: ["#b58900", "#cb4b16", "#dc322f"], mono: ["#7fc7ff", "#268bd2", "#164a6b"], solid: "#268bd2" },
  monokai:    { zone: ["#a6e22e", "#fd971f", "#f92672"], mono: ["#ff9dc4", "#f92672", "#99163f"], solid: "#f92672" },
  gruvbox:    { zone: ["#b8bb26", "#fabd2f", "#fe8019"], mono: ["#ffb377", "#fe8019", "#af3a03"], solid: "#fe8019" },
  onedark:    { zone: ["#98c379", "#61afef", "#c678dd"], mono: ["#9cc9fb", "#61afef", "#2f5f8a"], solid: "#61afef" },
  tokyonight: { zone: ["#7dcfff", "#7aa2f7", "#bb9af7"], mono: ["#d7c4fb", "#bb9af7", "#6a4f9e"], solid: "#7aa2f7" },
  catppuccin: { zone: ["#94e2d5", "#89b4fa", "#cba6f7"], mono: ["#d3d8ff", "#b4befe", "#6c74b0"], solid: "#cba6f7" },
  material:   { zone: ["#4caf50", "#ffc107", "#f44336"], mono: ["#64b5f6", "#2196f3", "#1565c0"], solid: "#2196f3" },
  synthwave:  { zone: ["#03edf9", "#ff7edb", "#f97e72"], mono: ["#ff9df7", "#ff7edb", "#b34fa0"], solid: "#ff7edb" },
};

export type GaugeMode = "bar" | "circ" | "needle" | "container" | "text" | "image";

export const GAUGE_MODE_LABELS: Record<GaugeMode, string> = {
  bar: "Bar",
  circ: "Circular",
  needle: "Needle",
  container: "Container",
  text: "Label",
  image: "Image",
};

export function isSensorGaugeMode(mode: GaugeMode): boolean {
  return mode === "bar" || mode === "circ" || mode === "needle";
}

export function isStaticGaugeMode(mode: GaugeMode): boolean {
  return !isSensorGaugeMode(mode);
}
export type ColorMode = "zone" | "solid" | "mono";
export type LabelPos = "top" | "bottom" | "left" | "right" | "middle";
export type ContainerShape = "frame" | "corners" | "line" | "circle";
export type ContainerCorner = "tl" | "tr" | "bl" | "br";

export interface FrameData {
  dataUrl: string;
  thumbUrl: string;
  label: string;
}

// ── canvas helpers ────────────────────────────────────────────────────────────
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// A rightward-leaning parallelogram — the "slanted segment" LED-meter look.
// skew shifts the top edge right relative to the bottom edge by `skew` px,
// so consecutive segments (translated by segW+gap) keep a constant visual
// gap along their full slanted height.
function slantPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, skew: number) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w + skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

// Overlays a glossy directional-light gradient, highlight band, and edge
// border onto an already-filled region, giving a bar segment a raised, 3D
// "capsule" look. lightDeg is measured clockwise from "light shining from
// directly above" (0°), matching the on-canvas up direction. Clips to a
// rounded rect by default; pass shapePath to clip to a different silhouette
// (e.g. a slanted parallelogram) instead.
function apply3DBarShading(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, lightDeg: number,
  shapePath?: () => void
) {
  const cx = x + w / 2, cy = y + h / 2;
  const theta = lightDeg * Math.PI / 180;
  const hx = Math.sin(theta), hy = -Math.cos(theta);
  const e = Math.abs(hx) * w / 2 + Math.abs(hy) * h / 2;
  const bx = cx + hx * e, by = cy + hy * e; // point facing the light (brightest)
  const dx = cx - hx * e, dy = cy - hy * e; // point facing away (darkest)
  const path = shapePath ?? (() => roundRect(ctx, x, y, w, h, r));

  ctx.save();
  path();
  ctx.clip();

  const shade = ctx.createLinearGradient(bx, by, dx, dy);
  shade.addColorStop(0, "rgba(255,255,255,0.4)");
  shade.addColorStop(0.5, "rgba(255,255,255,0.05)");
  shade.addColorStop(0.5, "rgba(0,0,0,0.05)");
  shade.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = shade;
  // Pad past the axis-aligned box so a slanted clip (parallelogram) is fully
  // shaded, not just the rectangle that sits inside it.
  const pad = Math.max(w, h);
  ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

  // Glossy highlight band on the side facing the light
  const cap = ctx.createLinearGradient(bx, by, dx, dy);
  cap.addColorStop(0, "rgba(255,255,255,0.45)");
  cap.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = cap;
  ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

  ctx.restore();

  // Edge border for definition
  path();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.stroke();
}

// Renders a thermometer-style "bar" gauge: a glass tube capped with a bulb
// reservoir at the bottom, a mercury column that rises with the value, and
// dual °F/°C tick scales flanking the tube. °F and °C are linearly related,
// so both scales can always be shown at once from the same onCount without
// needing two separate bound values.
function drawThermometerGauge(
  ctx: CanvasRenderingContext2D, W: number, H: number, onCount: number, opts: DrawOptions
) {
  const cx = W / 2;
  const tubeW = Math.max(6, Math.min(opts.sw, Math.min(W, H) * 0.22));
  const tubeHalfW = tubeW / 2;
  const bulbR = tubeHalfW * 1.7;

  const marginTop = H * 0.06;
  const marginBottom = H * 0.14;
  const bulbCY = H - marginBottom - bulbR;
  const tubeTop = marginTop;
  // The capsule's rounded bottom cap extends into the bulb, which is drawn
  // over it afterward — no special-casing needed for the tube/bulb seam.
  const tubeBottom = bulbCY + tubeHalfW;

  const tubePath = () => roundRect(ctx, cx - tubeHalfW, tubeTop, tubeW, tubeBottom - tubeTop, tubeHalfW);
  tubePath();
  ctx.fillStyle = opts.trackColor;
  ctx.fill();

  // Mercury column — clipped fill growing from the bottom, the same
  // clip-and-reveal technique the solid flat/ascending bar styles use.
  const fillFrac = Math.max(0, Math.min(1, onCount / 100));
  if (fillFrac > 0) {
    ctx.save();
    tubePath();
    ctx.clip();
    const fillTopY = tubeBottom - fillFrac * (tubeBottom - tubeTop);
    ctx.fillStyle = opts.mercuryColor;
    ctx.fillRect(cx - tubeHalfW, fillTopY, tubeW, tubeBottom - fillTopY);
    ctx.restore();
  }

  tubePath();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, tubeW * 0.05);
  ctx.stroke();

  // Bulb reservoir — always full — with a glossy highlight for a rounded,
  // glass-covered look.
  ctx.beginPath();
  ctx.arc(cx, bulbCY, bulbR, 0, Math.PI * 2);
  ctx.fillStyle = opts.mercuryColor;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, tubeW * 0.05);
  ctx.stroke();

  const hl = ctx.createRadialGradient(
    cx - bulbR * 0.35, bulbCY - bulbR * 0.35, 0,
    cx - bulbR * 0.35, bulbCY - bulbR * 0.35, bulbR * 0.9
  );
  hl.addColorStop(0, "rgba(255,255,255,0.5)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(cx, bulbCY, bulbR, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  // Dual °F / °C tick scales flanking the tube. The lowest tick stops just
  // above the bulb (rather than at tubeBottom, which runs into the bulb
  // itself) so it doesn't collide with the °F/°C unit labels beside the
  // bulb below it — real thermometers leave the same gap.
  const tickCount = Math.max(2, opts.thermoTickCount || 2);
  const tickLen = Math.max(4, tubeW * 0.5);
  const fs = Math.max(9, Math.min(tubeW * 0.85, H * 0.045));
  const scaleBottom = bulbCY - bulbR - fs * 0.6;
  ctx.font = `500 ${fs}px sans-serif`;
  ctx.textBaseline = "middle";
  for (let i = 0; i < tickCount; i++) {
    const t = i / (tickCount - 1);
    const y = scaleBottom - t * (scaleBottom - tubeTop);
    const tempF = opts.thermoMinF + t * (opts.thermoMaxF - opts.thermoMinF);
    const tempC = (tempF - 32) * 5 / 9;

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1, tubeW * 0.06);

    ctx.beginPath();
    ctx.moveTo(cx - tubeHalfW - 2, y);
    ctx.lineTo(cx - tubeHalfW - 2 - tickLen, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(tempF)), cx - tubeHalfW - 2 - tickLen - 4, y);

    ctx.beginPath();
    ctx.moveTo(cx + tubeHalfW + 2, y);
    ctx.lineTo(cx + tubeHalfW + 2 + tickLen, y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(String(Math.round(tempC)), cx + tubeHalfW + 2 + tickLen + 4, y);
  }

  // Unit labels flanking the bulb, at the bulb's own vertical center so
  // they stay clear of the lowest tick label above.
  const unitFs = Math.max(9, fs * 1.1);
  ctx.font = `600 ${unitFs}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "center";
  ctx.fillText("°F", cx - bulbR - Math.max(6, tickLen * 0.5), bulbCY);
  ctx.fillText("°C", cx + bulbR + Math.max(6, tickLen * 0.5), bulbCY);
}

// Overlays the same glossy 3D treatment as apply3DBarShading onto a circular
// gauge's ring: a faint ambient radial gradient across the ring's thickness
// (the tube's own curvature) plus a directional highlight/shadow that sweeps
// around the ring toward/away from lightDeg — matching the same clockwise,
// "0° = light from directly above" convention as the bar's lightDeg.
function apply3DRingShading(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  r: number, width: number, startRad: number, endRad: number, lightDeg: number
) {
  const ro = r + width / 2, ri = r - width / 2;
  // Convert lightDeg (0° = up, clockwise) into the canvas's polar angle
  // convention used by startRad/endRad (0 = +x axis, clockwise since y is down).
  const lightRad = lightDeg * Math.PI / 180 - Math.PI / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ro, startRad, endRad);
  ctx.arc(cx, cy, ri, endRad, startRad, true);
  ctx.closePath();
  ctx.clip();

  // Faint ambient shading from the tube's own cross-section curvature
  const shade = ctx.createRadialGradient(cx, cy, ri, cx, cy, ro);
  shade.addColorStop(0, "rgba(0,0,0,0.15)");
  shade.addColorStop(1, "rgba(255,255,255,0.15)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - ro, cy - ro, ro * 2, ro * 2);

  // Directional highlight/shadow sweeping around the ring toward/away from the light
  ctx.lineCap = "butt";
  const steps = Math.max(24, Math.min(180, Math.ceil(Math.abs(endRad - startRad) * ro / 3)));
  for (let i = 0; i < steps; i++) {
    const a0 = startRad + (i / steps) * (endRad - startRad);
    const a1 = startRad + ((i + 1) / steps) * (endRad - startRad);
    const aMid = (a0 + a1) / 2;
    const b = Math.cos(aMid - lightRad);
    ctx.beginPath();
    ctx.arc(cx, cy, (ro + ri) / 2, a0, a1);
    ctx.lineWidth = width;
    ctx.strokeStyle = b >= 0 ? `rgba(255,255,255,${0.4 * b})` : `rgba(0,0,0,${-0.35 * b})`;
    ctx.stroke();
  }

  ctx.restore();

  // Edge borders for definition
  ctx.beginPath(); ctx.arc(cx, cy, ro, startRad, endRad);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, width * 0.05);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, ri, startRad, endRad);
  ctx.stroke();
}

export function makeStamp() {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type BarStyle = "flat" | "ascending" | "slanted" | "thermometer";
export type ThermoUnit = "F" | "C";
export type NeedleStyle = "plain" | "classic";

export interface DrawOptions {
  mode: GaugeMode;
  nSegs: number;
  barStyle: BarStyle;
  sw: number;
  gap: number;
  mercuryColor: string;
  thermoUnit: ThermoUnit;
  thermoMinF: number;
  thermoMaxF: number;
  thermoTickCount: number;
  gauge3D: boolean;
  lightAngle: number;
  colorMode: ColorMode;
  themeColors: ThemeColors;
  solidColor: string;
  bgColor: string;
  trackColor: string;
  showLabel: boolean;
  labelPos: LabelPos;
  labelPad: number;
  arcSpan: number;
  rotation: number;
  outerRing: boolean;
  outerRingWidth: number;
  outerRingGap: number;
  outerRing3D: boolean;
  innerRingGlow: boolean;
  innerRingGlowIntensity: number;
  outerRingGlow: boolean;
  outerRingGlowIntensity: number;
  needleCenterDia: number;
  needleCenterColor: string;
  needleCenterBorderColor: string;
  needleColor: string;
  tickLength: number;
  needleStyle: NeedleStyle;
  dialMin: number;
  dialMax: number;
  dialTickStep: number;
  dialTitle: string;
  dialUnit: string;
  dialSubtext: string;
  dialAccentColor: string;
  containerShape: ContainerShape;
  containerColor1: string;
  containerColor2: string;
  containerThickness: number;
  containerGlow: number;
  containerMargin: number;
  containerCornerRadius: number;
  containerArmLength: number;
  containerCorners: ContainerCorner[];
  containerOrientation: "horizontal" | "vertical";
  textContent: string;
  textFont: string;
  textFontSize: number;
  textBold: boolean;
  textItalic: boolean;
  textColor: string;
  textAlign: "left" | "center" | "right";
}

export function defaultDrawOptions(mode: GaugeMode = "bar"): DrawOptions {
  return {
    mode,
    nSegs: mode === "needle" || mode === "text" || mode === "image" ? 0 : 10,
    barStyle: "flat",
    sw: 16,
    gap: 3,
    mercuryColor: "#d21f1f",
    thermoUnit: "F",
    thermoMinF: 32,
    thermoMaxF: 212,
    thermoTickCount: 5,
    gauge3D: false,
    lightAngle: 0,
    colorMode: "zone",
    themeColors: DEFAULT_THEMES.classic,
    solidColor: "#2a78d6",
    bgColor: "transparent",
    trackColor: "rgba(128,128,128,0.2)",
    showLabel: true,
    labelPos: "top",
    labelPad: 6,
    arcSpan: 220,
    rotation: 0,
    outerRing: false,
    outerRingWidth: 6,
    outerRingGap: 3,
    outerRing3D: false,
    innerRingGlow: false,
    innerRingGlowIntensity: 14,
    outerRingGlow: false,
    outerRingGlowIntensity: 14,
    needleCenterDia: 40,
    needleCenterColor: "#3a3a3a",
    needleCenterBorderColor: "#e5e5e5",
    needleColor: "#e5484d",
    tickLength: 16,
    needleStyle: "plain",
    dialMin: 0,
    dialMax: 100,
    dialTickStep: 10,
    dialTitle: "",
    dialUnit: "",
    dialSubtext: "",
    dialAccentColor: "#22c55e",
    containerShape: "frame",
    containerColor1: "#3b82f6",
    containerColor2: "#a855f7",
    containerThickness: 4,
    containerGlow: 14,
    containerMargin: 20,
    containerCornerRadius: 24,
    containerArmLength: 60,
    containerCorners: ["tl", "tr", "bl", "br"],
    containerOrientation: "horizontal",
    textContent: "Label",
    textFont: "Segoe UI",
    textFontSize: 20,
    textBold: false,
    textItalic: false,
    textColor: "#ffffff",
    textAlign: "left",
  };
}

// Sensible default export dimensions per gauge mode, used when placing a new
// gauge instance on the panel.
export function defaultSizeForMode(mode: GaugeMode): { width: number; height: number } {
  if (mode === "bar") return { width: 240, height: 60 };
  if (mode === "container") return { width: 320, height: 220 };
  if (mode === "text") return { width: 180, height: 32 };
  if (mode === "image") return { width: 160, height: 160 };
  return { width: 160, height: 160 };
}

// drawOn swaps canvas width/height for a 90°/270° bar so the long axis
// isn't clipped. Thermometers are always drawn upright and must not swap
// even if a leftover rotation is still stored on the gauge.
export function barCanvasIsSwapped(opts: DrawOptions): boolean {
  return opts.mode === "bar"
    && opts.barStyle !== "thermometer"
    && (opts.rotation === 90 || opts.rotation === 270);
}

// Min/max written into AIDA64 / InfoPanel so live sensors line up with
// classic-dial tick labels and thermometer °C ticks. Other gauges stay 0–100.
// Thermometers always export °C (HWInfo/AIDA temp sensors are typically C);
// the default 32–212°F scale is 0–100°C, matching the old hard-coded export.
export function gaugeSensorRange(opts: DrawOptions): { min: number; max: number } {
  if (opts.mode === "bar" && opts.barStyle === "thermometer") {
    const min = Math.round((opts.thermoMinF - 32) * 5 / 9);
    const max = Math.round((opts.thermoMaxF - 32) * 5 / 9);
    return min === max ? { min, max: min + 1 } : { min, max };
  }
  if (opts.mode === "needle" && opts.needleStyle === "classic") {
    const min = opts.dialMin;
    const max = opts.dialMax;
    return min === max ? { min, max: min + 1 } : { min, max };
  }
  return { min: 0, max: 100 };
}

// Draw text visually centered at (x, y) — uses actual glyph bounds, not EM-box
function fillTextVCenter(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number
) {
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  ctx.fillText(text, x, y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

// Parses "#rgb" / "#rrggbb" into 0-255 channel values.
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * u)},${Math.round(g1 + (g2 - g1) * u)},${Math.round(b1 + (b2 - b1) * u)})`;
}
// Smoothly blends across the three theme colors instead of stepping at
// fixed thresholds — the color at fraction f transitions continuously.
function blend3(f: number, colors: [string, string, string]): string {
  const t = Math.max(0, Math.min(1, f));
  return t <= 0.5 ? lerpColor(colors[0], colors[1], t / 0.5) : lerpColor(colors[1], colors[2], (t - 0.5) / 0.5);
}
function getZoneColor(f: number, c: ThemeColors) {
  return blend3(f, c.zone);
}
function getMonoColor(f: number, c: ThemeColors) {
  return blend3(f, c.mono);
}
// The theme color triple backing a smooth gradient fill, or null for a flat
// custom solid color (which has no theme-based gradient to build from).
function themeColorTriple(opts: DrawOptions): [string, string, string] | null {
  if (opts.colorMode === "zone") return opts.themeColors.zone;
  if (opts.colorMode === "mono") return opts.themeColors.mono;
  return null;
}
function getSegFill(i: number, total: number, opts: DrawOptions) {
  const f = (i + 1) / total;
  if (opts.colorMode === "zone") return getZoneColor(f, opts.themeColors);
  if (opts.colorMode === "solid") return opts.solidColor;
  return getMonoColor(f, opts.themeColors);
}
function getLabelColor(onCount: number, nSegs: number, opts: DrawOptions) {
  const f = onCount / nSegs;
  if (opts.colorMode === "zone") return getZoneColor(f, opts.themeColors);
  if (opts.colorMode === "solid") return opts.solidColor;
  return getMonoColor(f, opts.themeColors);
}

// Static zone ring — a smooth gradient across the theme's zone colors
// (same slice-based blend as the bar/circular gauges' fills), regardless
// of value.
function drawZoneRing(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  radius: number, width: number, sdRad: number, spanDeg: number,
  zoneColors: [string, string, string], glow: number = 0
) {
  const prevCap = ctx.lineCap;
  ctx.lineCap = "butt";
  const spanRad = spanDeg * Math.PI / 180;
  const steps = Math.max(24, Math.min(240, Math.ceil(Math.abs(spanRad) * radius / 3)));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const color = blend3((t0 + t1) / 2, zoneColors);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, sdRad + t0 * spanRad, sdRad + t1 * spanRad);
    ctx.strokeStyle = color;
    if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; } else { ctx.shadowBlur = 0; }
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.lineCap = prevCap;
}

// Renders the "classic" automotive-dial needle style's face content —
// title, unit text, and an optional sub-label + accent bar — centered on
// the dark face. Drawn before the needle/hub so the pointer visually passes
// in front of the printed face, like a real instrument.
function drawClassicDialFace(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, faceR: number, opts: DrawOptions
) {
  const titleLines = (opts.dialTitle ?? "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = cy - faceR * 0.56;
  const titleFs = Math.max(7, faceR * 0.115);
  ctx.font = `600 ${titleFs}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (const line of titleLines) {
    ctx.fillText(line, cx, y);
    y += titleFs * 1.05;
  }
  if (titleLines.length > 0) y += faceR * 0.05;

  if (opts.dialUnit) {
    const unitFs = Math.max(7, faceR * 0.13);
    ctx.font = `500 ${unitFs}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(opts.dialUnit, cx, y + unitFs * 0.6);
  }

  // Sub-label + accent bar near the bottom of the face
  const barY = cy + faceR * 0.66;
  if (opts.dialSubtext) {
    const subFs = Math.max(6, faceR * 0.1);
    ctx.font = `500 ${subFs}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(opts.dialSubtext, cx, barY - faceR * 0.15);
  }
  const barW = faceR * 0.55, barH = Math.max(3, faceR * 0.065);
  roundRect(ctx, cx - barW / 2, barY, barW, barH, barH / 2);
  ctx.fillStyle = opts.dialAccentColor;
  ctx.fill();
}

// Strokes a glowing neon line/path: a soft blurred halo (stroked twice, wider
// and more blurred on the second pass) plus a thin hot-white core, giving the
// glass-tube look used by the Container mode. buildPath must call
// ctx.beginPath()/moveTo/lineTo (etc.) but not stroke.
function strokeGlowPath(
  ctx: CanvasRenderingContext2D, buildPath: () => void,
  strokeStyle: string | CanvasGradient, glowColor: string, thickness: number, glow: number
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  buildPath();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glow;
  ctx.lineWidth = thickness;
  ctx.strokeStyle = strokeStyle;
  ctx.globalAlpha = 0.9;
  ctx.stroke();

  buildPath();
  ctx.shadowBlur = glow * 1.7;
  ctx.globalAlpha = 0.55;
  ctx.stroke();

  buildPath();
  ctx.shadowBlur = Math.max(1, glow * 0.35);
  ctx.lineWidth = Math.max(1, thickness * 0.35);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.globalAlpha = 1;
  ctx.stroke();

  ctx.restore();
}

// Renders the Container mode: a glowing frame border, a set of L-shaped
// corner brackets, a single glowing line, or a glowing circle, all using a
// color1→color2 gradient across the shape.
function drawContainerGauge(ctx: CanvasRenderingContext2D, W: number, H: number, opts: DrawOptions) {
  const { containerShape, containerColor1, containerColor2, containerThickness, containerGlow, containerMargin, containerCornerRadius, containerArmLength, containerCorners, containerOrientation } = opts;
  const glowColor = lerpColor(containerColor1, containerColor2, 0.5);
  const m = containerMargin;

  if (containerShape === "frame") {
    const x = m, y = m, w = Math.max(1, W - m * 2), h = Math.max(1, H - m * 2);
    const cr = Math.min(containerCornerRadius, w / 2, h / 2);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, containerColor1);
    grad.addColorStop(1, containerColor2);
    strokeGlowPath(ctx, () => roundRect(ctx, x, y, w, h, cr), grad, glowColor, containerThickness, containerGlow);
  } else if (containerShape === "corners") {
    const a = Math.max(2, Math.min(containerArmLength, (W - 2 * m) / 2, (H - 2 * m) / 2));
    const grad = ctx.createLinearGradient(m, m, W - m, H - m);
    grad.addColorStop(0, containerColor1);
    grad.addColorStop(1, containerColor2);
    strokeGlowPath(ctx, () => {
      ctx.beginPath();
      if (containerCorners.includes("tl")) { ctx.moveTo(m, m + a); ctx.lineTo(m, m); ctx.lineTo(m + a, m); }
      if (containerCorners.includes("tr")) { ctx.moveTo(W - m - a, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + a); }
      if (containerCorners.includes("bl")) { ctx.moveTo(m, H - m - a); ctx.lineTo(m, H - m); ctx.lineTo(m + a, H - m); }
      if (containerCorners.includes("br")) { ctx.moveTo(W - m - a, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - a); }
    }, grad, glowColor, containerThickness, containerGlow);
  } else if (containerShape === "line") {
    const isH = containerOrientation === "horizontal";
    const grad = isH
      ? ctx.createLinearGradient(m, 0, W - m, 0)
      : ctx.createLinearGradient(0, m, 0, H - m);
    grad.addColorStop(0, containerColor1);
    grad.addColorStop(1, containerColor2);
    strokeGlowPath(ctx, () => {
      ctx.beginPath();
      if (isH) { ctx.moveTo(m, H / 2); ctx.lineTo(W - m, H / 2); }
      else { ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); }
    }, grad, glowColor, containerThickness, containerGlow);
  } else {
    const cx = W / 2, cy = H / 2;
    const r = Math.max(1, Math.min(W, H) / 2 - m);
    const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, containerColor1);
    grad.addColorStop(1, containerColor2);
    strokeGlowPath(ctx, () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }, grad, glowColor, containerThickness, containerGlow);
  }
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function sharedMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d")!;
  return _measureCtx;
}

export interface GaugeLayout {
  r: number;
  cx: number;
  cy: number;
  // Half the space reserved around the ring for its own stroke width plus,
  // when enabled, the static outer zone ring — same quantity drawOn() needs
  // again later to place the value label outside the ring.
  outerHalf: number;
}

// Shared radius/center computation for circ & needle gauges — identical for
// both modes (only the content drawn inside the ring differs), so it's
// pulled out of drawOn() rather than inlined twice. Also lets
// computeGaugeOuterRadius() below solve backwards from a target radius to a
// bounding box ("make same size" in App.tsx) without duplicating — and
// risking drifting from — this math.
export function computeGaugeLayout(W: number, H: number, opts: DrawOptions, ctx?: CanvasRenderingContext2D): GaugeLayout {
  const { sw, labelPos } = opts;
  const pad = opts.labelPad;
  const r_base = Math.min(W, H) * 0.36;
  // The classic needle dial shows its value in an in-face digital box
  // instead of the usual outside label, so it never needs label space.
  const showLabel = opts.showLabel && !(opts.mode === "needle" && opts.needleStyle === "classic");

  // Estimate font size using base radius so we can compute label space
  const fs_est = Math.max(10, Math.min(r_base * 0.38, H * 0.13));
  const measureCtx = ctx ?? sharedMeasureCtx();
  measureCtx.font = `500 ${fs_est}px sans-serif`;
  const lblTextW = showLabel ? measureCtx.measureText("100%").width : 0;

  // Amount of canvas space the label needs in each axis
  const lblH = fs_est + pad * 2;
  const lblW = lblTextW + pad * 2;

  // Extra radius reserved for the static outer zone ring, if enabled
  const outerHalf = sw / 2 + (opts.outerRing ? opts.outerRingGap + opts.outerRingWidth : 0);

  // Clamp r so gauge + label fit, and shift cx/cy so the whole block is centered
  let r = r_base, cx = W / 2, cy = H / 2;
  if (showLabel) {
    if (labelPos === "top" || labelPos === "bottom") {
      r = Math.min(r_base, H / 2 - outerHalf - lblH);
      const shift = lblH / 2;
      cy = labelPos === "top" ? H / 2 + shift : H / 2 - shift;
    }
    if (labelPos === "left" || labelPos === "right") {
      r = Math.min(r_base, W / 2 - outerHalf - lblW);
      const shift = lblW / 2;
      cx = labelPos === "left" ? W / 2 + shift : W / 2 - shift;
    }
    r = Math.max(10, r);
  }
  // Also make sure the ring itself never clips the canvas edge
  r = Math.max(10, Math.min(r, Math.min(W, H) / 2 - outerHalf - 1));

  return { r, cx, cy, outerHalf };
}

// The outermost edge of what a circ/needle gauge actually draws — the ring
// plus its own stroke, plus the static outer zone ring when present. Two
// gauges with the same bounding box can still render at very different
// visual sizes if their sw/label/outer-ring settings differ (a thick sw
// leaves less room for the ring itself but pushes its outer edge no
// further out — see computeGaugeLayout's final clamp), so "make gauges the
// same size" compares *this*, not raw width/height, to decide whether two
// ring-based gauges actually look the same size.
export function computeGaugeOuterRadius(W: number, H: number, opts: DrawOptions, ctx?: CanvasRenderingContext2D): number {
  const { r } = computeGaugeLayout(W, H, opts, ctx);
  const edge = r + opts.sw / 2;
  return opts.outerRing ? edge + opts.outerRingGap + opts.outerRingWidth : edge;
}

// Binary-searches a uniform scale factor applied to (aspectW, aspectH) so
// the resulting box's computeGaugeOuterRadius() matches targetRadius —
// used by "make same size" (App.tsx) to equalize how big two ring gauges
// (circ/needle) actually *look* without touching either one's own
// sw/arcSpan/label styling, only its bounding box. computeGaugeOuterRadius
// is monotonically non-decreasing in box size, so this converges regardless
// of which label/outer-ring branch ends up binding.
export function solveRingBoxForOuterRadius(targetRadius: number, aspectW: number, aspectH: number, opts: DrawOptions): { width: number; height: number } {
  let lo = 0.02, hi = 50;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (computeGaugeOuterRadius(aspectW * mid, aspectH * mid, opts) < targetRadius) lo = mid; else hi = mid;
  }
  const s = (lo + hi) / 2;
  return { width: Math.max(1, Math.round(aspectW * s)), height: Math.max(1, Math.round(aspectH * s)) };
}

export function drawOn(canvas: HTMLCanvasElement, onCount: number, opts: DrawOptions) {
  const { mode, nSegs, sw, gap, bgColor, showLabel, labelPos, arcSpan, trackColor } = opts;
  // A bar gauge's footprint is naturally elongated along one axis. Rotating
  // it 90°/270° in place (same canvas pixel size) would clip the long axis
  // against the short canvas dimension, so the canvas itself is resized to
  // fit the rotated footprint. W/H below stay the *un-rotated* logical size
  // the caller configured (canvas.width/height are read before any resize),
  // so all the layout math further down — written in terms of W/H — is
  // unaffected; only the rotation transform's pivot and the fill/clear
  // extents need to know about the swapped physical canvas size.
  const W = canvas.width, H = canvas.height;
  const rotated90 = barCanvasIsSwapped(opts);
  if (rotated90) { canvas.width = H; canvas.height = W; }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgColor !== "transparent") {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (mode === "container") {
    drawContainerGauge(ctx, W, H, opts);
    return;
  }
  if (mode === "text") {
    drawImportedText(ctx, {
      text: opts.textContent,
      font: opts.textFont,
      fontSize: opts.textFontSize,
      bold: opts.textBold,
      italic: opts.textItalic,
      color: opts.textColor,
      align: opts.textAlign,
    }, canvas.width, canvas.height);
    return;
  }
  if (mode === "image") {
    return;
  }

  const track = trackColor;
  const pad = opts.labelPad;

  // ── helpers shared by both modes ─────────────────────────────────────────
  // When nSegs===0 onCount is a direct percentage (0-100)
  const isSolid = nSegs === 0;
  const pctOf = (oc: number, total: number) => isSolid ? oc : Math.round((oc / total) * 100);

  if (mode === "bar" && opts.barStyle === "thermometer") {
    // The thermometer is always upright — a rotated thermometer reads as
    // broken, unlike a rotated segmented/flat bar — so rotation is ignored
    // and it gets its own layout entirely instead of sharing the
    // horizontal flat/ascending/slanted geometry below.
    drawThermometerGauge(ctx, W, H, onCount, opts);
  } else if (mode === "bar") {
    // Rotate around the actual (possibly swapped-for-90°/270°) canvas
    // center, then shift by the logical W/H center so the unrotated layout
    // below still lands correctly inside the rotated canvas.
    if (opts.rotation !== 0) {
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(opts.rotation * Math.PI / 180);
      ctx.translate(-W / 2, -H / 2);
    }

    const bH = sw, oy = (H - bH) / 2;
    const pct = showLabel ? pctOf(onCount, nSegs) : 0;
    const fs = Math.max(10, Math.min(bH * 1.1, H * 0.13));

    // Measure label first so we can reserve space inside the canvas
    ctx.font = `500 ${fs}px sans-serif`;
    const lblW = showLabel ? ctx.measureText(pct + "%").width + pad * 2 : 0;

    const margin = W * 0.06;
    let ox = margin;
    let bW = W - margin * 2;
    if (showLabel && labelPos === "left")  { ox = margin + lblW; bW = W - margin - ox; }
    if (showLabel && labelPos === "right") { bW = W - margin - ox - lblW; }

    const barR = Math.min(4, bW * 0.015);

    if (isSolid) {
      // "Ascending" on a solid (continuous) bar: same growing-height look as
      // the segmented version, just smooth instead of blocky — a wedge/ramp
      // whose top edge rises left-to-right, sharing the flat style's bottom
      // edge (oy + bH) as baseline and its top-right corner (bH tall) as the
      // wedge's tallest point.
      const ascending = opts.barStyle === "ascending";
      const slanted = opts.barStyle === "slanted";
      const baselineY = oy + bH;
      const minHeightFrac = 0.15;
      const heightAtFrac = (t: number) => bH * (minHeightFrac + t * (1 - minHeightFrac));
      const solidSkew = bH * 0.35;
      // Fill clip always uses this *full-width* shape (matching the original
      // flat behavior) — fillRect below does the actual left-to-right
      // reveal, so clipping against the full sloped outline naturally
      // truncates it at the fill edge without needing a separate partial
      // wedge path.
      const fullShapePath = () => {
        if (ascending) {
          ctx.beginPath();
          ctx.moveTo(ox, baselineY);
          ctx.lineTo(ox + bW, baselineY);
          ctx.lineTo(ox + bW, baselineY - heightAtFrac(1));
          ctx.lineTo(ox, baselineY - heightAtFrac(0));
          ctx.closePath();
          return;
        }
        if (slanted) { slantPath(ctx, ox, oy, bW, bH, solidSkew); return; }
        roundRect(ctx, ox, oy, bW, bH, barR);
      };

      // Solid bar: track + clipped fill
      fullShapePath();
      ctx.fillStyle = track; ctx.fill();
      const fillW = (onCount / 100) * bW;
      if (fillW > 0) {
        ctx.save();
        fullShapePath(); ctx.clip();
        // Gradient spans the full bar so the color at a given x always
        // reflects that position's value — clipping to fillW just reveals
        // the leading slice of it, giving a smooth left-to-right blend.
        const triple = themeColorTriple(opts);
        if (triple) {
          const grad = ctx.createLinearGradient(ox, 0, ox + bW, 0);
          grad.addColorStop(0, triple[0]);
          grad.addColorStop(0.5, triple[1]);
          grad.addColorStop(1, triple[2]);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = opts.solidColor;
        }
        ctx.fillRect(ox, oy, fillW, bH);
        ctx.restore();
      }
      // Skipped for the wedge shape: apply3DBarShading clips to a plain
      // rounded rect internally, which would shade outside the wedge's
      // triangular silhouette (e.g. the empty corner above its short end).
      if (opts.gauge3D && !ascending) {
        apply3DBarShading(ctx, ox, oy, bW, bH, barR, opts.lightAngle,
          slanted ? () => slantPath(ctx, ox, oy, bW, bH, solidSkew) : undefined);
      }
    } else {
      const tg = Math.min(gap * (nSegs - 1), bW * 0.9), segW = (bW - tg) / nSegs;
      const segR = Math.min(4, segW / 3);
      // "Ascending" (staircase/equalizer look): each bar grows a little
      // taller than the last, sharing the flat style's bottom edge (oy + bH)
      // as a common baseline, with bH — normally the flat bar's fixed
      // thickness — acting as the tallest (rightmost) bar's height instead.
      const ascending = opts.barStyle === "ascending";
      const slanted = opts.barStyle === "slanted";
      const baselineY = oy + bH;
      const minHeightFrac = 0.15;
      for (let i = 0; i < nSegs; i++) {
        const segX = ox + i * (segW + gap);
        const segH = ascending
          ? Math.max(2, bH * (minHeightFrac + (i / Math.max(1, nSegs - 1)) * (1 - minHeightFrac)))
          : bH;
        const segY = ascending ? baselineY - segH : oy;
        const r = ascending ? Math.min(segR, segH / 3) : segR;
        const skew = segH * 0.35;
        ctx.fillStyle = i < onCount ? getSegFill(i, nSegs, opts) : track;
        if (slanted) slantPath(ctx, segX, segY, segW, segH, skew);
        else roundRect(ctx, segX, segY, segW, segH, r);
        ctx.fill();
        if (opts.gauge3D) {
          apply3DBarShading(ctx, segX, segY, segW, segH, r, opts.lightAngle,
            slanted ? () => slantPath(ctx, segX, segY, segW, segH, skew) : undefined);
        }
      }
    }

    if (showLabel) {
      ctx.fillStyle = isSolid
        ? getLabelColor(onCount, 100, opts)
        : getLabelColor(onCount, nSegs, opts);
      const barCX = ox + bW / 2;
      const barCY = oy + bH / 2;
      const label = pct + "%";
      if (labelPos === "top") {
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(label, barCX, oy - pad);
      } else if (labelPos === "bottom") {
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(label, barCX, oy + bH + pad);
      } else if (labelPos === "left") {
        ctx.textAlign = "right";
        fillTextVCenter(ctx, label, ox - pad, barCY);
      } else {
        ctx.textAlign = "left";
        fillTextVCenter(ctx, label, ox + bW + pad, barCY);
      }
    }

    if (opts.rotation !== 0) ctx.restore();
  } else {
    // ── circular gauge ──
    const { r, cx, cy, outerHalf } = computeGaugeLayout(W, H, opts, ctx);

    const half = (180 - arcSpan) / 2, sd = 180 + half, ed = 360 + 180 - half;
    const span = ed - sd;
    const rotRad = opts.rotation * Math.PI / 180;
    const sdRad = sd * Math.PI / 180 + rotRad;
    const edRad = ed * Math.PI / 180 + rotRad;
    const isNeedle = mode === "needle";
    const classic = isNeedle && opts.needleStyle === "classic";

    if (isNeedle) {
      // faceR is the radius just inside the ring/bezel — same quantity
      // either style treats as "where the ticks start counting inward from".
      const faceR = r - sw / 2;

      if (classic) {
        // Dark instrument face, then a thick chrome bezel reusing the same
        // glossy directional shading the outer zone ring gets elsewhere —
        // full-circle, so startRad/endRad just span 0..2π.
        ctx.beginPath(); ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
        const faceGrad = ctx.createRadialGradient(cx, cy, faceR * 0.15, cx, cy, faceR);
        faceGrad.addColorStop(0, "#2b2c30");
        faceGrad.addColorStop(1, "#08090a");
        ctx.fillStyle = faceGrad;
        ctx.fill();

        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#aeb2b8";
        ctx.lineWidth = sw;
        ctx.stroke();
        apply3DRingShading(ctx, cx, cy, r, sw, 0, Math.PI * 2, opts.lightAngle);
      } else {
        // The plain needle gauge's only ring is the static zone band (width = sw).
        drawZoneRing(ctx, cx, cy, r, sw, sdRad, span, opts.themeColors.zone);
      }

      // Inner tick marks, just inside the ring/bezel.
      const tickGap = 4;
      const tickOuterR = Math.max(10, faceR - tickGap);
      const tickWidth = Math.max(1.5, sw * 0.08);
      ctx.lineCap = "butt";

      if (classic) {
        // Major ticks every dialTickStep across [dialMin, dialMax], each
        // numbered, with 4 unlabeled minor ticks in between — like a real
        // speedometer face.
        const range = opts.dialMax - opts.dialMin;
        const step = Math.max(1, opts.dialTickStep);
        const majorCount = Math.max(2, Math.round(Math.abs(range) / step) + 1);
        const minorPerMajor = 5;
        const totalMinor = (majorCount - 1) * minorPerMajor;
        const majorLen = Math.max(4, Math.min(opts.tickLength, tickOuterR - 4));
        const minorLen = majorLen * 0.45;
        const labelFs = Math.max(7, Math.min(faceR * 0.09, H * 0.04));
        // Numbers sit at a fixed radius hugging the rim regardless of tick
        // length, so they stay confined to the outer band of the face and
        // never crowd the title/value box occupying the center.
        const labelR = faceR * 0.78;
        ctx.font = `500 ${labelFs}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (let i = 0; i <= totalMinor; i++) {
          const t = i / totalMinor;
          const ang = sdRad + t * (span * Math.PI / 180);
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          const isMajor = i % minorPerMajor === 0;
          const len = isMajor ? majorLen : minorLen;
          const inner = tickOuterR - len;
          ctx.beginPath();
          ctx.moveTo(cx + cosA * tickOuterR, cy + sinA * tickOuterR);
          ctx.lineTo(cx + cosA * inner, cy + sinA * inner);
          ctx.strokeStyle = isMajor ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)";
          ctx.lineWidth = isMajor ? tickWidth * 1.3 : tickWidth * 0.7;
          ctx.stroke();
          if (isMajor) {
            const tickValue = Math.round(opts.dialMin + t * range);
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(String(tickValue), cx + cosA * labelR, cy + sinA * labelR);
          }
        }
      } else {
        // 11 evenly-spaced, unlabeled hashmarks.
        const tickCount = 11;
        const tickLen = Math.max(2, Math.min(opts.tickLength, tickOuterR - 4));
        const tickInnerR = tickOuterR - tickLen;
        for (let i = 0; i < tickCount; i++) {
          const t = i / (tickCount - 1);
          const ang = sdRad + t * (span * Math.PI / 180);
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          ctx.beginPath();
          ctx.moveTo(cx + cosA * tickOuterR, cy + sinA * tickOuterR);
          ctx.lineTo(cx + cosA * tickInnerR, cy + sinA * tickInnerR);
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = tickWidth;
          ctx.stroke();
        }
      }

      // Needle. For the classic dial it's drawn *before* the face content
      // (title/unit/etc.) below, so that overlay paints over the needle's
      // base and pivot — the needle reads as emerging from behind the
      // instrument cluster, same as a real dashboard gauge. The plain style
      // has no such overlay, so its needle (and hub) stay on top, drawn last.
      const angle = sdRad + (onCount / 100) * (span * Math.PI / 180);
      const needleLen = Math.max(10, tickOuterR);
      const needleW = classic ? Math.max(2, faceR * 0.045) : Math.max(2, opts.needleCenterDia * 0.12);
      const drawNeedle = () => {
        ctx.lineCap = "round";
        ctx.strokeStyle = opts.needleColor;
        ctx.lineWidth = needleW;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * needleLen, cy + Math.sin(angle) * needleLen);
        ctx.stroke();
      };
      const drawHub = () => {
        const hubR = opts.needleCenterDia / 2;
        const borderW = Math.max(1.5, opts.needleCenterDia * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
        ctx.fillStyle = opts.needleCenterColor;
        ctx.fill();
        ctx.lineWidth = borderW;
        ctx.strokeStyle = opts.needleCenterBorderColor;
        ctx.stroke();
      };

      if (classic) {
        drawNeedle();
        drawClassicDialFace(ctx, cx, cy, faceR, opts);
      } else {
        drawNeedle();
        drawHub();
      }
    } else if (isSolid) {
      // Solid arc: track + fill — flat caps so the ends align exactly with
      // sdRad/edRad (and thus with the outer zone ring's flat-capped bands).
      ctx.lineCap = "butt";
      ctx.beginPath(); ctx.arc(cx, cy, r, sdRad, edRad);
      ctx.strokeStyle = track; ctx.lineWidth = sw; ctx.stroke();
      const fillPct = onCount / 100;
      if (fillPct > 0) {
        const spanRad = span * Math.PI / 180;
        const fillSweep = fillPct * spanRad;
        const triple = themeColorTriple(opts);
        if (triple) {
          // Draw the fill as many thin slices, each colored by its absolute
          // position along the full 0-100% range, for a smooth gradient
          // whose colors stay anchored to value rather than jumping at
          // fixed thresholds.
          const steps = Math.max(8, Math.min(180, Math.ceil(Math.abs(fillSweep) * r / 3)));
          for (let i = 0; i < steps; i++) {
            const f0 = (i / steps) * fillPct;
            const f1 = ((i + 1) / steps) * fillPct;
            const color = blend3((f0 + f1) / 2, triple);
            ctx.beginPath();
            ctx.arc(cx, cy, r, sdRad + f0 * spanRad, sdRad + f1 * spanRad);
            ctx.strokeStyle = color;
            if (opts.innerRingGlow) { ctx.shadowColor = color; ctx.shadowBlur = opts.innerRingGlowIntensity; }
            ctx.lineWidth = sw; ctx.stroke();
          }
        } else {
          const fillEnd = sdRad + fillSweep;
          ctx.beginPath(); ctx.arc(cx, cy, r, sdRad, fillEnd);
          ctx.strokeStyle = opts.solidColor;
          if (opts.innerRingGlow) { ctx.shadowColor = opts.solidColor; ctx.shadowBlur = opts.innerRingGlowIntensity; }
          ctx.lineWidth = sw; ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.lineCap = "round";
      // Clamp the total angle spent on gaps so segment width (ss) never goes
      // negative — a negative sweep flips ctx.arc's direction and makes the
      // last segment wrap most of the way around the circle, which visually
      // detaches the segments from the outer ring's start/end angles.
      const gdRaw = (gap / r) * (180 / Math.PI) * 2.5;
      const gd = nSegs > 1 ? Math.min(gdRaw, (span * 0.9) / (nSegs - 1)) : 0;
      const ss = (span - (nSegs - 1) * gd) / nSegs;
      for (let i = 0; i < nSegs; i++) {
        const s = (sd + i * (ss + gd)) * Math.PI / 180 + rotRad;
        const e = (sd + i * (ss + gd) + ss) * Math.PI / 180 + rotRad;
        const active = i < onCount;
        const color = active ? getSegFill(i, nSegs, opts) : track;
        ctx.beginPath(); ctx.arc(cx, cy, r, s, e);
        ctx.strokeStyle = color;
        if (active && opts.innerRingGlow) { ctx.shadowColor = color; ctx.shadowBlur = opts.innerRingGlowIntensity; } else { ctx.shadowBlur = 0; }
        ctx.lineWidth = sw; ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    if (!isNeedle && opts.gauge3D) apply3DRingShading(ctx, cx, cy, r, sw, sdRad, edRad, opts.lightAngle);

    // Static outer zone ring — always shows theme zone colors banded at the
    // 60% / 80% thresholds, regardless of the current value.
    if (!isNeedle && opts.outerRing) {
      const ringR = r + sw / 2 + opts.outerRingGap + opts.outerRingWidth / 2;
      drawZoneRing(ctx, cx, cy, ringR, opts.outerRingWidth, sdRad, span, opts.themeColors.zone,
        opts.outerRingGlow ? opts.outerRingGlowIntensity : 0);
      if (opts.outerRing3D) apply3DRingShading(ctx, cx, cy, ringR, opts.outerRingWidth, sdRad, edRad, opts.lightAngle);
    }

    if (showLabel && !classic) {
      const pct = pctOf(onCount, nSegs);
      ctx.fillStyle = isNeedle
        ? getZoneColor(onCount / 100, opts.themeColors)
        : isSolid
        ? getLabelColor(onCount, 100, opts)
        : getLabelColor(onCount, nSegs, opts);
      const fs = Math.max(10, Math.min(r * 0.38, H * 0.13));
      ctx.font = `500 ${fs}px sans-serif`;
      const outerEdge = r + outerHalf + pad;
      const label = pct + "%";
      if (labelPos === "middle") {
        ctx.textAlign = "center";
        fillTextVCenter(ctx, label, cx, cy);
      } else if (labelPos === "top") {
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(label, cx, cy - outerEdge);
      } else if (labelPos === "bottom") {
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(label, cx, cy + outerEdge);
      } else if (labelPos === "left") {
        ctx.textAlign = "right";
        fillTextVCenter(ctx, label, cx - outerEdge, cy);
      } else {
        ctx.textAlign = "left";
        fillTextVCenter(ctx, label, cx + outerEdge, cy);
      }
    }
  }
}

// Converts a 0-100 slider value into the onCount unit drawOn expects
// (segment count for segmented gauges, direct percentage for solid ones).
export function previewValueToOnCount(previewPct: number, nSegs: number): number {
  return nSegs === 0 ? previewPct : Math.round((previewPct / 100) * nSegs);
}
