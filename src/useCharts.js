// ─── epure-charts · read what the host application provides (chartsContext.js) ─
import { useContext } from 'react'
import { ChartsContext } from './chartsContext.js'

/** The host-provided chart context (see chartsContext.js). */
export function useCharts() {
  return useContext(ChartsContext)
}
