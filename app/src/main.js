// Vice Panel Studio — the editor.
//
// One state object describes the whole cover; every control edits it and
// re-renders the live preview. The export button renders the same state
// once more, at full size, into a PNG download. A ?shot= scene (./shots.js)
// can pre-load the editor or show the bare cover for screenshots.

import { drawCover, panelRects, LAYOUTS, GRADES, layoutById } from './cover.js';
import { readShotScene, signalShotReady } from './shots.js';

export const SIZES = [
  { id: 'square', name: 'Square 1080×1080', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait 1080×1350', w: 1080, h: 1350 },
  { id: 'landscape', name: 'Landscape 1920×1080', w: 1920, h: 1080 },
];

const sizeById = (id) => SIZES.find((s) => s.id === id) ?? SIZES[0];

const state = {
  layout: 'hero3',
  grade: 'sunset',
  size: 'landscape',
  title: 'Neon Shores',
  subtitle: 'Vice Panel Nights',
  grain: true,
  vignette: true,
  photos: [], // { img, name }
  slots: [], // per panel: { photoIndex, zoom, panX, panY }
  selected: 0,
  activePhoto: -1,
};

const canvas = document.getElementById('cover');
const tray = document.getElementById('tray');
const status = document.getElementById('status');
const zoomInput = document.getElementById('zoom');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');

/** Loads an image from a URL, resolving once it can be drawn. */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Keeps the slot list matched to the current layout's panel count. */
function ensureSlots() {
  const count = layoutById(state.layout).cells().length;
  while (state.slots.length < count) {
    state.slots.push({ photoIndex: -1, zoom: 1, panX: 0, panY: 0 });
  }
  state.slots.length = count;
  if (state.selected >= count) state.selected = 0;
}

/** The state as drawCover wants it: slots with photo objects resolved. */
function renderState(highlight) {
  ensureSlots();
  return {
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    grain: state.grain,
    vignette: state.vignette,
    highlight,
    slots: state.slots.map((slot) => ({
      photo: slot.photoIndex >= 0 ? state.photos[slot.photoIndex]?.img ?? null : null,
      zoom: slot.zoom,
      panX: slot.panX,
      panY: slot.panY,
    })),
  };
}

function render() {
  const size = sizeById(state.size);
  const previewW = 960;
  canvas.width = previewW;
  canvas.height = Math.round((previewW * size.h) / size.w);
  drawCover(canvas, renderState(state.selected));
  zoomInput.value = String(state.slots[state.selected]?.zoom ?? 1);
}

// ------------------------------------------------------------- photo tray

function renderTray() {
  tray.replaceChildren();
  state.photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb' + (i === state.activePhoto ? ' active' : '');
    btn.title = photo.name;
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      state.activePhoto = i;
      ensureSlots();
      state.slots[state.selected].photoIndex = i;
      renderTray();
      render();
    });
    tray.appendChild(btn);
  });
}

async function addPhoto(url, name) {
  const img = await loadImage(url);
  state.photos.push({ img, name });
  const index = state.photos.length - 1;
  if (state.activePhoto === -1) state.activePhoto = index;
  // Fill any still-empty panels with the new arrivals, in order.
  ensureSlots();
  state.slots.forEach((slot) => {
    if (slot.photoIndex === -1) slot.photoIndex = index;
  });
  renderTray();
  render();
  return index;
}

document.getElementById('photos').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    await addPhoto(URL.createObjectURL(file), file.name);
  }
  if (files.length > 0) status.textContent = `${state.photos.length} photo(s) in the tray.`;
  e.target.value = '';
});

document.getElementById('fillAll').addEventListener('click', () => {
  if (state.activePhoto < 0) {
    status.textContent = 'Add a photo first.';
    return;
  }
  ensureSlots();
  state.slots.forEach((slot) => {
    slot.photoIndex = state.activePhoto;
  });
  render();
});

// ------------------------------------------------------- pickers (buttons)

function buildPicker(containerId, options, current, onPick) {
  const box = document.getElementById(containerId);
  box.replaceChildren();
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.name;
    btn.className = 'pick' + (opt.id === current() ? ' active' : '');
    btn.addEventListener('click', () => {
      onPick(opt.id);
      buildPicker(containerId, options, current, onPick);
      render();
    });
    box.appendChild(btn);
  });
}

buildPicker('layouts', LAYOUTS, () => state.layout, (id) => {
  state.layout = id;
  ensureSlots();
});
buildPicker('grades', GRADES, () => state.grade, (id) => {
  state.grade = id;
});
buildPicker('sizes', SIZES, () => state.size, (id) => {
  state.size = id;
});

