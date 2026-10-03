import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../config';
import { parseLocalDate } from '../../domain/dates';
import type {
  Habit,
  HabitLog,
  LocalDate,
  Project,
  Tag,
  Task,
  TimerState,
} from '../../domain/types';
import {
  backupFileName,
  buildBackup,
  cleanReferences,
  deleteAllData,
  exportBackup,
  recordBackup,
  MAX_SHOWN_ERRORS,
  migrateBackupData,
  parseBackup,
  replaceAllData,
  type BackupData,
} from '../backup';
import { db } from '../db';
import { getTimerState } from '../repositories/focus';
import { getMeta, getSettings, updateSettings } from '../repositories/kv';

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (!date) throw new Error(`잘못된 날짜: ${text}`);
  return date;
}

const NOW = Date.UTC(2026, 9, 3, 3, 0, 0);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: '보고서 쓰기',
    note: '',
    priority: 'medium',
    dueDate: null,
    projectId: null,
    tagIds: [],
    subtasks: [],
    status: 'todo',
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
const project: Project = { id: 'p1', name: '회사', color: 'blue', order: 0, createdAt: NOW };
const tag: Tag = { id: 'g1', name: '급함', color: 'red', createdAt: NOW };
const habit: Habit = {
  id: 'h1',
  name: '물 마시기',
  note: '',
  color: 'blue',
  emoji: '💧',
  schedule: { type: 'daily' },
  goal: { type: 'count', target: 8, unit: '잔' },
  startDate: d('2026-09-01'),
  archivedOn: null,
  order: 0,
  createdAt: NOW,
  updatedAt: NOW,
};
const log: HabitLog = {
  id: 'h1:2026-10-02',
  habitId: 'h1',
  date: d('2026-10-02'),
  value: 5,
  updatedAt: NOW,
};

function sampleData(): BackupData {
  return {
    tasks: [
      task({
        projectId: 'p1',
        tagIds: ['g1'],
        subtasks: [{ id: 's1', title: '초안', done: true }],
        dueDate: d('2026-10-05'),
      }),
      task({ id: 't2', status: 'done', completedAt: NOW }),
    ],
    projects: [project],
    tags: [tag],
    habits: [habit],
    habitLogs: [log],
    focusSessions: [
      {
        id: 'f1',
        target: { type: 'task', id: 't1', titleSnapshot: '보고서 쓰기' },
        targetId: 't1',
        startedAt: NOW,
        endedAt: NOW + 1_500_000,
        plannedMs: 1_500_000,
        actualMs: 1_500_000,
        completed: true,
      },
    ],
    settings: { focusMinutes: 30, dayStartHour: 4, theme: 'dark' },
  };
}

function fileOf(data: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'haruteen',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: NOW,
    data,
    ...overrides,
  });
}

async function seed(data: BackupData) {
  await db.tasks.bulkAdd(data.tasks);
  await db.projects.bulkAdd(data.projects);
  await db.tags.bulkAdd(data.tags);
  await db.habits.bulkAdd(data.habits);
  await db.habitLogs.bulkAdd(data.habitLogs);
  await db.focusSessions.bulkAdd(data.focusSessions);
  await updateSettings(data.settings);
}

