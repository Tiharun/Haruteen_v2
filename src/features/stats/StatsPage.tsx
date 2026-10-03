import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { PageHeader } from '../../components/PageHeader';
import { useSessionsBetween } from '../../db/repositories/focus';
import { useHabitLogsQuery } from '../../db/repositories/habitLogs';
import { useHabitsQuery } from '../../db/repositories/habits';
import { useTasksQuery } from '../../db/repositories/tasks';
import {
  containsDate,
  focusStats,
  formatFocusTime,
  formatPercent,
  formatPeriodLabel,
  habitStats,
  isFuturePeriod,
  periodOf,
  periodRangeMs,
  shiftAnchor,
  taskStats,
  type StatsUnit,
} from '../../domain/stats';
import type { LocalDate, Priority } from '../../domain/types';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { streakUnit } from '../habits/labels';
import { FocusChart } from './FocusChart';
import styles from './StatsPage.module.css';

const UNITS: { value: StatsUnit; label: string; current: string; word: string }[] = [
  { value: 'week', label: '주', current: '이번 주', word: '주' },
  { value: 'month', label: '월', current: '이번 달', word: '달' },
  { value: 'year', label: '연', current: '올해', word: '해' },
];

const PRIORITY_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' };
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function StatsPage() {
  const { settings } = useSettings();
  const { weekStartsOn, dayStartHour } = settings;
  const today = useToday(dayStartHour);
  const [unit, setUnit] = useState<StatsUnit>('week');
  const [anchor, setAnchor] = useState<LocalDate | null>(null); // null = 오늘이 든 기간

  const period = useMemo(
    () => periodOf(anchor ?? today, unit, weekStartsOn),
    [anchor, today, unit, weekStartsOn],
  );
  const range = useMemo(() => periodRangeMs(period, dayStartHour), [period, dayStartHour]);

  const sessions = useSessionsBetween(range.start, range.end);
  const tasks = useTasksQuery();
  const habits = useHabitsQuery();
  const logs = useHabitLogsQuery();

  const focus = useMemo(
    () => (sessions ? focusStats(sessions, period, today, dayStartHour) : null),
    [sessions, period, today, dayStartHour],
  );
  const taskSummary = useMemo(
    () => (tasks ? taskStats(tasks, period, today, dayStartHour) : null),
    [tasks, period, today, dayStartHour],
  );
  // 지워진 할 일·습관의 집중 기록은 이름 뒤에 "(삭제됨)"을 붙인다 (집중 화면과 같은 표기).
  const existingTargetIds = useMemo(
    () => new Set([...(tasks ?? []).map((t) => t.id), ...(habits ?? []).map((h) => h.id)]),
    [tasks, habits],
  );
  const habitSummary = useMemo(
    () => (habits && logs ? habitStats(habits, logs, period, today, weekStartsOn) : null),
    [habits, logs, period, today, weekStartsOn],
  );

  if (!focus || !taskSummary || !habitSummary) return <PageHeader title="통계" />;

  const isCurrent = containsDate(period, today);
  const future = isFuturePeriod(period, today);
  const unitInfo = UNITS.find((u) => u.value === unit) ?? UNITS[0];
  const label = formatPeriodLabel(period);
  const move = (direction: -1 | 1) => setAnchor(shiftAnchor(period.from, unit, direction));
  const pickUnit = (next: StatsUnit) => {
    setUnit(next);
    setAnchor(null);
  };
  const emptyText = (text: string) => (future ? '아직 오지 않은 기간이에요.' : text);

  return (
    <>
      <PageHeader title="통계" />

      <div className={styles.toolbar}>
        <div role="group" aria-label="기간 단위" className={styles.tabs}>
          {UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              aria-pressed={unit === u.value}
              className={`${styles.tab} ${unit === u.value ? styles.tabActive : ''}`}
              onClick={() => pickUnit(u.value)}
            >
              {u.label}
            </button>
          ))}
        </div>
        <div className={styles.nav}>
          <IconButton aria-label={`이전 ${unitInfo?.word}`} onClick={() => move(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </IconButton>
          <p className={styles.periodLabel} aria-live="polite">
            {label}
          </p>
          <IconButton aria-label={`다음 ${unitInfo?.word}`} onClick={() => move(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </IconButton>
          <Button size="sm" disabled={isCurrent} onClick={() => setAnchor(null)}>
            {unitInfo?.current}로
          </Button>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="stats-focus">
        <h2 id="stats-focus" className={styles.heading}>
          집중
        </h2>
        <dl className={styles.cards}>
          <Stat label="총 집중 시간" value={formatFocusTime(focus.totalMs)} />
          <Stat label="완료한 세션" value={`${focus.completedCount}회`} />
          <Stat label="하루 평균" value={formatFocusTime(focus.averagePerDayMs)} />
        </dl>
        {focus.totalMs === 0 && (
          <p className={styles.empty}>
            {emptyText('이 기간에는 집중 기록이 없어요.')}{' '}
            {!future && <Link to="/focus">집중 시작하기</Link>}
          </p>
        )}
        <FocusChart unit={unit} buckets={focus.buckets} caption={`${label} 집중 시간`} />
        {focus.targets.length > 0 && (
          <table className={styles.table}>
            <caption>대상별 집중 시간</caption>
            <thead>
              <tr>
                <th scope="col">대상</th>
                <th scope="col" className={styles.num}>
                  시간
                </th>
              </tr>
            </thead>
            <tbody>
              {focus.targets.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.targetId !== undefined && !existingTargetIds.has(row.targetId)
                      ? `${row.label} (삭제됨)`
                      : row.label}
                  </th>
                  <td className={styles.num}>{formatFocusTime(row.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section} aria-labelledby="stats-tasks">
        <h2 id="stats-tasks" className={styles.heading}>
          할 일
        </h2>
        <dl className={styles.cards}>
          <Stat label="완료한 할 일" value={`${taskSummary.doneCount}개`} />
          {PRIORITIES.map((p) => (
            <Stat
              key={p}
              label={`우선순위 ${PRIORITY_LABEL[p]}`}
              value={`${taskSummary.byPriority[p]}개`}
            />
          ))}
          <Stat label="지금 지난 할 일" value={`${taskSummary.overdueCount}개`} />
        </dl>
        {taskSummary.doneCount === 0 && (
          <p className={styles.empty}>{emptyText('이 기간에 완료한 할 일이 없어요.')}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="stats-habits">
        <h2 id="stats-habits" className={styles.heading}>
          습관
        </h2>
        <dl className={styles.cards}>
          <Stat label="전체 달성률" value={formatPercent(habitSummary.overall.rate)} />
        </dl>
        {habitSummary.rows.length === 0 ? (
          <p className={styles.empty}>
            {emptyText('이 기간에 계산할 습관이 없어요.')}{' '}
            {!future && habits?.length === 0 && <Link to="/habits">첫 습관 만들기</Link>}
          </p>
        ) : (
          <table className={styles.table}>
            <caption>습관별 달성률</caption>
            <thead>
              <tr>
                <th scope="col">습관</th>
                <th scope="col" className={styles.num}>
                  달성률
                </th>
                <th scope="col" className={styles.num}>
                  현재 연속
                </th>
                <th scope="col" className={styles.num}>
                  최고 연속
                </th>
              </tr>
            </thead>
            <tbody>
              {habitSummary.rows.map((row) => (
                <tr key={row.habit.id}>
                  <th scope="row">
                    <Link to={`/habits/${row.habit.id}`}>
                      {row.habit.emoji ? `${row.habit.emoji} ` : ''}
                      {row.habit.name}
                    </Link>
                  </th>
                  <td className={styles.num}>
                    {formatPercent(row.rate)}
                    {row.rate !== null && (
                      <span className={styles.fraction}>
                        {' '}
                        ({row.done}/{row.total})
                      </span>
                    )}
                  </td>
                  <td className={styles.num}>
                    {row.streak.current}
                    {streakUnit(row.habit)}
                  </td>
                  <td className={styles.num}>
                    {row.streak.best}
                    {streakUnit(row.habit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
