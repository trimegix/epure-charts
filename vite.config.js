import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build --mode lib`: the library (one ESM file), dependencies left external.
// `vite build --mode demo`: the gallery as a static site (GitHub Pages).
export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [react()],
      publicDir: false, // the gallery's favicon has no place in the package
      build: {
        outDir: 'dist',
        lib: { entry: 'src/index.js', formats: ['es'], fileName: () => 'epure-charts.js' },
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
