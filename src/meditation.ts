interface AudioSection {
  type: 'audio';
  file: string;
  text: string;
  length: number;
}

interface SilenceSection {
  type: 'silence';
  length: number;
}

type Section = AudioSection | SilenceSection;

interface Meditation {
  background: {
    file: string;
  };
  sections: Section[];
}

export const meditation: Meditation = {
  background: {
    file: 'bg.mp3',
  },
  sections: [
    {
      type: 'audio',
      file: '22447663.mp3',
      text: 'Welcome to this meditation session. Find a comfortable position and take a deep breath.',
      length: 120,
    },
    {
      type: 'silence',
      length: 30,
    }
  ]
}
