import {
  CalendarCheck,
  ChartColumn,
  ListTodo,
  Repeat,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** 사이드바 메뉴. 모바일 하단 탭은 앞 4개 + 더보기(나머지). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: '오늘', icon: CalendarCheck },
  { to: '/tasks', label: '할 일', icon: ListTodo },
  { to: '/habits', label: '습관', icon: Repeat },
  { to: '/focus', label: '집중', icon: Timer },
  { to: '/stats', label: '통계', icon: ChartColumn },
  { to: '/settings', label: '설정', icon: Settings },
];

export const PRIMARY_TAB_COUNT = 4;
