import { ArrowLeft } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { Heatmap, type HeatmapCell } from '../../components/Heatmap';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useTargetSessions } from '../../db/repositories/focus';
import {
  adjustHabitLog,
  setHabitLog,
  toggleHabitLog,
  useHabitLogsOf,
} from '../../db/repositories/habitLogs';
import { useHabitsQuery } from '../../db/repositories/habits';
import { addDays, formatDateLong, toDate, weekdayName } from '../../domain/dates';
import {
  achievementRate,
  dayStatus,
  heatmapWeeks,
  loggability,
  streak,
  toLogValues,
} from '../../domain/habits';
import { formatFocusTime } from '../../domain/stats';
import type { IsoWeekday, LocalDate } from '../../domain/types';
import { ValidationError } from '../../domain/validation';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { CountStepper } from './CountStepper';
import { dayStatusLabel, goalLabel, scheduleLabel, streakUnit } from './labels';
import { MonthCalendar } from './MonthCalendar';
import styles from './HabitDetailPage.module.css';

const RATE_DAYS = 30;

function percent(rate: number | null): string {
  return rate === null ? '기록 없음' : `${Math.round(rate * 100)}%`;
}

export function HabitDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { settings } = useSettings();
  const today = useToday(settings.dayStartHour);
  const habits = useHabitsQuery();
  const logs = useHabitLogsOf(id);
  const sessions = useTargetSessions(id);
  const [picked, setPicked] = useState<LocalDate | null>(null);

  const habit = habits?.find((h) => h.id === id);
  const logValues = useMemo(() => toLogValues(logs ?? []), [logs]);
  const { weekStartsOn } = settings;

  const grid = useMemo(() => heatmapWeeks(today, weekStartsOn), [today, weekStartsOn]);

  const weeks = useMemo<HeatmapCell[][]>(() => {
    if (!habit) return [];
    return grid.map((column) =>
      column.map((date) => {
        const status = dayStatus(habit, logValues, date, today);
        return {
          key: date,
          kind: status.kind,
          level: status.level,
          label: `${formatDateLong(date)}, ${dayStatusLabel(habit, status)}`,
        };
      }),
    );
  }, [habit, grid, logValues, today]);

  // 달이 바뀌는 첫 열 위에 월 이름을 쓴다.
  const columnLabels = useMemo(
    () =>
      grid.map((column, i) => {
        const month = toDate(column[0] ?? today).getMonth();
        const prev = i === 0 ? -1 : toDate(grid[i - 1]?.[0] ?? today).getMonth();
        // 첫 열은 바로 다음 열에서 달이 바뀌면 글자가 겹치므로 쓰지 않는다.
        const next = i === 0 ? toDate(grid[1]?.[0] ?? today).getMonth() : month;
        return month !== prev && month === next ? `${month + 1}월` : null;
      }),
    [grid, today],
  );

  if (!habits || !logs) return null;

  if (!habit) {
    return (
      <>
        <PageHeader title="습관을 찾을 수 없어요" />
        <EmptyState
          title="습관을 찾을 수 없어요"
          description="주소가 잘못됐거나 이미 삭제된 습관이에요."
          action={<Link to="/habits">습관 목록으로</Link>}
        />
      </>
    );
  }

  const { current, best } = streak(habit, logValues, today, weekStartsOn);
  const unit = streakUnit(habit);
  const rate30 = achievementRate(
    habit,
    logValues,
    addDays(today, -(RATE_DAYS - 1)),
    today,
    today,
    weekStartsOn,
  );
  const rateAll = achievementRate(habit, logValues, habit.startDate, today, today, weekStartsOn);
  const focusMs = (sessions ?? []).reduce((sum, s) => sum + s.actualMs, 0);

  const selectedDate = picked ?? today;
  const rowLabels = Array.from({ length: 7 }, (_, i) =>
    weekdayName((((weekStartsOn - 1 + i) % 7) + 1) as IsoWeekday),
  );

  const report = (error: unknown) =>
    toast.show({
      message: error instanceof ValidationError ? error.message : '기록하지 못했어요.',
    });

  return (
    <div style={{ '--habit-color': `var(--color-${habit.color})` } as CSSProperties}>
      <Link to="/habits" className={styles.back}>
        <ArrowLeft size={16} aria-hidden="true" />
        습관 목록
      </Link>
      <PageHeader
        title={`${habit.emoji ?? ''} ${habit.name}`.trim()}
        subtitle={`${scheduleLabel(habit.schedule)} · 목표 ${goalLabel(habit.goal)}${habit.archivedOn === null ? '' : ' · 보관함'}`}
      />
      {habit.note !== '' && <p className={styles.note}>{habit.note}</p>}

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>현재 연속</dt>
          <dd>
            {current}
            {unit}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>최고 연속</dt>
          <dd>
            {best}
            {unit}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>최근 {RATE_DAYS}일 달성률</dt>
          <dd>{percent(rate30.rate)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>전체 달성률</dt>
          <dd>{percent(rateAll.rate)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>누적 집중 시간</dt>
          <dd>{focusMs > 0 ? formatFocusTime(focusMs) : '없음'}</dd>
        </div>
      </dl>

      <section className={styles.panel} aria-labelledby="habit-heatmap">
        <h2 id="habit-heatmap" className={styles.heading}>
          최근 1년
        </h2>
        <Heatmap
          weeks={weeks}
          rowLabels={rowLabels}
          columnLabels={columnLabels}
          ariaLabel={`${habit.name} 최근 53주 기록`}
        />
      </section>

      <section className={styles.panel} aria-labelledby="habit-calendar">
        <h2 id="habit-calendar" className={styles.heading}>
          월 달력
        </h2>
        <MonthCalendar
          habit={habit}
          logs={logValues}
          today={today}
          weekStartsOn={weekStartsOn}
          selectedDate={selectedDate}
          onSelect={setPicked}
          onToggle={(date) => toggleHabitLog(habit.id, date, today).catch(report)}
        />
        {habit.goal.type === 'count' && (
          <CountStepper
            habit={habit}
            date={selectedDate}
            value={logValues.get(selectedDate) ?? 0}
            allowed={loggability(habit, selectedDate, today)}
            onAdjust={(delta) => adjustHabitLog(habit.id, selectedDate, delta, today).catch(report)}
            onSet={(value) => setHabitLog(habit.id, selectedDate, value, today).catch(report)}
          />
        )}
      </section>
    </div>
  );
}
