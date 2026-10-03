import type { DueFilter, StatusFilter, TaskSort } from '../../domain/tasks';
import type { Priority } from '../../domain/types';

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export const STATUS_LABEL: Record<StatusFilter, string> = {
  todo: '진행 중',
  done: '완료',
  all: '전체',
};

export const DUE_LABEL: Record<DueFilter, string> = {
  all: '전체',
  overdue: '지남',
  today: '오늘',
  week: '이번 주',
  none: '마감 없음',
};

export const SORT_LABEL: Record<TaskSort, string> = {
  due: '마감일순',
  priority: '우선순위순',
  created: '최근 생성순',
  name: '이름순',
};
