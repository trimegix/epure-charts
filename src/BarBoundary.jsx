// ─── epure-charts · a format bar never brings the chart down ─────────────────
// An error in a format bar or a menu closes it and is logged to the console;
// the chart, the card and the page stay up.
import { Component } from 'react'

export default class BarBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    console.error('[epure-charts] format bar closed after an error:', error)
    this.props.onClose?.()
  }
  render() { return this.state.failed ? null : this.props.children }
}
