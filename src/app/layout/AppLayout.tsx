import { Outlet } from 'react-router';
import { TimerProvider } from '../../hooks/useTimer';
import { BottomTabs } from './BottomTabs';
import { Sidebar } from './Sidebar';
import { useMiniBarVisible } from './useMiniBarVisible';
import styles from './AppLayout.module.css';

function Shell() {
  const miniBar = useMiniBarVisible();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={`${styles.main} ${miniBar ? styles.withMiniBar : ''}`}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <BottomTabs />
    </div>
  );
}

export function AppLayout() {
  // 타이머는 어느 화면에 있든 계속 동작해야 하므로 레이아웃 바로 아래에서 한 번만 만든다.
  return (
    <TimerProvider>
      <Shell />
    </TimerProvider>
  );
}
