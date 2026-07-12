import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build de un único archivo HTML autocontenido (JS/CSS inline), para poder
// abrirlo con doble clic vía file:// sin levantar un servidor. Uso normal
// de desarrollo sigue siendo `npm run dev` con vite.config.js.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
  },
})
