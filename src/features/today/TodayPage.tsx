import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useFocusTotals, useSessionsBetween } from '../../db/repositories/focus';
import {
  adjustHabitLog,
  setHabitLog,
  toggleHabitLog,
  useHabitLogsQuery,
} from '../../db/repositories/habitLogs';
import { useHabitsQuery } from '../../db/repositories/habits';
import { useProjectsQuery } from '../../db/repositories/projects';
import { useTagsQuery } from '../../db/repositories/tags';
import { createTask, setTaskDone, useTasksQuery } from '../../db/repositories/tasks';
import { dayRangeMs, formatDateLong } from '../../domain/dates';
import {
  habitsForToday,
  isAchievedValue,
  streak,
  toLogValues,
  weeklyProgress,
} from '../../domain/habits';
import { groupTodayTasks, todayTaskCounts } from '../../domain/tasks';
import { formatFocusTime } from '../../domain/stats';
import type { Habit, HabitLog, LocalDate, Task } from '../../domain/types';
import { ValidationError } from '../../domain/validation';
import { useSettings } from '../../hooks/useSettings';
import { useShortcut } from '../../hooks/useShortcut';
import { useStartFocus } from '../../hooks/useTimer';
import { useToday } from '../../hooks/useToday';
import { TaskEditPanel } from '../tasks/TaskEditPanel';
import { BackupBanner } from './BackupBanner';
import { SummaryCards } from './SummaryCards';
import { TimerCard } from './TimerCard';
import { TodayHabitRow } from './TodayHabitRow';
import { TodayTasks } from './TodayTasks';
import styles from './TodayPage.module.css';

const NO_LOGS: HabitLog[] = [];

export function TodayPage() {
  const toast = useToast();
  const { settings } = useSettings();
  const today = useToday(settings.dayStartHour);
  const habits = useHabitsQuery();
  const habitLogs = useHabitLogsQuery();
  const tasks = useTasksQuery();
  const projects = useProjectsQuery();
  const tags = useTagsQuery();
  const focusTotals = useFocusTotals();
  const startFocus = useStartFocus();

  const range = useMemo(
    () => dayRangeMs(today, settings.dayStartHour),
    [today, settings.dayStartHour],
  );
  const sessions = useSessionsBetween(range.start, range.end);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useShortcut({
    keys: 'N',
    code: 'KeyN',
    description: '새 할 일 입력창으로 이동',
    handler: () => quickAddRef.current?.focus(),
  });

  const logsByHabit = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const log of habitLogs ?? []) {
      const list = map.get(log.habitId);
      if (list) list.push(log);
      else map.set(log.habitId, [log]);
    }
    return map;
  }, [habitLogs]);

  const groups = useMemo(
    () => groupTodayTasks(tasks ?? [], today, settings.dayStartHour),
    [tasks, today, settings.dayStartHour],
  );
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const tagById = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t])), [tags]);

  const dayStartNote = settings.dayStartHour !== 0 ? ` (하루 시작 ${settings.dayStartHour}시)` : '';
  const header = <PageHeader title="오늘" subtitle={`${formatDateLong(today)}${dayStartNote}`} />;
  if (!habits || !habitLogs || !tasks || !projects || !tags) return header;

  const report = (error: unknown, fallback: string) => {
    toast.show({ message: error instanceof ValidationError ? error.message : fallback });
  };

  const todayHabits = habitsForToday(habits, today);
  const habitRows = todayHabits.map((habit) => {
    const values = toLogValues(logsByHabit.get(habit.id) ?? NO_LOGS);
    return {
      habit,
      value: values.get(today) ?? 0,
      streak: streak(habit, values, today, settings.weekStartsOn),
      weekly: weeklyProgress(habit, values, today, settings.weekStartsOn),
    };
  });
  const habitsDone = habitRows.filter((r) => isAchievedValue(r.habit.goal, r.value)).length;

  const taskCounts = todayTaskCounts(groups, today);

  const todaySessions = sessions ?? [];
  const focusMs = todaySessions.reduce((sum, s) => sum + s.actualMs, 0);
  const focusCompleted = todaySessions.filter((s) => s.completed).length;

  const editingTask = editingId === null ? undefined : tasks.find((t) => t.id === editingId);

  const toggleHabit = (habit: Habit, date: LocalDate) => {
    toggleHabitLog(habit.id, date, today).catch((e: unknown) => report(e, '기록하지 못했어요.'));
  };
  const addTask = async (title: string) => {
    try {
      await createTask({ title, dueDate: today });
    } catch (error) {
      report(error, '할 일을 저장하지 못했어요.');
      throw error;
    }
  };
  const toggleTask = (task: Task, done: boolean) => {
    setTaskDone(task.id, done).catch((e: unknown) => report(e, '저장하지 못했어요.'));
  };
  const focusOnTask = (task: Task) => {
    void startFocus({ type: 'task', id: task.id, titleSnapshot: task.title });
  };

  return (
    <>
      {header}
      <SummaryCards
        tasks={taskCounts}
        habits={{ done: habitsDone, total: habitRows.length }}
        focus={{ duration: formatFocusTime(focusMs), sessions: focusCompleted }}
      />

      <div className={styles.columns}>
        <div className={styles.main}>
          <section aria-labelledby="today-habits">
            <h2 id="today-habits" className={styles.heading}>
              오늘의 습관
            </h2>
            {habitRows.length === 0 ? (
              <p className={styles.empty}>
                오늘 예정된 습관이 없어요. <Link to="/habits">습관 보러 가기</Link>
              </p>
            ) : (
              <ul className={styles.list} aria-label="오늘의 습관 목록">
                {habitRows.map(({ habit, value, streak: s, weekly }) => (
                  <TodayHabitRow
                    key={habit.id}
                    habit={habit}
                    today={today}
                    value={value}
                    streak={s}
                    weekly={weekly}
                    onToggle={() => toggleHabit(habit, today)}
                    onAdjust={(delta) =>
                      adjustHabitLog(habit.id, today, delta, today).catch((e: unknown) =>
                        report(e, '기록하지 못했어요.'),
                      )
                    }
                    onSetValue={(next) =>
                      setHabitLog(habit.id, today, next, today).catch((e: unknown) =>
                        report(e, '기록하지 못했어요.'),
                      )
                    }
                    onStartFocus={() =>
                      void startFocus({ type: 'habit', id: habit.id, titleSnapshot: habit.name })
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <TodayTasks
            groups={groups}
            today={today}
            projectById={projectById}
            tagById={tagById}
            focusTotals={focusTotals}
            quickAddRef={quickAddRef}
            onAdd={addTask}
            onToggle={toggleTask}
            onOpen={(task) => setEditingId(task.id)}
            onStartFocus={focusOnTask}
          />
        </div>

        <aside className={styles.side} aria-label="타이머와 알림">
          <TimerCard />
          <BackupBanner />
        </aside>
      </div>

      {editingTask && (
        <TaskEditPanel
          key={editingTask.id}
          task={editingTask}
          projects={projects}
          tags={tags}
          onClose={() => setEditingId(null)}
          onStartFocus={() => {
            setEditingId(null);
            focusOnTask(editingTask);
          }}
        />
      )}
    </>
  );
}
