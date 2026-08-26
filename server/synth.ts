import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const VOICE_NAME = 'Edward Sims';
const MODEL_ID = 'eleven_v3';
const OUTPUT_FORMAT = 'mp3_44100_128';
const CACHE_DIR = path.join(import.meta.dirname, 'audio_cache');
const INDEX_FILE = 'index.json';

export interface AudioCacheEntry {
  file: string;
  text: string;
  length: number;
  bytes: number;
  voice: string;
  model: string;
  createdAt: string;
}

export type AudioCacheIndex = Record<string, AudioCacheEntry>;

export interface NarrationFile {
  file: string;
  length: number;
}

export interface SynthesizerOptions {
  voiceName?: string;
  cacheDir?: string;
}

const textHash = (voiceName: string, text: string): string =>
  createHash('sha256').update(`${MODEL_ID}:${voiceName}:${text}`).digest('hex').slice(0, 8);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCacheEntry = (value: unknown): value is AudioCacheEntry =>
  isRecord(value) &&
  typeof value.file === 'string' &&
  typeof value.text === 'string' &&
  typeof value.length === 'number' &&
  typeof value.bytes === 'number' &&
  typeof value.voice === 'string' &&
  typeof value.model === 'string' &&
  typeof value.createdAt === 'string';

const loadApiKey = (): string => {
  const envPath = path.join(import.meta.dirname, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Missing ELEVENLABS_API_KEY. Add it to ${envPath} or set it in the environment.`,
    );
  }

  return apiKey;
};

const readIndex = async (cacheDir: string): Promise<AudioCacheIndex> => {
  const indexPath = path.join(cacheDir, INDEX_FILE);
  if (!existsSync(indexPath)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (cause) {
    throw new Error(`${indexPath} is not valid JSON. Repair or delete it and run again.`, { cause });
  }

  if (!isRecord(parsed)) {
    throw new Error(`${indexPath} does not contain an object.`);
  }

  const index: AudioCacheIndex = {};
  for (const [hash, entry] of Object.entries(parsed)) {
    if (isCacheEntry(entry)) {
      index[hash] = entry;
    }
  }

  return index;
};

// Entries whose audio file is gone are dropped on load, so a half-deleted cache heals
// itself instead of handing out records pointing at files that are not there.
const loadIndex = async (cacheDir: string): Promise<AudioCacheIndex> => {
  const stored = await readIndex(cacheDir);
  const index: AudioCacheIndex = {};

  for (const [hash, entry] of Object.entries(stored)) {
    if (existsSync(path.join(cacheDir, entry.file))) {
      index[hash] = entry;
    }
  }

  return index;
};

export class Synthesizer {
  private readonly client: ElevenLabsClient;
  private readonly voiceName: string;
  private readonly voiceId: string;
  private readonly cacheDir: string;
  private readonly index: AudioCacheIndex;
  private readonly pending = new Map<string, Promise<AudioCacheEntry>>();
  private writes: Promise<void> = Promise.resolve();

  private constructor(
    client: ElevenLabsClient,
    voiceName: string,
    voiceId: string,
    cacheDir: string,
    index: AudioCacheIndex,
  ) {
    this.client = client;
    this.voiceName = voiceName;
    this.voiceId = voiceId;
    this.cacheDir = cacheDir;
    this.index = index;
  }

  static create = async (options: SynthesizerOptions = {}): Promise<Synthesizer> => {
    const voiceName = options.voiceName ?? VOICE_NAME;
    const cacheDir = options.cacheDir ?? CACHE_DIR;

    const client = new ElevenLabsClient({ apiKey: loadApiKey() });
    const { voices } = await client.voices.search({ search: voiceName });
    const voice = voices[0];
    if (voice === undefined) {
      throw new Error(`No voice matching "${voiceName}".`);
    }

    await mkdir(cacheDir, { recursive: true });

    return new Synthesizer(client, voiceName, voice.voiceId, cacheDir, await loadIndex(cacheDir));
  };

  public synthesize = async (text: string): Promise<NarrationFile> => {
    const entry = await this.cacheEntry(text);
    return { file: entry.file, length: entry.length };
  };

  private cacheEntry = async (text: string): Promise<AudioCacheEntry> => {
    const hash = textHash(this.voiceName, text);

    const cached = this.index[hash];
    if (cached !== undefined) {
      return cached;
    }

    // Two calls for the same text must not each pay for a render.
    const inFlight = this.pending.get(hash);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const render = this.render(hash, text).finally(() => this.pending.delete(hash));
    this.pending.set(hash, render);

    return render;
  };

  private render = async (hash: string, text: string): Promise<AudioCacheEntry> => {
    const { audioBase64, alignment } = await this.client.textToSpeech.convertWithTimestamps(
      this.voiceId,
      { text, modelId: MODEL_ID, outputFormat: OUTPUT_FORMAT },
    );

    const endTimes = alignment?.characterEndTimesSeconds;
    if (endTimes === undefined || endTimes.length === 0) {
      throw new Error(`No alignment returned for "${text.slice(0, 40)}...".`);
    }

    const audio = Buffer.from(audioBase64, 'base64');
    const entry: AudioCacheEntry = {
      file: `${hash}.mp3`,
      text,
      length: Math.round(endTimes[endTimes.length - 1]! * 1000) / 1000,
      bytes: audio.byteLength,
      voice: this.voiceName,
      model: MODEL_ID,
      createdAt: new Date().toISOString(),
    };

    // Audio first: an index entry must never point at a file that is not there yet.
    await writeFile(path.join(this.cacheDir, entry.file), audio);
    this.index[hash] = entry;
    await this.writeIndex();

    return entry;
  };

  // Queued so concurrent renders cannot clobber each other, merged with what is already
  // on disk so a second synthesizer over the same cache adds to the index instead of
  // replacing it, and swapped in by rename so a reader never sees a half-written file.
  private writeIndex = (): Promise<void> => {
    this.writes = this.writes.then(async () => {
      const merged = { ...(await readIndex(this.cacheDir)), ...this.index };
      const sorted = Object.fromEntries(
        Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
      );

      const tmpPath = path.join(this.cacheDir, `${INDEX_FILE}.${process.pid}.tmp`);
      await writeFile(tmpPath, `${JSON.stringify(sorted, null, 2)}\n`);
      await rename(tmpPath, path.join(this.cacheDir, INDEX_FILE));
    });

    return this.writes;
  };
}
