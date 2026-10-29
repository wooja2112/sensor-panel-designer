// Ported from PanelBackgroundBuilder's src/App.jsx. Pure canvas drawing
// functions — no React dependency — so the same code path renders both the
// live preview and the full-resolution export.
import { getCachedImage } from './imageCache';

export type BackgroundShape = 'none' | 'circle' | 'polygon';

// 'cover' scales (preserving aspect ratio) to fill the panel, cropping
// whatever overflows. 'actual' draws at native pixel size, centered — an
// oversized image is cropped for free since drawImage never paints outside
// the canvas's own bounds.
export type BackgroundImageFit = 'cover' | 'actual';

export type PatternKey =
  | 'none'
  | 'honeycomb'
  | 'diamonds'
  | 'squares'
  | 'triangles'
  | 'circuit'
  | 'offset'
  | 'runningBond'
  | 'thirdOffset'
  | 'stacked'
  | 'stackedVertical'
  | 'crosshatch'
  | 'herringbone'
  | 'diagonalHerringbone'
  | 'straightHerringbone'
  | 'chevron'
  | 'pinwheel'
  | 'basketWeave'
  | 'versailles'
  | 'corridor';

export interface BackgroundOptions {
  color: string;
  transparentBackground: boolean;
  backgroundGradientEnabled: boolean;
  colorEnd: string;
  backgroundGradientAngle: number;
  image: string | null;
  imageFit: BackgroundImageFit;
  // Brightness is a percentage (100 = unchanged), like CSS's brightness().
  imageGrayscale: boolean;
  imageBrightness: number;
  pattern: PatternKey;
  patternColor: string;
  density: number;
  patternLineWidth: number;
  shape: BackgroundShape;
  diameter: number;
  sides: number;
  cornerRadius: number;
  borderThickness: number;
  borderColor: string;
  borderGradientEnabled: boolean;
  borderColorEnd: string;
  borderGradientAngle: number;
  showTitleBar: boolean;
  titleBarHeight: number;
  titleBarColor: string;
}

export const MIN_SIZE = 10;
export const MAX_SIZE = 50;
export const MIN_DENSITY = 1;
export const MAX_DENSITY = 10;
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 8;

export const MIN_DIAMETER = 10;
export const MAX_DIAMETER = 100;
export const SIDE_OPTIONS = [3, 4, 6, 8, 10];

export const MIN_BORDER = 0;
export const MAX_BORDER = 100;

export const MIN_GRADIENT_ANGLE = 0;
export const MAX_GRADIENT_ANGLE = 359;

export const MIN_IMAGE_BRIGHTNESS = 0;
export const MAX_IMAGE_BRIGHTNESS = 200;

export const MIN_TITLE_BAR_HEIGHT = 10;
export const MAX_TITLE_BAR_HEIGHT = 150;

export const MIN_CORNER_RADIUS = 0;
export const MAX_CORNER_RADIUS = 100;

export function defaultBackgroundOptions(): BackgroundOptions {
  return {
    color: '#000000',
    transparentBackground: false,
    backgroundGradientEnabled: false,
    colorEnd: '#ffffff',
    backgroundGradientAngle: 0,
    image: null,
    imageFit: 'cover',
    imageGrayscale: false,
    imageBrightness: 100,
    pattern: 'none',
    patternColor: '#ffffff',
    density: 5,
    patternLineWidth: 2,
    shape: 'none',
    diameter: 80,
    sides: 6,
    cornerRadius: 0,
    borderThickness: 0,
    borderColor: '#ffffff',
    borderGradientEnabled: false,
    borderColorEnd: '#000000',
    borderGradientAngle: 0,
    showTitleBar: false,
    titleBarHeight: 40,
    titleBarColor: '#1a1a1a',
  };
}

export function densityToSize(density: number): number {
  const t = (density - MIN_DENSITY) / (MAX_DENSITY - MIN_DENSITY);
  return MAX_SIZE - t * (MAX_SIZE - MIN_SIZE);
}

