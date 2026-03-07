import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
  },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vtk: ['@kitware/vtk.js'],
          cornerstone: ['@cornerstonejs/core', '@cornerstonejs/tools'],
          'cornerstone-loader': ['@cornerstonejs/dicom-image-loader'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
})
