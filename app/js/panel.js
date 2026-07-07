// Aperture — builds the whole instrument as SVG in the Arperture noir voice:
// deep anthracite surfaces, warm-gold LED rings and lit elements, silver
// hairline type, aperture-ring motifs. Sections: TUNE/GLIDE · MOD · OSC(3 rows)
// · MIXER · FILTER · FILTER CONTOUR (ADSR sliders) · LOUDNESS CONTOUR ·
// EFFECTS — then wheels + 32-key keyboard, then the 32-step sequencer strip.

const NS = 'http://www.w3.org/2000/svg';

export const VIEW_W = 1680;
export const VIEW_H = 1180;

// ---- noir palette -----------------------------------------------------------

export const C = {
  // brand accents — gold for branding marks, electric cyan for every LED
  gold: '#C9A227',
  goldBright: '#F0C64A',
  cyan: '#2ECCFA',        // lit
  cyanBright: '#5DD9FB',  // playhead / head LED
  cyanMid: '#16A6D4',     // locked steps
  cyanDim: '#0A5470',     // stored steps
  ledOn: '#0E2A38',       // lit button face
  silver: '#C5CBD6',
  muted: '#97A0AE',
  faint: '#5D6673',
  coral: '#FF6F61',
  // slate-blue surfaces
  bg: '#12161D',
  panel: '#1B212B',
  surface: '#232A36',
  surface2: '#2A3240',
  ledOff: '#262E3A',
  btnStroke: '#333D4C',
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(190,205,225,0.25)',
};

// ---- geometry ---------------------------------------------------------------

const PANEL = { x: 16, y: 16, w: VIEW_W - 32, h: 544 };
const SECT_X = [40, 136, 300, 640, 810, 990, 1230, 1470, 1640];
const AREA = { y: 34, h: 466 };            // sections vertical extent
const DECK = { y: 560, h: 390 };
const PLATE = { x: 40, y: 575, w: 220, h: 360 };
const KEYS = {
  x: 280, y: 570, whiteW: 71.5, whiteH: 372, blackW: 42, blackH: 232,
  count: 32, lowNote: 29,
};
const SEQ = { x: 40, y: 954, w: 1600, h: 184 };

const FONT_DISPLAY = `'Clash Display','Hanken Grotesk',sans-serif`;
const FONT_BODY = `'Hanken Grotesk',system-ui,sans-serif`;
const FONT_MONO = `'Space Mono',ui-monospace,monospace`;

// ---- svg helpers --------------------------------------------------------------

