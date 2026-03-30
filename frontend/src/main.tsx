import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

/** Local dev uses Vite’s /api proxy when VITE_BACKEND_ORIGIN is unset. Production must set both in Vercel (then redeploy). */
const missingProdEnv =
  import.meta.env.PROD
    ? [
        !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && 'VITE_CLERK_PUBLISHABLE_KEY',
        !import.meta.env.VITE_BACKEND_ORIGIN && 'VITE_BACKEND_ORIGIN',
      ].filter(Boolean)
    : [];

if (missingProdEnv.length) {
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.setAttribute(
    'style',
    'font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:1.5rem;line-height:1.5;color:#111'
  );
  box.innerHTML = `
    <h1 style="font-size:1.25rem;margin:0 0 0.75rem">Configuration missing</h1>
    <p style="margin:0 0 1rem">This build is missing environment variables (production). Add them in <strong>Vercel → Project → Settings → Environment Variables</strong>, then trigger a <strong>new deployment</strong>.</p>
    <p style="margin:0 0 0.5rem"><strong>Required:</strong></p>
    <ul style="margin:0;padding-left:1.25rem">${missingProdEnv.map((v) => `<li><code>${v}</code></li>`).join('')}</ul>
    <p style="margin:1rem 0 0;font-size:0.9rem;color:#444">See <code>frontend/.env.example</code> for local copy-paste. A file in the repo is not used on Vercel unless you set vars there in the dashboard.</p>
  `;
  root.appendChild(box);
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    </React.StrictMode>
  );
}
