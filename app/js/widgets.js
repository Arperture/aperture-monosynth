// Interaction + visual state for LED-ring knobs, vertical sliders, LED button
// groups, latching buttons, wheels, keys, and the sequencer strip controls.
// Values are normalized (knobs/sliders/wheels 0..1, switches integer index).

import { PARAM_BY_ID } from './params.js';
import { C, RING_LEDS } from './panel.js';

const KNOB_SWEEP = 300; // degrees

export class PanelUI {
  /**
   * @param {SVGElement} svg
   * @param {{ onParam, onNoteOn, onNoteOff, onWheel, onPower,
   *           onStepClick, onBarClick, onPlay, onRec }} handlers
   */
  constructor(svg, handlers) {
    this.svg = svg;
    this.h = handlers;
    this.values = {};
    this.wheels = { pitchWheel: 0.5, modWheel: 0 };
    this.powerOn = false;
    this.mouseNote = null;
    this.drag = null;
    this.learnMode = false;
    this.learnTargetEl = null;

    this.bind();
  }

  // ---- MIDI learn visuals ---------------------------------------------

  setLearnMode(on) {
    this.learnMode = on;
    this.svg.classList.toggle('learn-mode', on);
  }

  setLearnTarget(id) {
    if (this.learnTargetEl) this.learnTargetEl.classList.remove('learn-target');
    this.learnTargetEl = id ? this.svg.querySelector(
      `[data-widget="knob"][data-param="${id}"],[data-widget="slider"][data-param="${id}"]`,
    ) : null;
    if (this.learnTargetEl) this.learnTargetEl.classList.add('learn-target');
  }

  paintMidiLearn(on) {
    const g = this.svg.querySelector('#midi-learn-btn');
    if (!g) return;
    const face = g.querySelector('[data-face]');
    const dot = g.querySelector('[data-dot]');
    face.setAttribute('fill', on ? '#2E1B1C' : C.surface);
    face.setAttribute('stroke', on ? C.coral : C.btnStroke);
    dot.setAttribute('fill', on ? C.coral : C.ledOff);
    if (on) dot.setAttribute('filter', 'url(#glow)');
    else dot.removeAttribute('filter');
  }

  // ---- knobs (LED ring) --------------------------------------------------

  setKnob(id, v, fire = true) {
    this.values[id] = v;
    const g = this.svg.querySelector(`[data-widget="knob"][data-param="${id}"]`);
    if (g) {
      const rotor = g.querySelector(`[data-rotor="${id}"]`);
      if (rotor) {
        const deg = -KNOB_SWEEP / 2 + KNOB_SWEEP * v;
        rotor.setAttribute('transform', `rotate(${deg} ${g.dataset.cx} ${g.dataset.cy})`);
      }
      const ring = g.querySelector(`[data-ring="${id}"]`);
      if (ring) {
        const head = Math.round(v * (RING_LEDS - 1));
        const bipolar = g.dataset.bipolar === '1';
        const center = (RING_LEDS - 1) / 2;
        const leds = ring.children;
        for (let i = 0; i < leds.length; i++) {
          let lit;
          if (bipolar) {
            lit = (i >= Math.min(center, head) && i <= Math.max(center, head));
          } else {
            lit = i <= head;
          }
          const isHead = i === head;
          leds[i].setAttribute('fill', isHead ? C.cyanBright : lit ? C.cyan : C.ledOff);
          leds[i].setAttribute('opacity', isHead ? '1' : lit ? '0.55' : '1');
          if (isHead) leds[i].setAttribute('filter', 'url(#glow)');
          else leds[i].removeAttribute('filter');
        }
      }
    }
    if (fire) this.h.onParam(id, v);
  }

  // ---- sliders --------------------------------------------------------------

  setSlider(id, v, fire = true) {
    this.values[id] = v;
    const g = this.svg.querySelector(`[data-widget="slider"][data-param="${id}"]`);
    if (g) {
      const y0 = +g.dataset.y0, h = +g.dataset.h;
      const capY = y0 + (1 - v) * h;
      g.querySelector(`[data-cap="${id}"]`).setAttribute('transform', `translate(0 ${capY})`);
      const fill = g.querySelector(`[data-fill="${id}"]`);
      fill.setAttribute('y', capY);
      fill.setAttribute('height', Math.max(0, y0 + h - capY));
    }
    if (fire) this.h.onParam(id, v);
  }

