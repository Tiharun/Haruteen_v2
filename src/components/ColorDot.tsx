import type { ColorKey } from '../domain/types';
import styles from './ColorDot.module.css';

/** 프로젝트·태그 색 표시. 장식이므로 이름은 항상 옆에 글자로 함께 보여 준다. */
export function ColorDot({ color }: { color: ColorKey }) {
  return (
    <span
      className={styles.dot}
      style={{ background: `var(--color-${color})` }}
      aria-hidden="true"
    />
  );
}
