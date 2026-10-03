import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { createHabit, type HabitInput } from '../../../db/repositories/habits';
import { setHabitLog } from '../../../db/repositories/habitLogs';
import { addDays, formatDateLong, todayOf } from '../../../domain/dates';
import type { LocalDate } from '../../../domain/types';
import { HabitDetailPage } from '../HabitDetailPage';

const TODAY = todayOf(Date.now(), 0);

function input(overrides: Partial<HabitInput> = {}): HabitInput {
  return {
    name: '물 마시기',
    note: '',
    color: 'blue',
    emoji: null,
    schedule: { type: 'daily' },
    goal: { type: 'check' },
    startDate: addDays(TODAY, -60),
    ...overrides,
  };
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/habits/:id', element: <HabitDetailPage /> }], {
    initialEntries: [path],
  });
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.habits.clear(),
    db.habitLogs.clear(),
    db.focusSessions.clear(),
    db.kv.clear(),
  ]);
});

describe('습관 상세 화면', () => {
  it('없는 습관 주소에서는 안내 화면과 목록 링크가 보인다', async () => {
    renderAt('/habits/abc');
    expect(
      await screen.findByText('주소가 잘못됐거나 이미 삭제된 습관이에요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '습관 목록으로' })).toHaveAttribute('href', '/habits');
  });

  it('히트맵 셀에 날짜·상태가 aria-label과 title로 들어 있고, 누적 집중 시간을 보여 준다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await setHabitLog(habit.id, addDays(TODAY, -1), 8, TODAY);
    await setHabitLog(habit.id, addDays(TODAY, -2), 3, TODAY);
    await db.focusSessions.add({
      id: 's1',
      target: { type: 'habit', id: habit.id, titleSnapshot: habit.name },
      targetId: habit.id,
      startedAt: Date.now() - 3_600_000,
      endedAt: Date.now() - 3_000_000,
      plannedMs: 1_500_000,
      actualMs: 1_500_000,
      completed: true,
    });
    renderAt(`/habits/${habit.id}`);

    expect(await screen.findByRole('heading', { name: '물 마시기' })).toBeInTheDocument();
    const heatmap = screen.getByRole('group', { name: '물 마시기 최근 53주 기록' });
    const done = `${formatDateLong(addDays(TODAY, -1))}, 달성 8/8잔`;
    const partial = `${formatDateLong(addDays(TODAY, -2))}, 일부 3/8잔`;
    expect(within(heatmap).getByRole('img', { name: done })).toBeInTheDocument();
    expect(within(heatmap).getByRole('img', { name: partial })).toBeInTheDocument();

    const titles = Array.from(heatmap.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(done);
    expect(titles).toContain(partial);
    expect(within(heatmap).getAllByRole('img')).toHaveLength(53 * 7);

    expect(await screen.findByText('25분')).toBeInTheDocument();
  });

  it('상태마다 다른 모양(채움·테두리·빗금)으로 그려진다', async () => {
    const habit = await createHabit(
      input({
        schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] },
        startDate: addDays(TODAY, -10),
      }),
      TODAY,
    );
    await setHabitLog(habit.id, addDays(TODAY, -1), 1, TODAY);
    renderAt(`/habits/${habit.id}`);
    const heatmap = await screen.findByRole('group', { name: '물 마시기 최근 53주 기록' });

    const rect = (date: LocalDate) =>
      within(heatmap).getByRole('img', { name: new RegExp(`^${formatDateLong(date)},`) });
    // CSS Modules는 테스트에서 비활성화되어 있으므로 클래스 이름이 아니라 상태 문구로 구분을 확인한다.
    expect(rect(addDays(TODAY, -1)).getAttribute('aria-label')).toMatch(/달성$/);
    expect(rect(addDays(TODAY, -2)).getAttribute('aria-label')).toMatch(/미달성$/);
    expect(rect(addDays(TODAY, -20)).getAttribute('aria-label')).toMatch(/기록 대상 아님$/);
  });

  it('월 달력: 오늘·7일 전은 기록할 수 있고 8일 전 칸은 눌러도 기록되지 않는다', async () => {
    const habit = await createHabit(input(), TODAY);
    renderAt(`/habits/${habit.id}`);
    await screen.findByRole('heading', { name: '물 마시기' });

    const cell = (date: LocalDate) =>
      screen.queryByRole('button', { name: new RegExp(`^${formatDateLong(date)},`) });
    const goTo = async (date: LocalDate) => {
      // 달력을 이동해 해당 날짜 칸이 보이게 한다. 이전 달 → 다음 달 순으로 찾는다.
      for (const step of ['이전 달', '이전 달', '다음 달', '다음 달', '다음 달', '다음 달']) {
        if (cell(date)) break;
        await userEvent.click(screen.getByRole('button', { name: step }));
      }
      const found = cell(date);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    };

    const old = await goTo(addDays(TODAY, -8));
    expect(old).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(old);
    expect(await db.habitLogs.count()).toBe(0);

    const boundary = await goTo(addDays(TODAY, -7));
    expect(boundary).not.toHaveAttribute('aria-disabled');

    const todayCell = await goTo(TODAY);
    expect(todayCell).not.toHaveAttribute('aria-disabled');
    await userEvent.click(todayCell);
    await waitFor(async () => expect(await db.habitLogs.count()).toBe(1));
  });
});
