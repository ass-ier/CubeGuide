import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { analyticsEnabled, redactPageView } from './analytics';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root element is missing.');
createRoot(root).render(
  <StrictMode>
    <App />
    {analyticsEnabled && <Analytics mode="production" beforeSend={redactPageView} />}
  </StrictMode>,
);
