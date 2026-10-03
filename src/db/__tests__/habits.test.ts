import { beforeEach, describe, expect, it } from 'vitest';
import { parseLocalDate } from '../../domain/dates';
import type { LocalDate } from '../../domain/types';
import { ValidationError } from '../../domain/validation';
import { db } from '../db';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  moveHabit,
  restoreHabit,
  updateHabit,
  type HabitInput,
} from '../repositories/habits';
import { adjustHabitLog, setHabitLog, toggleHabitLog } from '../repositories/habitLogs';

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`잘못된 날짜: ${text}`);
  return date;
}

// 2026-10-03은 토요일
const TODAY = d('2026-10-03');

function input(overrides: Partial<HabitInput> = {}): HabitInput {
  return {
    name: '물 마시기',
    note: '',
    color: 'blue',
    emoji: null,
    schedule: { type: 'daily' },
    goal: { type: 'check' },
    startDate: d('2026-09-01'),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.habits.clear(), db.habitLogs.clear()]);
});

describe('habits repository', () => {
  it('만들 때 입력을 정리하고 order를 뒤에 붙인다', async () => {
    const a = await createHabit(input({ name: '  운동  ', emoji: ' 💪 ' }), TODAY, 1000);
    const b = await createHabit(input({ name: '독서' }), TODAY, 2000);
    expect(a).toMatchObject({
      name: '운동',
      emoji: '💪',
      archivedOn: null,
      order: 0,
      createdAt: 1000,
    });
    expect(b.order).toBe(1);
  });

  it('요일을 7개 모두 고르면 daily로 저장한다', async () => {
    const habit = await createHabit(
      input({ schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] } }),
      TODAY,
    );
    expect((await db.habits.get(habit.id))?.schedule).toEqual({ type: 'daily' });
  });

  it('잘못된 입력은 저장하지 않는다', async () => {
    await expect(createHabit(input({ name: '   ' }), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      createHabit(input({ goal: { type: 'count', target: 1, unit: '잔' } }), TODAY),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createHabit(input({ schedule: { type: 'weekdays', days: [] } }), TODAY),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(createHabit(input({ startDate: d('2024-01-01') }), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.habits.count()).toBe(0);
  });

  it('수정해도 기록은 지우지 않는다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await setHabitLog(habit.id, TODAY, 5, TODAY);

    const updated = await updateHabit(
      habit.id,
      input({ goal: { type: 'check' }, schedule: { type: 'weeklyCount', count: 3 } }),
      TODAY,
      5000,
    );
    expect(updated).toMatchObject({
      goal: { type: 'check' },
      schedule: { type: 'weeklyCount', count: 3 },
      updatedAt: 5000,
    });
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(5);
  });

  it('이미 있는 오래된 시작일은 그대로 두면 수정할 수 있다', async () => {
    const habit = await createHabit(input({ startDate: d('2025-10-03') }), TODAY);
    // 1년 + 며칠 뒤 오늘 → 시작일이 365일을 넘었지만 시작일을 바꾸지 않으면 통과
    const later = d('2026-12-01');
    await expect(
      updateHabit(habit.id, input({ name: '새 이름', startDate: d('2025-10-03') }), later),
    ).resolves.toMatchObject({ name: '새 이름' });
    await expect(
      updateHabit(habit.id, input({ startDate: d('2025-10-04') }), later),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('이미 삭제된 습관을 수정하면 아무 일도 없다', async () => {
    const habit = await createHabit(input(), TODAY);
    await deleteHabit(habit.id);
    expect(await updateHabit(habit.id, input({ name: '유령' }), TODAY)).toBeNull();
    expect(await db.habits.count()).toBe(0);
  });

  it('순서 이동: 이웃과 맞바꾸고 맨 끝에서는 아무 일도 없다', async () => {
    const a = await createHabit(input({ name: 'a' }), TODAY);
    const b = await createHabit(input({ name: 'b' }), TODAY);
    const c = await createHabit(input({ name: 'c' }), TODAY);
    const names = async () => (await db.habits.orderBy('order').toArray()).map((h) => h.name);

    await moveHabit(c.id, -1);
    expect(await names()).toEqual(['a', 'c', 'b']);
    await moveHabit(a.id, -1);
    expect(await names()).toEqual(['a', 'c', 'b']);
    await moveHabit(b.id, 1);
    expect(await names()).toEqual(['a', 'c', 'b']);
    await moveHabit(a.id, 1);
    expect(await names()).toEqual(['c', 'a', 'b']);
  });

  it('순서 이동은 보관한 습관을 건너뛰고 같은 목록 안에서만 움직인다', async () => {
    await createHabit(input({ name: 'a' }), TODAY);
    const b = await createHabit(input({ name: 'b' }), TODAY);
    const c = await createHabit(input({ name: 'c' }), TODAY);
    await archiveHabit(b.id, TODAY);

    await moveHabit(c.id, -1); // 진행 중에서는 a 다음 → a와 맞바꿈
    const active = (await db.habits.orderBy('order').toArray())
      .filter((h) => h.archivedOn === null)
      .map((h) => h.name);
    expect(active).toEqual(['c', 'a']);
    expect((await db.habits.get(b.id))?.archivedOn).toBe(TODAY);
  });

  it('보관하면 archivedOn=오늘, 복원하면 null. 기록은 그대로', async () => {
    const habit = await createHabit(input(), TODAY);
    await setHabitLog(habit.id, TODAY, 1, TODAY);

    await archiveHabit(habit.id, TODAY, 7000);
    expect(await db.habits.get(habit.id)).toMatchObject({ archivedOn: TODAY, updatedAt: 7000 });
    expect(await db.habitLogs.count()).toBe(1);

    await restoreHabit(habit.id, 8000);
    expect(await db.habits.get(habit.id)).toMatchObject({ archivedOn: null, updatedAt: 8000 });
  });

  it('삭제하면 그 습관의 기록만 함께 지운다', async () => {
    const keep = await createHabit(input({ name: '남길 것' }), TODAY);
    const drop = await createHabit(input({ name: '지울 것' }), TODAY);
    await setHabitLog(keep.id, TODAY, 1, TODAY);
    await setHabitLog(drop.id, TODAY, 1, TODAY);
    await setHabitLog(drop.id, d('2026-10-02'), 1, TODAY);

    await deleteHabit(drop.id);

    expect(await db.habits.get(drop.id)).toBeUndefined();
    expect(await db.habitLogs.where('habitId').equals(drop.id).count()).toBe(0);
    expect(await db.habitLogs.where('habitId').equals(keep.id).count()).toBe(1);
  });
});

describe('habitLogs repository', () => {
  it('체크형 토글: 기록 → 해제', async () => {
    const habit = await createHabit(input(), TODAY);
    expect(await toggleHabitLog(habit.id, TODAY, TODAY, 100)).toMatchObject({
      id: `${habit.id}:${TODAY}`,
      value: 1,
      updatedAt: 100,
    });
    expect(await db.habitLogs.count()).toBe(1);
    await toggleHabitLog(habit.id, TODAY, TODAY);
    expect(await db.habitLogs.count()).toBe(0);
  });

  it('count → check로 바뀐 습관의 값 3인 기록은 토글하면 해제된다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await setHabitLog(habit.id, TODAY, 3, TODAY);
    await updateHabit(habit.id, input({ goal: { type: 'check' } }), TODAY);

    await toggleHabitLog(habit.id, TODAY, TODAY);
    expect(await db.habitLogs.count()).toBe(0);
    await toggleHabitLog(habit.id, TODAY, TODAY);
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(1);
  });

  it('횟수형 +1을 8번 누르면 8이 되고, −1로 0까지 내리면 기록이 사라진다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    for (let i = 0; i < 8; i++) await adjustHabitLog(habit.id, TODAY, 1, TODAY);
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(8);

    for (let i = 0; i < 8; i++) await adjustHabitLog(habit.id, TODAY, -1, TODAY);
    expect(await db.habitLogs.count()).toBe(0);

    // 0에서 더 내려가도 음수 기록이 생기지 않는다
    await adjustHabitLog(habit.id, TODAY, -1, TODAY);
    expect(await db.habitLogs.count()).toBe(0);
  });

  it('값을 직접 정하고, 0이면 지운다. 체크형은 1로 저장한다', async () => {
    const counter = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await setHabitLog(counter.id, TODAY, 6, TODAY);
    expect((await db.habitLogs.get(`${counter.id}:${TODAY}`))?.value).toBe(6);
    await setHabitLog(counter.id, TODAY, 0, TODAY);
    expect(await db.habitLogs.count()).toBe(0);

    const check = await createHabit(input({ name: '체크' }), TODAY);
    await setHabitLog(check.id, TODAY, 5, TODAY);
    expect((await db.habitLogs.get(`${check.id}:${TODAY}`))?.value).toBe(1);
  });

  it('값은 정수 0~9,999만 받는다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await expect(setHabitLog(habit.id, TODAY, -1, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(setHabitLog(habit.id, TODAY, 1.5, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(setHabitLog(habit.id, TODAY, 10000, TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await setHabitLog(habit.id, TODAY, 9999, TODAY);
    await expect(adjustHabitLog(habit.id, TODAY, 1, TODAY)).rejects.toBeInstanceOf(ValidationError);
    expect((await db.habitLogs.get(`${habit.id}:${TODAY}`))?.value).toBe(9999);
  });

  it('7일 전은 기록할 수 있고 8일 전과 미래는 repository에서도 거부한다', async () => {
    const habit = await createHabit(input(), TODAY);
    await toggleHabitLog(habit.id, d('2026-09-26'), TODAY);
    expect(await db.habitLogs.count()).toBe(1);

    await expect(toggleHabitLog(habit.id, d('2026-09-25'), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(toggleHabitLog(habit.id, d('2026-10-04'), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.habitLogs.count()).toBe(1);
  });

  it('범위 밖이면 지우는 것도 거부한다', async () => {
    const habit = await createHabit(input(), TODAY);
    await db.habitLogs.put({
      id: `${habit.id}:2026-09-20`,
      habitId: habit.id,
      date: d('2026-09-20'),
      value: 1,
      updatedAt: 0,
    });
    await expect(toggleHabitLog(habit.id, d('2026-09-20'), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.habitLogs.count()).toBe(1);
  });

  it('월·수·금 습관의 화요일은 거부한다', async () => {
    const habit = await createHabit(
      input({ schedule: { type: 'weekdays', days: [1, 3, 5] } }),
      TODAY,
    );
    await expect(toggleHabitLog(habit.id, d('2026-09-29'), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    ); // 화
    await toggleHabitLog(habit.id, d('2026-09-30'), TODAY); // 수
    expect(await db.habitLogs.count()).toBe(1);
  });

  it('보관한 습관의 보관일 이후와 시작일 이전은 거부한다', async () => {
    const habit = await createHabit(input({ startDate: d('2026-10-01') }), TODAY);
    await expect(toggleHabitLog(habit.id, d('2026-09-30'), TODAY)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await archiveHabit(habit.id, TODAY);
    await expect(toggleHabitLog(habit.id, TODAY, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await toggleHabitLog(habit.id, d('2026-10-02'), TODAY); // 보관 전날은 가능
    expect(await db.habitLogs.count()).toBe(1);
  });

  it('횟수형은 토글할 수 없다', async () => {
    const habit = await createHabit(
      input({ goal: { type: 'count', target: 8, unit: '잔' } }),
      TODAY,
    );
    await expect(toggleHabitLog(habit.id, TODAY, TODAY)).rejects.toBeInstanceOf(ValidationError);
  });

  it('없는 습관에 기록하면 아무 일도 없다', async () => {
    expect(await setHabitLog('없음', TODAY, 1, TODAY)).toBeNull();
    expect(await toggleHabitLog('없음', TODAY, TODAY)).toBeNull();
    expect(await db.habitLogs.count()).toBe(0);
  });
});
