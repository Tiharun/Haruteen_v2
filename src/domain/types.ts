// DESIGN.md §3 데이터 모델. 순수 타입만 둔다.

export type ID = string;
export type EpochMs = number;
export type LocalDate = string & { readonly __brand: 'LocalDate' };
export type ColorKey = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple';
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const COLOR_KEYS: readonly ColorKey[] = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
];

export type Priority = 'high' | 'medium' | 'low';

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task {
  id: ID;
  title: string;
  note: string;
  priority: Priority;
  dueDate: LocalDate | null;
  projectId: ID | null;
  tagIds: ID[];
  subtasks: Subtask[];
  status: 'todo' | 'done';
  completedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface Project {
  id: ID;
  name: string;
  color: ColorKey;
  order: number;
  createdAt: EpochMs;
}

export interface Tag {
  id: ID;
  name: string;
  color: ColorKey;
  createdAt: EpochMs;
}

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: IsoWeekday[] }
  | { type: 'weeklyCount'; count: number };

export type HabitGoal = { type: 'check' } | { type: 'count'; target: number; unit: string };

export interface Habit {
  id: ID;
  name: string;
  note: string;
  color: ColorKey;
  emoji: string | null;
  schedule: HabitSchedule;
  goal: HabitGoal;
  startDate: LocalDate;
  archivedOn: LocalDate | null;
  order: number;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface HabitLog {
  id: string;
  habitId: ID;
  date: LocalDate;
  value: number;
  updatedAt: EpochMs;
}

export type FocusTarget = { type: 'task' | 'habit'; id: ID; titleSnapshot: string } | null;

export interface FocusSession {
  id: ID;
  target: FocusTarget;
  targetId: ID | null;
  startedAt: EpochMs;
  endedAt: EpochMs;
  plannedMs: number;
  actualMs: number;
  completed: boolean;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Settings {
  key: 'settings';
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  notificationsEnabled: boolean;
  showTimerInTitle: boolean;
  dayStartHour: number;
  weekStartsOn: 1 | 7;
  theme: ThemeSetting;
}

export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';

export interface TimerState {
  key: 'timer';
  revision: number;
  runId: ID | null;
  phase: TimerPhase;
  status: 'idle' | 'running' | 'paused';
  target: FocusTarget;
  plannedMs: number;
  accumulatedMs: number;
  runningSince: EpochMs | null;
  firstStartedAt: EpochMs | null;
  completedFocusInSet: number;
}

export interface Meta {
  key: 'meta';
  lastBackupAt: EpochMs | null;
  backupReminderDismissedUntil: EpochMs | null;
}
