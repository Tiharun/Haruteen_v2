import { NavLink } from 'react-router';
import { APP_NAME } from '../../config';
import { NAV_ITEMS } from '../nav';
import { MiniTimer } from './MiniTimer';
import styles from './Sidebar.module.css';

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoMark} aria-hidden="true">
          ✓
        </span>
        <span className={styles.logoText}>{APP_NAME}</span>
      </div>
      <nav aria-label="주 메뉴" className={styles.nav}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className={styles.timerSlot}>
        <MiniTimer variant="sidebar" />
      </div>
    </aside>
  );
}
