// ─── epure-charts · what the host application provides to the engine ─────────
// The engine knows neither the data nor the UI of the application hosting it.
// The host passes them through <ChartsProvider value={…}>:
//   · resolveSeries(spec, { currentId }) → resolved series [{ label, unit, role, points }]
//     (otherwise each chart can receive `resolved` directly);
//   · resolveBridge(spec, ctx)          → bridge { steps, unit } for a waterfall
//     (otherwise WaterfallView can receive `bridge` directly);
//   · formatValue(v, unit, decimals)    → text of a number;
//   · Header                            → a card header component ({ title, sub, menu }).
// Without a provider, neutral defaults apply: the engine stays usable on its own.
import { createContext } from 'react'
import { defaultFormat } from './scene.js'

export const CHARTS_DEFAULTS = {
  resolveSeries: () => [],
  resolveBridge: () => ({ steps: [], unit: 'M' }),
  formatValue: defaultFormat,
  Header: null,
}

export const ChartsContext = createContext(CHARTS_DEFAULTS)
