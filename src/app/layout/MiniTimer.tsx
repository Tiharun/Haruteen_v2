import { Pause, Play } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { IconButton } from '../../components/IconButton';
import { formatClock, PHASE_LABEL } from '../../domain/timer';
import { useTimer } from '../../hooks/useTimer';
import { useMiniBarVisible } from './useMiniBarVisible';
import styles from './MiniTimer.module.css';

/** 남은 시간, 단계, 대상, 시작/일시정지 버튼. 누르면 집중 화면으로 간다. (DESIGN.md §5.1) */
export function MiniTimer({ variant }: { variant: 'sidebar' | 'bar' }) {
  const timer = useTimer();
  const { pathname } = useLocation();
  const barVisible = useMiniBarVisible();
  const { state } = timer;

  const hidden = pathname === '/focus' || !timer.ready || (variant === 'bar' && !barVisible);

  // 모바일 미니 바가 떠 있으면 토스트가 그 위로 올라가도록 알린다(Toast.module.css).
  const barShown = variant === 'bar' && !hidden;
  useEffect(() => {
    if (!barShown) return undefined;
    document.documentElement.dataset.minibar = 'on';
    return () => {
      delete document.documentElement.dataset.minibar;
    };
  }, [barShown]);

  if (hidden) return null;

  const paused = state.status === 'paused';
  const idle = state.status === 'idle';
  const targetName = state.target?.titleSnapshot ?? '대상 없음';
  const phaseText = `${PHASE_LABEL[state.phase]}${paused ? ' · 일시정지' : idle ? ' · 대기' : ''}`;
  const time = formatClock(timer.remainingMs);

  const toggle = () => {
    if (idle) void timer.start();
    else if (paused) void timer.resume();
    else void timer.pause();
  };
  const toggleLabel = idle ? '타이머 시작' : paused ? '타이머 재개' : '타이머 일시정지';

  return (
    <div className={`${styles.card} ${variant === 'bar' ? styles.bar : ''}`} data-variant={variant}>
      <Link
        to="/focus"
        className={styles.info}
        aria-label={`집중 화면으로 가기. ${phaseText}, 남은 시간 ${time}, ${targetName}`}
      >
        <span className={styles.phase}>{phaseText}</span>
        <span className={styles.time}>{time}</span>
        <span className={styles.target}>{targetName}</span>
      </Link>
      <IconButton aria-label={toggleLabel} className={styles.toggle} onClick={toggle}>
        {idle || paused ? (
          <Play size={18} aria-hidden="true" />
        ) : (
          <Pause size={18} aria-hidden="true" />
        )}
      </IconButton>
    </div>
  );
}
