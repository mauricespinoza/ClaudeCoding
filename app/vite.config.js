import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Netlify/Vercel sirven la app desde la raíz de su propio dominio, así que
// no hace falta un base path especial (a diferencia de GitHub Pages).
export default defineConfig({
  plugins: [react()],
})
