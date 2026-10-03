import { useState } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useHasData } from '../../db/backup';
import { updateMeta, useMetaQuery } from '../../db/repositories/kv';
import { shouldRemindBackup, snoozeUntil } from '../../domain/backup';
import { useBackupExport } from '../../hooks/useBackupExport';
import styles from './BackupBanner.module.css';

/**
 * 백업 알림 배너 (DESIGN.md §5.2 오른쪽 열의 타이머 카드 아래, §8.3).
 * 데이터가 있고 마지막 백업이 없거나 14일이 지났으면 보인다. "나중에"는 7일간 숨긴다.
 */
export function BackupBanner() {
  const toast = useToast();
  const hasData = useHasData();
  const meta = useMetaQuery();
  const exportBackup = useBackupExport();
  // 렌더 중에 시계를 읽지 않도록 처음 한 번만 고정한다. 하루 안에 조건이 바뀌지 않으므로 충분하다.
  const [now] = useState(() => Date.now());

  if (hasData === undefined || meta === undefined) return null;
  if (!shouldRemindBackup(hasData, meta, now)) return null;

  const backupNow = () => {
    exportBackup().then(
      () => toast.show({ message: '백업 파일을 내려받았어요.' }),
      () => toast.show({ message: '백업하지 못했어요.' }),
    );
  };
  const later = () => {
    updateMeta({ backupReminderDismissedUntil: snoozeUntil(Date.now()) }).catch(() =>
      toast.show({ message: '저장하지 못했어요.' }),
    );
  };

  return (
    <section className={styles.banner} aria-labelledby="backup-banner-title">
      <h2 id="backup-banner-title" className={styles.title}>
        데이터를 백업해 두세요
      </h2>
      <p className={styles.text}>
        {meta.lastBackupAt === null
          ? '아직 백업한 적이 없어요.'
          : '마지막 백업이 2주 넘게 지났어요.'}{' '}
        데이터는 이 브라우저에만 저장돼 있어서, 브라우저 데이터를 지우면 사라져요.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" size="sm" onClick={backupNow}>
          지금 백업
        </Button>
        <Button variant="ghost" size="sm" onClick={later}>
          나중에
        </Button>
      </div>
    </section>
  );
}
