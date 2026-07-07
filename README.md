# Aperture

The Arperture Media noir-edition mono synth — an evolution of the Prodigy recreation
(project root) with a modern feature set: sub oscillator, sub-driven filter growl,
4-shape LFO, full ADSR contours on sliders, a 32-step sequencer with motion
recording, and a stereo FX chain (mod / delay / reverb). Styled after the
"Aperture Noir" design philosophy: slate-blue surfaces, electric-cyan LEDs,
silver hairline type. Every knob's position reads out on an LED ring — no
printed pointers.

## Run it

```bash
npm install              # first time only
./scripts/fetch-fonts.sh # first time only — downloads Clash Display (see app/assets/fonts/FONT-LICENSES.md)
npm start
```

Click the POWER LED on the performance plate (or just play) to start audio.

## Play it

- **USB MIDI keyboard** — plug in and play; pitch bend ±7 st, CC1 = mod wheel.
  Every panel control answers to a CC (chart below). MIDI Start/Stop/Continue
  (0xFA/0xFC/0xFB) drives the sequencer transport.
- **Computer keys** — `A W S E D F T G Y H U J K O L P ; '` from C, `Z`/`X` octave.
- **Mouse** — drag knobs/sliders/wheels vertically (`Shift` = fine, double-click = default,
  scroll wheel works), click buttons, click/drag keys.

## The new sections

- **MOD** — RATE + **AMOUNT**: amount of audio-rate **sub-oscillator → filter cutoff**
  FM ("growl"), independent of the wheel-driven LFO path. SHAPE: SINE / TRI /
  SQ (unipolar, heritage quirk) / **S&H**. **OSC MOD** routes the LFO to both
  oscillators; **OSC 2 MOD** routes it to oscillator 2 alone (beating and,
  with SYNC on, LFO-driven sync sweeps).
- **SUB OSCILLATOR** — square, tracks OSC 1, RANGE −1 or −2 octaves; own MIXER level.
- **CONTOURS** — real ADSR on vertical sliders (1 ms – 10 s log ranges).
- **VEL→CUTOFF** (FILTER section) — note velocity tracks the filter: full-force
  strikes open to the CUTOFF knob setting, soft strikes close it by up to
  ~3.5 octaves. Applies to live MIDI playing and to sequencer step velocities
  (loudness stays velocity-insensitive either way — heritage).
- **EFFECTS** — MOD (chorus / flanger / phaser), DELAY (stereo / ping-pong / tape,
  **SYNC** locks TIME to musical divisions of the sequencer tempo: 16th → half
  note across the knob), REVERB (plate / hall). Each: type buttons, TIME + DEPTH, ON.

## Sequencer (32 steps)

16 LED step buttons + BAR 1/2 indicator (click a bar LED to view that half; the
view follows the playhead while running). **Bright cyan = playhead · dim cyan = step with data (brighter when it holds
motion locks) · unlit = rest · coral outline = record cursor.**

- **Click** a step: toggle **note ↔ rest** (a rest stays unlit). **Shift-click**: clear the step.
- **Ties**: **alt-click** a step to tie it to the previous one — the note holds
  through with no retrigger, and the **LED between the two steps lights**.
  Clicking that in-between LED toggles the tie too. Tied steps still fire
  their p-locks.
- **REC + stopped** = step record: played notes fill steps **with their velocity**
  (cursor auto-advances; click a step to move the cursor). Turning a knob
  p-locks the cursor step.
- **REC + playing** = realtime: notes + velocity land on the current step;
  **knob moves are recorded as motion locks** on the playing step and replay
  with the pattern (they animate the panel as they fire).
- Per-step **velocity** scales the VCA like an accent (live keyboard playing
  stays velocity-insensitive — heritage behavior; mouse/computer keys record 0.8).
- **Right-click a step** for the step menu: pick the **note by name/octave**
  (C0–B8, no keyboard needed), set **velocity 0–127**, toggle TIE, or **CLEAR**.
