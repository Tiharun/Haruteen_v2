import type { ReactNode } from 'react';
import styles from './TimerRing.module.css';

const SIZE = 280;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface TimerRingProps {
  /** 0~1 */
  progress: number;
  tone: 'focus' | 'break';
  children: ReactNode;
}

/** 큰 원형 진행 표시. 안쪽에 남은 시간 등을 넣는다. */
export function TimerRing({ progress, tone, children }: TimerRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <div className={styles.ring} style={{ width: SIZE, height: SIZE }}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
      >
        <circle
          className={styles.track}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
        />
        <circle
          className={`${styles.bar} ${tone === 'break' ? styles.breakBar : ''}`}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
