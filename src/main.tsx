import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error handlers — prevent unhandled errors from crashing the browser tab
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('[Global] Uncaught error:', event.error);
});

createRoot(document.getElementById("root")!).render(<App />);