  // ---- button groups / latches --------------------------------------------------

  setSwitch(id, idx, fire = true) {
    this.values[id] = idx;
    const grp = this.svg.querySelector(`[data-widget="btngroup"][data-param="${id}"]`);
    if (grp) {
      for (const b of grp.querySelectorAll('[data-idx]')) {
        const active = +b.dataset.idx === idx;
        const face = b.querySelector('[data-face]');
        face.setAttribute('fill', active ? C.ledOn : C.surface);
        face.setAttribute('stroke', active ? C.cyan : C.btnStroke);
        if (active) face.setAttribute('filter', 'url(#glow)');
        else face.removeAttribute('filter');
        const glyph = b.querySelector('[data-glyph]');
        if (glyph) glyph.setAttribute('stroke', active ? C.cyanBright : C.muted);
        const label = b.querySelector('text');
        if (label) label.setAttribute('fill', active ? C.cyanBright : C.muted);
      }
    }
    const latch = this.svg.querySelector(`[data-widget="latch"][data-param="${id}"]`);
    if (latch) this.paintLatch(latch, idx >= 1);
    if (fire) this.h.onParam(id, idx);
  }

  paintLatch(g, on) {
    const face = g.querySelector('[data-face]');
    const dot = g.querySelector('[data-dot]');
    face.setAttribute('fill', on ? C.ledOn : C.surface);
    face.setAttribute('stroke', on ? C.cyan : C.btnStroke);
    if (dot) {
      dot.setAttribute('fill', on ? C.cyanBright : C.ledOff);
      if (on) dot.setAttribute('filter', 'url(#glow)');
      else dot.removeAttribute('filter');
    }
  }

  // ---- wheels -----------------------------------------------------------------------

  setWheel(id, v, fire = true) {
    this.wheels[id] = v;
    const g = this.svg.querySelector(`[data-widget="wheel"][data-param="${id}"]`);
    if (g) {
      const groove = g.querySelector(`[data-groove="${id}"]`);
      const h = +g.dataset.h, cy = +g.dataset.cy;
      const y = cy + (0.5 - v) * (h - 40);
      groove.setAttribute('y', y - 1.5);
      const ribs = g.querySelector(`[data-ribs="${id}"]`);
      if (ribs) ribs.setAttribute('transform', `translate(0 ${(0.5 - v) * 9})`);
    }
    if (fire) this.h.onWheel(id, v);
  }

  setPower(on) {
    this.powerOn = on;
    const led = this.svg.querySelector('#power-led');
    if (led) {
      led.setAttribute('fill', on ? '#ff3b30' : '#3A1518');
      led.style.filter = on ? 'drop-shadow(0 0 4px #ff3b30cc)' : '';
    }
  }

  setKeyLit(note, on) {
    const key = this.svg.querySelector(`[data-widget="key"][data-note="${note}"]`);
    if (!key) return;
    const kind = key.dataset.kind;
    key.setAttribute('fill', on
      ? (kind === 'white' ? 'url(#whiteKeyDown)' : 'url(#blackKeyDown)')
      : (kind === 'white' ? 'url(#whiteKey)' : 'url(#blackKey)'));
  }

  // ---- sequencer strip painting ----------------------------------------------------------

  paintStep(i16, st) {
    const led = this.svg.querySelector(`[data-stepled="${i16}"]`);
    const face = this.svg.querySelector(`[data-stepface="${i16}"]`);
    if (!led || !face) return;
    // rest (inactive) stays fully unlit; locked steps read brighter than plain notes
    let fill = C.ledOff, glow = false, op = '1';
    if (st.play) { fill = C.cyanBright; glow = true; }
    else if (st.active) { fill = st.locked ? C.cyanMid : C.cyanDim; op = '0.95'; }
    led.setAttribute('fill', fill);
    led.setAttribute('opacity', op);
    if (glow) led.setAttribute('filter', 'url(#glowBig)');
    else led.removeAttribute('filter');
    face.setAttribute('stroke', st.cursor ? C.coral : C.btnStroke);
    face.setAttribute('stroke-width', st.cursor ? '1.6' : '1');
  }

