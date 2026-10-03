import { useMemo } from 'react';
import { Check, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Tooltip } from '../../components/Tooltip';
import { useToast } from '../../components/Toast';
import { useSessionsBetween } from '../../db/repositories/focus';
import { useHabitsQuery } from '../../db/repositories/habits';
import { setTaskDone, useTasksQuery } from '../../db/repositories/tasks';
import { dayRangeMs } from '../../domain/dates';
import { formatFocusTime } from '../../domain/stats';
import { formatClock, PHASE_LABEL, progressRatio, setProgress } from '../../domain/timer';
import { useShortcut } from '../../hooks/useShortcut';
import { useTimer } from '../../hooks/useTimer';
import { useToday } from '../../hooks/useToday';
import { SessionList } from './SessionList';
import { TargetSelect } from './TargetSelect';
import { TimerRing } from './TimerRing';
import styles from './FocusPage.module.css';

export function FocusPage() {
  const toast = useToast();
  const timer = useTimer();
  const { state, settings, now } = timer;
  const today = useToday(settings.dayStartHour);
  const tasks = useTasksQuery();
  const habits = useHabitsQuery();

  const range = useMemo(
    () => dayRangeMs(today, settings.dayStartHour),
    [today, settings.dayStartHour],
  );
  const sessions = useSessionsBetween(range.start, range.end);

  const idle = state.status === 'idle';
  const running = state.status === 'running';
  const isFocus = state.phase === 'focus';

  const toggle = () => {
    if (idle) void timer.start();
    else if (running) void timer.pause();
    else void timer.resume();
  };

  useShortcut({
    keys: 'Space',
    code: 'Space',
    description: '타이머 시작·일시정지',
    handler: toggle,
  });

  const existingTargetIds = useMemo(
    () => new Set([...(tasks ?? []).map((t) => t.id), ...(habits ?? []).map((h) => h.id)]),
    [tasks, habits],
  );

  if (!timer.ready || !tasks || !habits) return <PageHeader title="집중" />;

  const target = state.target;
  const targetTask =
    target?.type === 'task'
      ? tasks.find((t) => t.id === target.id && t.status === 'todo')
      : undefined;
  const { done: setDone, total: setTotal } = setProgress(state, settings);

  const completeTask = () => {
    if (!targetTask) return;
    setTaskDone(targetTask.id, true).then(
      () => toast.show({ message: `“${targetTask.title}”을(를) 완료했어요. 타이머는 계속돼요.` }),
      () => toast.show({ message: '할 일을 완료하지 못했어요.' }),
    );
  };

  const todaySessions = sessions ?? [];
  const todayTotalMs = todaySessions.reduce((sum, s) => sum + s.actualMs, 0);
  const todayCompleted = todaySessions.filter((s) => s.completed).length;

  const statusText = idle ? '대기 중' : running ? '진행 중' : '일시정지됨';
  const startLabel = isFocus ? '시작' : `${PHASE_LABEL[state.phase]} 시작`;

  return (
    <>
      <PageHeader title="집중" />

      <section className={styles.timer} aria-label="타이머">
        <TimerRing progress={progressRatio(state, now)} tone={isFocus ? 'focus' : 'break'}>
          <span className={styles.phase}>{PHASE_LABEL[state.phase]}</span>
          <span className={styles.clock} role="timer" aria-label="남은 시간">
            {formatClock(timer.remainingMs)}
          </span>
          <span className={styles.status}>{statusText}</span>
        </TimerRing>

        <p className={styles.setInfo}>
          <span className={styles.dots} aria-hidden="true">
            {Array.from({ length: setTotal }, (_, i) => (
              <span key={i} className={i < setDone ? styles.dotOn : styles.dot} />
            ))}
          </span>
          {setTotal}회 중 {setDone}회
        </p>

        <div className={styles.controls}>
          {idle ? (
            <Button variant="primary" onClick={() => void timer.start()}>
              <Play size={18} aria-hidden="true" />
              {startLabel}
            </Button>
          ) : (
            <Button variant="primary" onClick={toggle}>
              {running ? (
                <>
                  <Pause size={18} aria-hidden="true" />
                  일시정지
                </>
              ) : (
                <>
                  <Play size={18} aria-hidden="true" />
                  재개
                </>
              )}
            </Button>
          )}

          {!idle && isFocus && (
            <Tooltip text="1분 미만은 기록되지 않아요">
              <Button onClick={() => void timer.stop()}>
                <Square size={16} aria-hidden="true" />
                중단
              </Button>
            </Tooltip>
          )}
          {!isFocus && (
            <Button onClick={() => void timer.skip()}>
              <SkipForward size={16} aria-hidden="true" />
              건너뛰기
            </Button>
          )}
          {idle && isFocus && state.completedFocusInSet > 0 && (
            <Button onClick={() => void timer.resetSet()}>
              <RotateCcw size={16} aria-hidden="true" />
              세트 초기화
            </Button>
          )}
        </div>
        <p className={styles.shortcutHint}>
          <kbd className={styles.kbd}>Space</kbd>로 시작·일시정지
        </p>
      </section>

      <section className={styles.panel} aria-label="대상 선택">
        <TargetSelect
          value={target}
          disabled={!idle}
          tasks={tasks}
          habits={habits}
          today={today}
          onChange={(next) => void timer.setTarget(next)}
        />
        {targetTask && !idle && isFocus && (
          <Button variant="secondary" onClick={completeTask}>
            <Check size={16} aria-hidden="true" />할 일 완료
          </Button>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="focus-today">
        <div className={styles.panelHead}>
          <h2 id="focus-today" className={styles.heading}>
            오늘의 집중 기록
          </h2>
          <p className={styles.total}>
            총 {formatFocusTime(todayTotalMs)} · 완료 {todayCompleted}회
          </p>
        </div>
        {todaySessions.length === 0 ? (
          <p className={styles.empty}>
            아직 기록이 없어요. 위의 시작 버튼을 눌러 첫 집중을 시작해 보세요.
          </p>
        ) : (
          <SessionList sessions={todaySessions} existingTargetIds={existingTargetIds} />
        )}
      </section>

      <p className={styles.quick}>
        집중·휴식 시간이나 알림은 <Link to="/settings">설정의 타이머 섹션</Link>에서 바꿀 수 있어요.
      </p>
    </>
  );
}
