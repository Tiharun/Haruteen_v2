import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { formatBytes, requestPersistentStorage, useStorageInfo } from '../../hooks/useStorage';
import fieldStyles from '../../components/Field.module.css';
import styles from './SettingsPage.module.css';

export function InfoSection() {
  const toast = useToast();
  const { info, refresh } = useStorageInfo();

  const askPersist = async () => {
    const granted = await requestPersistentStorage();
    refresh();
    toast.show({
      message: granted
        ? '영구 저장이 허용됐어요.'
        : '브라우저가 영구 저장을 허용하지 않았어요. 백업을 꼭 해 두세요.',
    });
  };

  let persistedText: string;
  if (info === null) persistedText = '확인 중…';
  else if (info.persisted === null) persistedText = '이 브라우저에서는 확인할 수 없어요.';
  else if (info.persisted) persistedText = '영구 저장됨 (브라우저가 임의로 지우지 않아요)';
  else persistedText = '영구 저장 안 됨 (저장 공간이 부족하면 브라우저가 지울 수 있어요)';

  const usageText =
    info?.usage != null
      ? `${formatBytes(info.usage)}${info.quota != null ? ` / ${formatBytes(info.quota)}` : ''}`
      : '알 수 없어요';

  return (
    <section className={styles.section} aria-labelledby="settings-info">
      <h2 id="settings-info" className={styles.heading}>
        정보
      </h2>
      <dl className={styles.counts}>
        <div className={styles.countRow}>
          <dt>앱 버전</dt>
          <dd>{__APP_VERSION__}</dd>
        </div>
        <div className={styles.countRow}>
          <dt>저장소 사용량</dt>
          <dd>{usageText}</dd>
        </div>
      </dl>
      <p>
        영구 저장: <strong>{persistedText}</strong>
      </p>
      {info?.supported && info.persisted === false && (
        <>
          <div>
            <Button onClick={() => void askPersist()}>영구 저장 요청하기</Button>
          </div>
          <p className={fieldStyles.hint}>
            브라우저가 거절할 수 있어요. 거절돼도 앱은 그대로 쓸 수 있지만 백업은 꼭 해 두세요.
          </p>
        </>
      )}
    </section>
  );
}
