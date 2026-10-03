import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { createTag } from '../../../db/repositories/tags';
import { createTask, updateTask } from '../../../db/repositories/tasks';
import { addDays, todayOf } from '../../../domain/dates';
import { TimerProvider } from '../../../hooks/useTimer';
import { TasksPage } from '../TasksPage';

function renderPage(path = '/tasks') {
  const router = createMemoryRouter(
    [
      {
        path: '/tasks',
        element: (
          <TimerProvider>
            <TasksPage />
          </TimerProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  return router;
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.tasks.clear(), db.projects.clear(), db.tags.clear(), db.kv.clear()]);
});

describe('할 일 화면', () => {
  it('검색어는 입력한 그대로 보이고, 잠시 뒤 목록과 주소에 반영된다', async () => {
    await createTask({ title: '하루 계획' });
    await createTask({ title: '장보기' });
    const router = renderPage();
    const search = await screen.findByLabelText('검색');
    await screen.findByText('장보기');

    await userEvent.type(search, '하루');
    expect(search).toHaveValue('하루');
    await waitFor(() => expect(screen.queryByText('장보기')).not.toBeInTheDocument());
    expect(screen.getByText('하루 계획')).toBeInTheDocument();
    expect(router.state.location.search).toContain('q=');

    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(search).toHaveValue('');
    expect(await screen.findByText('장보기')).toBeInTheDocument();
  });

  it('제목이 공백뿐이면 추가할 수 없고 이유를 보여 준다', async () => {
    renderPage();
    const input = await screen.findByLabelText('새 할 일');
    await userEvent.type(input, '   ');
    expect(screen.getByText('제목을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('추가하고 완료하면 진행 중 목록에서 사라지고 완료 탭에 나타난다', async () => {
    renderPage();
    await userEvent.type(await screen.findByLabelText('새 할 일'), '장보기{Enter}');
    expect(await screen.findByText('장보기')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: '장보기 완료' }));
    await waitFor(() => expect(screen.queryByText('장보기')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(await screen.findByText('장보기')).toBeInTheDocument();
  });

  it('메모의 HTML 태그는 글자 그대로 보이고 요소로 만들어지지 않는다', async () => {
    const task = await createTask({ title: '메모 시험' });
    await updateTask(task.id, { note: '<b>안녕</b>' });
    renderPage();
    await userEvent.click(await screen.findByText('메모 시험'));

    const dialog = await screen.findByRole('dialog', { name: '할 일 편집' });
    expect(within(dialog).getByLabelText('메모')).toHaveValue('<b>안녕</b>');
    expect(dialog.querySelector('b')).toBeNull();
  });

  it('편집 패널에서 제목을 바꾸면 500ms 뒤 저장된다', async () => {
    const task = await createTask({ title: '옛 제목' });
    renderPage();
    await userEvent.click(await screen.findByText('옛 제목'));
    const field = await screen.findByLabelText('제목');
    await userEvent.clear(field);
    await userEvent.type(field, '새 제목');

    await waitFor(async () => expect((await db.tasks.get(task.id))?.title).toBe('새 제목'), {
      timeout: 2000,
    });
  });

  async function seedOverdue() {
    const today = todayOf(Date.now(), 0);
    await createTask({ title: '어제 마감', dueDate: addDays(today, -1) });
    await createTask({ title: '오늘 마감', dueDate: today });
  }

  it('어제가 마감인 할 일에는 "지남" 표시가 붙는다', async () => {
    await seedOverdue();
    renderPage();
    const row = (await screen.findByText('어제 마감')).closest('li') as HTMLElement;
    expect(within(row).getByText(/지남 · /)).toBeInTheDocument();
    const todayRow = screen.getByText('오늘 마감').closest('li') as HTMLElement;
    expect(within(todayRow).queryByText(/지남/)).not.toBeInTheDocument();
  });

  it('지남 필터에는 지난 할 일만 나온다', async () => {
    await seedOverdue();
    renderPage('/tasks?due=overdue');
    expect(await screen.findByText('어제 마감')).toBeInTheDocument();
    expect(screen.queryByText('오늘 마감')).not.toBeInTheDocument();
  });

  it('태그를 두 개 고르면 두 태그를 모두 가진 할 일만 보인다', async () => {
    const x = await createTag('x', 'red');
    const y = await createTag('y', 'blue');
    const both = await createTask({ title: '둘 다' });
    const only = await createTask({ title: '하나만' });
    await updateTask(both.id, { tagIds: [x.id, y.id] });
    await updateTask(only.id, { tagIds: [x.id] });

    const router = renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'x' }));
    expect(screen.getByText('둘 다')).toBeInTheDocument();
    expect(screen.getByText('하나만')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'y' }));
    await waitFor(() => expect(screen.queryByText('하나만')).not.toBeInTheDocument());
    expect(screen.getByText('둘 다')).toBeInTheDocument();
    expect(router.state.location.search).toContain('tags=');
  });
});
