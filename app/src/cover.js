// Vice Panel Studio — the cover renderer.
//
// Everything the poster is made of lives here: the panel layouts, the colour
// grades (real per-pixel work on an offscreen canvas), the lettering and the
// invented badge. drawCover() paints a complete cover onto any canvas at the
// canvas's own size, so the editor preview and the full-size PNG export share
// exactly one code path.

// ---------------------------------------------------------------- layouts
// A layout is a list of panel rectangles in fractions of the cover size,
// in reading order; the editor keeps one photo slot per rectangle.

function grid(cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({ x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows });
    }
  }
  return cells;
}

export const LAYOUTS = [
  {
    id: 'grid9',
    name: 'Nine Panel Grid',
    cells: () => grid(3, 3),
  },
  {
    id: 'hero3',
    name: 'Hero + Three',
    cells: () => [
      { x: 0, y: 0, w: 0.58, h: 1 },
      { x: 0.58, y: 0, w: 0.42, h: 1 / 3 },
      { x: 0.58, y: 1 / 3, w: 0.42, h: 1 / 3 },
      { x: 0.58, y: 2 / 3, w: 0.42, h: 1 / 3 },
    ],
  },
  {
    id: 'grid4',
    name: 'Four Panel 2×2',
    cells: () => grid(2, 2),
  },
  {
    id: 'grid6',
    name: 'Six Panel 2×3',
    cells: () => grid(2, 3),
  },
  {
    id: 'heroStrip',
    name: 'Hero + Bottom Strip',
    cells: () => [
      { x: 0, y: 0, w: 1, h: 0.72 },
      { x: 0, y: 0.72, w: 1 / 3, h: 0.28 },
      { x: 1 / 3, y: 0.72, w: 1 / 3, h: 0.28 },
      { x: 2 / 3, y: 0.72, w: 1 / 3, h: 0.28 },
    ],
  },
];

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

