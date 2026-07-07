// Computer-keyboard playing: two-row piano map, Z/X octave shift.
//   A W S E D F T G Y H U J K O L P ; '
//   C C# D D# E F F# G G# A A# B C ... up to F an octave above

const KEY_TO_SEMITONE = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
  KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const OCTAVE_MIN = 24; // C1
const OCTAVE_MAX = 60; // C4

export class Qwerty {
  constructor({ onNoteOn, onNoteOff, onOctaveChange }) {
    this.base = 36; // C2 — sits inside the Prodigy's F1..C4 keyboard
    this.down = new Map(); // code -> midi note
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onOctaveChange = onOctaveChange;

    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => this.keyup(e));
    window.addEventListener('blur', () => this.releaseAll());
  }

  label() {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[this.base % 12] + (Math.floor(this.base / 12) - 1);
  }

  keydown(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.code === 'KeyZ') {
      this.shiftOctave(-12);
      return;
    }
    if (e.code === 'KeyX') {
      this.shiftOctave(12);
      return;
    }
    const semi = KEY_TO_SEMITONE[e.code];
    if (semi == null) return;
    e.preventDefault();
    const note = this.base + semi;
    if (this.down.has(e.code)) return;
    this.down.set(e.code, note);
    this.onNoteOn(note);
  }

  keyup(e) {
    const note = this.down.get(e.code);
    if (note == null) return;
    this.down.delete(e.code);
    this.onNoteOff(note);
  }

  shiftOctave(d) {
    const next = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, this.base + d));
    if (next === this.base) return;
    this.releaseAll();
    this.base = next;
    this.onOctaveChange(this.label());
  }

  releaseAll() {
    for (const [, note] of this.down) this.onNoteOff(note);
    this.down.clear();
  }
}
