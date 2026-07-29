import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve esta app desde /ClaudeCoding/geophoto/ (repo de usuario,
// no de organización), así que los assets deben pedirse con ese prefijo.
// GITHUB_PAGES lo setea el workflow de deploy; en dev/build normal queda en '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/ClaudeCoding/geophoto/' : '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
