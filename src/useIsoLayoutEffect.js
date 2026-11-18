// useLayoutEffect in the browser, useEffect on the server: same behavior where it runs,
// and no React 18 warning when a host renders the charts on the server.
import { useEffect, useLayoutEffect } from 'react'

export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
