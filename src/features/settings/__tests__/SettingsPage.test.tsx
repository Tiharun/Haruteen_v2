import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { getSettings, updateSettings } from '../../../db/repositories/kv';
import { SettingsPage } from '../SettingsPage';

function renderPage() {
  render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await db.open();
  await db.kv.clear();
});

describe('설정 화면 — 타이머·알림', () => {
  it('저장된 값이 있으면 입력칸에 그 값이 채워진다(기본값이 아니라)', async () => {
    await updateSettings({ focusMinutes: 30, longBreakInterval: 6 });
    renderPage();
    expect(await screen.findByLabelText('집중 시간 (분)')).toHaveValue('30');
    expect(screen.getByLabelText('긴 휴식 간격 (집중 몇 번마다) (회)')).toHaveValue('6');
  });

  it('범위를 벗어난 집중 시간은 이유를 보여 주고 저장하지 않는다', async () => {
    renderPage();
    const input = await screen.findByLabelText('집중 시간 (분)');
    await userEvent.clear(input);
    expect(
      screen.getByText('집중 시간은(는) 1~120분 사이의 정수로 입력해 주세요.'),
    ).toBeInTheDocument();

    await userEvent.type(input, '121');
    await userEvent.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await getSettings()).focusMinutes).toBe(25);
  });

  it('올바른 값은 칸을 벗어날 때 저장된다', async () => {
    renderPage();
    const input = await screen.findByLabelText('집중 시간 (분)');
    await userEvent.clear(input);
    await userEvent.type(input, '1');
    await userEvent.tab();
    await waitFor(async () => expect((await getSettings()).focusMinutes).toBe(1));
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('입력 도중의 값(1, 12)은 저장하지 않고 Enter로 확정한 값만 저장한다', async () => {
    renderPage();
    const input = await screen.findByLabelText('집중 시간 (분)');
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    expect((await getSettings()).focusMinutes).toBe(25);
    await userEvent.keyboard('{Enter}');
    await waitFor(async () => expect((await getSettings()).focusMinutes).toBe(45));
  });

  it('소수·글자는 거부한다', async () => {
    renderPage();
    const input = await screen.findByLabelText('짧은 휴식 (분)');
    await userEvent.clear(input);
    await userEvent.type(input, '2.5');
    await userEvent.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await getSettings()).shortBreakMinutes).toBe(5);
  });

  it('자동 시작 체크박스를 바꾸면 저장된다', async () => {
    renderPage();
    await userEvent.click(await screen.findByLabelText('집중이 끝나면 휴식을 자동으로 시작'));
    await waitFor(async () => expect((await getSettings()).autoStartBreak).toBe(true));
  });

  it('브라우저가 알림을 지원하지 않으면 안내하고 알림 체크박스를 막는다', async () => {
    renderPage();
    // jsdom에는 Notification이 없다
    expect(
      await screen.findByText('이 브라우저에서는 시스템 알림을 지원하지 않아요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('다른 탭을 보고 있을 때 끝나면 시스템 알림 보내기'),
    ).toBeDisabled();
  });
});
