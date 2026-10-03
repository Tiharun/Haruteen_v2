import { formatTimeOfDay } from '../../domain/dates';
import { formatDuration } from '../../domain/timer';
import type { FocusSession, ID } from '../../domain/types';
import styles from './SessionList.module.css';

export interface SessionListProps {
  sessions: FocusSession[];
  /** 아직 남아 있는 할 일·습관 id. 없는 대상은 "(삭제됨)"으로 표시한다. */
  existingTargetIds: ReadonlySet<ID>;
}

function targetLabel(session: FocusSession, existingTargetIds: ReadonlySet<ID>): string {
  if (session.target === null) return '대상 없음';
  const exists = existingTargetIds.has(session.target.id);
  return exists ? session.target.titleSnapshot : `${session.target.titleSnapshot} (삭제됨)`;
}

export function SessionList({ sessions, existingTargetIds }: SessionListProps) {
  return (
    <ul className={styles.list} aria-label="오늘의 집중 기록">
      {sessions.map((s) => (
        <li key={s.id} className={styles.row}>
          <span className={styles.time}>{formatTimeOfDay(s.startedAt)}</span>
          <span className={styles.target}>{targetLabel(s, existingTargetIds)}</span>
          <span className={styles.duration}>{formatDuration(s.actualMs)}</span>
          <span className={s.completed ? styles.done : styles.stopped}>
            {s.completed ? '완료' : '중단'}
          </span>
        </li>
      ))}
    </ul>
  );
}
