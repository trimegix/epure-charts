# Scenes

A scene is everything a chart needs to be drawn, already laid out: plain JSON, no
functions, no React. Every `build*Scene(spec, data, { width, height, format })` returns one,
and every `*Figure` component only draws what its scene says. That makes a scene the right
input for anything that is not a browser: a static site, an SVG file, a slide.

The exact fields of each scene are listed in [scene-shapes.md](scene-shapes.md), generated
from real scenes. This page gives the conventions they share.

## Coordinates

- **Pixels, top-left origin**, y pointing down, like SVG. `scene.width` and `scene.height` are
  the drawing's size; every `x`, `y`, `w`, `h`, `x0`, `x1`, `cx`, `cy`, `r` is in that space.
- `plot` (when present) is the plotting area: `{ left, right, top, bottom, width, height }`.
- `d` fields are SVG path strings in the same space. Some marks carry a transform as numbers
  (`tx`, `ty` on pie arcs): add them to the path's coordinates.
- Text positions are **baselines**: `y` is where the text sits, `anchor` is `start`, `middle` or
  `end` (SVG `text-anchor`). A converter to slide text boxes measures from there.
- Scale a scene to another size by multiplying every coordinate by the same factor (keeping
  the ratio) or, better, rebuild it at the target size: layout (label collisions, ticks,
  wrapping) depends on the size.

## Colors

- A color is a **token name** (`'cat-1'`, `'gray-700'`, `'chart-pos'`) or a hex (`'#1f6f8b'`).
- Palette tokens are CSS variables (`--cat-1`…). Semantic tokens (`chart-pos`, `chart-neg`,
  `chart-accent`, `chart-neutral`, `chart-actual`, `chart-plan`, `chart-hypothesis`…) name a
  meaning and fall back on a palette token: `tok('chart-pos')` is
  `var(--chart-pos, var(--green))`. See `styles/tokens.css` for the list.
- Off the browser, resolve a token with `LIGHT_TOKENS` / `DARK_TOKENS` and `baseToken()`
  (`epure-charts/core`), or let `sceneToSVGString(scene, { tokens })` do it.
- `spec.accent: 'single'` + `spec.emphasis: [keys]`: every mark is `chart-neutral` except the
  emphasized ones, in `chart-accent`.

## Text and type

- Text is final: numbers are formatted, engine words are translated (`spec.locale: 'fr'`,
  or `setDefaultLocale('fr')`), long labels are wrapped or ellipsized (`full` keeps the
  original when they differ).
- Layout assumes the default sizes (11 px body, 10 px notes; `size` on a label overrides).
  Figures draw them as `--chart-fs` / `--chart-fs-note`, so a page can align them with its
  type scale.

## meta

Every scene carries `meta`:

| Field | |
|---|---|
| `meta.figure` | which figure draws it: `chart`, `waterfall`, `barh`, `pie`, `scatter`, `mekko`, `gantt`, `table`, `slope`, `funnel` |
| `meta.variant` | a sub-kind when one figure draws several (`'profile'` for the profile chart) |
| `meta.title` | `spec.title` |
| `meta.desc` | `spec.description`, else the provenance as one line (for `<desc>`) |
| `meta.locale` | the language the scene's text is in |
| `meta.provenance` | `{ source?, note?, base?: { sample?, period?, scope? } }` from the spec |

The figure never draws the provenance: the page writes the title and the footer from it (and
a deck exporter the source line), so it travels with the data instead of being baked into
the drawing.

## Empty scenes

`scene.empty === true`: nothing to draw (no data). Figures render nothing; a page shows its
own empty state.

## From a scene to…

| Target | Use |
|---|---|
| React, server or browser | `<XxxFigure scene={scene} />` (`epure-charts/static`) |
| An SVG string (file, e-mail) | `sceneToSVGString(scene, { tokens })`: every `var(--…)` resolved |
| Slides | read the scene directly: rectangles → shapes, `d` → freeform paths, labels → text boxes at their baseline, colors through the token tables |
