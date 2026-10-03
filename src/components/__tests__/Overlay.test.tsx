import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Modal } from '../Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  const [rowShown, setRowShown] = useState(true);
  return (
    <main>
      {rowShown && (
        <button type="button" onClick={() => setOpen(true)}>
          행 열기
        </button>
      )}
      {open && (
        <Modal
          title="편집"
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              onClick={() => {
                setRowShown(false); // 열 때 눌렀던 버튼이 사라진다
                setOpen(false);
              }}
            >
              삭제
            </button>
          }
        >
          <p>내용</p>
        </Modal>
      )}
    </main>
  );
}

describe('Overlay 포커스 복원', () => {
  it('닫으면 열 때 누른 버튼으로 포커스가 돌아간다', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '행 열기' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });

  it('열 때 누른 버튼이 사라졌으면 본문(main)으로 포커스가 돌아간다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '행 열기' }));
    await userEvent.click(await screen.findByRole('button', { name: '삭제' }));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });
});
