import { defineConfig } from 'vite';

// base './' → GitHub Pages 하위 경로(/G_village/)에서도 저장소 이름과 상관없이 동작
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
