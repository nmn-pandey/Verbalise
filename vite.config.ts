import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Verbalise-No-LLM/', // This should match your repository name
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
