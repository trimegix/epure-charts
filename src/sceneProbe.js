// ─── epure-charts · test seam: the scene a figure draws ──────────────────────
// Internal (not exported by the package): the parity test listens to the scenes the live
// views hand to their figure, to compare them with the static entry's. One call per render.
let probe = null
/** Listens to every scene a figure draws (null: stop). Returns the previous listener. */
export function setSceneProbe(fn) { const prev = probe; probe = fn; return prev }
/** Called by each figure with the scene it draws. */
export function sceneDrawn(scene) { if (probe) probe(scene) }
