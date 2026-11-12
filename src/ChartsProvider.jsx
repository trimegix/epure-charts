// ─── epure-charts · provider: the host application plugs in its data ─────────
import { ChartsContext, CHARTS_DEFAULTS } from './chartsContext.js'
import ChartHeader from './ChartHeader'

/** Supplies host settings (formatters, resolvers, header component) to every chart below it. */
export default function ChartsProvider({ value, children }) {
  return <ChartsContext.Provider value={{ ...CHARTS_DEFAULTS, Header: ChartHeader, ...value }}>{children}</ChartsContext.Provider>
}
