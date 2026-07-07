// Right-click context menu for sequencer steps: pick the note by name/octave
// (no keyboard needed), set velocity 0–127, toggle tie, take a whole-panel
// SNAPSHOT onto the step, or clear it. Edits apply immediately.

import { NOTE_NAMES, midiToName } from './sequencer.js';

export class StepMenu {
  /**
   * @param {object} io
   *   getStep(i)            -> step data
   *   setNote(i, midi), setVel(i, v127), setTie(i, on),
   *   snapshot(i), clearStep(i)
   */
  constructor(io) {
    this.io = io;
    this.stepIndex = -1;

    const m = document.createElement('div');
    m.id = 'step-menu';
    m.innerHTML = `
      <div class="sm-title" id="sm-title">STEP 1</div>
      <div class="sm-row">
        <span class="sm-label">NOTE</span>
        <select id="sm-note"></select>
        <select id="sm-oct"></select>
        <span class="sm-current" id="sm-notename"></span>
      </div>
      <div class="sm-row">
        <span class="sm-label">VEL</span>
        <input type="range" id="sm-vel" min="0" max="127" step="1" />
        <span class="sm-current" id="sm-velnum"></span>
      </div>
      <div class="sm-row">
        <button id="sm-tie" class="sm-btn"></button>
        <button id="sm-snap" class="sm-btn sm-accent">SNAPSHOT</button>
        <button id="sm-clear" class="sm-btn sm-danger">CLEAR</button>
      </div>
      <div class="sm-hint">snapshot locks every panel setting to this step</div>
    `;
    document.body.appendChild(m);
    this.el = m;

    const noteSel = m.querySelector('#sm-note');
    for (let i = 0; i < 12; i++) {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = NOTE_NAMES[i];
      noteSel.appendChild(o);
    }
    const octSel = m.querySelector('#sm-oct');
    for (let oct = 0; oct <= 8; oct++) {
      const o = document.createElement('option');
      o.value = oct;
      o.textContent = oct;
      octSel.appendChild(o);
    }

    const apply = () => {
      const midi = (parseInt(octSel.value, 10) + 1) * 12 + parseInt(noteSel.value, 10);
      this.io.setNote(this.stepIndex, midi);
      m.querySelector('#sm-notename').textContent = midiToName(midi);
    };
    noteSel.addEventListener('change', apply);
    octSel.addEventListener('change', apply);

    const vel = m.querySelector('#sm-vel');
    vel.addEventListener('input', () => {
      this.io.setVel(this.stepIndex, +vel.value);
      m.querySelector('#sm-velnum').textContent = vel.value;
    });

    m.querySelector('#sm-tie').addEventListener('click', () => {
      const st = this.io.getStep(this.stepIndex);
      this.io.setTie(this.stepIndex, !st.tie);
      this.paintTie();
    });
    m.querySelector('#sm-snap').addEventListener('click', () => {
      this.io.snapshot(this.stepIndex);
      this.flash('#sm-snap', 'SAVED ✓');
    });
    m.querySelector('#sm-clear').addEventListener('click', () => {
      this.io.clearStep(this.stepIndex);
      this.refresh();
    });

    // dismiss on outside press or Esc
    window.addEventListener('pointerdown', (e) => {
      if (this.open() && !this.el.contains(e.target)) this.close();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.close();
    });
  }

  open() { return this.el.classList.contains('show'); }

  show(stepIndex, x, y) {
    this.stepIndex = stepIndex;
    this.refresh();
    const m = this.el;
    m.classList.add('show');
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8)}px`;
    m.style.top = `${Math.max(8, y - r.height - 14)}px`;
  }

  refresh() {
    const st = this.io.getStep(this.stepIndex);
    this.el.querySelector('#sm-title').textContent =
      `STEP ${this.stepIndex + 1}${st.on ? '' : ' · REST'}`;
    this.el.querySelector('#sm-note').value = st.note % 12;
    this.el.querySelector('#sm-oct').value = Math.floor(st.note / 12) - 1;
    this.el.querySelector('#sm-notename').textContent = st.on ? midiToName(st.note) : '—';
    const v127 = Math.round((st.vel ?? 0.8) * 127);
    this.el.querySelector('#sm-vel').value = v127;
    this.el.querySelector('#sm-velnum').textContent = v127;
    this.paintTie();
  }

  paintTie() {
    const st = this.io.getStep(this.stepIndex);
    const b = this.el.querySelector('#sm-tie');
    b.textContent = `TIE ${st.tie ? 'ON' : 'OFF'}`;
    b.classList.toggle('sm-on', !!st.tie);
  }

  flash(sel, text) {
    const b = this.el.querySelector(sel);
    const orig = b.textContent;
    b.textContent = text;
    setTimeout(() => { b.textContent = orig; }, 900);
  }

  close() {
    this.el.classList.remove('show');
    this.stepIndex = -1;
  }
}