type PatternDrawFn = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  patternColor: string,
  size: number,
) => void;

function drawHoneycomb(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const r = size;
  const hexWidth = 2 * r;
  const hexHeight = Math.sqrt(3) * r;
  const colSpacing = hexWidth * 0.75;
  const rowSpacing = hexHeight;

  ctx.strokeStyle = patternColor;

  let col = 0;
  for (let x = 0; x < canvasWidth + hexWidth; x += colSpacing) {
    const yOffset = col % 2 === 0 ? 0 : rowSpacing / 2;
    for (let y = -hexHeight; y < canvasHeight + hexHeight; y += rowSpacing) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i);
        const px = x + r * Math.cos(angle);
        const py = y + yOffset + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    col++;
  }
}

function drawDiamonds(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const halfDiagonal = size / 2;
  const rowSpacing = halfDiagonal;
  const colSpacing = size;

  ctx.strokeStyle = patternColor;

  let row = 0;
  for (let y = -halfDiagonal; y < canvasHeight + halfDiagonal; y += rowSpacing) {
    const xOffset = row % 2 === 0 ? 0 : colSpacing / 2;
    for (let x = -size + xOffset; x < canvasWidth + size; x += colSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, y - halfDiagonal);
      ctx.lineTo(x + halfDiagonal, y);
      ctx.lineTo(x, y + halfDiagonal);
      ctx.lineTo(x - halfDiagonal, y);
      ctx.closePath();
      ctx.stroke();
    }
    row++;
  }
}

function drawSquares(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  ctx.strokeStyle = patternColor;

  for (let y = 0; y < canvasHeight; y += size) {
    for (let x = 0; x < canvasWidth; x += size) {
      ctx.strokeRect(x, y, size, size);
    }
  }
}

function drawTriangles(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const rowHeight = (size * Math.sqrt(3)) / 2;

  ctx.strokeStyle = patternColor;

  let row = 0;
  for (let y0 = -rowHeight; y0 < canvasHeight + rowHeight; y0 += rowHeight) {
    const y1 = y0 + rowHeight;
    let col = 0;
    for (let x0 = -size; x0 < canvasWidth + size; x0 += size / 2) {
      ctx.beginPath();
      if ((row + col) % 2 === 0) {
        ctx.moveTo(x0, y1);
        ctx.lineTo(x0 + size, y1);
        ctx.lineTo(x0 + size / 2, y0);
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + size, y0);
        ctx.lineTo(x0 + size / 2, y1);
      }
      ctx.closePath();
      ctx.stroke();
      col++;
    }
    row++;
  }
}

