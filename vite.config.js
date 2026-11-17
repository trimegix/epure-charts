import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build --mode lib`: the library (ESM: the full entry, the pure core, the static figures), dependencies left external.
// `vite build --mode demo`: the gallery as a static site (GitHub Pages).
export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [react()],
      publicDir: false, // the gallery's favicon has no place in the package
      build: {
        outDir: 'dist',
        lib: { entry: { 'epure-charts': 'src/index.js', core: 'src/core.js', static: 'src/static.js' }, formats: ['es'], fileName: (_, name) => `${name}.js` },
        rollupOptions: {
          external: [/^react($|\/)/, /^react-dom($|\/)/, /^@tabler\/icons-react/, /^d3-/, /^jspreadsheet-ce/, /^jsuites/],
        },
        sourcemap: false,
        minify: 'esbuild',
      },
    }
  }
  return {
    plugins: [react()],
    base: mode === 'demo' ? '/epure-charts/' : '/',
    build: { outDir: 'demo-dist' },
  }
})
