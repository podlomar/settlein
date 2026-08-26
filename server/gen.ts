import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { processSession } from './session.js';

const sessionId = process.argv[2];
if (sessionId === undefined) {
  console.error('Usage: npm run gen -- <session-id>');
  process.exit(1);
}

const manifest = await processSession(sessionId);

const outputDir = path.join(import.meta.dirname, 'sessions', sessionId);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${path.join(outputDir, 'manifest.json')}`);
