// ─── epure-charts · the option tables of the format bars ────────────────────
// Shapes, bar modes, orders, dashes, markers, decimals… in the interface's language (tr = useT()),
// and the number reader of the bars' fields. Shared by ChartWheel and its controls.
import {
  IconArrowsExchange,
  IconArrowsSort,
  IconChartArea,
  IconChartBar,
  IconChartLine,
  IconLayoutColumns,
  IconPercentage,
  IconSortAscending,
  IconSortDescending,
  IconStack2,
} from '@tabler/icons-react'

// The option tables, in the interface's language (tr = useT()).
export const tablesOf = tr => {
  const SHAPES = [['bar', tr('Bars'), IconChartBar], ['line', tr('Line'), IconChartLine], ['area', tr('Area'), IconChartArea]]
  const BAR_MODES = [['clustered', tr('Clustered'), IconLayoutColumns], ['stacked', tr('Stacked'), IconStack2], ['stacked100', '100% stacked', IconPercentage]]
  const ORDERS = [[null, tr('Sheet order'), IconArrowsSort], ['reverse', tr('Reverse order'), IconArrowsExchange], ['desc', tr('Largest first'), IconSortDescending], ['asc', tr('Smallest first'), IconSortAscending]]
  // The order's short name in a bar value ("Order: sheet").
  const ORDER_SHORT = { sheet: tr('Sheet'), reverse: tr('Reverse') }
  const SHOW = [['none', tr('None')], ['last', tr('Last')], ['some', tr('Chosen')], ['all', tr('All')]]
  const DASHES = [['solid', tr('Solid'), null], ['dash', tr('Dashed'), '4 3'], ['dot', tr('Dotted'), '1.5 2.5']]
  const MARKERS = [['none', tr('No marker'), '∅'], ['circle', tr('Circle'), '●'], ['square', tr('Square'), '■'], ['diamond', tr('Diamond'), '◆'], ['triangle', tr('Triangle'), '▲']]
  const DECIMALS = [[null, tr('Auto')], [0, '0'], [1, tr('0.0')], [2, tr('0.00')]]
  // The magnitude of an amount (×10³, ×10⁶, ×10⁹).
  const MAGNITUDES = [[null, tr('Auto'), tr('Magnitude chosen by the screen')], ['k', 'k', tr('Thousands (×10³)')], ['M', 'M', tr('Millions (×10⁶)')], ['B', 'B', tr('Billions (×10⁹)')], ['prime', tr('Prime (′ ″)'), tr('Prime notation: ′ millions, ″ billions')]]
  const SCHEME_LIST = [['', tr('Default colors')], ['categorical', tr('Categorical')], ['accent', tr('Accent')], ['gray', tr('Grays')], ['blue', tr('Blues')]]
  // Fill patterns.
  const PATTERN_ITEMS = [[null, tr('Solid')], ['hatch', '///', null, tr('Hatched')], ['hatchBack', '\\\\\\', null, tr('Hatched backward')], ['cross', '×', null, tr('Crosshatch')], ['dots', '···', null, tr('Dots')], ['lines', '≡', null, tr('Lines')]]
  // Ends of an error bar.
  const CAPS = [['bar', '—', tr('line')], ['none', '∅', tr('none')], ['dot', '●', tr('dot')], ['arrow', '▲', tr('arrow')]]
  // Text size steps (chart, labels, legend).
  const SIZES = [['xsmall', 'XS', null, tr('Extra small')], ['small', 'S', null, tr('Small')], [null, 'M', null, tr('Medium')], ['large', 'L', null, tr('Large')], ['xlarge', 'XL', null, tr('Extra large')]]
  const GAPS = [[null, tr('Auto')], [0.1, tr('Wide')], [0.3, tr('Medium')], [0.5, tr('Narrow')], [0.7, tr('Thin')]]
  const OBJECTS = [['chart', tr('Chart')], ['series', tr('Series')], ['yaxis', tr('Value axis')], ['xaxis', tr('Category axis')], ['labels', tr('Labels')], ['legend', tr('Legend')]]
  return { SHAPES, BAR_MODES, ORDERS, ORDER_SHORT, SHOW, DASHES, MARKERS, DECIMALS, MAGNITUDES, SCHEME_LIST, PATTERN_ITEMS, CAPS, SIZES, GAPS, OBJECTS }
}

export const numOrNull = raw => {
  const t = String(raw ?? '').trim().replace(',', '.')
  if (t === '' || t === '-' || t.endsWith('.')) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
