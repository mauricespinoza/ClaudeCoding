import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En GitHub Pages la app se sirve desde /ClaudeCoding/estructural/.
// GITHUB_PAGES lo setea el workflow de deploy; en dev queda en '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/ClaudeCoding/estructural/' : '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
})
