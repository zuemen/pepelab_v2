import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const port = Number(env.VITE_DEV_SERVER_PORT || env.PORT || 5173);
  const host = env.VITE_DEV_SERVER_HOST || true;

  return {
    plugins: [react()],
    server: {
      port,
      host,
    },
    define: {
      'process.env': {},
    },
  };
});
