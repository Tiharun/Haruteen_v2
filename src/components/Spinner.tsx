import { useEffect, useState } from 'react';
import styles from './Spinner.module.css';

const DELAY_MS = 200;

/** 전체 화면 로딩 스피너. 200ms가 지난 뒤에만 보인다(짧은 로딩에서 깜빡이지 않도록). */
export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles.screen} role="status">
      {visible && (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </>
      )}
    </div>
  );
}