- **SNAPSHOT** (in the step menu) locks *every* panel setting to that step —
  when the playhead lands there the whole panel jumps to the saved state and
  latches until a later step (lock or snapshot) changes it. Snapshots work on
  rests too, so you can automate the panel without triggering a note.
- **STEPS 16/32** selector by the transport switches the pattern length
  (bar 2 dims in 16-step mode).
- PLAY/REC, TEMPO knob (40–240) + BPM readout. The working pattern and tempo persist.

## Saving — patch libraries & sequence banks

Both live in the bottom strip and work the same way:

- **PATCH** — four libraries **A / B / C / D**, 128 named slots each (512 patches).
  Library A ships pre-loaded with the factory patches. Pick a library + slot,
  then **Save** (a dialog pops up to name it), **Load**, or **Clear**. **Init**
  resets the panel to the blank patch.
- **SEQ** — four banks **A / B / C / D**, 128 named slots each (512 sequences).
  Same Save (named) / Load / Clear. A saved sequence carries its steps, ties,
  velocities, locks/snapshots, tempo, and length. **Init** (click twice)
  clears the working sequence.

Saving opens a small naming dialog (Enter to confirm, Esc to cancel). Filled
slots show their name in the dropdown; empty ones read "· empty". Patches and
sequences are independent, so any sequence can play under any patch.

## MIDI Learn

Every knob and slider can be re-assigned to any controller knob:

1. Click **MIDI LEARN** on the panel (bottom strip — it arms coral).
2. Click the knob or slider you want to map (it pulses).
3. Twist a knob on your MIDI controller — the assignment locks in and a
   popup shows the CC number.
4. Map as many controls as you like, then click MIDI LEARN again (or press
   `Esc`) to exit.

**Shift-click** a control while armed to reset it to its factory CC.
Assigning a CC that's already in use steals it; the previous owner falls
back to its default. Assignments persist between launches. CC 1 stays
reserved for the mod wheel, CC 120/123 for all-notes-off. Buttons and
switches keep their factory CCs (chart below) — they aren't learnable.

## MIDI implementation chart

Factory defaults (omni; MIDI Learn overrides take precedence for knobs and
sliders). Knobs/sliders take 0–127; switches split the range per position.

| CC | Control | CC | Control |
|----|---------|----|---------|
| 1  | Mod wheel | 74 | Cutoff (standard) |
| 3  | Tune | 71 | Emphasis (standard) |
| 5  | Glide | 22 | Contour Amount |
| 76 | Mod Rate | 28 | Mod Amount (growl) |
| 77 | Osc 2 Interval | 23/24/25/29 | Filter A/D/S/R |
| 20 | Mixer Osc 1 | 73/72/26/30 | Loudness A/D/S/R |
| 21 | Mixer Osc 2 | 27 | Mixer Sub |
| 7  | Master Volume | 85/86 | ModFX Time/Depth |
| 102| Osc 1 Octave | 87/88 | Delay Time/Depth |
| 103| Osc 1 Wave | 89/90 | Reverb Time/Depth |
| 104| Osc 2 Octave | 113/114 | ModFX On/Type |
| 105| Osc 2 Wave | 115/116 | Delay On/Type |
| 106| Sync | 117/118 | Reverb On/Type |
| 111| Osc 2 Mod | 119 | Delay Sync |
| 107| Oscillator Mod | 109 | Mod Shape (4-pos) |
| 108| Filter Mod | 110 | Kbd Tracking |
| 112| Sub Octave | 80 | Vel→Cutoff on/off |

Voicing and FX constants are grouped under `TUNE BY EAR` at the top of
`app/audio/aperture-processor.js`. The heritage voice behaviors (low-note
priority, single trigger, sync's pitch-wheel reroute, linear glide) carry over
from the Prodigy engine.

## Package as a Mac app

```bash
npm run package    # unsigned .app in dist/mac*/
```
