import { useEffect, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { NAV_ITEMS, PRIMARY_TAB_COUNT } from '../nav';
import { MiniTimer } from './MiniTimer';
import styles from './BottomTabs.module.css';

const PRIMARY = NAV_ITEMS.slice(0, PRIMARY_TAB_COUNT);
const MORE = NAV_ITEMS.slice(PRIMARY_TAB_COUNT);

export function BottomTabs() {
  // 열린 시점의 경로를 기억해 두면, 다른 화면으로 이동했을 때 자동으로 닫힌 것으로 본다.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const moreOpen = openedAt === pathname;
  const setMoreOpen = (open: boolean) => setOpenedAt(open ? pathname : null);
  const moreActive = MORE.some((item) => pathname.startsWith(item.to));

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenedAt(null);
        moreButtonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenedAt(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [moreOpen]);

  return (
    <div ref={rootRef} className={styles.root}>
      {moreOpen && (
        <div id="more-menu" className={styles.more}>
          {MORE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.moreLink} ${isActive ? styles.active : ''}`}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
      <MiniTimer variant="bar" />
      <nav aria-label="하단 메뉴" className={styles.bar}>
        {PRIMARY.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
          >
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          className={`${styles.tab} ${moreActive ? styles.active : ''}`}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <Ellipsis size={22} aria-hidden="true" />
          <span>더보기</span>
        </button>
      </nav>
    </div>
  );
}
