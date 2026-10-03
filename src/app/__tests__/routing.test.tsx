import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ToastProvider } from '../../components/Toast';
import { db } from '../../db/db';
import { FocusPage } from '../../features/focus/FocusPage';
import { NotFoundPage } from '../../features/NotFoundPage';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { TodayPage } from '../../features/today/TodayPage';
import { AppLayout } from '../layout/AppLayout';
import { applyTheme } from '../theme';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <TodayPage /> },
          { path: 'focus', element: <FocusPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  // 실제 앱처럼 ToastProvider 아래에서 렌더한다(타이머가 토스트를 쓴다).
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

describe('라우팅', () => {
  it('없는 주소는 404 화면을 보여 준다', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '오늘로 가기' })).toBeInTheDocument();
  });

  it('메뉴로 다른 화면에 이동한다', async () => {
    await db.open();
    renderAt('/');
    await userEvent.click(screen.getAllByRole('link', { name: '집중' })[0] as HTMLElement);
    expect(screen.getByRole('heading', { name: '집중' })).toBeInTheDocument();
  });
});

describe('applyTheme', () => {
  it('수동 테마는 html과 localStorage 캐시에 반영되고, system이면 지워진다', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('haruteen:theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('haruteen:theme')).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('Esc로 취소하고 확인 버튼으로 확정한다', async () => {
    const calls: string[] = [];
    render(
      <ConfirmDialog
        title="삭제할까요?"
        message="되돌릴 수 없어요."
        confirmLabel="삭제"
        danger
        onConfirm={() => calls.push('confirm')}
        onCancel={() => calls.push('cancel')}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: '삭제할까요?' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(calls).toEqual(['cancel', 'confirm']);
  });
});
