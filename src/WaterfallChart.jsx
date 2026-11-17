// ─── epure-charts · a ready-to-use waterfall, formatting included ───────────
// <WaterfallChart spec bridge? … /> = WaterfallView + its reading settings
// (useWaterfallPrefs): click, right-click, sheet, Reset, with no wiring by the host.
// readOnly: the spec as given, without the per-browser settings (static pages, server rendering).
import WaterfallView from './WaterfallView.jsx'
import { useWaterfallPrefs } from './useWaterfallPrefs.js'

export default function WaterfallChart({ spec, bridge, currentId, scope, context, readOnly = false, ...rest }) {
  const [effective, , api] = useWaterfallPrefs(spec, { currentId, scope, context, bridge })
  // Ready to use: without its own header (bare), the formatting button sits in the corner.
  return <WaterfallView floatMenu {...rest} readOnly={readOnly} spec={readOnly ? spec : effective} bridge={bridge} currentId={currentId} scope={scope} context={context} api={readOnly ? undefined : api} />
}
