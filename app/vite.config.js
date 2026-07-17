import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: en GitHub Pages la app se sirve desde /ClaudeCoding/ (repo de
// usuario, no de organización), así que los assets deben pedirse con ese
// prefijo. GITHUB_PAGES lo setea el workflow de deploy; en dev/build normal
// queda en '/' como siempre.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/ClaudeCoding/' : '/',
})
