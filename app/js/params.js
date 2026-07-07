// Single source of truth for every panel control.
// UI widgets, the DSP engine, presets, and the MIDI CC map all key off these ids.
// Knob/slider values are normalized 0..1; switch values are integer position
// indices (left → right / first → last button in a group).
//
// MIDI: `cc` assigns a controller to each control. Standard CCs where they
// exist (7 volume, 5 portamento time, 74 cutoff, 71 resonance, 73 attack,
// 72 release, 76 vibrato rate); knobs otherwise in CC20–30 + 85–90,
// switches/buttons in CC102–118.

export const PARAMS = [
  // -- TUNE / GLIDE --------------------------------------------------------
  { id: 'tune',          type: 'knob',   def: 0.5,  bipolar: true, detent: true, cc: 3 },
  { id: 'glide',         type: 'knob',   def: 0.0,  cc: 5 },

  // -- MOD ------------------------------------------------------------------
  { id: 'modRate',       type: 'knob',   def: 0.45, cc: 76 },
  { id: 'modAmount',     type: 'knob',   def: 0.0,  cc: 28 },  // sub->filter growl
  { id: 'modShape',      type: 'switch', def: 0, positions: 4, cc: 109 }, // sine tri sq s&h
  { id: 'oscMod',        type: 'switch', def: 0, positions: 2, cc: 107 },
  { id: 'osc2Mod',       type: 'switch', def: 0, positions: 2, cc: 111 }, // LFO -> OSC 2 only

  // -- OSCILLATORS ------------------------------------------------------------
  { id: 'osc1Octave',    type: 'switch', def: 1, positions: 3, cc: 102 }, // 32' 16' 8'
  { id: 'sync',          type: 'switch', def: 0, positions: 2, cc: 106 },
  { id: 'osc1Wave',      type: 'switch', def: 0, positions: 3, cc: 103 }, // saw tri pulse
  { id: 'osc2Octave',    type: 'switch', def: 1, positions: 3, cc: 104 }, // 16' 8' 4'
  { id: 'osc2Interval',  type: 'knob',   def: 0.5, bipolar: true, detent: true, cc: 77 },
  { id: 'osc2Wave',      type: 'switch', def: 0, positions: 3, cc: 105 }, // saw tri square
  { id: 'subOctave',     type: 'switch', def: 0, positions: 2, cc: 112 }, // -1 / -2 oct

  // -- MIXER --------------------------------------------------------------------
  { id: 'mixOsc1',       type: 'knob',   def: 0.8,  cc: 20 },
  { id: 'mixOsc2',       type: 'knob',   def: 0.8,  cc: 21 },
  { id: 'mixSub',        type: 'knob',   def: 0.0,  cc: 27 },
  { id: 'filterMod',     type: 'switch', def: 0, positions: 2, cc: 108 },
  { id: 'masterVolume',  type: 'knob',   def: 0.75, cc: 7 },
  { id: 'kbdTracking',   type: 'switch', def: 2, positions: 3, cc: 110 }, // off half full

  // -- FILTER ----------------------------------------------------------------------
  { id: 'cutoff',        type: 'knob',   def: 0.7,  cc: 74 },
  { id: 'emphasis',      type: 'knob',   def: 0.25, cc: 71 },
  { id: 'contourAmount', type: 'knob',   def: 0.35, cc: 22 },

  // -- FILTER CONTOUR (ADSR sliders) --------------------------------------------------
  { id: 'fAttack',       type: 'slider', def: 0.05, cc: 23 },
  { id: 'fDecay',        type: 'slider', def: 0.45, cc: 24 },
  { id: 'fSustain',      type: 'slider', def: 0.4,  cc: 25 },
  { id: 'fRelease',      type: 'slider', def: 0.2,  cc: 29 },

  // -- LOUDNESS CONTOUR (ADSR sliders) --------------------------------------------------
  { id: 'lAttack',       type: 'slider', def: 0.03, cc: 73 },
  { id: 'lDecay',        type: 'slider', def: 0.5,  cc: 72 },
  { id: 'lSustain',      type: 'slider', def: 0.85, cc: 26 },
  { id: 'lRelease',      type: 'slider', def: 0.25, cc: 30 },

  // -- FX ---------------------------------------------------------------------------------
  { id: 'modFxOn',       type: 'switch', def: 0, positions: 2, cc: 113 },
  { id: 'modFxType',     type: 'switch', def: 0, positions: 3, cc: 114 }, // chorus flanger phaser
  { id: 'modFxTime',     type: 'knob',   def: 0.35, cc: 85 },
  { id: 'modFxDepth',    type: 'knob',   def: 0.5,  cc: 86 },
  { id: 'dlyOn',         type: 'switch', def: 0, positions: 2, cc: 115 },
  { id: 'dlySync',       type: 'switch', def: 0, positions: 2, cc: 119 }, // TIME snaps to BPM divisions
  { id: 'dlyType',       type: 'switch', def: 0, positions: 3, cc: 116 }, // stereo pingpong tape
  { id: 'dlyTime',       type: 'knob',   def: 0.45, cc: 87 },
  { id: 'dlyDepth',      type: 'knob',   def: 0.4,  cc: 88 },
  { id: 'revOn',         type: 'switch', def: 0, positions: 2, cc: 117 },
  { id: 'revType',       type: 'switch', def: 0, positions: 2, cc: 118 }, // plate hall
  { id: 'revTime',       type: 'knob',   def: 0.5,  cc: 89 },
  { id: 'revDepth',      type: 'knob',   def: 0.35, cc: 90 },

  // -- SEQUENCER (UI-owned; not sent to the engine as a voice param, not in presets)
  { id: 'seqTempo',      type: 'knob',   def: 0.4,  seq: true }, // 40 + 200v BPM
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export const CC_TO_PARAM = Object.fromEntries(
  PARAMS.filter((p) => p.cc != null).map((p) => [p.cc, p]),
);

export function defaultState() {
  const s = {};
  for (const p of PARAMS) if (!p.seq) s[p.id] = p.def;
  return s;
}

// Wheels are performance controls, not part of saved patches.
export const WHEELS = [
  { id: 'pitchWheel', def: 0.5, detent: true },
  { id: 'modWheel',   def: 0.0 },
];
