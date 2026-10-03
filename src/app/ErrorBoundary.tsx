import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../components/Button';
import styles from './FullScreenMessage.module.css';

export function ErrorFallback({ error }: { error?: unknown }) {
  const detail = error instanceof Error ? error.message : undefined;
  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>문제가 생겼어요</h1>
      <p className={styles.text}>
        화면을 그리는 중 오류가 발생했어요. 저장된 데이터는 그대로예요. 새로고침해도 계속되면 개발자
        도구의 콘솔을 확인해 주세요.
      </p>
      {detail && <p className={styles.detail}>{detail}</p>}
      <Button variant="primary" onClick={() => window.location.reload()}>
        새로고침
      </Button>
    </div>
  );
}

interface State {
  error: unknown;
  failed: boolean;
}

/** 최상위 Error Boundary. 앱이 흰 화면으로 멈추지 않게 한다. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: undefined, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}