// -------------------------------------------------------------- lettering

titleInput.addEventListener('input', () => {
  state.title = titleInput.value;
  render();
});
subtitleInput.addEventListener('input', () => {
  state.subtitle = subtitleInput.value;
  render();
});
zoomInput.addEventListener('input', () => {
  ensureSlots();
  state.slots[state.selected].zoom = Number(zoomInput.value);
  render();
});
document.getElementById('grain').addEventListener('change', (e) => {
  state.grain = e.target.checked;
  render();
});
document.getElementById('vignette').addEventListener('change', (e) => {
  state.vignette = e.target.checked;
  render();
});

// ---------------------------------------------------- canvas: select, pan

function canvasPoint(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * canvas.width,
    y: ((event.clientY - box.top) / box.height) * canvas.height,
  };
}

function panelAt(point) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  return rects.findIndex((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
}

let drag = null;

canvas.addEventListener('pointerdown', (event) => {
  const point = canvasPoint(event);
  const index = panelAt(point);
  if (index === -1) return;
  state.selected = index;
  drag = { x: point.x, y: point.y, moved: 0 };
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const point = canvasPoint(event);
  const dx = point.x - drag.x;
  const dy = point.y - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = point.x;
  drag.y = point.y;
  const slot = state.slots[state.selected];
  const photo = slot && slot.photoIndex >= 0 ? state.photos[slot.photoIndex]?.img : null;
  if (!photo) return;
  const rect = panelRects(state.layout, canvas.width, canvas.height)[state.selected];
  const scale = Math.max(rect.w / photo.naturalWidth, rect.h / photo.naturalHeight) * slot.zoom;
  const maxPanX = Math.max(1, (photo.naturalWidth * scale - rect.w) / 2);
  const maxPanY = Math.max(1, (photo.naturalHeight * scale - rect.h) / 2);
  slot.panX = Math.min(1, Math.max(-1, slot.panX + dx / maxPanX));
  slot.panY = Math.min(1, Math.max(-1, slot.panY + dy / maxPanY));
  render();
});

canvas.addEventListener('pointerup', () => {
  drag = null;
});

// ----------------------------------------------------------------- export

document.getElementById('export').addEventListener('click', () => {
  const size = sizeById(state.size);
  const out = document.createElement('canvas');
  out.width = size.w;
  out.height = size.h;
  drawCover(out, renderState(-1));
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-panel-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status.textContent = `Saved vice-panel-${size.w}x${size.h}.png`;
  }, 'image/png');
});

// ------------------------------------------------------------------ start

async function applyScene(scene) {
  state.layout = scene.layout;
  state.grade = scene.grade;
  state.size = scene.size;
  state.title = scene.title;
  state.subtitle = scene.subtitle;
  state.grain = scene.grain;
  state.vignette = scene.vignette;
  titleInput.value = scene.title;
  subtitleInput.value = scene.subtitle;
  document.getElementById('grain').checked = scene.grain;
  document.getElementById('vignette').checked = scene.vignette;
  buildPicker('layouts', LAYOUTS, () => state.layout, (id) => { state.layout = id; ensureSlots(); });
  buildPicker('grades', GRADES, () => state.grade, (id) => { state.grade = id; });
  buildPicker('sizes', SIZES, () => state.size, (id) => { state.size = id; });
  ensureSlots();
  const loaded = [];
  for (const name of scene.photos) {
    loaded.push(await addPhoto(`samples/${name}.jpg`, name));
  }
  // Spread the named photos across the panels, in order, cycling.
  state.slots.forEach((slot, i) => {
    slot.photoIndex = loaded[i % loaded.length];
  });
  state.activePhoto = loaded[0];
  renderTray();
  if (scene.mode === 'cover') {
    document.body.classList.add('shot-cover');
    const size = sizeById(state.size);
    canvas.width = size.w;
    canvas.height = size.h;
    drawCover(canvas, renderState(-1));
  } else {
    render();
  }
}

const scene = readShotScene(new URLSearchParams(location.search));
ensureSlots();
if (scene) {
  // Canvas text does not trigger @font-face loading by itself, so pull both
  // lettering fonts in explicitly before the first painted frame.
  await Promise.all([
    document.fonts.load('100px Anton'),
    document.fonts.load('100px Pacifico'),
    document.fonts.ready,
  ]);
  await applyScene(scene);
  signalShotReady();
} else {
  render();
  Promise.all([document.fonts.load('100px Anton'), document.fonts.load('100px Pacifico')])
    .then(() => render());
}
