// MIDI Learn — user-assignable CC mappings for knobs and sliders.
//
// Flow: arm the MIDI LEARN button -> click a knob/slider (it pulses) ->
// twist a controller knob -> the CC is assigned and a contextual popup shows
// the number. Learn stays armed so several controls can be mapped in a row;
// click the button again (or press Esc) to exit. Shift-click a control while
// armed to clear its custom mapping back to the default CC.
//
// Custom assignments override the factory map in params.js and persist in
// localStorage. Assigning a CC that is already in use steals it — the
// previous owner falls back to its default. CC 1 stays reserved for the mod
// wheel (intercepted before the generic CC path), and CC 120/123 stay
// all-notes-off.

import { PARAMS, PARAM_BY_ID } from './params.js';

const LS_KEY = 'aperture.ccMap';

const LABELS = {
  tune: 'TUNE', glide: 'GLIDE',
  modRate: 'MOD RATE', modAmount: 'MOD AMOUNT',
  osc2Interval: 'OSC 2 INTERVAL',
  mixOsc1: 'MIXER OSC 1', mixOsc2: 'MIXER OSC 2', mixSub: 'MIXER SUB',
  masterVolume: 'MASTER VOLUME',
  cutoff: 'CUTOFF', emphasis: 'EMPHASIS', contourAmount: 'CONTOUR AMOUNT',
  fAttack: 'FILTER ATTACK', fDecay: 'FILTER DECAY', fSustain: 'FILTER SUSTAIN', fRelease: 'FILTER RELEASE',
  lAttack: 'LOUDNESS ATTACK', lDecay: 'LOUDNESS DECAY', lSustain: 'LOUDNESS SUSTAIN', lRelease: 'LOUDNESS RELEASE',
  modFxTime: 'MOD FX TIME', modFxDepth: 'MOD FX DEPTH',
  dlyTime: 'DELAY TIME', dlyDepth: 'DELAY DEPTH',
  revTime: 'REVERB TIME', revDepth: 'REVERB DEPTH',
  seqTempo: 'TEMPO',
};

export const label = (id) => LABELS[id] || id.toUpperCase();

export class MidiLearn {
  /** @param {import('./widgets.js').PanelUI} ui */
  constructor(ui) {
    this.ui = ui;
    this.armed = false;
    this.target = null;
    this.custom = this.load();
    this.hideTimer = null;

    this.popup = document.createElement('div');
    this.popup.id = 'learn-popup';
    document.body.appendChild(this.popup);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.armed) this.toggle();
    });
  }

  load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }

  save() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.custom));
  }

  // effective CC for a param (custom wins over factory default)
  effectiveCC(id) {
    return this.custom[id] ?? PARAM_BY_ID[id]?.cc ?? null;
  }

  // effective cc -> param resolution: custom assignments win; a factory
  // default only applies while its param has no custom override
  resolve(cc) {
    for (const [id, c] of Object.entries(this.custom)) {
      if (c === cc) return PARAM_BY_ID[id];
    }
    for (const p of PARAMS) {
      if (p.cc === cc && this.custom[p.id] == null) return p;
    }
    return null;
  }

  toggle() {
    this.armed = !this.armed;
    this.target = null;
    this.ui.setLearnMode(this.armed);
    this.ui.setLearnTarget(null);
    this.ui.paintMidiLearn(this.armed);
    if (this.armed) {
      this.showAt(document.getElementById('midi-learn-btn'),
        'MIDI LEARN — click a knob or slider', false);
    } else {
      this.hide();
    }
  }

  // a knob/slider was clicked while armed
  pick(id, clear) {
    const kind = PARAM_BY_ID[id]?.type;
    if (kind !== 'knob' && kind !== 'slider') return;
    const el = this.controlEl(id);
    if (clear) {
      delete this.custom[id];
      this.save();
      const def = PARAM_BY_ID[id]?.cc;
      this.showAt(el, `${label(id)} → ${def != null ? `CC ${def} (default)` : 'unassigned'}`, true);
      this.target = null;
      this.ui.setLearnTarget(null);
      return;
    }
    this.target = id;
    this.ui.setLearnTarget(id);
    this.showAt(el, `${label(id)} — move a controller knob…`, false);
  }

  // raw CC arrived; returns true when consumed by learn mode
  onCC(cc) {
    if (!this.armed) return false;
    if (this.target == null) return true;    // armed but nothing picked: swallow
    for (const k of Object.keys(this.custom)) {
      if (this.custom[k] === cc) delete this.custom[k];   // steal
    }
    this.custom[this.target] = cc;
    this.save();
    this.showAt(this.controlEl(this.target), `${label(this.target)} ← CC ${cc}`, true);
    this.ui.setLearnTarget(null);
    this.target = null;                       // stay armed for the next control
    return true;
  }

  controlEl(id) {
    return document.querySelector(
      `[data-widget="knob"][data-param="${id}"],[data-widget="slider"][data-param="${id}"]`,
    );
  }

  showAt(el, text, autohide) {
    clearTimeout(this.hideTimer);
    this.popup.textContent = text;
    if (el) {
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90);
      this.popup.style.left = `${x}px`;
      this.popup.style.top = `${Math.max(r.top - 10, 34)}px`;
    }
    this.popup.classList.add('show');
    if (autohide) {
      this.hideTimer = setTimeout(() => this.hide(), 1900);
    }
  }

  hide() {
    this.popup.classList.remove('show');
  }
}
