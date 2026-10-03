import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/Toast';
import { SCHEMA_VERSION } from '../../../config';
import { db } from '../../../db/db';
import { getMeta, getSettings, updateSettings } from '../../../db/repositories/kv';
import { createTask } from '../../../db/repositories/tasks';
import { BackupBanner } from '../../today/BackupBanner';
import { SettingsPage } from '../SettingsPage';

function renderSettings() {
  render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

function backupJson(titles: string[]): string {
  const now = Date.now();
  return JSON.stringify({
    app: 'haruteen',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    data: {
      tasks: titles.map((title, i) => ({
        id: `imp-${i}`,
        title,
        note: '',
        priority: 'medium',
        dueDate: null,
        projectId: 'ghost-project',
        tagIds: [],
        subtasks: [],
        status: 'todo',
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })),
      projects: [],
      tags: [],
      habits: [],
      habitLogs: [],
      focusSessions: [],
      settings: { focusMinutes: 40 },
    },
  });
}

function jsonFile(content: string, name = 'backup.json') {
  return new File([content], name, { type: 'application/json' });
}

const created = { url: vi.fn(() => 'blob:test'), revoke: vi.fn() };

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  created.url.mockClear();
  created.revoke.mockClear();
  URL.createObjectURL = created.url;
  URL.revokeObjectURL = created.revoke;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('설정 화면 — 날짜', () => {
  it('하루 시작 시각을 바꾸면 저장되고 영향 설명이 보인다', async () => {
    renderSettings();
    const select = await screen.findByLabelText('하루 시작 시각');
    expect(screen.getByText(/자정\(0시\)에 하루가 바뀌어요/)).toBeInTheDocument();
    await userEvent.selectOptions(select, '4');
    await waitFor(async () => expect((await getSettings()).dayStartHour).toBe(4));
    expect(await screen.findByText('새벽 0시~4시는 전날로 계산해요.')).toBeInTheDocument();
    expect(screen.getByText(/이미 기록한 습관 날짜는 바뀌지 않아요/)).toBeInTheDocument();
  });

  it('하루 시작이 4시면 새벽 3시에는 어제 날짜를 오늘로 보여 준다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 3, 3, 0) });
    try {
      renderSettings();
      expect(await screen.findByText(/10월 3일 토요일/)).toBeInTheDocument();
      await updateSettings({ dayStartHour: 4 });
      expect(await screen.findByText(/10월 2일 금요일/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('주 시작 요일을 일요일로 바꿀 수 있다', async () => {
    renderSettings();
    await userEvent.selectOptions(await screen.findByLabelText('한 주의 시작 요일'), '7');
    await waitFor(async () => expect((await getSettings()).weekStartsOn).toBe(7));
  });
});

describe('설정 화면 — 데이터', () => {
  it('내보내면 파일이 내려받아지고 마지막 백업 시각이 기록된다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: '백업 내보내기' }));
    await waitFor(async () => expect((await getMeta()).lastBackupAt).not.toBeNull());
    expect(created.url).toHaveBeenCalledTimes(1);
  });

  it('JSON이 아닌 파일은 거부하고 기존 데이터는 유지한다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile('이건 그냥 텍스트 파일입니다.', 'note.json'),
    );
    const dialog = await screen.findByRole('dialog', { name: '불러올 수 없는 파일이에요' });
    expect(within(dialog).getByText(/JSON 형식이 아니에요/)).toBeInTheDocument();
    expect(within(dialog).getByText('현재 데이터는 그대로 있어요.')).toBeInTheDocument();
    expect(await db.tasks.count()).toBe(1);
  });

  it('다른 앱의 JSON도 거부한다', async () => {
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile(JSON.stringify({ app: 'other', tasks: [] })),
    );
    expect(await screen.findByText('하루틴 백업 파일이 아니에요.')).toBeInTheDocument();
  });

  it('미리보기에 개수와 정리 내역·경고가 보이고, 교체 전 내려받기가 기본 체크다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile(backupJson(['가져온 일 1', '가져온 일 2'])),
    );
    const dialog = await screen.findByRole('dialog', { name: '백업 불러오기' });
    expect(within(dialog).getByText('할 일').nextSibling).toHaveTextContent('2개');
    expect(within(dialog).getByText(/프로젝트 없음으로 바꿨어요/)).toBeInTheDocument();
    expect(within(dialog).getByText('현재 데이터는 모두 교체됩니다.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('교체 전에 현재 데이터 내려받기')).toBeChecked();
    // 아직 아무것도 바뀌지 않았다
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['기존 할 일']);
  });

  it('교체하려면 먼저 내려받고, 내려받은 뒤 따로 눌러야 데이터가 바뀐다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile(backupJson(['가져온 일'])),
    );
    const dialog = await screen.findByRole('dialog', { name: '백업 불러오기' });
    expect(within(dialog).queryByRole('button', { name: /교체하기/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '현재 데이터 내려받기' }));

    // 내려받기만으로는 아무것도 바뀌지 않는다
    const replaceButton = await within(dialog).findByRole('button', {
      name: '내려받았어요, 교체하기',
    });
    expect(created.url).toHaveBeenCalledTimes(1);
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['기존 할 일']);

    await userEvent.click(replaceButton);
    await waitFor(async () =>
      expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['가져온 일']),
    );
    expect((await getSettings()).focusMinutes).toBe(40);
    expect((await db.tasks.toArray())[0]?.projectId).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // 설정 입력칸도 불러온 값으로 바뀐다
    expect(await screen.findByLabelText('집중 시간 (분)')).toHaveValue('40');
  });

  it('교체 전 내려받기를 끄면 내려받지 않는다', async () => {
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile(backupJson(['가져온 일'])),
    );
    const dialog = await screen.findByRole('dialog', { name: '백업 불러오기' });
    await userEvent.click(within(dialog).getByLabelText('교체 전에 현재 데이터 내려받기'));
    await userEvent.click(within(dialog).getByRole('button', { name: '현재 데이터를 교체하기' }));
    await waitFor(async () => expect(await db.tasks.count()).toBe(1));
    expect(created.url).not.toHaveBeenCalled();
  });

  it('미리보기에서 취소하면 아무것도 바뀌지 않는다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.upload(
      await screen.findByLabelText('백업 파일 선택'),
      jsonFile(backupJson(['가져온 일'])),
    );
    const dialog = await screen.findByRole('dialog', { name: '백업 불러오기' });
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['기존 할 일']);
  });

  it('전체 삭제는 "삭제"를 직접 입력해야 활성화된다', async () => {
    await createTask({ title: '기존 할 일' });
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: '모든 데이터 삭제' }));
    const dialog = await screen.findByRole('dialog', { name: '모든 데이터 삭제' });
    const confirm = within(dialog).getByRole('button', { name: '전체 삭제' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByRole('textbox'), '삭');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), '제');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    await waitFor(async () => expect(await db.tasks.count()).toBe(0));
  });
});