  // LED between step i16 and the next step; lit while the next step ties
  paintTie(i16, lit) {
    const dot = this.svg.querySelector(`[data-tiedot="${i16}"]`);
    if (!dot) return;
    dot.setAttribute('fill', lit ? C.cyan : C.ledOff);
    if (lit) dot.setAttribute('filter', 'url(#glow)');
    else dot.removeAttribute('filter');
  }

  paintStepNumbers(page) {
    for (let i = 0; i < 16; i++) {
      const n = this.svg.querySelector(`[data-stepnum="${i}"]`);
      if (n) n.textContent = String(page * 16 + i + 1);
    }
  }

  paintBar(bar, st) {
    const face = this.svg.querySelector(`[data-barface="${bar}"]`);
    if (!face) return;
    face.setAttribute('fill', st.play ? C.ledOn : st.view ? C.surface2 : C.surface);
    face.setAttribute('stroke', st.play ? C.cyanBright : st.view ? C.cyan : C.btnStroke);
    if (st.play) face.setAttribute('filter', 'url(#glow)');
    else face.removeAttribute('filter');
  }

  paintTransport({ playing, rec }) {
    const play = this.svg.querySelector('#seq-play');
    if (play) {
      const face = play.querySelector('[data-face]');
      const glyph = play.querySelector('[data-glyph]');
      face.setAttribute('stroke', playing ? C.cyan : C.btnStroke);
      face.setAttribute('fill', playing ? C.ledOn : C.surface);
      glyph.setAttribute('stroke', playing ? C.cyanBright : C.muted);
      glyph.setAttribute('fill', playing ? C.cyanBright : C.muted);
    }
    const recB = this.svg.querySelector('#seq-rec');
    if (recB) {
      const face = recB.querySelector('[data-face]');
      const dot = recB.querySelector('[data-dot]');
      face.setAttribute('stroke', rec ? C.coral : C.btnStroke);
      face.setAttribute('fill', rec ? '#2E1B1C' : C.surface);
      dot.setAttribute('fill', rec ? C.coral : C.ledOff);
      if (rec) dot.setAttribute('filter', 'url(#glow)');
      else dot.removeAttribute('filter');
    }
  }

  paintBpm(bpm) {
    const r = this.svg.querySelector('#bpm-readout');
    if (r) r.textContent = String(bpm);
  }

  // ---- generic state -----------------------------------------------------------------------

  applyState(state, fire = true) {
    for (const [id, v] of Object.entries(state)) {
      const p = PARAM_BY_ID[id];
      if (!p) continue;
      this.setParam(id, v, fire);
    }
  }

  setParam(id, v, fire = true) {
    const p = PARAM_BY_ID[id];
    if (!p) return;
    if (p.type === 'knob') this.setKnob(id, v, fire);
    else if (p.type === 'slider') this.setSlider(id, v, fire);
    else this.setSwitch(id, v, fire);
  }

  // ---- interaction ----------------------------------------------------------------------------

