import { defineConfig } from 'vite';

// In dev the client is served by Vite, so the API and narration audio have to be
// forwarded to the Express server. In a build, Express serves both itself and these
// paths resolve without a proxy.
const API_SERVER = 'http://localhost:3000';

export default defineConfig({
  server: {
    proxy: {
      '/api': API_SERVER,
      // Only the narrations, not all of /assets — Vite owns that prefix in a build.
      '/assets/narrations': API_SERVER,
    },
  },
});
