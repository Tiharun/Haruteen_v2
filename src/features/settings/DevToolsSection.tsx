import { useState } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { DUMMY_COUNTS, insertDummyData } from '../../db/dummyData';
import { useSettings } from '../../hooks/useSettings';
import fieldStyles from '../../components/Field.module.css';
import styles from './SettingsPage.module.css';

/** 개발 모드(`import.meta.env.DEV`)에서만 그린다. 프로덕션 빌드에는 포함되지 않는다. (DESIGN.md §10) */
export function DevToolsSection() {
  const toast = useToast();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);

  const generate = () => {
    setBusy(true);
    insertDummyData(Date.now(), settings.dayStartHour)
      .then(
        () => toast.show({ message: '더미 데이터를 추가했어요.' }),
        () => toast.show({ message: '더미 데이터를 만들지 못했어요.' }),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section className={styles.section} aria-labelledby="settings-dev">
      <h2 id="settings-dev" className={styles.heading}>
        개발용
      </h2>
      <p className={fieldStyles.hint}>
        할 일 {DUMMY_COUNTS.tasks.toLocaleString('ko-KR')}개, 습관 기록{' '}
        {DUMMY_COUNTS.habitLogs.toLocaleString('ko-KR')}개, 집중 기록{' '}
        {DUMMY_COUNTS.focusSessions.toLocaleString('ko-KR')}개를 지금 데이터에 추가해요.
      </p>
      <div>
        <Button onClick={generate} disabled={busy}>
          더미 데이터 생성
        </Button>
      </div>
    </section>
  );
}
