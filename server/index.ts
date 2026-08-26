import fs from 'node:fs/promises';
import path from 'node:path';
import { processSession } from './session.js';

const sessionId = process.argv[2];
if (sessionId === undefined) {
  console.error('Usage: node generator/index.js <session-id>');
  process.exit(1);
}

const manifest = await processSession(sessionId);

const outputDir = path.join(import.meta.dirname, 'sessions', sessionId);

await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
