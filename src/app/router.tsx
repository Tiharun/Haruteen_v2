import { createBrowserRouter } from 'react-router';
import { FocusPage } from '../features/focus/FocusPage';
import { HabitDetailPage } from '../features/habits/HabitDetailPage';
import { HabitsPage } from '../features/habits/HabitsPage';
import { NotFoundPage } from '../features/NotFoundPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { StatsPage } from '../features/stats/StatsPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { TodayPage } from '../features/today/TodayPage';
import { ErrorFallback } from './ErrorBoundary';
import { AppLayout } from './layout/AppLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorFallback />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'habits', element: <HabitsPage /> },
      { path: 'habits/:id', element: <HabitDetailPage /> },
      { path: 'focus', element: <FocusPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
