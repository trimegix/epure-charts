# Changelog

## 0.1.1

- `epure-charts/core`: the pure engine (specs, scenes, number formats, data sheet model) as its
  own entry, with no React, DOM or CSS import, so that it loads under Node.
- `resolveCollisions` (label layout) is exported.
- `jsuites` is declared as a dependency (it was only installed through `jspreadsheet-ce`).

## 0.1.0

First public release: column, line, area, combination, profile, waterfall, horizontal bar,
butterfly, pie, doughnut, scatter, bubble, Mekko, Gantt and table charts, each with a mini
toolbar, context menus and a data sheet.