async function snapshot() {
  return {
    tasks: await db.tasks.toArray(),
    projects: await db.projects.toArray(),
    tags: await db.tags.toArray(),
    habits: await db.habits.toArray(),
    habitLogs: await db.habitLogs.toArray(),
    focusSessions: await db.focusSessions.toArray(),
    settings: await getSettings(),
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('백업 내보내기', () => {
  it('파일명은 haruteen-backup-YYYY-MM-DD.json', () => {
    expect(backupFileName(new Date(2026, 9, 3, 12).getTime())).toBe(
      'haruteen-backup-2026-10-03.json',
    );
  });

  it('형식·버전·타이머/메타 제외, 설정에는 key가 없다', async () => {
    await seed(sampleData());
    const backup = await buildBackup(NOW);
    expect(backup.app).toBe('haruteen');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.exportedAt).toBe(NOW);
    expect(Object.keys(backup.data).sort()).toEqual(
      ['focusSessions', 'habitLogs', 'habits', 'projects', 'settings', 'tags', 'tasks'].sort(),
    );
    expect(backup.data.settings).not.toHaveProperty('key');
    expect(backup.data.settings.focusMinutes).toBe(30);
  });

  it('파일을 만들기만 해서는 lastBackupAt이 바뀌지 않고, 내려받은 뒤 recordBackup으로 기록된다', async () => {
    await exportBackup(NOW);
    expect((await getMeta()).lastBackupAt).toBeNull();
    await recordBackup(NOW);
    expect((await getMeta()).lastBackupAt).toBe(NOW);
  });

  it('내보낸 파일을 그대로 다시 검증하면 통과하고 내용이 같다', async () => {
    await seed(sampleData());
    const { json } = await exportBackup(NOW);
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual({
      tasks: 2,
      projects: 1,
      tags: 1,
      habits: 1,
      habitLogs: 1,
      focusSessions: 1,
    });
    expect(result.cleanup).toEqual({
      taskProjectCleared: 0,
      taskTagsRemoved: 0,
      habitLogsRemoved: 0,
    });
    expect(result.data.tasks).toEqual(sampleData().tasks);
  });
});

describe('백업 불러오기 검증', () => {
  it('정상 파일은 통과한다', () => {
    expect(parseBackup(fileOf(sampleData())).ok).toBe(true);
  });

  it('JSON이 아니면 거부한다', () => {
    expect(parseBackup('안녕하세요, 그냥 텍스트 파일입니다.').ok).toBe(false);
  });

  it('다른 앱의 JSON은 거부한다', () => {
    expect(parseBackup(JSON.stringify({ name: 'other', items: [] })).ok).toBe(false);
    const result = parseBackup(fileOf(sampleData(), { app: 'other-app' }));
    expect(result).toMatchObject({ ok: false, errors: ['하루틴 백업 파일이 아니에요.'] });
  });

  it('현재보다 높은 schemaVersion은 거부한다', () => {
    const result = parseBackup(fileOf(sampleData(), { schemaVersion: SCHEMA_VERSION + 1 }));
    expect(result).toMatchObject({ ok: false, errors: ['더 새 버전에서 만든 백업이에요.'] });
  });

  it('올릴 수 없는 낮은 버전(0)은 거부한다', () => {
    expect(parseBackup(fileOf(sampleData(), { schemaVersion: 0 })).ok).toBe(false);
  });

  it('필드가 잘못되면 위치와 이유를 보여 준다', () => {
    const data = sampleData();
    data.tasks[1] = task({ id: 't2', title: 'x'.repeat(201) });
    const result = parseBackup(fileOf(data));
    expect(result).toMatchObject({ ok: false, errors: ['tasks[1].title: 200자 초과'] });
  });

  it('오류는 최대 5개만 보여 주고 나머지 개수를 알려 준다', () => {
    const data = sampleData();
    data.tasks = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}`, title: '' }));
    const result = parseBackup(fileOf(data));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(MAX_SHOWN_ERRORS);
    expect(result.omitted).toBe(3);
    expect(result.errors[0]).toBe('tasks[0].title: 비어 있음');
  });

  it('필수 항목이 없거나 형식이 틀리면 거부한다', () => {
    expect(parseBackup(fileOf({ tasks: [] })).ok).toBe(false);
    expect(parseBackup(fileOf({ ...sampleData(), tasks: 'nope' })).ok).toBe(false);
  });

  it('id가 겹치거나 습관 기록의 id가 맞지 않으면 거부한다', () => {
    const dup = sampleData();
    dup.tasks = [task(), task()];
    expect(parseBackup(fileOf(dup))).toMatchObject({
      ok: false,
      errors: ['tasks[1].id: id 중복'],
    });

    const badLog = sampleData();
    badLog.habitLogs = [{ ...log, id: 'other' }];
    expect(parseBackup(fileOf(badLog)).ok).toBe(false);
  });

  it('제목의 앞뒤 공백은 지우고, 공백뿐인 제목은 거부한다', () => {
    const ok = sampleData();
    ok.tasks = [task({ title: '  보고서  ' })];
    const parsed = parseBackup(fileOf(ok));
    expect(parsed.ok && parsed.data.tasks[0]?.title).toBe('보고서');

    const blank = sampleData();
    blank.tasks = [task({ title: '   ' })];
    expect(parseBackup(fileOf(blank))).toMatchObject({
      ok: false,
      errors: ['tasks[0].title: 비어 있음'],
    });
  });

  it('프로젝트·태그 이름이 대소문자만 달라도 중복으로 거부한다', () => {
    const projects = sampleData();
    projects.projects = [
      { ...project, id: 'p1', name: 'Work' },
      { ...project, id: 'p2', name: 'work' },
    ];
    expect(parseBackup(fileOf(projects))).toMatchObject({
      ok: false,
      errors: ['projects[1].name: 이름 중복'],
    });

    const tags = sampleData();
    tags.tags = [
      { ...tag, id: 'g1', name: 'Urgent' },
      { ...tag, id: 'g2', name: 'URGENT' },
    ];
    expect(parseBackup(fileOf(tags))).toMatchObject({
      ok: false,
      errors: ['tags[1].name: 이름 중복'],
    });
  });

  it('요일이 중복되거나 정렬돼 있지 않으면 거부한다', () => {
    for (const days of [
      [1, 1, 3],
      [3, 1],
    ]) {
      const data = sampleData();
      data.habits = [{ ...habit, schedule: { type: 'weekdays', days } } as Habit];
      expect(parseBackup(fileOf(data)).ok).toBe(false);
    }
    const ok = sampleData();
    ok.habits = [{ ...habit, schedule: { type: 'weekdays', days: [1, 3, 5] } } as Habit];
    expect(parseBackup(fileOf(ok)).ok).toBe(true);
  });

  it('이모지는 그래핌 1개만 허용한다', () => {
    const two = sampleData();
    two.habits = [{ ...habit, emoji: '💧🔥' }];
    expect(parseBackup(fileOf(two)).ok).toBe(false);

    const family = sampleData();
    family.habits = [{ ...habit, emoji: '👨‍👩‍👧' }]; // 코드 포인트는 여러 개지만 그래핌은 1개
    expect(parseBackup(fileOf(family)).ok).toBe(true);
  });

  it('상태와 completedAt이 맞지 않는 할 일은 거부한다', () => {
    const doneWithoutTime = sampleData();
    doneWithoutTime.tasks = [task({ status: 'done', completedAt: null })];
    expect(parseBackup(fileOf(doneWithoutTime)).ok).toBe(false);

    const todoWithTime = sampleData();
    todoWithTime.tasks = [task({ status: 'todo', completedAt: NOW })];
    expect(parseBackup(fileOf(todoWithTime)).ok).toBe(false);
  });

  it('집중 기록의 targetId가 target.id와 다르면 거부한다', () => {
    const data = sampleData();
    const session = data.focusSessions[0];
    if (!session) throw new Error('시드에 집중 기록이 있어야 해요');
    data.focusSessions = [{ ...session, targetId: 'other' }];
    expect(parseBackup(fileOf(data))).toMatchObject({
      ok: false,
      errors: ['focusSessions[0].targetId: targetId가 target.id와 다름'],
    });

    const noTarget = sampleData();
    noTarget.focusSessions = [{ ...session, target: null, targetId: 't1' }];
    expect(parseBackup(fileOf(noTarget)).ok).toBe(false);
  });

  it('설정이 일부만 있어도 통과한다(나머지는 기본값)', () => {
    expect(parseBackup(fileOf({ ...sampleData(), settings: {} })).ok).toBe(true);
  });

  it('설정 값이 범위를 벗어나면 거부한다', () => {
    const data = { ...sampleData(), settings: { dayStartHour: 9 } };
    expect(parseBackup(fileOf(data))).toMatchObject({
      ok: false,
      errors: ['settings.dayStartHour: 6 초과'],
    });
  });
});

describe('참조 정리', () => {
  it('없는 projectId는 null로, 없는 tagId는 제거, 없는 습관의 기록은 삭제하고 개수를 센다', () => {
    const data = sampleData();
    data.tasks = [
      task({ id: 'a', projectId: 'ghost', tagIds: ['g1', 'ghost1', 'ghost2'] }),
      task({ id: 'b', projectId: 'p1' }),
    ];
    data.habitLogs = [log, { ...log, id: 'gone:2026-10-02', habitId: 'gone' }];

    const result = parseBackup(fileOf(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cleanup).toEqual({
      taskProjectCleared: 1,
      taskTagsRemoved: 2,
      habitLogsRemoved: 1,
    });
    expect(result.data.tasks[0]).toMatchObject({ projectId: null, tagIds: ['g1'] });
    expect(result.data.tasks[1]?.projectId).toBe('p1');
    expect(result.data.habitLogs).toEqual([log]);
    expect(result.counts.habitLogs).toBe(1);
  });

  it('입력 객체를 바꾸지 않는다', () => {
    const data = sampleData();
    data.tasks = [task({ projectId: 'ghost' })];
    cleanReferences(data);
    expect(data.tasks[0]?.projectId).toBe('ghost');
  });
});

describe('버전 마이그레이션 구조', () => {
  it('현재 버전은 그대로 통과하고, 올릴 방법이 없는 옛 버전은 null', () => {
    const data = sampleData();
    expect(migrateBackupData(data, SCHEMA_VERSION)).toBe(data);
    expect(migrateBackupData(data, 0)).toBeNull();
  });
});

describe('전체 교체', () => {
  it('내보낸 파일을 전체 삭제한 뒤 불러오면 데이터가 이전과 같다', async () => {
    await seed(sampleData());
    const before = await snapshot();
    const { json } = await exportBackup(NOW);

    await deleteAllData();
    expect((await snapshot()).tasks).toEqual([]);

    const parsed = parseBackup(json);
    if (!parsed.ok) throw new Error('검증 실패');
    await replaceAllData(parsed.data);
    expect(await snapshot()).toEqual(before);
  });

  it('기존 데이터는 모두 교체되고 타이머는 idle로 초기화된다(revision은 올라간다)', async () => {
    await seed(sampleData());
    const running: TimerState = {
      key: 'timer',
      revision: 7,
      runId: 'r1',
      phase: 'focus',
      status: 'running',
      target: null,
      plannedMs: 1_500_000,
      accumulatedMs: 0,
      runningSince: NOW,
      firstStartedAt: NOW,
      completedFocusInSet: 2,
    };
    await db.kv.put(running);

    await replaceAllData({
      ...sampleData(),
      tasks: [task({ id: 'only' })],
      habits: [],
      habitLogs: [],
    });

    expect((await db.tasks.toArray()).map((t) => t.id)).toEqual(['only']);
    expect(await db.habits.count()).toBe(0);
    expect(await getTimerState()).toMatchObject({
      status: 'idle',
      runId: null,
      revision: 8,
      completedFocusInSet: 0,
    });
  });

  it('백업 시각 메타는 유지한다', async () => {
    await recordBackup(NOW);
    await replaceAllData(sampleData());
    expect((await getMeta()).lastBackupAt).toBe(NOW);
  });

  it('중간에 실패하면 롤백되어 기존 데이터가 그대로 남는다', async () => {
    await seed(sampleData());
    const before = await snapshot();

    // 할 일은 정상이지만 습관 id가 겹쳐 중간에서 실패하게 만든다
    const broken: BackupData = {
      ...sampleData(),
      tasks: [task({ id: 'new-task' })],
      habits: [habit, habit],
    };
    await expect(replaceAllData(broken)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});

describe('전체 삭제', () => {
  it('모든 테이블이 비고 설정은 기본값으로 돌아간다', async () => {
    await seed(sampleData());
    await deleteAllData();
    const after = await snapshot();
    expect(after.tasks).toEqual([]);
    expect(after.habits).toEqual([]);
    expect(after.focusSessions).toEqual([]);
    expect(after.settings.focusMinutes).toBe(25);
    expect((await getMeta()).lastBackupAt).toBeNull();
  });
});
