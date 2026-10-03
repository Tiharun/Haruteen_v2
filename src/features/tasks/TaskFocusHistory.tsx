import { Play } from 'lucide-react';
import { Button } from '../../components/Button';
import { useTargetSessions } from '../../db/repositories/focus';
import { formatDateShort, formatTimeOfDay, todayOf } from '../../domain/dates';
import { formatDuration } from '../../domain/timer';
import { formatFocusTime } from '../../domain/stats';
import type { ID } from '../../domain/types';
import { useSettings } from '../../hooks/useSettings';
import fieldStyles from '../../components/Field.module.css';
import styles from './TaskFocusHistory.module.css';

const RECENT_COUNT = 5;

export interface TaskFocusHistoryProps {
  taskId: ID;
  /** 완료한 할 일에는 집중 시작 버튼을 보여 주지 않는다 */
  canStart: boolean;
  onStartFocus: () => void;
}

/** 편집 패널의 "집중 기록": 누적 시간과 최근 5개 세션. (DESIGN.md §5.3) */
export function TaskFocusHistory({ taskId, canStart, onStartFocus }: TaskFocusHistoryProps) {
  const sessions = useTargetSessions(taskId);
  const { settings } = useSettings();
  const totalMs = (sessions ?? []).reduce((sum, s) => sum + s.actualMs, 0);
  const recent = (sessions ?? []).slice(0, RECENT_COUNT);

  return (
    <section aria-labelledby={`focus-history-${taskId}`} className={styles.section}>
      <div className={styles.head}>
        <h3 id={`focus-history-${taskId}`} className={fieldStyles.label}>
          집중 기록
        </h3>
        {canStart && (
          <Button size="sm" onClick={onStartFocus}>
            <Play size={14} aria-hidden="true" />
            집중 시작
          </Button>
        )}
      </div>
      {sessions !== undefined && sessions.length === 0 ? (
        <p className={fieldStyles.hint}>아직 집중 기록이 없어요.</p>
      ) : (
        <>
          <p className={styles.total}>
            누적 집중 <strong>{formatFocusTime(totalMs)}</strong> ({sessions?.length ?? 0}회)
          </p>
          <ul className={styles.list} aria-label="최근 집중 기록">
            {recent.map((s) => (
              <li key={s.id} className={styles.row}>
                <span>
                  {formatDateShort(todayOf(s.startedAt, settings.dayStartHour))}{' '}
                  {formatTimeOfDay(s.startedAt)}
                </span>
                <span>{formatDuration(s.actualMs)}</span>
                <span className={s.completed ? styles.done : styles.stopped}>
                  {s.completed ? '완료' : '중단'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