// ----------------------------------------------------------------- grades
// A grade is a gradient map (shadow colour -> mid colour -> highlight
// colour) blended over the photo, followed by saturation / contrast /
// brightness adjustments. The map is baked into a 256-entry lookup table
// once, then applied to the panel's pixels.

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const GRADES = [
  {
    id: 'sunset',
    name: 'Sunset Gradient Map',
    stops: [[0, '#24103f'], [0.42, '#8f2d63'], [0.68, '#e85d2a'], [0.88, '#ffb84d'], [1, '#fff3cf']],
    blend: 0.78, saturation: 1.18, contrast: 1.07, brightness: 1.0,
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    stops: [[0, '#041e2e'], [0.38, '#0b5e73'], [0.66, '#7a2d8f'], [0.86, '#ff4f9a'], [1, '#ffe3f2']],
    blend: 0.72, saturation: 1.3, contrast: 1.1, brightness: 1.02,
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    stops: [[0, '#2a1806'], [0.45, '#8a5410'], [0.75, '#e09a2e'], [1, '#ffe9b8']],
    blend: 0.62, saturation: 1.12, contrast: 1.04, brightness: 1.06,
  },
  {
    id: 'pastel',
    name: 'Vice Pastel',
    stops: [[0, '#463a6e'], [0.4, '#5f8fa8'], [0.7, '#e8a0b4'], [1, '#fff0e0']],
    blend: 0.55, saturation: 0.92, contrast: 0.98, brightness: 1.08,
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

const lutCache = new Map();

function gradeLut(grade) {
  if (lutCache.has(grade.id)) return lutCache.get(grade.id);
  const stops = grade.stops.map(([t, hex]) => [t, hexRgb(hex)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    for (let ch = 0; ch < 3; ch += 1) {
      lut[i * 3 + ch] = a[1][ch] + (b[1][ch] - a[1][ch]) * f;
    }
  }
  lutCache.set(grade.id, lut);
  return lut;
}

/** Applies a grade to an ImageData in place. */
function applyGrade(imageData, grade) {
  const lut = gradeLut(grade);
  const d = imageData.data;
  const { blend, saturation, contrast, brightness } = grade;
  const keep = 1 - blend;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const li = lum * 3;
    let nr = r * keep + lut[li] * blend;
    let ng = g * keep + lut[li + 1] * blend;
    let nb = b * keep + lut[li + 2] * blend;
    const grey = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    nr = grey + (nr - grey) * saturation;
    ng = grey + (ng - grey) * saturation;
    nb = grey + (nb - grey) * saturation;
    d[i] = (nr - 128) * contrast + 128 * brightness;
    d[i + 1] = (ng - 128) * contrast + 128 * brightness;
    d[i + 2] = (nb - 128) * contrast + 128 * brightness;
  }
  return imageData;
}

// ------------------------------------------------------------- film grain
// One fixed noise tile, generated from a seeded generator so every render
// of the same cover comes out identical.

let grainTile = null;

function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 256;
  grainTile = document.createElement('canvas');
  grainTile.width = size;
  grainTile.height = size;
  const ctx = grainTile.getContext('2d');
  const img = ctx.createImageData(size, size);
  let seed = 987654321;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(next() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return grainTile;
}

// ---------------------------------------------------------------- drawing

const scratch = document.createElement('canvas');

/**
 * Paints one panel: the assigned photo cover-fit with its zoom and pan,
 * graded, with an inner shadow. Empty slots get a dark placeholder.
 */
function drawPanel(ctx, rect, slot, grade) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const photo = slot?.photo ?? null;
  if (photo) {
    const zoom = slot.zoom ?? 1;
    const scale = Math.max(w / photo.naturalWidth, h / photo.naturalHeight) * zoom;
    const pw = photo.naturalWidth * scale;
    const ph = photo.naturalHeight * scale;
    const maxPanX = Math.max(0, (pw - w) / 2);
    const maxPanY = Math.max(0, (ph - h) / 2);
    const dx = x + (w - pw) / 2 + (slot.panX ?? 0) * maxPanX;
    const dy = y + (h - ph) / 2 + (slot.panY ?? 0) * maxPanY;
    scratch.width = Math.max(2, Math.round(w));
    scratch.height = Math.max(2, Math.round(h));
    const sctx = scratch.getContext('2d');
    sctx.drawImage(photo, dx - x, dy - y, pw, ph);
    const pixels = sctx.getImageData(0, 0, scratch.width, scratch.height);
    sctx.putImageData(applyGrade(pixels, grade), 0, 0);
    ctx.drawImage(scratch, x, y);
  } else {
    const fill = ctx.createLinearGradient(x, y, x + w, y + h);
    fill.addColorStop(0, '#31204d');
    fill.addColorStop(1, '#170d2b');
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = `600 ${Math.max(13, Math.min(w, h) * 0.09)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD PHOTO', x + w / 2, y + h / 2);
  }
  // Inner shadow: soft dark gradients hugging the top and left edges.
  const depth = Math.max(10, Math.min(w, h) * 0.16);
  const topShade = ctx.createLinearGradient(0, y, 0, y + depth);
  topShade.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
  topShade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(x, y, w, depth);
  const leftShade = ctx.createLinearGradient(x, 0, x + depth, 0);
  leftShade.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
  leftShade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftShade;
  ctx.fillRect(x, y, depth, h);
  ctx.restore();
  // White keyline between panels.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.012 + 2);
  ctx.strokeRect(x, y, w, h);
}

/** The invented starburst badge, drawn fresh every render. */
function drawBadge(ctx, w, h) {
  const r = Math.min(w, h) * 0.085;
  const cx = w - r * 1.3;
  const cy = h - r * 1.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.22);
  ctx.beginPath();
  const points = 16;
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.78;
    const a = (i / (points * 2)) * Math.PI * 2;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23e';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = r * 0.22;
  ctx.shadowOffsetY = r * 0.08;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = '#14100a';
  ctx.stroke();
  ctx.fillStyle = '#14100a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${r * 0.34}px Anton, sans-serif`;
  ctx.fillText('VICE PANEL', 0, -r * 0.22);
  ctx.fillText('STUDIO', 0, r * 0.16);
  ctx.font = `${r * 0.2}px Anton, sans-serif`;
  ctx.fillText('EST. 2026', 0, r * 0.46);
  ctx.restore();
}

/** Title in Anton with a sunset gradient fill, subtitle in glowing Pacifico. */
function drawLettering(ctx, w, h, title, subtitle) {
  const text = (title ?? '').trim().toUpperCase();
  const sub = (subtitle ?? '').trim();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let titleBase = h * 0.05;
  if (text) {
    let size = w * 0.135;
    ctx.font = `${size}px Anton, sans-serif`;
    while (ctx.measureText(text).width > w * 0.94 && size > 14) {
      size *= 0.94;
      ctx.font = `${size}px Anton, sans-serif`;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, size * 1.25);
    grad.addColorStop(0, '#fffbe8');
    grad.addColorStop(0.45, '#ffd23e');
    grad.addColorStop(0.78, '#ff7a3c');
    grad.addColorStop(1, '#ff4f9a');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0d0714';
    ctx.lineWidth = size * 0.16;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.07;
    ctx.strokeText(text, w / 2, size * 1.04);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(text, w / 2, size * 1.04);
    titleBase = size * 1.22;
  }
  if (sub) {
    let size = w * 0.052;
    ctx.font = `${size}px Pacifico, cursive`;
    while (ctx.measureText(sub).width > w * 0.9 && size > 10) {
      size *= 0.94;
      ctx.font = `${size}px Pacifico, cursive`;
    }
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = size * 0.55;
    ctx.fillStyle = '#ff8ae2';
    ctx.fillText(sub, w / 2, titleBase + size * 0.95);
    ctx.fillStyle = '#ffe3f7';
    ctx.shadowBlur = size * 0.25;
    ctx.fillText(sub, w / 2, titleBase + size * 0.95);
    ctx.shadowBlur = 0;
  }
}

/**
 * Renders the whole cover described by `state` onto `canvas`.
 * state: { layout, grade, title, subtitle, grain, vignette,
 *          slots: [{ photo, zoom, panX, panY }], highlight }
 * `highlight` is an editor-only panel index outline (-1 for exports).
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const layout = layoutById(state.layout);
  const grade = gradeById(state.grade);
  const gap = Math.max(4, Math.round(w * 0.006));
  ctx.fillStyle = '#0d0714';
  ctx.fillRect(0, 0, w, h);
  const cells = layout.cells();
  cells.forEach((cell, i) => {
    const rect = {
      x: cell.x * w + gap / 2,
      y: cell.y * h + gap / 2,
      w: cell.w * w - gap,
      h: cell.h * h - gap,
    };
    drawPanel(ctx, rect, state.slots[i] ?? null, grade);
    if (state.highlight === i) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = Math.max(3, w * 0.005);
      ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
    }
  });
  if (state.vignette) {
    const rad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
    rad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rad.addColorStop(1, 'rgba(5, 0, 12, 0.5)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.grain) {
    const tile = getGrainTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  drawLettering(ctx, w, h, state.title, state.subtitle);
  drawBadge(ctx, w, h);
}

/** Pixel rects of a layout at a given cover size — shared with hit-testing. */
export function panelRects(layoutId, w, h) {
  const gap = Math.max(4, Math.round(w * 0.006));
  return layoutById(layoutId).cells().map((cell) => ({
    x: cell.x * w + gap / 2,
    y: cell.y * h + gap / 2,
    w: cell.w * w - gap,
    h: cell.h * h - gap,
  }));
}