  bind() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', () => this.pointerUp());
    svg.addEventListener('dblclick', (e) => this.doubleClick(e));
    svg.addEventListener('wheel', (e) => this.wheelScroll(e), { passive: false });
    svg.addEventListener('pointerover', (e) => {
      if (this.mouseNote == null) return;
      const key = e.target.closest?.('[data-widget="key"]');
      if (key) {
        const note = +key.dataset.note;
        if (note !== this.mouseNote) {
          const old = this.mouseNote;
          this.mouseNote = note;
          this.h.onNoteOn(note);
          this.h.onNoteOff(old);
        }
      }
    });
  }

  pointerDown(e) {
    const t = e.target.closest?.('[data-widget]');
    if (!t) return;
    const widget = t.dataset.widget;
    e.preventDefault();

    switch (widget) {
      case 'key': {
        const note = +t.dataset.note;
        this.mouseNote = note;
        this.h.onNoteOn(note);
        return;
      }
      case 'power':
        this.h.onPower(!this.powerOn);
        return;
      case 'knob': {
        const id = t.dataset.param;
        if (this.learnMode) { this.h.onLearnPick(id, e.shiftKey); return; }
        this.drag = { kind: 'knob', id, startY: e.clientY, startV: this.values[id] ?? 0 };
        return;
      }
      case 'slider': {
        const id = t.dataset.param;
        if (this.learnMode) { this.h.onLearnPick(id, e.shiftKey); return; }
        this.drag = {
          kind: 'slider', id, startY: e.clientY,
          startV: this.values[id] ?? 0, h: +t.dataset.h,
        };
        return;
      }
      case 'midilearn':
        this.h.onMidiLearn();
        return;
      case 'wheel': {
        const id = t.dataset.param;
        this.drag = { kind: 'wheel', id, startY: e.clientY, startV: this.wheels[id] ?? 0 };
        return;
      }
      case 'btngroup': {
        const btn = e.target.closest('[data-idx]');
        if (btn) this.setSwitch(t.dataset.param, +btn.dataset.idx);
        return;
      }
      case 'latch': {
        const id = t.dataset.param;
        this.setSwitch(id, (this.values[id] ?? 0) >= 1 ? 0 : 1);
        return;
      }
      case 'step':
        this.h.onStepClick(+t.dataset.step, e.shiftKey, e.altKey);
        return;
      case 'tieled':
        this.h.onTieClick(+t.dataset.tie);
        return;
      case 'barled':
        this.h.onBarClick(+t.dataset.bar);
        return;
      case 'playbtn':
        this.h.onPlay();
        return;
      case 'recbtn':
        this.h.onRec();
        return;
      default:
        break;
    }
  }

  pointerMove(e) {
    if (!this.drag) return;
    const d = this.drag;
    const scale = this.unitScale();
    const fine = e.shiftKey ? 0.25 : 1;
    const dy = (d.startY - e.clientY) / scale;

    if (d.kind === 'knob') {
      let v = d.startV + (dy / 160) * fine;
      v = Math.max(0, Math.min(1, v));
      const p = PARAM_BY_ID[d.id];
      if (p?.detent && Math.abs(v - 0.5) < 0.022) v = 0.5;
      this.setKnob(d.id, v);
    } else if (d.kind === 'slider') {
      let v = d.startV + (dy / d.h) * fine;
      v = Math.max(0, Math.min(1, v));
      this.setSlider(d.id, v);
    } else if (d.kind === 'wheel') {
      let v = d.startV + (dy / 190) * fine;
      v = Math.max(0, Math.min(1, v));
      if (d.id === 'pitchWheel' && Math.abs(v - 0.5) < 0.03) v = 0.5;
      this.setWheel(d.id, v);
    }
  }

  pointerUp() {
    this.drag = null;
    if (this.mouseNote != null) {
      this.h.onNoteOff(this.mouseNote);
      this.mouseNote = null;
    }
  }

  doubleClick(e) {
    const t = e.target.closest?.('[data-widget]');
    if (!t) return;
    const p = PARAM_BY_ID[t.dataset.param];
    if (t.dataset.widget === 'knob') this.setKnob(t.dataset.param, p ? p.def : 0.5);
    else if (t.dataset.widget === 'slider') this.setSlider(t.dataset.param, p ? p.def : 0.5);
    else if (t.dataset.widget === 'wheel') {
      this.setWheel(t.dataset.param, t.dataset.param === 'pitchWheel' ? 0.5 : 0);
    }
  }

  wheelScroll(e) {
    const t = e.target.closest?.('[data-widget="knob"],[data-widget="slider"],[data-widget="wheel"]');
    if (!t) return;
    e.preventDefault();
    const id = t.dataset.param;
    const step = (e.shiftKey ? 0.004 : 0.02) * (e.deltaY < 0 ? 1 : -1);
    const kind = t.dataset.widget;
    if (kind === 'wheel') {
      this.setWheel(id, Math.max(0, Math.min(1, (this.wheels[id] ?? 0) + step)));
    } else {
      let v = Math.max(0, Math.min(1, (this.values[id] ?? 0) + step));
      const p = PARAM_BY_ID[id];
      if (p?.detent && Math.abs(v - 0.5) < 0.012) v = 0.5;
      if (kind === 'knob') this.setKnob(id, v);
      else this.setSlider(id, v);
    }
  }

  unitScale() {
    const wrap = document.getElementById('unit-wrap');
    const s = getComputedStyle(wrap).getPropertyValue('--unit-scale');
    return parseFloat(s) || 1;
  }
}