describe('설정 화면 — 정보', () => {
  it('앱 버전과 저장소 상태를 보여 준다', async () => {
    renderSettings();
    expect(await screen.findByText('앱 버전')).toBeInTheDocument();
    expect(screen.getByText('저장소 사용량')).toBeInTheDocument();
    expect(await screen.findByText(/영구 저장:/)).toBeInTheDocument();
  });

  it('개발 모드에서는 더미 데이터 생성 버튼이 보인다', async () => {
    renderSettings();
    expect(await screen.findByRole('button', { name: '더미 데이터 생성' })).toBeInTheDocument();
  });
});

describe('오늘 화면 백업 배너', () => {
  function renderBanner() {
    render(
      <ToastProvider>
        <BackupBanner />
      </ToastProvider>,
    );
  }

  it('데이터가 없으면 보이지 않는다', async () => {
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('데이터를 백업해 두세요')).not.toBeInTheDocument();
  });

  it('데이터가 있고 백업한 적이 없으면 보이고, "나중에"를 누르면 7일간 숨긴다', async () => {
    await createTask({ title: '기존 할 일' });
    renderBanner();
    expect(await screen.findByText('데이터를 백업해 두세요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '나중에' }));
    await waitFor(() =>
      expect(screen.queryByText('데이터를 백업해 두세요')).not.toBeInTheDocument(),
    );
    const until = (await getMeta()).backupReminderDismissedUntil;
    expect(until).not.toBeNull();
    expect((until ?? 0) - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
  });

  it('"지금 백업"을 누르면 내려받고 배너가 사라진다', async () => {
    await createTask({ title: '기존 할 일' });
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: '지금 백업' }));
    await waitFor(() =>
      expect(screen.queryByText('데이터를 백업해 두세요')).not.toBeInTheDocument(),
    );
    expect(created.url).toHaveBeenCalledTimes(1);
  });
});
