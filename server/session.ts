import type { Session, ScriptStep, SpeechStep, SessionManifest } from './types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { Synthesizer } from './synth.js';

const SESSIONS_DIR = path.join(import.meta.dirname, 'sessions');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseStep = (value: unknown, index: number): ScriptStep => {
  if (!isRecord(value)) {
    throw new Error(`script[${index}] is not a mapping.`);
  }

  if (typeof value.speech === 'string') {
    return { speech: value.speech };
  }

  if (typeof value.pause === 'number') {
    return { pause: value.pause };
  }

  throw new Error(`script[${index}] needs either a "speech" string or a "pause" number.`);
};

const parseSession = (value: unknown, source: string): Session => {
  if (!isRecord(value)) {
    throw new Error(`${source} does not contain a mapping.`);
  }

  const { id, name, brief, script } = value;

  if (typeof id !== 'string') {
    throw new Error(`${source} is missing a string "id".`);
  }

  if (typeof name !== 'string') {
    throw new Error(`${source} is missing a string "name".`);
  }

  if (typeof brief !== 'string') {
    throw new Error(`${source} is missing a string "brief".`);
  }

  if (!Array.isArray(script)) {
    throw new Error(`${source} is missing a "script" list.`);
  }

  return { id, name, brief, script: script.map(parseStep) };
};

const loadSession = async (id: string): Promise<Session> => {
  const source = path.join(SESSIONS_DIR, id, 'session.yml');
  const session = parseSession(parse(await readFile(source, 'utf8')), source);

  if (session.id !== id) {
    throw new Error(`${source} declares id "${session.id}" but lives in the "${id}" folder.`);
  }

  return session;
};

export const isSpeechStep = (step: ScriptStep): step is SpeechStep => 'speech' in step;

export const processSession = async (id: string): Promise<SessionManifest> => {
  const session = await loadSession(id);
  const synthesizer = await Synthesizer.create();
  const manifest: SessionManifest = {
    background: {
      file: 'bg.mp3',
    },
    sections: [],
  };

  if (session.script.length === 0) {
    throw new Error(`Session "${id}" has an empty script.`);
  }

  for (const step of session.script) {
    if (isSpeechStep(step)) {
      if (step.speech.trim().length === 0) {
        throw new Error(`Session "${id}" has a speech step with empty text.`);
      }

      const file = await synthesizer.synthesize(step.speech);
      manifest.sections.push({
        type: 'narration',
        file: file.file,
        text: step.speech,
        length: file.length,
      });
    } else {
      if (step.pause <= 0) {
        throw new Error(`Session "${id}" has a pause step with non-positive length.`);
      }

      manifest.sections.push({
        type: 'silence',
        length: step.pause,
      });
    }
  }

  return manifest;
};
