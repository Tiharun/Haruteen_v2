process.env.TZ = 'Asia/Seoul';

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  resolve: {
    // 테스트에는 서비스 워커 플러그인이 없으므로 가상 모듈을 가짜로 바꿔 둔다.
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/app/pwaRegisterStub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // 파일이 병렬로 돌며 jsdom이 느려질 때(특히 클릭을 많이 하는 UI 테스트) 5초 기본값을 넘는 경우가 있었다.
    testTimeout: 15_000,
  },
});
