export interface SpeechStep {
  speech: string;
}

export interface PauseStep {
  pause: number;
}

export type ScriptStep = SpeechStep | PauseStep;

export interface Session {
  id: string;
  name: string;
  brief: string;
  script: ScriptStep[];
}

export interface NarrationSection {
  type: 'narration';
  file: string;
  text: string;
  length: number;
}

export interface SilenceSection {
  type: 'silence';
  length: number;
}

export type ManifestSection = NarrationSection | SilenceSection;

export interface SessionManifest {
  background: {
    file: string;
  };
  sections: ManifestSection[];
}
