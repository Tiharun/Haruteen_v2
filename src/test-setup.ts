import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import 'fake-indexeddb/auto';

// 파일 22개가 병렬로 돌면 jsdom이 느려져 findBy·waitFor의 기본 1초가 모자랄 때가 있다(간헐 실패).
configure({ asyncUtilTimeout: 4000 });