function hash2D(x: number, y: number, salt: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function drawCircuit(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const cell = size;
  const cols = Math.ceil(canvasWidth / cell) + 2;
  const rows = Math.ceil(canvasHeight / cell) + 2;
  const chamfer = cell * 0.28;
  const edgeChance = 0.55;

  const hasHEdge = (col: number, row: number) => hash2D(col, row, 1) < edgeChance;
  const hasVEdge = (col: number, row: number) => hash2D(col, row, 2) < edgeChance;

  function nodeDirs(col: number, row: number): string[] {
    const dirs: string[] = [];
    if (hasHEdge(col, row)) dirs.push('E');
    if (hasHEdge(col - 1, row)) dirs.push('W');
    if (hasVEdge(col, row)) dirs.push('S');
    if (hasVEdge(col, row - 1)) dirs.push('N');
    return dirs;
  }

  function bendDirs(col: number, row: number): string[] | null {
    const dirs = nodeDirs(col, row);
    if (dirs.length !== 2) return null;
    const [a, b] = dirs;
    const opposite =
      (a === 'E' && b === 'W') || (a === 'W' && b === 'E') ||
      (a === 'N' && b === 'S') || (a === 'S' && b === 'N');
    return opposite ? null : dirs;
  }

  function insetPoint(col: number, row: number, dir: string, amount: number): [number, number] {
    const x = col * cell;
    const y = row * cell;
    if (dir === 'E') return [x + amount, y];
    if (dir === 'W') return [x - amount, y];
    if (dir === 'N') return [x, y - amount];
    return [x, y + amount];
  }

  ctx.strokeStyle = patternColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let row = -1; row <= rows; row++) {
    for (let col = -1; col <= cols; col++) {
      if (hasHEdge(col, row)) {
        let x0 = col * cell;
        const y0 = row * cell;
        let x1 = (col + 1) * cell;
        if (bendDirs(col, row)) x0 += chamfer;
        if (bendDirs(col + 1, row)) x1 -= chamfer;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.stroke();
      }
      if (hasVEdge(col, row)) {
        const x0 = col * cell;
        let y0 = row * cell;
        let y1 = (row + 1) * cell;
        if (bendDirs(col, row)) y0 += chamfer;
        if (bendDirs(col, row + 1)) y1 -= chamfer;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
        ctx.stroke();
      }
    }
  }

  for (let row = -1; row <= rows; row++) {
    for (let col = -1; col <= cols; col++) {
      const dirs = nodeDirs(col, row);
      const degree = dirs.length;
      if (degree === 0) continue;

      const bend = degree === 2 ? bendDirs(col, row) : null;
      if (bend) {
        const [p0x, p0y] = insetPoint(col, row, bend[0], chamfer);
        const [p1x, p1y] = insetPoint(col, row, bend[1], chamfer);
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.lineTo(p1x, p1y);
        ctx.stroke();
        continue;
      }

      if (degree === 1 || degree >= 3) {
        const r = degree >= 3 ? cell * 0.11 : cell * 0.08;
        ctx.beginPath();
        ctx.arc(col * cell, row * cell, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawBrickGrid(
  ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string,
  tileLength: number, tileWidth: number, offsetFraction: number, vertical: boolean,
) {
  ctx.strokeStyle = patternColor;

  if (!vertical) {
    let row = 0;
    for (let y = 0; y < canvasHeight; y += tileWidth) {
      const xOffset = (((row * offsetFraction * tileLength) % tileLength) + tileLength) % tileLength;
      for (let x = -tileLength + xOffset; x < canvasWidth; x += tileLength) {
        ctx.strokeRect(x, y, tileLength, tileWidth);
      }
      row++;
    }
  } else {
    let col = 0;
    for (let x = 0; x < canvasWidth; x += tileWidth) {
      const yOffset = (((col * offsetFraction * tileLength) % tileLength) + tileLength) % tileLength;
      for (let y = -tileLength + yOffset; y < canvasHeight; y += tileLength) {
        ctx.strokeRect(x, y, tileWidth, tileLength);
      }
      col++;
    }
  }
}

const drawOffset: PatternDrawFn = (ctx, w, h, color, size) => drawBrickGrid(ctx, w, h, color, size * 2, size, 0.5, false);
const drawRunningBond: PatternDrawFn = (ctx, w, h, color, size) => drawBrickGrid(ctx, w, h, color, size * 2, size, 0.5, true);
const drawThirdOffset: PatternDrawFn = (ctx, w, h, color, size) => drawBrickGrid(ctx, w, h, color, size * 2, size, 1 / 3, true);
const drawStacked: PatternDrawFn = (ctx, w, h, color, size) => drawBrickGrid(ctx, w, h, color, size * 2, size, 0, false);
const drawStackedVertical: PatternDrawFn = (ctx, w, h, color, size) => drawBrickGrid(ctx, w, h, color, size * 2, size, 0, true);

function drawWeave(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, unit: number, blockCount: number) {
  ctx.strokeStyle = patternColor;
  const moduleSize = unit * blockCount;

  let moduleRow = 0;
  for (let my = -moduleSize; my < canvasHeight + moduleSize; my += moduleSize) {
    let moduleCol = 0;
    for (let mx = -moduleSize; mx < canvasWidth + moduleSize; mx += moduleSize) {
      const horizontal = (moduleRow + moduleCol) % 2 === 0;
      for (let i = 0; i < blockCount; i++) {
        if (horizontal) {
          ctx.strokeRect(mx, my + i * unit, moduleSize, unit);
        } else {
          ctx.strokeRect(mx + i * unit, my, unit, moduleSize);
        }
      }
      moduleCol++;
    }
    moduleRow++;
  }
}

const drawBasketWeave: PatternDrawFn = (ctx, w, h, color, size) => drawWeave(ctx, w, h, color, size * 0.7, 2);
const drawCrosshatch: PatternDrawFn = (ctx, w, h, color, size) => drawWeave(ctx, w, h, color, size * 0.5, 3);

function drawHerringboneCore(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, unit: number, padding: number) {
  const cellW = unit * 2;
  const cellH = unit * 4;
  ctx.strokeStyle = patternColor;

  const span = canvasWidth + canvasHeight + padding * 2;

  let col = 0;
  for (let x = -span; x < span; x += cellW) {
    const yOffset = (col % 2 === 0) ? 0 : cellH / 2;
    for (let y = -span + yOffset; y < span; y += cellH) {
      if (x > canvasWidth + padding || x + cellW < -padding || y > canvasHeight + padding || y + cellH < -padding) continue;
      ctx.strokeRect(x, y, cellW, unit);
      ctx.strokeRect(x, y + unit, unit, cellH - 2 * unit);
      ctx.strokeRect(x + unit, y + unit, unit, cellH - 2 * unit);
      ctx.strokeRect(x, y + cellH - unit, cellW, unit);
    }
    col++;
  }
}

function drawRotatedHerringbone(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, unit: number, angleDeg: number, flip: boolean) {
  const diag = Math.hypot(canvasWidth, canvasHeight);
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  drawHerringboneCore(ctx, canvasWidth, canvasHeight, patternColor, unit, diag);
  ctx.restore();
}

const drawHerringbone: PatternDrawFn = (ctx, w, h, color, size) => drawRotatedHerringbone(ctx, w, h, color, size * 0.7, 45, false);
const drawDiagonalHerringbone: PatternDrawFn = (ctx, w, h, color, size) => drawRotatedHerringbone(ctx, w, h, color, size * 0.7, 45, true);
const drawStraightHerringbone: PatternDrawFn = (ctx, w, h, color, size) => drawRotatedHerringbone(ctx, w, h, color, size * 0.7, 0, false);

function drawChevron(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const unit = size * 0.8;
  const L = unit * 2;
  const period = unit * 2;
  const shearAt = (y: number) => {
    const t = ((y % period) + period) % period;
    return t <= unit ? t : period - t;
  };

  ctx.strokeStyle = patternColor;

  const rows = Math.ceil(canvasHeight / unit) + 2;
  for (let r = -1; r < rows; r++) {
    const y0 = r * unit;
    const y1 = y0 + unit;
    const s0 = shearAt(y0);
    const s1 = shearAt(y1);
    for (let x0 = -L * 2; x0 < canvasWidth + L * 2; x0 += L) {
      ctx.beginPath();
      ctx.moveTo(x0 + s0, y0);
      ctx.lineTo(x0 + L + s0, y0);
      ctx.lineTo(x0 + L + s1, y1);
      ctx.lineTo(x0 + s1, y1);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function drawPinwheel(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const unit = size * 0.7;
  const block = unit * 3;

  ctx.strokeStyle = patternColor;

  const rects: [number, number, number, number][] = [
    [0, 0, unit * 2, unit * 2],
    [unit * 2, 0, unit, unit],
    [unit * 2, unit, unit, unit],
    [unit * 2, unit * 2, unit, unit],
    [0, unit * 2, unit, unit],
    [unit, unit * 2, unit, unit],
  ];

  const cols = Math.ceil(canvasWidth / block) + 2;
  const rows = Math.ceil(canvasHeight / block) + 2;

  for (let brow = -1; brow < rows; brow++) {
    for (let bcol = -1; bcol < cols; bcol++) {
      const bx = bcol * block;
      const by = brow * block;
      const rotIdx = (((bcol - brow) % 4) + 4) % 4;
      ctx.save();
      ctx.translate(bx + block / 2, by + block / 2);
      ctx.rotate((rotIdx * Math.PI) / 2);
      ctx.translate(-block / 2, -block / 2);
      for (const [rx, ry, rw, rh] of rects) {
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }
  }
}

function drawVersailles(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const unit = size * 0.6;
  const M = unit * 4;

  ctx.strokeStyle = patternColor;

  const cols = Math.ceil(canvasWidth / M) + 2;
  const rows = Math.ceil(canvasHeight / M) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * M;
      const y = row * M;

      ctx.strokeRect(x, y, M, M);
      ctx.strokeRect(x + unit, y + unit, M - unit * 2, M - unit * 2);

      const cs = unit * 0.8;
      ctx.strokeRect(x, y, cs, cs);
      ctx.strokeRect(x + M - cs, y, cs, cs);
      ctx.strokeRect(x, y + M - cs, cs, cs);
      ctx.strokeRect(x + M - cs, y + M - cs, cs, cs);

      const cx = x + M / 2;
      const cy = y + M / 2;
      const r = unit * 1.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function drawCorridor(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, patternColor: string, size: number) {
  const colWidth = size * 0.8;
  const segHeight = size * 1.6;

  ctx.strokeStyle = patternColor;

  let col = 0;
  for (let x = 0; x < canvasWidth; x += colWidth) {
    ctx.strokeRect(x, 0, colWidth, canvasHeight);
    if (col % 2 === 1) {
      const yOffset = (((Math.floor(col / 2) * (segHeight / 2)) % segHeight) + segHeight) % segHeight;
      for (let y = -segHeight + yOffset; y < canvasHeight; y += segHeight) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + colWidth, y);
        ctx.stroke();
      }
    }
    col++;
  }
}

const PATTERN_DRAW_FUNCTIONS: Record<Exclude<PatternKey, 'none'>, PatternDrawFn> = {
  honeycomb: drawHoneycomb,
  diamonds: drawDiamonds,
  squares: drawSquares,
  triangles: drawTriangles,
  circuit: drawCircuit,
  offset: drawOffset,
  runningBond: drawRunningBond,
  thirdOffset: drawThirdOffset,
  stacked: drawStacked,
  stackedVertical: drawStackedVertical,
  crosshatch: drawCrosshatch,
  herringbone: drawHerringbone,
  diagonalHerringbone: drawDiagonalHerringbone,
  straightHerringbone: drawStraightHerringbone,
  chevron: drawChevron,
  pinwheel: drawPinwheel,
  basketWeave: drawBasketWeave,
  versailles: drawVersailles,
  corridor: drawCorridor,
};

function traceShapePath(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, shape: BackgroundShape, diameter: number, sides: number) {
  const radius = (Math.min(canvasWidth, canvasHeight) * diameter) / 200;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else if (shape === 'polygon') {
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function traceRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Shared direction/endpoint math for gradients, rotated so 0deg points
// straight up and angles increase clockwise.
function gradientDirection(angleDeg: number): [number, number] {
  const theta = (angleDeg * Math.PI) / 180;
  return [Math.sin(theta), -Math.cos(theta)];
}

function gradientEndpointsFromReach(canvasWidth: number, canvasHeight: number, dirX: number, dirY: number, reach: number): [number, number, number, number] {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  return [cx + dirX * reach, cy + dirY * reach, cx - dirX * reach, cy - dirY * reach];
}

// Endpoints placed exactly on the circle's edge, so the start/end colors
// land on visible pixels rather than somewhere in the bounding box.
function getCircleGradientEndpoints(canvasWidth: number, canvasHeight: number, diameter: number, angleDeg: number) {
  const [dirX, dirY] = gradientDirection(angleDeg);
  const reach = (Math.min(canvasWidth, canvasHeight) * diameter) / 200;
  return gradientEndpointsFromReach(canvasWidth, canvasHeight, dirX, dirY, reach);
}

// Endpoints placed exactly on the (optionally inset) rectangle's edge via a
// ray/box intersection, so axis-aligned angles reach pure colors edge-to-edge.
function getRectGradientEndpoints(canvasWidth: number, canvasHeight: number, angleDeg: number, insetX = 0, insetY = 0) {
  const [dirX, dirY] = gradientDirection(angleDeg);
  const halfWidth = canvasWidth / 2 - insetX;
  const halfHeight = canvasHeight / 2 - insetY;
  const reachX = dirX !== 0 ? halfWidth / Math.abs(dirX) : Infinity;
  const reachY = dirY !== 0 ? halfHeight / Math.abs(dirY) : Infinity;
  const reach = Math.min(reachX, reachY);
  return gradientEndpointsFromReach(canvasWidth, canvasHeight, dirX, dirY, reach);
}

function getBorderGradientEndpoints(canvasWidth: number, canvasHeight: number, shape: BackgroundShape, diameter: number, borderThickness: number, angleDeg: number) {
  if (shape === 'circle' || shape === 'polygon') {
    return getCircleGradientEndpoints(canvasWidth, canvasHeight, diameter, angleDeg);
  }
  const inset = borderThickness / 2;
  return getRectGradientEndpoints(canvasWidth, canvasHeight, angleDeg, inset, inset);
}

function drawBorder(
  ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, shape: BackgroundShape,
  diameter: number, sides: number, cornerRadius: number, borderThickness: number, borderColor: string,
  borderGradientEnabled: boolean, borderColorEnd: string, borderGradientAngle: number,
) {
  if (borderThickness <= 0) return;

  ctx.save();

  const inset = borderThickness / 2;
  if (shape === 'circle' || shape === 'polygon') {
    traceShapePath(ctx, canvasWidth, canvasHeight, shape, diameter, sides);
  } else if (cornerRadius > 0) {
    traceRoundedRectPath(ctx, inset, inset, canvasWidth - borderThickness, canvasHeight - borderThickness, cornerRadius - inset);
  } else {
    ctx.beginPath();
    ctx.rect(inset, inset, canvasWidth - borderThickness, canvasHeight - borderThickness);
  }

  if (borderGradientEnabled) {
    const gradientBounds = getBorderGradientEndpoints(canvasWidth, canvasHeight, shape, diameter, borderThickness, borderGradientAngle);
    const gradient = ctx.createLinearGradient(...gradientBounds);
    gradient.addColorStop(0, borderColor);
    gradient.addColorStop(1, borderColorEnd);
    ctx.strokeStyle = gradient;
  } else {
    ctx.strokeStyle = borderColor;
  }
  ctx.lineWidth = borderThickness;

  ctx.stroke();
  ctx.restore();
}

// Grayscale (Rec. 709 luma, as CSS grayscale()) and brightness applied to
// RGBA pixels in place. Both are linear in the channels; brightness clamps at
// full intensity.
export function adjustImagePixels(data: Uint8ClampedArray, grayscale: boolean, brightness: number) {
  const k = Math.min(MAX_IMAGE_BRIGHTNESS, Math.max(MIN_IMAGE_BRIGHTNESS, brightness)) / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (grayscale) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = y; g = y; b = y;
    }
    data[i] = Math.round(r * k);
    data[i + 1] = Math.round(g * k);
    data[i + 2] = Math.round(b * k);
  }
}

// The adjusted copy of the most recent background image, so redraws while
// dragging gauges don't redo the per-pixel pass.
let adjustedCache: { img: HTMLImageElement; grayscale: boolean; brightness: number; canvas: HTMLCanvasElement } | null = null;

function adjustedImage(img: HTMLImageElement, grayscale: boolean, brightness: number): CanvasImageSource {
  if (!grayscale && brightness === 100) return img;
  const hit = adjustedCache;
  if (hit && hit.img === img && hit.grayscale === grayscale && hit.brightness === brightness) return hit.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  adjustImagePixels(pixels.data, grayscale, brightness);
  ctx.putImageData(pixels, 0, 0);
  adjustedCache = { img, grayscale, brightness, canvas };
  return canvas;
}

function drawBackgroundImage(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, image: string, options: BackgroundOptions) {
  const decoded = getCachedImage(image);
  if (!decoded || decoded.width === 0 || decoded.height === 0) return; // not decoded yet — caller re-renders once it is
  const img = adjustedImage(decoded, options.imageGrayscale, options.imageBrightness);
  const fit = options.imageFit;

  // Anchored at the top-left corner (0,0) rather than centered — an
  // oversized image (in 'actual' fit, or a 'cover' fit whose aspect ratio
  // doesn't match the panel) is cropped off its right/bottom edges instead
  // of symmetrically off all sides.
  if (fit === 'cover') {
    const scale = Math.max(canvasWidth / decoded.width, canvasHeight / decoded.height);
    ctx.drawImage(img, 0, 0, decoded.width * scale, decoded.height * scale);
  } else {
    ctx.drawImage(img, 0, 0);
  }
}

function drawTitleBar(ctx: CanvasRenderingContext2D, canvasWidth: number, titleBarHeight: number, titleBarColor: string) {
  ctx.fillStyle = titleBarColor;
  ctx.fillRect(0, 0, canvasWidth, titleBarHeight);
}

export function renderBackground(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, options: BackgroundOptions) {
  const {
    color,
    transparentBackground,
    backgroundGradientEnabled,
    colorEnd,
    backgroundGradientAngle,
    image,
    pattern,
    patternColor,
    density,
    patternLineWidth,
    shape,
    diameter,
    sides,
    cornerRadius,
    borderThickness,
    borderColor,
    borderGradientEnabled,
    borderColorEnd,
    borderGradientAngle,
    showTitleBar,
    titleBarHeight,
    titleBarColor,
  } = options;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  if (shape === 'circle' || shape === 'polygon') {
    traceShapePath(ctx, canvasWidth, canvasHeight, shape, diameter, sides);
    ctx.clip();
  } else if (shape === 'none' && cornerRadius > 0) {
    traceRoundedRectPath(ctx, 0, 0, canvasWidth, canvasHeight, cornerRadius);
    ctx.clip();
  }

  if (!transparentBackground) {
    if (backgroundGradientEnabled) {
      const gradientBounds = getRectGradientEndpoints(canvasWidth, canvasHeight, backgroundGradientAngle);
      const gradient = ctx.createLinearGradient(...gradientBounds);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, colorEnd);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = color;
    }
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (image) {
    drawBackgroundImage(ctx, canvasWidth, canvasHeight, image, options);
  }

  const drawPattern = pattern !== 'none' ? PATTERN_DRAW_FUNCTIONS[pattern] : undefined;
  if (drawPattern) {
    ctx.lineWidth = patternLineWidth;
    drawPattern(ctx, canvasWidth, canvasHeight, patternColor, densityToSize(density));
  }

  // Title bars only make sense on plain rectangular (non-shaped) images.
  if (shape === 'none' && showTitleBar && titleBarHeight > 0) {
    drawTitleBar(ctx, canvasWidth, titleBarHeight, titleBarColor);
  }
  ctx.restore();

  // Drawn after restore (outside the clip) so the border isn't cut off
  // where it straddles the shape's edge.
  drawBorder(ctx, canvasWidth, canvasHeight, shape, diameter, sides, cornerRadius, borderThickness, borderColor, borderGradientEnabled, borderColorEnd, borderGradientAngle);
}
