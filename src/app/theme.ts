import { THEME_CACHE_KEY } from '../config';
import type { ThemeSetting } from '../domain/types';

/**
 * 테마를 html에 적용하고 localStorage에 캐시한다. (DESIGN.md §6)
 * 캐시는 첫 렌더 전에 public/theme-init.js가 읽는다. 원본은 IndexedDB의 Settings.
 */
export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  try {
    if (theme === 'system') {
      localStorage.removeItem(THEME_CACHE_KEY);
    } else {
      localStorage.setItem(THEME_CACHE_KEY, theme);
    }
  } catch {
    // localStorage를 쓸 수 없어도 화면 적용에는 영향이 없다.
  }
}
