// Fixed scenes, so a reviewer (or the screenshot driver) can open the app
// in an exact state from a link alone.
//
//   ?shot=cover   renders only the composed cover, filling the viewport.
//   ?shot=editor  renders the normal editor with the scene applied.
//
// Recognised parameters: layout, grade, size, title, subtitle, photos
// (comma-separated sample names without extension), grain, vignette.

export function readShotScene(params) {
  const mode = params.get('shot');
  if (mode !== 'cover' && mode !== 'editor') return null;
  const photos = (params.get('photos') ?? 'pier,boulevard')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    mode,
    layout: params.get('layout') ?? 'hero3',
    grade: params.get('grade') ?? 'sunset',
    size: params.get('size') ?? 'landscape',
    title: params.get('title') ?? 'Neon Shores',
    subtitle: params.get('subtitle') ?? 'Vice Panel Nights',
    photos: photos.length > 0 ? photos : ['pier'],
    grain: params.get('grain') !== '0',
    vignette: params.get('vignette') !== '0',
  };
}

/** Flags the scene as fully painted, two frames after the caller returns. */
export function signalShotReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
