import { createRoot } from 'react-dom/client'
import { HelmetProvider } from "react-helmet-async";
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

const root = document.getElementById("root")!;

try {
  createRoot(root).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>
  );
} catch (err) {
  console.error('[Fatal] React failed to mount:', err);
  root.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:2rem">' +
    '<div><h1 style="font-size:1.5rem;margin-bottom:0.5rem">DragonCandy failed to load</h1>' +
    '<p style="color:#666">Please refresh or try again later.</p>' +
    '<button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;border-radius:9999px;background:#4DD9C0;color:#fff;border:none;font-weight:bold;cursor:pointer">Refresh</button>' +
    '</div></div>';
}
