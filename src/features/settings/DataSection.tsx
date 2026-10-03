import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  deleteAllData,
  MAX_BACKUP_BYTES,
  parseBackup,
  replaceAllData,
  type ParseBackupResult,
} from '../../db/backup';
import { useMetaQuery } from '../../db/repositories/kv';
import { useBackupExport } from '../../hooks/useBackupExport';
import fieldStyles from '../../components/Field.module.css';
import styles from './SettingsPage.module.css';

const DELETE_WORD = '삭제';

type Preview = { fileName: string; result: ParseBackupResult };

function formatDateTime(time: number): string {
  return new Date(time).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function ImportPreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const toast = useToast();
  const exportBackup = useBackupExport();
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  // 내려받기가 끝났는지. 저장 대화상자를 취소해도 알 수 없으므로, 교체는 사용자가 따로 눌러야 한다.
  const [downloaded, setDownloaded] = useState(false);
  const { result } = preview;

  if (!result.ok) {
    return (
      <Modal
        title="불러올 수 없는 파일이에요"
        onClose={onClose}
        footer={<Button onClick={onClose}>닫기</Button>}
      >
        <div className={styles.modalBody}>
          <p>{preview.fileName}</p>
          <ul className={styles.list}>
            {result.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          {result.omitted > 0 && (
            <p className={fieldStyles.hint}>그 밖에 {result.omitted}개 더 있어요.</p>
          )}
          <p>현재 데이터는 그대로 있어요.</p>
        </div>
      </Modal>
    );
  }

  const { counts, cleanup } = result;
  const rows: [string, number][] = [
    ['할 일', counts.tasks],
    ['프로젝트', counts.projects],
    ['태그', counts.tags],
    ['습관', counts.habits],
    ['습관 기록', counts.habitLogs],
    ['집중 기록', counts.focusSessions],
  ];
  const warnings: string[] = [];
  if (cleanup.taskProjectCleared > 0) {
    warnings.push(
      `없는 프로젝트를 가리키던 할 일 ${cleanup.taskProjectCleared}개는 프로젝트 없음으로 바꿨어요.`,
    );
  }
  if (cleanup.taskTagsRemoved > 0) {
    warnings.push(`없는 태그 ${cleanup.taskTagsRemoved}개를 할 일에서 뗐어요.`);
  }
  if (cleanup.habitLogsRemoved > 0) {
    warnings.push(`습관이 없는 기록 ${cleanup.habitLogsRemoved}개는 버렸어요.`);
  }

  const needsDownload = backupFirst && !downloaded;

  const download = async () => {
    setBusy(true);
    try {
      await exportBackup();
      setDownloaded(true);
    } catch {
      toast.show({ message: '현재 데이터를 내려받지 못해서 불러오기를 멈췄어요.' });
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    setBusy(true);
    try {
      await replaceAllData(result.data);
      toast.show({ message: '백업을 불러왔어요.' });
      onClose();
    } catch {
      toast.show({ message: '불러오지 못했어요. 기존 데이터는 그대로예요.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="백업 불러오기"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          {needsDownload ? (
            <Button variant="primary" onClick={() => void download()} disabled={busy}>
              현재 데이터 내려받기
            </Button>
          ) : (
            <Button variant="danger" onClick={() => void replace()} disabled={busy}>
              {downloaded ? '내려받았어요, 교체하기' : '현재 데이터를 교체하기'}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.modalBody}>
        <p>
          {preview.fileName} · {formatDateTime(result.exportedAt)}에 내보낸 파일
        </p>
        <dl className={styles.counts}>
          {rows.map(([label, count]) => (
            <div key={label} className={styles.countRow}>
              <dt>{label}</dt>
              <dd>{count.toLocaleString('ko-KR')}개</dd>
            </div>
          ))}
        </dl>
        {warnings.length > 0 && (
          <ul className={styles.list} aria-label="정리한 내용">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <p className={styles.warning}>현재 데이터는 모두 교체됩니다.</p>
        {downloaded && (
          <p className={fieldStyles.hint}>
            내려받은 파일이 저장됐는지 확인한 뒤 “내려받았어요, 교체하기”를 눌러 주세요.
          </p>
        )}
        <Checkbox
          label="교체 전에 현재 데이터 내려받기"
          checked={backupFirst}
          disabled={busy}
          onChange={(e) => setBackupFirst(e.target.checked)}
        />
      </div>
    </Modal>
  );
}

function DeleteAllModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteAllData();
      toast.show({ message: '모든 데이터를 삭제했어요.' });
      onClose();
    } catch {
      toast.show({ message: '삭제하지 못했어요.' });
      setBusy(false);
    }
  };

  return (
    <Modal
      title="모든 데이터 삭제"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={word !== DELETE_WORD || busy}
            onClick={() => void remove()}
          >
            전체 삭제
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        <p className={styles.warning}>
          할 일, 습관, 집중 기록, 설정이 모두 지워지고 되돌릴 수 없어요. 먼저 백업을 내려받아 두는
          것을 권해요.
        </p>
        <Input
          label={`계속하려면 "${DELETE_WORD}"라고 입력해 주세요`}
          value={word}
          autoComplete="off"
          onChange={(e) => setWord(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export function DataSection() {
  const toast = useToast();
  const meta = useMetaQuery();
  const exportBackup = useBackupExport();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const doExport = () => {
    exportBackup().then(
      () => toast.show({ message: '백업 파일을 내려받았어요.' }),
      () => toast.show({ message: '백업하지 못했어요.' }),
    );
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 골라도 change가 나도록
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setPreview({
        fileName: file.name,
        result: {
          ok: false,
          errors: ['파일이 너무 커요. 20MB 이하만 불러올 수 있어요.'],
          omitted: 0,
        },
      });
      return;
    }
    file.text().then(
      (content) => setPreview({ fileName: file.name, result: parseBackup(content) }),
      () => toast.show({ message: '파일을 읽지 못했어요.' }),
    );
  };

  return (
    <section className={styles.section} aria-labelledby="settings-data">
      <h2 id="settings-data" className={styles.heading}>
        데이터
      </h2>
      <p className={fieldStyles.hint}>
        데이터는 이 브라우저에만 저장돼요. 정기적으로 백업 파일을 내려받아 두세요.
      </p>
      <p>
        마지막 백업:{' '}
        <strong>{meta?.lastBackupAt ? formatDateTime(meta.lastBackupAt) : '아직 없어요'}</strong>
      </p>
      <div className={styles.buttons}>
        <Button variant="primary" onClick={doExport}>
          백업 내보내기
        </Button>
        <Button onClick={() => fileInput.current?.click()}>백업 불러오기</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className={styles.hiddenInput}
          aria-label="백업 파일 선택"
          tabIndex={-1}
          onChange={onFile}
        />
      </div>
      <div className={styles.group}>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          모든 데이터 삭제
        </Button>
      </div>
      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {deleting && <DeleteAllModal onClose={() => setDeleting(false)} />}
    </section>
  );
}
