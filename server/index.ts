import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { loadManifest } from './session.js';
import { CACHE_DIR } from './synth.js';

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = path.join(import.meta.dirname, '..', 'client', 'dist');

const app = express();

app.use(express.json());

app.get('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const manifest = await loadManifest(id);

  if (manifest === null) {
    res.status(404).json({ error: `No manifest for session "${id}".` });
    return;
  }

  res.json(manifest);
});

// Only the audio is public: the cache's index.json is internal bookkeeping.
app.use('/assets/narrations', (req, res, next) => {
  if (!req.path.endsWith('.mp3')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  next();
});

// Cache file names are content hashes, so the bytes behind a given URL never change
// and the response can be cached indefinitely.
app.use(
  '/assets/narrations',
  express.static(CACHE_DIR, { index: false, immutable: true, maxAge: '1y' }),
);

// The built client, mounted last so it can never shadow an API or audio route.
app.use(express.static(CLIENT_DIR));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
};

app.use(handleError);

app.listen(PORT, () => {
  console.log(`settlein server listening on http://localhost:${PORT}`);

  if (!existsSync(CLIENT_DIR)) {
    console.warn(`No client build at ${CLIENT_DIR} — run "npm run build" in client/.`);
  }
});
