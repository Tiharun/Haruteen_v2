import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastOptions } from '../Toast';

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      띄우기
    </button>
  );
}

function renderToast(options: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '띄우기' }));
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('동작 버튼이 없으면 4초 뒤에 사라진다', () => {
    renderToast({ message: '저장했어요.' });
    advance(3900);
    expect(screen.getByText('저장했어요.')).toBeInTheDocument();
    advance(200);
    expect(screen.queryByText('저장했어요.')).not.toBeInTheDocument();
  });

  it('동작 버튼이 있으면 4초가 지나도 남아 있고, 10초 뒤에 사라진다', () => {
    renderToast({ message: '보관했어요.', action: { label: '되돌리기', onClick: vi.fn() } });
    advance(4100);
    expect(screen.getByText('보관했어요.')).toBeInTheDocument();
    advance(6000);
    expect(screen.queryByText('보관했어요.')).not.toBeInTheDocument();
  });

  it('마우스를 올려 두는 동안은 사라지지 않는다', () => {
    renderToast({ message: '저장했어요.' });
    const toast = screen.getByText('저장했어요.').parentElement as HTMLElement;
    fireEvent.mouseEnter(toast);
    advance(30_000);
    expect(screen.getByText('저장했어요.')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    advance(4100);
    expect(screen.queryByText('저장했어요.')).not.toBeInTheDocument();
  });

  it('버튼에 포커스가 있는 동안은 사라지지 않는다', () => {
    renderToast({ message: '보관했어요.', action: { label: '되돌리기', onClick: vi.fn() } });
    const button = screen.getByRole('button', { name: '되돌리기' });
    fireEvent.focus(button);
    advance(60_000);
    expect(screen.getByText('보관했어요.')).toBeInTheDocument();
    fireEvent.blur(button);
    advance(10_100);
    expect(screen.queryByText('보관했어요.')).not.toBeInTheDocument();
  });
});
