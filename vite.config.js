import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' -> relative asset URLs, works under any GH Pages subpath or custom domain.
// Routing uses HashRouter, so deep links never 404 on GH Pages.
// Vendors live in their own long-cached chunks; routes are React.lazy chunks.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
