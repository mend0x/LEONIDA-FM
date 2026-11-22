import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && import.meta.env.VITE_LEONIDA_PAGES !== '1' && import.meta.env.VITE_LEONIDA_CLOUDFLARE !== '1' && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
