import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { createHabit, type HabitInput } from '../../../db/repositories/habits';
import { createTask } from '../../../db/repositories/tasks';
import { addDays, isoWeekday, todayOf } from '../../../domain/dates';
import type { IsoWeekday } from '../../../domain/types';
import { TimerProvider } from '../../../hooks/useTimer';
import { TodayPage } from '../TodayPage';

const TODAY = todayOf(Date.now(), 0);

function habitInput(overrides: Partial<HabitInput> = {}): HabitInput {
  return {
    name: '물 마시기',
    note: '',
    color: 'blue',
    emoji: null,
    schedule: { type: 'daily' },
    goal: { type: 'check' },
    startDate: addDays(TODAY, -30),
    ...overrides,
  };
}

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <TimerProvider>
            <TodayPage />
          </TimerProvider>
        ),
      },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.tasks.clear(),
    db.habits.clear(),
    db.habitLogs.clear(),
    db.focusSessions.clear(),
    db.projects.clear(),
    db.tags.clear(),
    db.kv.clear(),
  ]);
});

describe('오늘 화면', () => {
  it('어제 마감·오늘 마감·마감 없는 할 일이 각각 맞는 그룹에 나온다', async () => {
    await createTask({ title: '어제 마감', dueDate: addDays(TODAY, -1) });
    await createTask({ title: '오늘 마감', dueDate: TODAY });
    await createTask({ title: '마감 없는 할 일' });
    await createTask({ title: '내일 마감', dueDate: addDays(TODAY, 1) });
    renderPage();

    const overdue = await screen.findByRole('region', { name: '지난 할 일' });
    expect(within(overdue).getByText('어제 마감')).toBeInTheDocument();
    expect(within(overdue).getByText(/지남/)).toBeInTheDocument();

    const due = screen.getByRole('region', { name: '오늘 마감' });
    expect(within(due).getByText('오늘 마감')).toBeInTheDocument();

    // 마감 없음은 기본 접힘
    const noDue = screen.getByRole('region', { name: '마감 없음' });
    expect(within(noDue).queryByText('마감 없는 할 일')).not.toBeInTheDocument();
    await userEvent.click(within(noDue).getByRole('button', { name: '마감 없음 1개' }));
    expect(within(noDue).getByText('마감 없는 할 일')).toBeInTheDocument();

    expect(screen.queryByText('내일 마감')).not.toBeInTheDocument();
  });

  it('빠른 추가는 마감이 오늘인 할 일을 만든다', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('새 할 일'), '보고서 쓰기{Enter}');
    await waitFor(async () => {
      const tasks = await db.tasks.toArray();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.dueDate).toBe(TODAY);
    });
    const due = await screen.findByRole('region', { name: '오늘 마감' });
    expect(within(due).getByText('보고서 쓰기')).toBeInTheDocument();
  });

  it('할 일을 체크하면 저장되고 "완료 n개"로 접혀 보인다', async () => {
    await createTask({ title: '운동', dueDate: TODAY });
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: '운동 완료' }));

    const done = await screen.findByRole('button', { name: '완료 1개' });
    expect(done).toHaveAttribute('aria-expanded', 'false');
    expect((await db.tasks.toArray())[0]?.status).toBe('done');
    expect(screen.queryByRole('region', { name: '오늘 마감' })).not.toBeInTheDocument();

    await userEvent.click(done);
    expect(screen.getByRole('checkbox', { name: '운동 완료' })).toBeChecked();
  });

  it('습관을 체크하면 기록되고 요약 카드가 바뀐다', async () => {
    await createHabit(habitInput(), TODAY);
    renderPage();
    const summary = await screen.findByRole('list', { name: '오늘 요약' });
    expect(await within(summary).findByText('0 / 1')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('checkbox', { name: '물 마시기 오늘 달성' }));
    await waitFor(async () => expect(await db.habitLogs.count()).toBe(1));
    expect(await within(summary).findByText('1 / 1')).toBeInTheDocument();
  });

  it('횟수형은 +/− 버튼으로 기록하고, weeklyCount는 이번 주 진행을 보여 준다', async () => {
    await createHabit(
      habitInput({ name: '물', goal: { type: 'count', target: 3, unit: '잔' } }),
      TODAY,
    );
    await createHabit(
      habitInput({ name: '운동', schedule: { type: 'weeklyCount', count: 3 } }),
      TODAY,
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '물 1 늘리기' }));
    await waitFor(async () => expect((await db.habitLogs.toArray())[0]?.value).toBe(1));
    expect(screen.getByText('이번 주 0/3')).toBeInTheDocument();
  });

  it('오늘 예정이 아닌 습관은 보이지 않는다', async () => {
    const todayWeekday = isoWeekday(TODAY);
    const other = ((todayWeekday % 7) + 1) as IsoWeekday; // 오늘이 아닌 요일
    await createHabit(
      habitInput({ name: '다른 요일', schedule: { type: 'weekdays', days: [other] } }),
      TODAY,
    );
    renderPage();
    expect(await screen.findByText(/오늘 예정된 습관이 없어요/)).toBeInTheDocument();
    expect(screen.queryByText('다른 요일')).not.toBeInTheDocument();
  });

  it('하루 시작 시각이 0이 아니면 날짜 헤더에 표시한다', async () => {
    await db.kv.put({ key: 'settings', dayStartHour: 4 } as never);
    renderPage();
    expect(await screen.findByText(/\(하루 시작 4시\)/)).toBeInTheDocument();
  });
});
