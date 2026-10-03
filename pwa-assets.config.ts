import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/favicon.svg 하나로 PWA 아이콘(192·512·maskable·apple-touch·favicon.ico)을 만든다: npm run generate-pwa-assets
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
