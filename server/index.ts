import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { SessionManifest } from './types.js';

const PORT = Number(process.env.PORT ?? 3000);

// Stands in for the real session endpoints until they exist, so the client has
// something with the right shape to develop against.
const MOCK_MANIFEST: SessionManifest = {
  background: { file: 'bg.mp3' },
  sections: [
    {
      type: 'narration',
      file: '246b49e9.mp3',
      text: 'Settle in. Let your shoulders drop, and take one slow breath.',
      length: 4.56,
    },
    { type: 'silence', length: 15 },
    {
      type: 'narration',
      file: 'ba67e2b9.mp3',
      text: 'Notice the weight of your body where it meets the floor.',
      length: 2.8,
    },
    { type: 'silence', length: 15 },
  ],
};

const app = express();

app.use(express.json());

app.get('/api/mock', (_req, res) => {
  res.json(MOCK_MANIFEST);
});

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
});
