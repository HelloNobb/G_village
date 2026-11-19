import { defineConfig } from 'vite';

// 빌드마다 고유 번호. 데이터 파일을 이 번호로 불러오고, dist/build.json 에도 적어 둬서
// 브라우저에 캐시된 옛 코드가 새 데이터와 섞이면 자동으로 새로고침하게 함.
const BUILD_ID = String(Date.now());

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { chunkSizeWarningLimit: 2000 },
  plugins: [{
    name: 'build-id',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ id: BUILD_ID }) });
    },
  }],
});
