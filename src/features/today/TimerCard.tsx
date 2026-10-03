import { Pause, Play, Square } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { formatClock, PHASE_LABEL } from '../../domain/timer';
import { useTimer } from '../../hooks/useTimer';
import styles from './TimerCard.module.css';

/** 집중 화면의 축소판. 시작·일시정지·중단만 둔다. 대상 선택·세트 초기화는 집중 화면에서 한다. */
export function TimerCard() {
  const timer = useTimer();
  const { state } = timer;
  const idle = state.status === 'idle';
  const running = state.status === 'running';
  const isFocus = state.phase === 'focus';
  const statusText = idle ? '대기 중' : running ? '진행 중' : '일시정지됨';

  return (
    <section className={styles.card} aria-labelledby="today-timer">
      <h2 id="today-timer" className={styles.heading}>
        타이머
      </h2>
      <p className={styles.phase}>
        {PHASE_LABEL[state.phase]} · {statusText}
      </p>
      <p className={styles.clock} role="timer" aria-label="남은 시간">
        {formatClock(timer.remainingMs)}
      </p>
      {state.target && <p className={styles.target}>대상: {state.target.titleSnapshot}</p>}
      <div className={styles.controls}>
        {idle ? (
          <Button variant="primary" onClick={() => void timer.start()}>
            <Play size={16} aria-hidden="true" />
            시작
          </Button>
        ) : running ? (
          <Button variant="primary" onClick={() => void timer.pause()}>
            <Pause size={16} aria-hidden="true" />
            일시정지
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void timer.resume()}>
            <Play size={16} aria-hidden="true" />
            재개
          </Button>
        )}
        {!idle && isFocus && (
          <Button onClick={() => void timer.stop()}>
            <Square size={14} aria-hidden="true" />
            중단
          </Button>
        )}
        {!idle && !isFocus && <Button onClick={() => void timer.skip()}>건너뛰기</Button>}
      </div>
      <Link to="/focus" className={styles.link}>
        집중 화면으로
      </Link>
    </section>
  );
}
