import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { getTimerState } from '../../../db/repositories/focus';
import { createTask, deleteTask } from '../../../db/repositories/tasks';
import { TimerProvider } from '../../../hooks/useTimer';
import { FocusPage } from '../FocusPage';

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: '/focus',
        element: (
          <TimerProvider>
            <FocusPage />
          </TimerProvider>
        ),
      },
    ],
    { initialEntries: ['/focus'] },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.kv.clear(), db.tasks.clear(), db.habits.clear(), db.focusSessions.clear()]);
});

describe('집중 화면', () => {
  it('시작 → 일시정지 → 재개 → 중단 (1분 미만이라 기록은 남지 않는다)', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '시작' }));
    expect(await screen.findByRole('button', { name: '일시정지' })).toBeInTheDocument();
    expect((await getTimerState()).status).toBe('running');

    await userEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(await screen.findByRole('button', { name: '재개' })).toBeInTheDocument();
    expect((await getTimerState()).status).toBe('paused');

    await userEvent.click(screen.getByRole('button', { name: '재개' }));
    await userEvent.click(await screen.findByRole('button', { name: '중단' }));
    expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument();
    expect((await getTimerState()).status).toBe('idle');
    expect(await db.focusSessions.count()).toBe(0);
  });

  it('진행 중에는 대상을 바꿀 수 없다', async () => {
    await createTask({ title: '보고서' });
    renderPage();
    const select = await screen.findByLabelText('집중 대상');
    await userEvent.selectOptions(select, '보고서');
    await waitFor(async () => expect((await getTimerState()).target?.titleSnapshot).toBe('보고서'));

    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await waitFor(() => expect(screen.getByLabelText('집중 대상')).toBeDisabled());
  });

  it('집중 중인 대상이 할 일이면 "할 일 완료" 버튼으로 할 일만 완료하고 타이머는 계속된다', async () => {
    const task = await createTask({ title: '보고서' });
    renderPage();
    await userEvent.selectOptions(await screen.findByLabelText('집중 대상'), '보고서');
    // 대상 저장이 끝나기 전에 시작을 누르면 revision이 달라 무시된다(§4.4). 저장을 기다린다.
    await waitFor(async () => expect((await getTimerState()).target?.titleSnapshot).toBe('보고서'));
    expect(screen.queryByRole('button', { name: '할 일 완료' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: '할 일 완료' }));

    await waitFor(async () => expect((await db.tasks.get(task.id))?.status).toBe('done'));
    expect((await getTimerState()).status).toBe('running');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '할 일 완료' })).not.toBeInTheDocument(),
    );
  });

  it('대상 할 일이 삭제돼도 오늘의 기록에 남고 "(삭제됨)"으로 표시된다', async () => {
    const task = await createTask({ title: '지울 일' });
    const now = Date.now();
    await db.focusSessions.put({
      id: 's1',
      target: { type: 'task', id: task.id, titleSnapshot: '지울 일' },
      targetId: task.id,
      startedAt: now - 1000,
      endedAt: now,
      plannedMs: 25 * 60_000,
      actualMs: 25 * 60_000,
      completed: true,
    });
    renderPage();
    const list = await screen.findByRole('list', { name: '오늘의 집중 기록' });
    expect(within(list).getByText('지울 일')).toBeInTheDocument();

    await deleteTask(task.id);
    expect(await within(list).findByText('지울 일 (삭제됨)')).toBeInTheDocument();
    expect(await db.focusSessions.count()).toBe(1);
  });

  it('오늘 기록이 없으면 안내 문구와 총합 0을 보여 준다', async () => {
    renderPage();
    expect(await screen.findByText(/아직 기록이 없어요/)).toBeInTheDocument();
    expect(screen.getByText(/총 0분 · 완료 0회/)).toBeInTheDocument();
  });

  it('오늘 총합은 완료와 중단 세션의 실제 시간을 더한다', async () => {
    const now = Date.now();
    const base = {
      target: null,
      targetId: null,
      plannedMs: 25 * 60_000,
      startedAt: now - 5000,
      endedAt: now,
    };
    await db.focusSessions.bulkPut([
      { ...base, id: 'a', actualMs: 25 * 60_000, completed: true },
      { ...base, id: 'b', actualMs: 5 * 60_000, completed: false, startedAt: now - 6000 },
    ]);
    renderPage();
    expect(await screen.findByText(/총 30분 · 완료 1회/)).toBeInTheDocument();
  });
});
