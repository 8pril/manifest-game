import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // tsconfig의 paths는 타입 검사에만 쓰이므로 번들러에도 같은 별칭을 등록한다.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 상대 경로로 빌드한다. GitHub Pages는 프로젝트 사이트일 때
  // https://<user>.github.io/<repo>/ 형태의 하위 경로로 서빙되는데,
  // base를 './'로 두면 저장소 이름이 무엇이든 에셋 경로가 깨지지 않는다.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
