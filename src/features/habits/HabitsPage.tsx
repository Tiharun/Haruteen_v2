import { Archive, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  moveHabit,
  restoreHabit,
  updateHabit,
  useHabitsQuery,
  type HabitInput,
} from '../../db/repositories/habits';
import {
  adjustHabitLog,
  setHabitLog,
  toggleHabitLog,
  useHabitLogsQuery,
} from '../../db/repositories/habitLogs';
import type { Habit, HabitLog, LocalDate } from '../../domain/types';
import { ValidationError } from '../../domain/validation';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { HabitCard } from './HabitCard';
import { HabitFormDialog } from './HabitFormDialog';
import styles from './HabitsPage.module.css';

const NO_LOGS: HabitLog[] = [];

/** `undefined`면 닫힘, `null`이면 새 습관, Habit이면 수정 */
type FormState = Habit | null | undefined;

export function HabitsPage() {
  const toast = useToast();
  const { settings } = useSettings();
  const today = useToday(settings.dayStartHour);
  const habits = useHabitsQuery();
  const allLogs = useHabitLogsQuery();

  const [params, setParams] = useSearchParams();
  const showArchived = params.get('archived') === '1';
  const setShowArchived = (value: boolean) => setParams(value ? { archived: '1' } : {});
  const [form, setForm] = useState<FormState>(undefined);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const logsByHabit = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const log of allLogs ?? []) {
      const list = map.get(log.habitId);
      if (list) list.push(log);
      else map.set(log.habitId, [log]);
    }
    return map;
  }, [allLogs]);

  if (!habits || !allLogs) return null;

  const active = habits.filter((h) => h.archivedOn === null);
  const archived = habits.filter((h) => h.archivedOn !== null);
  const shown = showArchived ? archived : active;

  const report = (error: unknown, fallback: string) => {
    toast.show({ message: error instanceof ValidationError ? error.message : fallback });
  };

  const save = async (input: HabitInput) => {
    if (form) await updateHabit(form.id, input, today);
    else await createHabit(input, today);
  };

  const toggle = (habit: Habit, date: LocalDate) => {
    toggleHabitLog(habit.id, date, today).catch((error: unknown) =>
      report(error, '기록하지 못했어요.'),
    );
  };
  const adjust = (habit: Habit, date: LocalDate, delta: number) => {
    adjustHabitLog(habit.id, date, delta, today).catch((error: unknown) =>
      report(error, '기록하지 못했어요.'),
    );
  };
  const setValue = (habit: Habit, date: LocalDate, value: number) => {
    setHabitLog(habit.id, date, value, today).catch((error: unknown) =>
      report(error, '기록하지 못했어요.'),
    );
  };

  const archive = (habit: Habit) => {
    archiveHabit(habit.id, today)
      .then(() =>
        toast.show({
          message: `“${habit.name}”을(를) 보관했어요.`,
          action: {
            label: '되돌리기',
            onClick: () => {
              restoreHabit(habit.id).catch((error: unknown) => report(error, '복원하지 못했어요.'));
            },
          },
        }),
      )
      .catch((error: unknown) => report(error, '보관하지 못했어요.'));
  };
  const restore = (habit: Habit) => {
    restoreHabit(habit.id).catch((error: unknown) => report(error, '복원하지 못했어요.'));
  };
  const move = (habit: Habit, direction: -1 | 1) => {
    moveHabit(habit.id, direction).catch((error: unknown) => report(error, '옮기지 못했어요.'));
  };
  const confirmDelete = async (habit: Habit) => {
    setDeleting(null);
    try {
      await deleteHabit(habit.id);
      toast.show({ message: `“${habit.name}”을(를) 삭제했어요.` });
    } catch (error) {
      report(error, '삭제하지 못했어요.');
    }
  };

  const deletingLogCount = deleting ? (logsByHabit.get(deleting.id)?.length ?? 0) : 0;

  return (
    <>
      <PageHeader
        title="습관"
        actions={
          <>
            <Button
              aria-pressed={showArchived}
              className={showArchived ? styles.toggleOn : undefined}
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive size={16} aria-hidden="true" />
              보관함 ({archived.length})
            </Button>
            <Button variant="primary" onClick={() => setForm(null)}>
              <Plus size={16} aria-hidden="true" />
              습관 추가
            </Button>
          </>
        }
      />

      {shown.length === 0 ? (
        showArchived ? (
          <EmptyState
            title="보관한 습관이 없어요"
            description="그만두고 싶은 습관은 지우지 말고 보관해 두면 기록이 남아요."
            action={<Button onClick={() => setShowArchived(false)}>습관 목록으로</Button>}
          />
        ) : (
          <EmptyState
            title="아직 습관이 없어요"
            description="매일 또는 정해진 요일에 하고 싶은 일을 만들고 기록해 보세요."
            action={
              <Button variant="primary" onClick={() => setForm(null)}>
                첫 습관 만들기
              </Button>
            }
          />
        )
      ) : (
        <ul className={styles.list} aria-label={showArchived ? '보관한 습관 목록' : '습관 목록'}>
          {shown.map((habit, index) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              logs={logsByHabit.get(habit.id) ?? NO_LOGS}
              today={today}
              weekStartsOn={settings.weekStartsOn}
              archived={showArchived}
              isFirst={index === 0}
              isLast={index === shown.length - 1}
              onMove={(direction) => move(habit, direction)}
              onEdit={() => setForm(habit)}
              onArchive={() => archive(habit)}
              onRestore={() => restore(habit)}
              onDelete={() => setDeleting(habit)}
              onToggle={(date) => toggle(habit, date)}
              onAdjust={(date, delta) => adjust(habit, date, delta)}
              onSetValue={(date, value) => setValue(habit, date, value)}
            />
          ))}
        </ul>
      )}

      {form !== undefined && (
        <HabitFormDialog
          key={form?.id ?? 'new'}
          habit={form ?? undefined}
          today={today}
          onSubmit={save}
          onClose={() => setForm(undefined)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="습관을 삭제할까요?"
          message={
            <>
              <p>“{deleting.name}”을(를) 삭제해요.</p>
              <p className={styles.impact}>
                {deletingLogCount > 0
                  ? `지금까지 한 기록 ${deletingLogCount}개도 함께 지워지고, 되돌릴 수 없어요. 기록은 남기고 싶다면 삭제 대신 보관하세요.`
                  : '되돌릴 수 없어요.'}
              </p>
            </>
          }
          confirmLabel="삭제"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  );
}
