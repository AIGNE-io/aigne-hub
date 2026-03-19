// Initialize window.blocklet before any other imports
// eslint-disable-next-line import/no-extraneous-dependencies
import '@blocklet/sdk';

// Entry point: reuses blocklets/core/src/ via Vite aliases
// @app/* → ../../blocklets/core/src/*
import App from '@app/app';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('app')!);
root.render(<App />);
