import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { db } from '../../../db/db';
import { archiveHabit, createHabit, type HabitInput } from '../../../db/repositories/habits';
import { setHabitLog } from '../../../db/repositories/habitLogs';
import { addDays, formatDateShort, isoWeekday, todayOf } from '../../../domain/dates';
import { HabitsPage } from '../HabitsPage';

const TODAY = todayOf(Date.now(), 0);

function input(overrides: Partial<HabitInput> = {}): HabitInput {
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

function renderPage(path = '/habits') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <HabitsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.habits.clear(), db.habitLogs.clear(), db.kv.clear()]);
});

describe('습관 화면', () => {
  it('습관이 없으면 첫 습관 만들기 버튼이 보이고, 대화상자로 만들 수 있다', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '첫 습관 만들기' }));

    const dialog = await screen.findByRole('dialog', { name: '습관 추가' });
    const save = within(dialog).getByRole('button', { name: '저장' });
    expect(save).toBeDisabled(); // 이름이 비어 있다

    await userEvent.type(within(dialog).getByLabelText('이름'), '독서');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(await screen.findByRole('heading', { name: '독서' })).toBeInTheDocument();
    expect((await db.habits.toArray()).map((h) => h.name)).toEqual(['독서']);
  });

  it('이름이 공백뿐이면 저장할 수 없고 이유를 보여 준다', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '첫 습관 만들기' }));
    const dialog = await screen.findByRole('dialog', { name: '습관 추가' });
    const name = within(dialog).getByLabelText('이름');
    await userEvent.type(name, '   ');
    await userEvent.tab();

    expect(within(dialog).getByText('습관 이름을 입력해 주세요.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('체크형: 오늘 칸을 누르면 달성, 다시 누르면 해제된다', async () => {
    const habit = await createHabit(input(), TODAY);
    renderPage();
    const cell = await screen.findByRole('button', { name: `${formatDateShort(TODAY)} 미달성` });
    await userEvent.click(cell);

    await screen.findByRole('button', { name: `${formatDateShort(TODAY)} 달성` });
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: `${formatDateShort(TODAY)} 달성` }));
    await waitFor(async () => expect(await db.habitLogs.count()).toBe(0));
  });

  it('월·수·금 습관처럼 예정일이 아닌 칸은 눌러도 기록되지 않고 이유가 보인다', async () => {
    const todayWeekday = isoWeekday(TODAY);
    await createHabit(input({ schedule: { type: 'weekdays', days: [todayWeekday] } }), TODAY);
    renderPage();

    const strip = await screen.findByRole('list', { name: '물 마시기 최근 7일' });
    const yesterdayLabel = formatDateShort(addDays(TODAY, -1));
    const yesterday = within(strip).getByRole('button', {
      name: (name) => name.startsWith(yesterdayLabel) && name.includes('기록할 수 없음'),
    });
    expect(yesterday).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(yesterday);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '예정일이 아니라 기록할 수 없어요.',
    );
    expect(await db.habitLogs.count()).toBe(0);
  });

  it('횟수형: +를 8번 누르면 달성 표시, −로 0까지 내리면 기록이 사라진다', async () => {
    const habit = await createHabit(
      input({ name: '물', goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    renderPage();
    const plus = await screen.findByRole('button', { name: '물 1 늘리기' });
    const group = screen.getByRole('group', { name: `물 ${formatDateShort(TODAY)} 기록` });

    for (let i = 0; i < 7; i++) await userEvent.click(plus);
    await waitFor(() => expect(within(group).getByLabelText('물 기록 값')).toHaveValue('7'));
    expect(within(group).queryByText('달성')).not.toBeInTheDocument();

    await userEvent.click(plus);
    expect(await within(group).findByText('달성')).toBeInTheDocument();
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(8);

    const minus = screen.getByRole('button', { name: '물 1 줄이기' });
    for (let i = 0; i < 8; i++) await userEvent.click(minus);
    await waitFor(async () => expect(await db.habitLogs.count()).toBe(0));
    expect(within(group).queryByText('달성')).not.toBeInTheDocument();
  });

  it('횟수형: 값을 직접 입력할 수 있다', async () => {
    const habit = await createHabit(
      input({ name: '물', goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    renderPage();
    const field = await screen.findByLabelText('물 기록 값');
    await userEvent.clear(field);
    await userEvent.type(field, '5{Enter}');

    await waitFor(async () =>
      expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(5),
    );
  });

  it('횟수형: 잘못된 값을 입력하면 입력칸 아래에 이유가 보이고 기록되지 않는다', async () => {
    const habit = await createHabit(
      input({ name: '물', goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    renderPage();
    const field = await screen.findByLabelText('물 기록 값');
    await userEvent.clear(field);
    await userEvent.type(field, '12345{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('기록 값은 0~9,999');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveValue('12345'); // 고칠 수 있게 입력이 남는다
    expect(await db.habitLogs.get(`${habit.id}:${TODAY}`)).toBeUndefined();

    await userEvent.clear(field);
    await userEvent.type(field, '5{Enter}');
    await waitFor(async () =>
      expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(5),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('일정을 바꾸면 경고가 뜨고, 저장하면 새 일정이 적용된다', async () => {
    const habit = await createHabit(input(), TODAY);
    await setHabitLog(habit.id, TODAY, 1, TODAY);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '물 마시기 수정' }));

    const dialog = await screen.findByRole('dialog', { name: '습관 수정' });
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText('반복'), 'weeklyCount');
    expect(within(dialog).getByRole('status')).toHaveTextContent('새 기준으로 다시');

    await userEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(async () =>
      expect((await db.habits.get(habit.id))?.schedule).toEqual({ type: 'weeklyCount', count: 3 }),
    );
    expect(await db.habitLogs.count()).toBe(1); // 기록은 그대로
  });

  it('요일을 하나도 고르지 않으면 저장할 수 없다', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '첫 습관 만들기' }));
    const dialog = await screen.findByRole('dialog', { name: '습관 추가' });
    await userEvent.type(within(dialog).getByLabelText('이름'), '운동');
    await userEvent.selectOptions(within(dialog).getByLabelText('반복'), 'weekdays');
    for (const day of ['월', '수', '금']) {
      await userEvent.click(within(dialog).getByRole('button', { name: `${day}요일` }));
    }
    expect(within(dialog).getByText('요일을 하나 이상 골라 주세요.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('보관하면 목록에서 사라지고 보관함에 나타나며, 복원하면 돌아온다', async () => {
    await createHabit(input(), TODAY);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '물 마시기 보관' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '물 마시기' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: '보관함 (1)' }));
    expect(await screen.findByRole('heading', { name: '물 마시기' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '복원' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '물 마시기' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: '보관함 (0)' }));
    expect(await screen.findByRole('heading', { name: '물 마시기' })).toBeInTheDocument();
  });

  it('/habits?archived=1로 들어가면 보관함이 바로 열린다', async () => {
    const habit = await createHabit(input(), TODAY);
    await createHabit(input({ name: '스트레칭' }), TODAY);
    await archiveHabit(habit.id, TODAY);
    renderPage('/habits?archived=1');

    expect(await screen.findByRole('heading', { name: '물 마시기' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '스트레칭' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보관함 (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('삭제 확인창에 기록 개수가 보이고, 삭제하면 기록도 남지 않는다', async () => {
    const habit = await createHabit(input(), TODAY);
    await setHabitLog(habit.id, TODAY, 1, TODAY);
    await setHabitLog(habit.id, addDays(TODAY, -1), 1, TODAY);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '물 마시기 삭제' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('기록 2개');
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

    await waitFor(async () => expect(await db.habits.count()).toBe(0));
    expect(await db.habitLogs.count()).toBe(0);
  });

  it('위·아래 버튼으로 순서를 바꾼다', async () => {
    await createHabit(input({ name: '가' }), TODAY);
    await createHabit(input({ name: '나' }), TODAY);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '나 위로 이동' }));

    await waitFor(() => {
      const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(names).toEqual(['나', '가']);
    });
  });
});
