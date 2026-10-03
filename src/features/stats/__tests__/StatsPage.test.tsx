import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../db/db';
import { achievementRate, toLogValues } from '../../../domain/habits';
import { parseLocalDate } from '../../../domain/dates';
import type { FocusSession, Habit, HabitLog, LocalDate } from '../../../domain/types';
import { StatsPage } from '../StatsPage';

const MIN = 60_000;
// 2026-10-03(토) 12:00. 월 시작 주는 9/28~10/4.
const NOW = new Date(2026, 9, 3, 12, 0);

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`잘못된 날짜: ${text}`);
  return date;
}
const at = (m: number, day: number, h = 10) => new Date(2026, m - 1, day, h, 0).getTime();

function session(
  id: string,
  startedAt: number,
  actualMs: number,
  extra: Partial<FocusSession> = {},
) {
  return {
    id,
    target: null,
    targetId: null,
    startedAt,
    endedAt: startedAt + actualMs,
    plannedMs: actualMs,
    actualMs,
    completed: true,
    ...extra,
  } satisfies FocusSession;
}

const habit: Habit = {
  id: 'h1',
  name: '물 마시기',
  note: '',
  color: 'blue',
  emoji: null,
  schedule: { type: 'daily' },
  goal: { type: 'check' },
  startDate: d('2026-09-01'),
  archivedOn: null,
  order: 0,
  createdAt: 0,
  updatedAt: 0,
};
const logs: HabitLog[] = ['2026-09-28', '2026-09-29', '2026-10-01'].map((date) => ({
  id: `h1:${date}`,
  habitId: 'h1',
  date: d(date),
  value: 1,
  updatedAt: 0,
}));

function renderPage() {
  render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('통계 화면', () => {
  it('데이터가 없으면 각 섹션에 빈 상태 문구를 보여 준다', async () => {
    renderPage();
    expect(await screen.findByText(/이 기간에는 집중 기록이 없어요/)).toBeInTheDocument();
    expect(screen.getByText('이 기간에 완료한 할 일이 없어요.')).toBeInTheDocument();
    expect(screen.getByText(/이 기간에 계산할 습관이 없어요/)).toBeInTheDocument();
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });

  it('이번 주 집중 합계·완료 수·하루 평균과 요일별 값(표)을 보여 준다', async () => {
    await db.focusSessions.bulkAdd([
      session('a', at(9, 28), 30 * MIN),
      session('b', at(10, 1), 60 * MIN, {
        target: { type: 'task', id: 't1', titleSnapshot: '보고서' },
        targetId: 't1',
      }),
      session('c', at(10, 3), 15 * MIN, { completed: false }),
      session('old', at(9, 20), 99 * MIN), // 지난주
    ]);
    renderPage();

    expect(await screen.findByText('1시간 45분')).toBeInTheDocument(); // 30+60+15
    expect(screen.getByText('2회')).toBeInTheDocument();
    expect(screen.getByText('17분')).toBeInTheDocument(); // 105분 / 6일 = 17.5분

    const chartTable = screen.getByRole('table', { name: /^\d.*집중 시간$/ });
    expect(within(chartTable).getByRole('row', { name: /9월 28일/ })).toHaveTextContent('30분');
    expect(within(chartTable).getByRole('row', { name: /10월 4일/ })).toHaveTextContent(
      '아직 오지 않음',
    );
    expect(screen.getByRole('table', { name: '대상별 집중 시간' })).toHaveTextContent('보고서');
    expect(screen.getByRole('table', { name: '대상별 집중 시간' })).toHaveTextContent('대상 없음');
  });

  it('다음 주로 이동하면 집계가 비고 안내가 나오며, "이번 주로"로 돌아온다', async () => {
    await db.focusSessions.add(session('a', at(10, 1), 30 * MIN));
    renderPage();
    await screen.findByText('30분', { selector: 'dd' });

    await userEvent.click(screen.getByRole('button', { name: '다음 주' }));
    expect(await screen.findByText('2026년 10월 5일 (월) ~ 10월 11일 (일)')).toBeInTheDocument();
    expect(screen.getAllByText('아직 오지 않은 기간이에요.').length).toBeGreaterThanOrEqual(3);
    const chartTable = screen.getByRole('table', { name: /^\d.*집중 시간$/ });
    expect(within(chartTable).getAllByText('아직 오지 않음')).toHaveLength(7);

    await userEvent.click(screen.getByRole('button', { name: '이번 주로' }));
    expect(await screen.findByText('30분', { selector: 'dd' })).toBeInTheDocument();
  });

  it('연 단위는 12개 월 막대(표 12행)를 보여 준다', async () => {
    await db.focusSessions.add(session('a', at(1, 15), 40 * MIN));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '연' }));
    const chartTable = await screen.findByRole('table', { name: '2026년 집중 시간' });
    expect(within(chartTable).getAllByRole('row')).toHaveLength(13); // 머리글 + 12개월
    expect(within(chartTable).getByRole('row', { name: /^1월/ })).toHaveTextContent('40분');
    expect(within(chartTable).getByRole('row', { name: /^11월/ })).toHaveTextContent(
      '아직 오지 않음',
    );
  });

  it('할 일: 기간 내 완료 수와 우선순위별 수', async () => {
    await db.tasks.bulkAdd(
      (['high', 'low', 'low'] as const).map((priority, i) => ({
        id: `t${i}`,
        title: `할 일 ${i}`,
        note: '',
        priority,
        dueDate: null,
        projectId: null,
        tagIds: [],
        subtasks: [],
        status: 'done' as const,
        completedAt: at(10, 1 + i),
        createdAt: 0,
        updatedAt: 0,
      })),
    );
    renderPage();
    const done = (await screen.findByText('완료한 할 일')).parentElement;
    expect(done).toHaveTextContent('3개');
    expect(screen.getByText('우선순위 낮음').parentElement).toHaveTextContent('2개');
  });

  it('습관 달성률이 습관 상세와 같은 계산(같은 기간)으로 표시된다', async () => {
    await db.habits.add(habit);
    await db.habitLogs.bulkAdd(logs);
    renderPage();

    const row = (await screen.findByRole('link', { name: '물 마시기' })).closest('tr');
    expect(row).not.toBeNull();
    // 9/28~10/2 예정 5일 중 3일 달성, 오늘(10/3) 미달성은 분모 제외
    const expected = achievementRate(
      habit,
      toLogValues(logs),
      d('2026-09-28'),
      d('2026-10-04'),
      d('2026-10-03'),
      1,
    );
    expect(expected).toMatchObject({ done: 3, total: 5 });
    expect(row).toHaveTextContent('60%');
    expect(row).toHaveTextContent('(3/5)');
    expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(2); // 전체 달성률 카드 + 표
    await waitFor(() => expect(row).toHaveTextContent('0일')); // 오늘 미달성 + 어제 미달성이므로 현재 연속 0
  });
});
