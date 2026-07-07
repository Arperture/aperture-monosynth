// Factory patches + user preset storage (localStorage).
// A patch is a plain { paramId: value } snapshot of the panel (FX included;
// the sequence and tempo are stored separately, not in patches).

import { defaultState } from './params.js';

export const FACTORY = [
  {
    name: 'Init',
    state: defaultState(),
  },
  {
    name: 'Noir Bass',
    state: {
      ...defaultState(),
      osc1Octave: 0, osc2Octave: 0,
      osc1Wave: 0, osc2Wave: 0,
      osc2Interval: 0.535,
      subOctave: 0, mixSub: 0.6,
      mixOsc1: 0.85, mixOsc2: 0.75,
      cutoff: 0.4, emphasis: 0.18, contourAmount: 0.5,
      fAttack: 0.02, fDecay: 0.4, fSustain: 0.15, fRelease: 0.22,
      lAttack: 0.01, lDecay: 0.6, lSustain: 0.8, lRelease: 0.24,
      revOn: 1, revType: 0, revTime: 0.35, revDepth: 0.18,
    },
  },
  {
    name: 'Growl Bass',
    state: {
      ...defaultState(),
      osc1Octave: 0, osc2Octave: 0,
      osc1Wave: 0, osc2Wave: 2,
      subOctave: 1, mixSub: 0.75,
      modAmount: 0.55,
      mixOsc1: 0.8, mixOsc2: 0.65,
      cutoff: 0.35, emphasis: 0.42, contourAmount: 0.4,
      fAttack: 0.02, fDecay: 0.5, fSustain: 0.3, fRelease: 0.2,
      lAttack: 0.01, lDecay: 0.55, lSustain: 0.85, lRelease: 0.2,
      dlyOn: 1, dlyType: 1, dlyTime: 0.5, dlyDepth: 0.25,
    },
  },
  {
    name: 'Sync Lead',
    state: {
      ...defaultState(),
      sync: 1,
      osc1Octave: 1, osc2Octave: 2,
      osc1Wave: 0, osc2Wave: 0,
      osc2Interval: 0.74,
      mixOsc1: 0.3, mixOsc2: 0.9,
      cutoff: 0.62, emphasis: 0.3, contourAmount: 0.45,
      fAttack: 0.02, fDecay: 0.5, fSustain: 0.35, fRelease: 0.3,
      lAttack: 0.02, lDecay: 0.55, lSustain: 0.9, lRelease: 0.32,
      dlyOn: 1, dlyType: 0, dlyTime: 0.42, dlyDepth: 0.3,
    },
  },
  {
    name: 'Chorus Pad',
    state: {
      ...defaultState(),
      osc1Octave: 1, osc2Octave: 1,
      osc1Wave: 1, osc2Wave: 0,
      osc2Interval: 0.53,
      mixOsc1: 0.7, mixOsc2: 0.7, mixSub: 0.3,
      cutoff: 0.55, emphasis: 0.15, contourAmount: 0.25,
      fAttack: 0.5, fDecay: 0.6, fSustain: 0.6, fRelease: 0.55,
      lAttack: 0.45, lDecay: 0.6, lSustain: 0.85, lRelease: 0.6,
      modFxOn: 1, modFxType: 0, modFxTime: 0.3, modFxDepth: 0.65,
      revOn: 1, revType: 1, revTime: 0.65, revDepth: 0.4,
    },
  },
  {
    name: 'Dub Stab',
    state: {
      ...defaultState(),
      osc1Octave: 1, osc2Octave: 1,
      osc1Wave: 2, osc2Wave: 2,
      osc2Interval: 0.55,
      subOctave: 0, mixSub: 0.45,
      mixOsc1: 0.8, mixOsc2: 0.7,
      cutoff: 0.5, emphasis: 0.55, contourAmount: 0.55,
      fAttack: 0.01, fDecay: 0.3, fSustain: 0.05, fRelease: 0.15,
      lAttack: 0.01, lDecay: 0.4, lSustain: 0.4, lRelease: 0.2,
      dlyOn: 1, dlyType: 2, dlyTime: 0.6, dlyDepth: 0.55,
      revOn: 1, revType: 0, revTime: 0.5, revDepth: 0.25,
    },
  },
];

const LS_PRESETS = 'aperture.userPresets';
const LS_STATE = 'aperture.panelState';

export function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(LS_PRESETS)) || []; }
  catch { return []; }
}

export function saveUserPresets(list) {
  localStorage.setItem(LS_PRESETS, JSON.stringify(list));
}

export function loadPanelState() {
  try { return JSON.parse(localStorage.getItem(LS_STATE)); }
  catch { return null; }
}

export function savePanelState(state) {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}
