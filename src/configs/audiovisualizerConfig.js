const config = {
  PRE_WORD_INTERVAL: 2, // s
  POST_WORD_INTERVAL: 1, // s
  VARIANCE: 0.5, // s
  START_DELAY: 3, // s
  TICKS_PER_SECOND: 48000,

  WORD_CODE: {
    0: "Nurse",
    // 0: "piano_note_16kHz",
    1: "Success",
    2: "Up",
  },

  TRIAL_CONFIG: {
    block1: [1, 1, 1],
    block2: [1, 2, 1, 1, 0, 0, 2, 1, 0, 2],
  },
};

export default config;
