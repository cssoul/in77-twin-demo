import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5273 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