function el(name, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function txt(parent, x, y, str, size = 10, opts = {}) {
  const t = el('text', {
    x, y,
    fill: opts.fill || C.muted,
    'font-size': size,
    'font-family': opts.font || FONT_BODY,
    'font-weight': opts.weight || 600,
    'letter-spacing': opts.ls != null ? opts.ls : 1.2,
    'text-anchor': opts.anchor || 'middle',
  }, parent);
  t.textContent = str;
  return t;
}

const mono = (parent, x, y, str, size = 8, opts = {}) =>
  txt(parent, x, y, str, size, { font: FONT_MONO, weight: 400, ls: 1.5, ...opts });

// ---- defs ----------------------------------------------------------------------

function buildDefs(svg) {
  const defs = el('defs', {}, svg);
  const grad = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => {
    const g = el('linearGradient', { id, x1, y1, x2, y2 }, defs);
    for (const [o, c] of stops) el('stop', { offset: o, 'stop-color': c }, g);
  };
  const rgrad = (id, stops, cx = 0.5, cy = 0.42, r = 0.62) => {
    const g = el('radialGradient', { id, cx, cy, r }, defs);
    for (const [o, c] of stops) el('stop', { offset: o, 'stop-color': c }, g);
  };

  grad('panelFace', [[0, '#222937'], [0.5, '#1B212B'], [1, '#151A22']]);
  grad('deckFace', [[0, '#181E27'], [1, '#12161D']]);
  rgrad('knobBody', [[0, '#39424F'], [0.55, '#242B36'], [0.85, '#181D26'], [1, '#0D1016']]);
  grad('capMetal', [[0, '#D9DCE1'], [0.45, '#A9AEB7'], [0.55, '#8F959F'], [1, '#5F6570']]);
  grad('whiteKey', [[0, '#E4E6E9'], [0.85, '#EDEFF2'], [0.97, '#CDD0D5'], [1, '#A7AAB0']]);
  grad('whiteKeyDown', [[0, '#C2C5CB'], [0.9, '#CDD0D6'], [1, '#9A9DA4']]);
  grad('blackKey', [[0, '#343B46'], [0.12, '#1E242D'], [0.85, '#12161D'], [1, '#080A0E']]);
  grad('blackKeyDown', [[0, '#242B34'], [0.5, '#141920'], [1, '#080A0E']]);
  grad('wheelFace', [[0, '#1D232C'], [0.12, '#2E3641'], [0.5, '#3A434F'], [0.88, '#28303B'], [1, '#161B22']]);

  // glow for lit LEDs
  const f = el('filter', { id: 'glow', x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
  el('feGaussianBlur', { stdDeviation: 1.6, result: 'b' }, f);
  const m = el('feMerge', {}, f);
  el('feMergeNode', { in: 'b' }, m);
  el('feMergeNode', { in: 'SourceGraphic' }, m);

  const f2 = el('filter', { id: 'glowBig', x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
  el('feGaussianBlur', { stdDeviation: 3.2, result: 'b' }, f2);
  const m2 = el('feMerge', {}, f2);
  el('feMergeNode', { in: 'b' }, m2);
  el('feMergeNode', { in: 'SourceGraphic' }, m2);
}

// ---- LED-ring knob ---------------------------------------------------------------

export const RING_LEDS = 15;

// opts: bipolar (LEDs light from center), label, labelSize, mini
function buildKnob(parent, id, cx, cy, r = 19, opts = {}) {
  const g = el('g', { 'data-widget': 'knob', 'data-param': id }, parent);
  if (opts.bipolar) g.dataset.bipolar = '1';

  // LED ring (replaces printed tick marks)
  const ring = el('g', { 'data-ring': id }, g);
  const rr = r + 9;
  for (let i = 0; i < RING_LEDS; i++) {
    const a = ((-150 + (300 * i) / (RING_LEDS - 1)) * Math.PI) / 180;
    el('circle', {
      cx: cx + Math.sin(a) * rr,
      cy: cy - Math.cos(a) * rr,
      r: 2.1,
      fill: C.ledOff,
      'data-led': i,
    }, ring);
  }

  // body
  el('circle', { cx, cy, r: r + 1.5, fill: '#0A0D12' }, g);
  el('circle', { cx, cy, r, fill: 'url(#knobBody)', stroke: '#333D4C', 'stroke-width': 0.8 }, g);
  el('circle', { cx, cy, r: r - 5, fill: '#161B23', stroke: '#2C3542', 'stroke-width': 0.6 }, g);

  // hairline pointer (subtle, cyan to match the LEDs)
  const rot = el('g', { 'data-rotor': id, transform: `rotate(0 ${cx} ${cy})` }, g);
  el('line', {
    x1: cx, y1: cy - r + 3, x2: cx, y2: cy - 5,
    stroke: C.cyan, 'stroke-width': 1.6, 'stroke-linecap': 'round',
  }, rot);

  el('circle', { cx, cy, r: r + 13, fill: 'transparent' }, g);
  g.dataset.cx = cx; g.dataset.cy = cy;

  if (opts.label) {
    txt(parent, cx, cy - r - 18, opts.label, opts.labelSize || 9, { fill: C.silver });
  }
  return g;
}

// ---- vertical slider ----------------------------------------------------------------

function buildSlider(parent, id, cx, yTop, h, opts = {}) {
  const g = el('g', { 'data-widget': 'slider', 'data-param': id }, parent);
  // track
  el('rect', {
    x: cx - 3, y: yTop, width: 6, height: h, rx: 3,
    fill: '#0A0D12', stroke: '#2C3542', 'stroke-width': 0.8,
  }, g);
  // cyan value fill (from bottom up to the cap)
  el('rect', {
    'data-fill': id, x: cx - 1.5, y: yTop + h, width: 3, height: 0, rx: 1.5,
    fill: C.cyan, opacity: 0.85,
  }, g);
  // cap
  const cap = el('g', { 'data-cap': id }, g);
  el('rect', {
    x: cx - 13, y: -8, width: 26, height: 16, rx: 3,
    fill: 'url(#capMetal)', stroke: '#3E4654', 'stroke-width': 0.8,
  }, cap);
  el('line', { x1: cx - 9, y1: 0, x2: cx + 9, y2: 0, stroke: '#151A21', 'stroke-width': 2 }, cap);

  el('rect', { x: cx - 16, y: yTop - 10, width: 32, height: h + 20, fill: 'transparent' }, g);
  g.dataset.cx = cx; g.dataset.y0 = yTop; g.dataset.h = h;

  if (opts.label) {
    mono(parent, cx, yTop + h + 22, opts.label, 9, { fill: C.silver });
  }
  return g;
}

// ---- LED buttons ------------------------------------------------------------------------

// draw a small waveform glyph centered at (x,y), stroke color inherits via attr
function waveGlyph(parent, kind, x, y, color) {
  const p = {
    sine: `M${x - 8} ${y} Q ${x - 4} ${y - 7} ${x} ${y} Q ${x + 4} ${y + 7} ${x + 8} ${y}`,
    tri: `M${x - 8} ${y + 4} L${x - 3} ${y - 4} L${x + 2} ${y + 4} L${x + 8} ${y - 3}`,
    square: `M${x - 8} ${y + 4} L${x - 8} ${y - 4} L${x} ${y - 4} L${x} ${y + 4} L${x + 8} ${y + 4} L${x + 8} ${y - 4}`,
    saw: `M${x - 7} ${y + 4} L${x + 3} ${y - 4} L${x + 3} ${y + 4} L${x + 7} ${y + 4}`,
    pulse: `M${x - 8} ${y + 4} L${x - 8} ${y - 4} L${x - 4} ${y - 4} L${x - 4} ${y + 4} L${x + 8} ${y + 4} L${x + 8} ${y - 4}`,
    sh: `M${x - 8} ${y + 3} H${x - 4} V${y - 3} H${x} V${y + 1} H${x + 4} V${y - 4} H${x + 8}`,
    play: `M${x - 5} ${y - 7} L${x + 7} ${y} L${x - 5} ${y + 7} Z`,
  }[kind];
  return el('path', {
    d: p, stroke: color, 'stroke-width': 1.5, fill: kind === 'play' ? color : 'none',
    'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-glyph': '1',
  }, parent);
}

// group of N small LED buttons; opts.items: [{label}|{glyph}], size, pitch
function buildBtnGroup(parent, id, cx, cy, items, opts = {}) {
  const size = opts.size || 24;
  const pitch = opts.pitch || size + 7;
  const total = pitch * (items.length - 1);
  const g = el('g', {
    'data-widget': 'btngroup', 'data-param': id, 'data-positions': items.length,
  }, parent);

  items.forEach((it, i) => {
    const bx = cx - total / 2 + i * pitch;
    const b = el('g', { 'data-idx': i }, g);
    el('rect', {
      'data-face': 1, x: bx - size / 2, y: cy - size / 2, width: size, height: size, rx: 5,
      fill: C.surface, stroke: C.btnStroke, 'stroke-width': 0.9,
    }, b);
    if (it.glyph) waveGlyph(b, it.glyph, bx, cy, C.muted);
    if (it.label) {
      mono(b, bx, cy + 3.2, it.label, it.labelSize || 8, { fill: C.muted });
    }
    if (it.sub) mono(g, bx, cy + size / 2 + 11, it.sub, 6.5, { fill: C.faint });
  });

  if (opts.label) txt(parent, cx, cy - size / 2 - 10, opts.label, 8.5, { fill: C.silver });
  return g;
}

// single latching LED button
function buildLatch(parent, id, cx, cy, opts = {}) {
  const size = opts.size || 24;
  const g = el('g', { 'data-widget': 'latch', 'data-param': id }, parent);
  el('rect', {
    'data-face': 1, x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: 5,
    fill: C.surface, stroke: C.btnStroke, 'stroke-width': 0.9,
  }, g);
  el('circle', { 'data-dot': 1, cx, cy, r: 3.4, fill: C.ledOff }, g);
  if (opts.label) txt(parent, cx, cy - size / 2 - 10, opts.label, 8.5, { fill: C.silver });
  if (opts.labelBelow) mono(parent, cx, cy + size / 2 + 13, opts.labelBelow, 7, { fill: C.faint });
  return g;
}

// ---- case & panel ---------------------------------------------------------------------------

function sectionTitle(svg, i, label) {
  txt(svg, (SECT_X[i] + SECT_X[i + 1]) / 2, 58, label, 11.5, {
    font: FONT_DISPLAY, weight: 600, ls: 2.6, fill: C.silver,
  });
}

function buildCase(svg) {
  el('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: C.bg }, svg);
  // side rails
  el('rect', { x: 0, y: 0, width: 16, height: VIEW_H, fill: '#161B22' }, svg);
  el('rect', { x: VIEW_W - 16, y: 0, width: 16, height: VIEW_H, fill: '#161B22' }, svg);
  el('line', { x1: 16, y1: 0, x2: 16, y2: VIEW_H, stroke: '#000', 'stroke-width': 1 }, svg);
  el('line', { x1: VIEW_W - 16, y1: 0, x2: VIEW_W - 16, y2: VIEW_H, stroke: '#000', 'stroke-width': 1 }, svg);

  el('rect', { x: PANEL.x, y: PANEL.y, width: PANEL.w, height: PANEL.h, fill: 'url(#panelFace)' }, svg);
  el('rect', { x: 16, y: DECK.y, width: VIEW_W - 32, height: VIEW_H - DECK.y, fill: 'url(#deckFace)' }, svg);
  el('line', { x1: 16, y1: DECK.y, x2: VIEW_W - 16, y2: DECK.y, stroke: '#000', 'stroke-width': 1.5 }, svg);

  // outer hairline + section dividers (aperture-ring precision)
  el('rect', {
    x: SECT_X[0], y: AREA.y, width: SECT_X[SECT_X.length - 1] - SECT_X[0], height: AREA.h,
    rx: 10, fill: 'none', stroke: C.lineStrong, 'stroke-width': 1,
  }, svg);
  for (let i = 1; i < SECT_X.length - 1; i++) {
    el('line', {
      x1: SECT_X[i], y1: AREA.y + 10, x2: SECT_X[i], y2: AREA.y + AREA.h - 10,
      stroke: C.line, 'stroke-width': 1,
    }, svg);
  }

  // corner brackets (business-card motif)
  const br = (x, y, dx, dy) => {
    el('path', {
      d: `M${x + dx * 10} ${y} L${x} ${y} L${x} ${y + dy * 10}`,
      stroke: C.gold, 'stroke-width': 1, fill: 'none', opacity: 0.7,
    }, svg);
  };
  br(28, 28, 1, 1);
  br(VIEW_W - 28, 28, -1, 1);
  br(28, VIEW_H - 24, 1, -1);
  br(VIEW_W - 28, VIEW_H - 24, -1, -1);
}

// vector recreation of the aperture iris mark, noir monochrome
function buildEmblem(svg, cx, cy, r) {
  const g = el('g', { opacity: 0.95 }, svg);
  el('circle', { cx, cy, r, fill: 'none', stroke: C.gold, 'stroke-width': 1.6 }, g);
  // 6 iris blades
  for (let i = 0; i < 6; i++) {
    const a0 = (i * 60 * Math.PI) / 180;
    const a1 = ((i * 60 + 52) * Math.PI) / 180;
    const inner = r * 0.42;
    el('line', {
      x1: cx + Math.cos(a0) * r * 0.92, y1: cy + Math.sin(a0) * r * 0.92,
      x2: cx + Math.cos(a1) * inner, y2: cy + Math.sin(a1) * inner,
      stroke: C.gold, 'stroke-width': 1.3,
    }, g);
  }
  el('circle', { cx, cy, r: r * 0.42, fill: 'none', stroke: C.gold, 'stroke-width': 1 }, g);
  el('circle', { cx, cy, r: 1.6, fill: C.gold }, g);
  return g;
}

function buildBranding(svg) {
  // microtype, bottom-left of panel
  mono(svg, 44, 536, 'AP·1 — ANALOG MODELING SYNTHESIZER', 8, { anchor: 'start', fill: C.faint });
  mono(svg, 44, 550, 'EST. MMXXVI · ARPERTURE MEDIA', 7, { anchor: 'start', fill: '#45454B' });
  // crosshair microdetail
  const chx = 470, chy = 542;
  el('line', { x1: chx - 10, y1: chy, x2: chx + 10, y2: chy, stroke: C.faint, 'stroke-width': 0.8 }, svg);
  el('line', { x1: chx, y1: chy - 8, x2: chx, y2: chy + 8, stroke: C.faint, 'stroke-width': 0.8 }, svg);
  el('circle', { cx: chx, cy: chy, r: 2, fill: C.gold }, svg);

  // MIDI LEARN button — arm, click a knob/slider, twist a controller knob
  const lb = el('g', { id: 'midi-learn-btn', 'data-widget': 'midilearn' }, svg);
  el('rect', {
    'data-face': 1, x: 560, y: 519, width: 22, height: 22, rx: 5,
    fill: C.surface, stroke: C.btnStroke, 'stroke-width': 0.9,
  }, lb);
  el('circle', { 'data-dot': 1, cx: 571, cy: 530, r: 3.2, fill: C.ledOff }, lb);
  mono(lb, 592, 533.5, 'MIDI LEARN', 7.5, { anchor: 'start', fill: C.faint });
  el('rect', { x: 556, y: 514, width: 118, height: 32, fill: 'transparent' }, lb);

  // wordmark, bottom-right of panel — emblem sits clear of the name
  buildEmblem(svg, 1364, 530, 17);
  txt(svg, 1636, 539, 'APERTURE', 30, {
    font: FONT_DISPLAY, weight: 600, ls: 7, fill: C.gold, anchor: 'end',
  });
  el('line', { x1: 1417, y1: 549, x2: 1636, y2: 549, stroke: C.gold, 'stroke-width': 0.8, opacity: 0.6 }, svg);
}

// ---- sections ------------------------------------------------------------------------------------

function buildSections(svg) {
  // -- 1: TUNE / GLIDE
  {
    const cx = (SECT_X[0] + SECT_X[1]) / 2;
    buildKnob(svg, 'tune', cx, 130, 20, { bipolar: true, label: 'TUNE' });
    buildKnob(svg, 'glide', cx, 330, 20, { label: 'GLIDE' });
  }

  // -- 2: MOD
  {
    sectionTitle(svg, 1, 'MOD');
    const cL = SECT_X[1] + 44, cR = SECT_X[2] - 44;
    buildKnob(svg, 'modRate', cL, 140, 18, { label: 'RATE' });
    buildKnob(svg, 'modAmount', cR, 140, 18, { label: 'AMOUNT' });
    mono(svg, cR, 176, 'SUB→FILTER', 6.5, { fill: C.faint });

    buildBtnGroup(svg, 'modShape', (SECT_X[1] + SECT_X[2]) / 2, 268, [
      { glyph: 'sine' }, { glyph: 'tri' }, { glyph: 'square' }, { glyph: 'sh' },
    ], { label: 'SHAPE', size: 26, pitch: 34 });

    buildLatch(svg, 'oscMod', SECT_X[1] + 44, 386, {
      label: 'OSC MOD', size: 26,
    });
    buildLatch(svg, 'osc2Mod', SECT_X[2] - 44, 386, {
      label: 'OSC 2 MOD', size: 26,
    });
  }

  // -- 3: OSCILLATORS
  {
    const cA = SECT_X[2] + 78, cB = (SECT_X[2] + SECT_X[3]) / 2 + 10, cC = SECT_X[3] - 78;

    txt(svg, (SECT_X[2] + SECT_X[3]) / 2, 58, 'OSCILLATOR 1', 11.5, { font: FONT_DISPLAY, weight: 600, ls: 2.6, fill: C.silver });
    buildBtnGroup(svg, 'osc1Octave', cA, 122, [
      { label: "32'" }, { label: "16'" }, { label: "8'" },
    ], { label: 'OCTAVE', size: 26, pitch: 33 });
    buildLatch(svg, 'sync', cB, 122, { label: 'SYNC', size: 26, labelBelow: '2→1' });
    buildBtnGroup(svg, 'osc1Wave', cC, 122, [
      { glyph: 'saw' }, { glyph: 'tri' }, { glyph: 'pulse' },
    ], { label: 'WAVE', size: 26, pitch: 33 });

    txt(svg, (SECT_X[2] + SECT_X[3]) / 2, 208, 'OSCILLATOR 2', 11.5, { font: FONT_DISPLAY, weight: 600, ls: 2.6, fill: C.silver });
    buildBtnGroup(svg, 'osc2Octave', cA, 276, [
      { label: "16'" }, { label: "8'" }, { label: "4'" },
    ], { label: 'OCTAVE', size: 26, pitch: 33 });
    buildKnob(svg, 'osc2Interval', cB, 278, 19, { bipolar: true, label: 'INTERVAL' });
    buildBtnGroup(svg, 'osc2Wave', cC, 276, [
      { glyph: 'saw' }, { glyph: 'tri' }, { glyph: 'square' },
    ], { label: 'WAVE', size: 26, pitch: 33 });

    txt(svg, (SECT_X[2] + SECT_X[3]) / 2, 372, 'SUB OSCILLATOR', 11.5, { font: FONT_DISPLAY, weight: 600, ls: 2.6, fill: C.silver });
    buildBtnGroup(svg, 'subOctave', cA + 20, 432, [
      { label: '-1', sub: 'OCT' }, { label: '-2', sub: 'OCT' },
    ], { label: 'RANGE', size: 26, pitch: 34 });
    // fixed square voice badge
    const bx = cC - 20;
    el('rect', { x: bx - 22, y: 418, width: 44, height: 28, rx: 5, fill: 'none', stroke: C.line, 'stroke-width': 1 }, svg);
    waveGlyph(svg, 'square', bx, 432, C.faint);
    mono(svg, bx, 460, 'SQUARE', 6.5, { fill: C.faint });
  }

  // -- 4: MIXER
  {
    sectionTitle(svg, 3, 'MIXER');
    const cL = SECT_X[3] + 48, cR = SECT_X[4] - 46;
    buildKnob(svg, 'mixOsc1', cL, 132, 18, { label: 'OSC 1' });
    buildKnob(svg, 'mixOsc2', cL, 272, 18, { label: 'OSC 2' });
    buildKnob(svg, 'mixSub', cL, 412, 18, { label: 'SUB' });

    buildLatch(svg, 'filterMod', cR, 126, { label: 'FILTER MOD', size: 26 });
    buildKnob(svg, 'masterVolume', cR, 268, 18, { label: 'VOLUME' });
    buildBtnGroup(svg, 'kbdTracking', cR, 408, [
      { label: '0', sub: 'OFF' }, { label: '½', sub: 'HALF' }, { label: '1', sub: 'FULL' },
    ], { label: 'KBD TRACK', size: 22, pitch: 28 });
  }

  // -- 5: FILTER
  {
    sectionTitle(svg, 4, 'FILTER');
    const cx = (SECT_X[4] + SECT_X[5]) / 2;
    buildKnob(svg, 'cutoff', cx, 168, 28, { label: 'CUTOFF' });
    buildKnob(svg, 'emphasis', SECT_X[4] + 50, 340, 18, { label: 'EMPHASIS' });
    mono(svg, SECT_X[4] + 50, 378, 'SELF OSC →', 6, { fill: C.faint });
    buildKnob(svg, 'contourAmount', SECT_X[5] - 50, 340, 18, { label: 'CONTOUR' });
  }

  // -- 6/7: contour slider banks
  const bank = (idx, prefix, title) => {
    sectionTitle(svg, idx, title);
    const x0 = SECT_X[idx];
    const cxs = [0, 1, 2, 3].map((i) => x0 + 48 + i * 48);
    const labels = ['A', 'D', 'S', 'R'];
    const ids = ['Attack', 'Decay', 'Sustain', 'Release'];
    cxs.forEach((cx, i) => {
      buildSlider(svg, prefix + ids[i], cx, 96, 320, { label: labels[i] });
    });
  };
  bank(5, 'f', 'FILTER CONTOUR');
  bank(6, 'l', 'LOUDNESS CONTOUR');

  // -- 8: EFFECTS
  {
    sectionTitle(svg, 7, 'EFFECTS');
    const x0 = SECT_X[7], x1 = SECT_X[8];
    const cx = (x0 + x1) / 2;

    const block = (y0, name, onId, typeId, types, timeId, depthId, syncId) => {
      mono(svg, x0 + 14, y0 + 14, name, 9, { anchor: 'start', fill: C.silver });
      if (syncId) {
        buildLatch(svg, syncId, x1 - 54, y0 + 10, { size: 18 });
        mono(svg, x1 - 54, y0 + 28, 'SYNC', 5.5, { fill: C.faint });
        mono(svg, x1 - 26, y0 + 28, 'ON', 5.5, { fill: C.faint });
      }
      buildLatch(svg, onId, x1 - 26, y0 + 10, { size: 18 });
      buildBtnGroup(svg, typeId, cx, y0 + 46, types.map((t) => ({ label: t, labelSize: 6.5 })), { size: 24, pitch: 31 });
      buildKnob(svg, timeId, cx - 38, y0 + 100, 14);
      buildKnob(svg, depthId, cx + 38, y0 + 100, 14);
      mono(svg, cx - 38, y0 + 128, 'TIME', 6.5, { fill: C.faint });
      mono(svg, cx + 38, y0 + 128, 'DEPTH', 6.5, { fill: C.faint });
      if (y0 > 80) {
        el('line', { x1: x0 + 12, y1: y0 - 2, x2: x1 - 12, y2: y0 - 2, stroke: C.line, 'stroke-width': 1 }, svg);
      }
    };

    block(72, 'MOD', 'modFxOn', 'modFxType', ['CHO', 'FLA', 'PHA'], 'modFxTime', 'modFxDepth');
    block(216, 'DELAY', 'dlyOn', 'dlyType', ['ST', 'PP', 'TAPE'], 'dlyTime', 'dlyDepth', 'dlySync');
    block(360, 'REVERB', 'revOn', 'revType', ['PLATE', 'HALL'], 'revTime', 'revDepth');
  }
}

// ---- performance plate + keyboard --------------------------------------------------------------------

function buildWheel(parent, id, cx, top, h) {
  const w = 38;
  const g = el('g', { 'data-widget': 'wheel', 'data-param': id }, parent);
  el('rect', { x: cx - w / 2 - 5, y: top - 6, width: w + 10, height: h + 12, rx: 6, fill: '#060607' }, g);
  el('rect', { x: cx - w / 2, y: top, width: w, height: h, rx: 4, fill: 'url(#wheelFace)', stroke: '#000', 'stroke-width': 1 }, g);
  const ribs = el('g', { 'data-ribs': id, stroke: '#00000055', 'stroke-width': 1.4 }, g);
  for (let i = 1; i < 12; i++) {
    const ry = top + (h * i) / 12;
    el('line', { x1: cx - w / 2 + 3, y1: ry, x2: cx + w / 2 - 3, y2: ry }, ribs);
  }
  el('rect', {
    'data-groove': id, x: cx - w / 2 + 4, y: top + h / 2 - 1.5, width: w - 8, height: 3, rx: 1.5,
    fill: C.cyan, filter: 'url(#glow)',
  }, g);
  el('rect', { x: cx - w / 2, y: top, width: w, height: 20, fill: '#000', opacity: 0.45, rx: 4 }, g);
  el('rect', { x: cx - w / 2, y: top + h - 20, width: w, height: 20, fill: '#000', opacity: 0.45, rx: 4 }, g);
  el('rect', { x: cx - w / 2 - 5, y: top - 6, width: w + 10, height: h + 12, rx: 6, fill: 'transparent' }, g);
  g.dataset.cy = top + h / 2; g.dataset.h = h;
  return g;
}

function buildPlate(svg) {
  const p = PLATE;
  el('rect', {
    x: p.x, y: p.y, width: p.w, height: p.h, rx: 10,
    fill: 'none', stroke: C.lineStrong, 'stroke-width': 1,
  }, svg);
  mono(svg, p.x + p.w / 2, p.y + 24, 'PERFORMANCE', 8, { fill: C.muted });

  const pw = el('g', { id: 'power-switch', 'data-widget': 'power' }, svg);
  const led = el('circle', {
    id: 'power-led', cx: p.x + 30, cy: p.y + 52, r: 4.5,
    fill: '#3A1518', stroke: '#000', 'stroke-width': 1,
  }, pw);
  led.style.transition = 'fill 120ms';
  mono(pw, p.x + 62, p.y + 55, 'POWER', 7, { anchor: 'start', fill: C.muted });
  el('rect', { x: p.x + 14, y: p.y + 38, width: 100, height: 28, fill: 'transparent' }, pw);

  const wTop = p.y + 84, wH = 226;
  buildWheel(svg, 'pitchWheel', p.x + 72, wTop, wH);
  buildWheel(svg, 'modWheel', p.x + 148, wTop, wH);
  mono(svg, p.x + 72, p.y + 336, 'PITCH', 7.5, { fill: C.muted });
  mono(svg, p.x + 148, p.y + 336, 'MOD', 7.5, { fill: C.muted });
}

const WHITE_STEP = { F: 2, G: 2, A: 2, B: 1, C: 2, D: 2, E: 1 };
const LETTERS = ['F', 'G', 'A', 'B', 'C', 'D', 'E'];

export function keyboardNotes() {
  const whites = [], blacks = [];
  let note = KEYS.lowNote;
  let li = 0;
  for (let i = 0; note <= KEYS.lowNote + KEYS.count - 1; i++) {
    const x = KEYS.x + i * KEYS.whiteW;
    whites.push({ note, x });
    const step = WHITE_STEP[LETTERS[li % 7]];
    if (step === 2 && note + 1 <= KEYS.lowNote + KEYS.count - 1) {
      blacks.push({ note: note + 1, x: x + KEYS.whiteW - KEYS.blackW / 2 });
    }
    note += step;
    li++;
  }
  return { whites, blacks };
}

function buildKeyboard(svg) {
  const { whites, blacks } = keyboardNotes();
  const kb = el('g', { id: 'keyboard' }, svg);
  el('rect', { x: KEYS.x - 4, y: KEYS.y - 8, width: whites.length * KEYS.whiteW + 8, height: 8, fill: '#050506' }, kb);

  for (const k of whites) {
    const r = el('rect', {
      'data-widget': 'key', 'data-note': k.note,
      x: k.x, y: KEYS.y, width: KEYS.whiteW - 1.2, height: KEYS.whiteH,
      rx: 2.5, fill: 'url(#whiteKey)', stroke: '#3F3F44', 'stroke-width': 0.8,
    }, kb);
    r.dataset.kind = 'white';
  }
  for (const k of blacks) {
    const r = el('rect', {
      'data-widget': 'key', 'data-note': k.note,
      x: k.x, y: KEYS.y, width: KEYS.blackW, height: KEYS.blackH,
      rx: 2.5, fill: 'url(#blackKey)', stroke: '#000', 'stroke-width': 0.8,
    }, kb);
    r.dataset.kind = 'black';
  }
}

// ---- sequencer strip ----------------------------------------------------------------------------------

function buildSequencer(svg) {
  const q = SEQ;
  el('rect', {
    x: q.x, y: q.y, width: q.w, height: q.h, rx: 10,
    fill: C.panel, stroke: C.lineStrong, 'stroke-width': 1,
  }, svg);

  mono(svg, q.x + 20, q.y + 26, 'SEQUENCER — 32 STEP', 8.5, { anchor: 'start', fill: C.muted });

  // bar indicator panel
  for (let b = 0; b < 2; b++) {
    const bx = q.x + 24 + b * 34;
    const g = el('g', { 'data-widget': 'barled', 'data-bar': b }, svg);
    el('rect', {
      'data-barface': b, x: bx, y: q.y + 44, width: 24, height: 24, rx: 5,
      fill: C.surface, stroke: C.btnStroke, 'stroke-width': 0.9,
    }, g);
    mono(g, bx + 12, q.y + 60, String(b + 1), 9, { fill: C.muted });
    el('rect', { x: bx - 3, y: q.y + 41, width: 30, height: 30, fill: 'transparent' }, g);
  }
  mono(svg, q.x + 55, q.y + 86, 'BAR', 7, { fill: C.faint });

  // transport
  const playG = el('g', { 'data-widget': 'playbtn', id: 'seq-play' }, svg);
  el('rect', {
    'data-face': 1, x: q.x + 116, y: q.y + 38, width: 38, height: 38, rx: 7,
    fill: C.surface, stroke: C.btnStroke, 'stroke-width': 1,
  }, playG);
  waveGlyph(playG, 'play', q.x + 135, q.y + 57, C.muted);
  mono(svg, q.x + 135, q.y + 90, 'PLAY', 7, { fill: C.faint });

  const recG = el('g', { 'data-widget': 'recbtn', id: 'seq-rec' }, svg);
  el('rect', {
    'data-face': 1, x: q.x + 166, y: q.y + 38, width: 38, height: 38, rx: 7,
    fill: C.surface, stroke: C.btnStroke, 'stroke-width': 1,
  }, recG);
  el('circle', { 'data-dot': 1, cx: q.x + 185, cy: q.y + 57, r: 6, fill: C.ledOff }, recG);
  mono(svg, q.x + 185, q.y + 90, 'REC', 7, { fill: C.faint });

  buildKnob(svg, 'seqTempo', q.x + 262, q.y + 58, 16);
  mono(svg, q.x + 262, q.y + 96, 'TEMPO', 7, { fill: C.faint });
  const bpm = mono(svg, q.x + 306, q.y + 64, '120', 22, { anchor: 'start', fill: C.cyanBright });
  bpm.id = 'bpm-readout';
  mono(svg, q.x + 306, q.y + 80, 'BPM', 7, { anchor: 'start', fill: C.faint });

  // hint
  mono(svg, q.x + 20, q.y + 130, 'REC+STOP: STEP RECORD · REC+PLAY: MOTION REC', 6.5, { anchor: 'start', fill: C.faint });
  mono(svg, q.x + 20, q.y + 144, 'ALT+CLICK: TIE · SHIFT+CLICK: CLEAR · OFF STEP = REST', 6.5, { anchor: 'start', fill: C.faint });

  // 16 step buttons + tie LEDs in the gaps between them
  const sx0 = q.x + 396, pitch = 75.5, size = 56;
  const sy = q.y + 58;
  for (let i = 0; i < 16; i++) {
    const bx = sx0 + i * pitch;
    const num = mono(svg, bx + size / 2, sy - 12, String(i + 1), 7.5, { fill: C.faint });
    num.setAttribute('data-stepnum', i);
    const g = el('g', { 'data-widget': 'step', 'data-step': i }, svg);
    el('rect', {
      'data-stepface': i, x: bx, y: sy, width: size, height: size, rx: 8,
      fill: C.surface, stroke: C.btnStroke, 'stroke-width': 1,
    }, g);
    el('rect', {
      'data-stepled': i, x: bx + 7, y: sy + 7, width: size - 14, height: size - 14, rx: 5,
      fill: C.ledOff,
    }, g);

    // tie LED in the gap to the right of this step (shows the NEXT step's tie)
    const tx = bx + size + (pitch - size) / 2;
    const tg = el('g', { 'data-widget': 'tieled', 'data-tie': i }, svg);
    el('circle', { 'data-tiedot': i, cx: tx, cy: sy + size / 2, r: 3, fill: C.ledOff }, tg);
    el('rect', { x: tx - 9, y: sy + size / 2 - 12, width: 18, height: 24, fill: 'transparent' }, tg);
  }
  // quarter-note tick marks under steps
  for (let i = 0; i < 16; i += 4) {
    el('circle', { cx: sx0 + i * pitch + size / 2, cy: sy + size + 14, r: 1.6, fill: C.faint }, svg);
  }
}

// ---- public --------------------------------------------------------------------------------------------

export function buildUnit(svg) {
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  buildDefs(svg);
  buildCase(svg);
  buildSections(svg);
  buildBranding(svg);
  buildPlate(svg);
  buildKeyboard(svg);
  buildSequencer(svg);
}

export { KEYS };
