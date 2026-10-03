import styles from './SummaryCards.module.css';

export interface SummaryCardsProps {
  /** 오늘 완료한 할 일 수 / 오늘 마감+지난 할 일 수 (`todayTaskCounts`) */
  tasks: { done: number; total: number };
  /** 오늘 달성한 습관 수 / 오늘 예정 습관 수 */
  habits: { done: number; total: number };
  /** 오늘 총 집중 시간(표시용 문자열)과 완료한 세션 수 */
  focus: { duration: string; sessions: number };
}

export function SummaryCards({ tasks, habits, focus }: SummaryCardsProps) {
  return (
    <ul className={styles.cards} aria-label="오늘 요약">
      <li className={styles.card}>
        <span className={styles.label}>할 일</span>
        <span className={styles.value}>
          {tasks.done} / {tasks.total}
        </span>
        <span className={styles.note}>완료 / 오늘 처리할 일</span>
      </li>
      <li className={styles.card}>
        <span className={styles.label}>습관</span>
        <span className={styles.value}>
          {habits.done} / {habits.total}
        </span>
        <span className={styles.note}>달성 / 오늘 예정</span>
      </li>
      <li className={styles.card}>
        <span className={styles.label}>집중</span>
        <span className={styles.value}>{focus.duration}</span>
        <span className={styles.note}>완료 {focus.sessions}회</span>
      </li>
    </ul>
  );
}
