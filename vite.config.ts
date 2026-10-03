import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
  // Pré-bundle tout ensemble : évite deux copies de R3F ("Invalid hook call")
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
  },
})
