# Contributing

Thanks for helping make Epure Charts better.

## Setup

```bash
npm install
npm run dev     # the gallery, live-reloaded
npm run check   # what CI runs: word guard, lint, tests, build
```

Run `git config core.hooksPath .githooks` once: the hooks run the same guard before each commit.

## How the code is organised

- `src/*Scene.js`: pure functions that turn a spec and data into a scene (positions, labels, annotations). No React, no DOM: this is where most logic and tests live.
- `src/*View.jsx`: React components that draw a scene as SVG and handle the pointer and the keyboard.
- `src/ChartWheel.jsx`, `src/*Bar.jsx`: the mini toolbars and context menus.
- `src/sheetModel.js`, `src/formula.js`, `src/DataSheet.jsx`: the data sheet.

## Pull requests

- One topic per pull request, with a test next to the scene change (`src/*.test.mjs`, `node --test`).
- Keep the rendering offline: no network request, no font or image loaded from a URL.
- Colors and fonts go through CSS custom properties, so that host applications can theme them.
