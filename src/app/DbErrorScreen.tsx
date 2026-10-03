import { Button } from '../components/Button';
import styles from './FullScreenMessage.module.css';

/** IndexedDB를 열 수 없을 때(사생활 보호 모드·저장소 차단 등) 보여 주는 화면. (DESIGN.md §5.9) */
export function DbErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : undefined;
  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>데이터 저장소를 열 수 없어요</h1>
      <p className={styles.text}>
        하루틴은 데이터를 이 브라우저 안에만 저장해서, 저장소(IndexedDB)를 쓸 수 없으면 동작하지
        않아요. 아래 원인을 확인해 보세요.
      </p>
      <ul className={styles.text} style={{ textAlign: 'left' }}>
        <li>
          사생활 보호(시크릿) 모드에서는 저장소가 막혀 있을 수 있어요. 일반 창에서 열어 주세요.
        </li>
        <li>
          브라우저 설정에서 이 사이트의 쿠키·사이트 데이터 저장이 차단돼 있지 않은지 확인해 주세요.
        </li>
        <li>기기의 저장 공간이 가득 찼는지 확인해 주세요.</li>
      </ul>
      {detail && <p className={styles.detail}>{detail}</p>}
      <Button variant="primary" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}
