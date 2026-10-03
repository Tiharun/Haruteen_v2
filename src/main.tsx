import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';

const container = document.getElementById('root');
if (!container) throw new Error('#root 요소를 찾을 수 없어요.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
