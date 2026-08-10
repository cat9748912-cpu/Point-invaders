// ══════════════════════════════════════════════════════════════════════
//  🔊 POINT INVADERS — AUDIO ENGINE
// ══════════════════════════════════════════════════════════════════════
// Every sound in the arcade is SYNTHESISED at runtime out of oscillators and
// noise — there are no .wav/.mp3 files to ship, fetch, cache or 404 on. That
// keeps the whole hub a three-file drop-in that still works from a file:// URL
// or offline, and it means a laser can be pitched per-shot instead of being one
// frozen recording replayed 200 times a round.
//
// Public surface (all no-ops, never throwing, if Web Audio is missing):
//   SFX.play(name, opts)   — one-shot effect; opts {vol, semi, rate}
//   SFX.music(track)       — 'hub' | 'game' | null
//   SFX.mode / cycleMode() — 'full' → 'sfx' → 'mute' → 'full'
//   SFX.bindToggle(el)     — wires a button to cycleMode() and keeps it labelled
//
// The engine stays deliberately self-contained: a single IIFE that knows
// nothing about games, screens or scores and shares nothing with the rest of
// this file but the window.SFX handle, so it can still be lifted straight back
// out into another project. It sits at the very top because the code below
// binds the 🔊 buttons via SFX.bindToggle() while loading.
window.SFX = (function(){
'use strict';

// ── PERSISTED PREFERENCES ─────────────────────────────────────────────
// One control, three settings. Music is the part people turn off first, so it
// gets its own rung on the ladder rather than being all-or-nothing with the
// effects. localStorage is wrapped because Safari's private mode throws on it.
const LS_KEY = 'pi_audio_mode';
const MODES = ['full','sfx','mute'];
function loadMode(){
  try{ const v = localStorage.getItem(LS_KEY); return MODES.includes(v) ? v : 'full'; }
  catch(e){ return 'full'; }
}
function saveMode(m){ try{ localStorage.setItem(LS_KEY, m); }catch(e){} }

let mode = loadMode();

// ── GRAPH ─────────────────────────────────────────────────────────────
//   voices ─┬─▶ sfxBus  ──┬─▶ comp ─▶ master ─▶ speakers
//           └─▶ musicBus ─┘        (delay send hangs off musicBus)
// The compressor is the thing that keeps a Nova Bomb — thirty explosions in
// four frames — from clipping into a crackle. Buses are separate so muting the
// music can't cut an effect that's mid-decay.
let ctx=null, master=null, comp=null, sfxBus=null, musicBus=null, musicDelay=null;
let noiseBuf=null, unlocked=false;

const SUPPORTED = !!(window.AudioContext || window.webkitAudioContext);

function ensureCtx(){
  if(ctx || !SUPPORTED) return ctx;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.25;

    master = ctx.createGain();   master.gain.value = 0.85;
    sfxBus = ctx.createGain();   sfxBus.gain.value = (mode === 'mute') ? 0 : 1;
    musicBus = ctx.createGain(); musicBus.gain.value = (mode === 'full') ? 1 : 0;

    // Feedback delay on the music only — it's what turns four bare oscillators
    // into something that sounds like a soundtrack. Effects stay dry so a hit
    // still reads as instant feedback.
    musicDelay = ctx.createDelay(1.0);
    // Placeholder only — music() retunes this to the track's tempo on every
    // start. A delay is a rhythmic instrument here, not an ambience knob.
    musicDelay.delayTime.value = 0.30;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const wet = ctx.createGain(); wet.gain.value = 0.30;
    const damp = ctx.createBiquadFilter(); damp.type='lowpass'; damp.frequency.value = 2600;
    musicDelay.connect(damp); damp.connect(fb); fb.connect(musicDelay);
    musicDelay.connect(wet); wet.connect(comp);

    sfxBus.connect(comp); musicBus.connect(comp);
    comp.connect(master); master.connect(ctx.destination);
  }catch(e){ ctx = null; }
  return ctx;
}

// Browsers hand back a SUSPENDED context until the page has been interacted
// with, and silently drop anything scheduled into it. Every plausible first
// gesture resumes it, then unhooks itself.
// resume() is a promise, and on the very first gesture the context is still
// SUSPENDED when the handler returns — so the retry has to hang off the promise
// rather than off a state read taken microseconds too early. Getting this wrong
// leaves the soundtrack permanently silent while effects work fine.
function unlock(){
  const c = ensureCtx();
  if(!c) return;
  unlocked = true;
  if(c.state === 'suspended') c.resume().then(resumeMusic).catch(()=>{});
  else resumeMusic();
}
['pointerdown','touchstart','keydown','mousedown','click'].forEach(ev=>{
  window.addEventListener(ev, unlock, { capture:true, passive:true });
});

// Tabbing away shouldn't leave a soundtrack playing in a background tab, and
// setInterval throttling there would bunch the scheduler up anyway.
document.addEventListener('visibilitychange', ()=>{
  if(!ctx) return;
  if(document.hidden){ try{ ctx.suspend(); }catch(e){} }
  else if(unlocked){ try{ ctx.resume().then(resumeMusic).catch(()=>{}); }catch(e){} }
});

function noiseBuffer(){
  if(noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for(let i=0;i<len;i++) d[i] = Math.random()*2 - 1;
  return noiseBuf;
}

// ── PRIMITIVES ────────────────────────────────────────────────────────
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clampF = f => Math.max(20, Math.min(18000, f || 20));

// A single pitched voice. f1 makes it a sweep, which is the whole vocabulary of
// retro sound design: up = good, down = bad, down-fast = laser.
function tone(t0, o){
  const g = ctx.createGain();
  const osc = ctx.createOscillator();
  const dur = o.dur, vol = o.vol == null ? 0.2 : o.vol;
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(clampF(o.f0), t0);
  if(o.f1 && o.f1 !== o.f0){
    if(o.linear) osc.frequency.linearRampToValueAtTime(clampF(o.f1), t0 + dur);
    else osc.frequency.exponentialRampToValueAtTime(clampF(o.f1), t0 + dur);
  }
  if(o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const atk = o.attack == null ? 0.005 : o.attack;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
  if(o.hold) g.gain.setValueAtTime(Math.max(0.0002, vol), t0 + Math.min(dur, atk + o.hold));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g);
  let tail = g;
  if(o.filter){
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(clampF(o.fc), t0);
    if(o.fc1) f.frequency.exponentialRampToValueAtTime(clampF(o.fc1), t0 + dur);
    f.Q.value = o.q == null ? 1 : o.q;
    g.connect(f); tail = f;
  }
  tail.connect(o.bus || sfxBus);
  if(o.send) tail.connect(o.send);

  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
  return osc;
}

// Noise through a swept filter: every impact, whoosh and explosion in the hub.
function noise(t0, o){
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  src.playbackRate.value = o.rate || 1;

  const f = ctx.createBiquadFilter();
  f.type = o.filter || 'lowpass';
  f.frequency.setValueAtTime(clampF(o.fc), t0);
  if(o.fc1) f.frequency.exponentialRampToValueAtTime(clampF(o.fc1), t0 + o.dur);
  f.Q.value = o.q == null ? 1 : o.q;

  const g = ctx.createGain();
  const vol = o.vol == null ? 0.2 : o.vol;
  const atk = o.attack == null ? 0.003 : o.attack;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  if(o.send) g.connect(o.send);
  src.start(t0);
  src.stop(t0 + o.dur + 0.03);
  return src;
}

// Play a run of notes as one gesture — used by every chime, fanfare and denial.
function seq(t0, notes, o){
  o = o || {};
  notes.forEach((n, i) => {
    const step = o.step == null ? 0.075 : o.step;
    tone(t0 + i * step, {
      type: o.type || 'square',
      f0: mtof(n), f1: o.glide ? mtof(n) * o.glide : 0,
      dur: o.dur == null ? 0.16 : o.dur,
      vol: (o.vol == null ? 0.18 : o.vol) * (o.fade ? 1 - i * 0.12 : 1),
      attack: o.attack
    });
  });
}

// ── EFFECT BANK ───────────────────────────────────────────────────────
// `gap` is the minimum milliseconds between retriggers of the same effect. Game
// loops fire collision events dozens of times per frame; without a floor here,
// a Meltdown-tier Nebula wave stacks 40 identical explosions on the same sample
// boundary and the result is a click, not a bang. It also caps the voice count
// for free.
const BANK = {
  // ── INTERFACE ──
  ui:        { gap: 30,  fn:(t)=>{ tone(t,{type:'triangle',f0:880,f1:1180,dur:0.055,vol:0.13}); } },
  uiBack:    { gap: 30,  fn:(t)=>{ tone(t,{type:'triangle',f0:640,f1:400,dur:0.075,vol:0.13}); } },
  hover:     { gap: 45,  fn:(t)=>{ tone(t,{type:'sine',f0:1500,dur:0.028,vol:0.05}); } },
  tab:       { gap: 30,  fn:(t)=>{ tone(t,{type:'square',f0:1046,dur:0.045,vol:0.09}); } },
  toggle:    { gap: 30,  fn:(t)=>{ seq(t,[76,83],{type:'square',dur:0.09,vol:0.13,step:0.055}); } },
  error:     { gap: 120, fn:(t)=>{ tone(t,{type:'sawtooth',f0:190,f1:96,dur:0.28,vol:0.16,filter:'lowpass',fc:900});
                                   tone(t+0.09,{type:'sawtooth',f0:150,f1:80,dur:0.24,vol:0.12,filter:'lowpass',fc:700}); } },
  deny:      { gap: 90,  fn:(t)=>{ tone(t,{type:'square',f0:240,f1:150,dur:0.16,vol:0.14}); } },
  success:   { gap: 120, fn:(t)=>{ seq(t,[72,76,79,84],{type:'square',dur:0.2,vol:0.15,step:0.07}); } },
  login:     { gap: 200, fn:(t)=>{ seq(t,[60,67,72,76,79],{type:'triangle',dur:0.42,vol:0.13,step:0.085});
                                   noise(t,{dur:0.5,vol:0.05,filter:'highpass',fc:400,fc1:5000}); } },
  logout:    { gap: 200, fn:(t)=>{ seq(t,[72,67,60,55],{type:'triangle',dur:0.3,vol:0.12,step:0.085}); } },

  // ── ECONOMY ──
  coin:      { gap: 40,  fn:(t)=>{ tone(t,{type:'square',f0:mtof(88),dur:0.07,vol:0.15});
                                   tone(t+0.06,{type:'square',f0:mtof(93),dur:0.22,vol:0.15}); } },
  purchase:  { gap: 150, fn:(t)=>{ seq(t,[72,76,79,84,88],{type:'square',dur:0.26,vol:0.14,step:0.06});
                                   noise(t+0.1,{dur:0.5,vol:0.05,filter:'bandpass',fc:3000,fc1:8000,q:2}); } },
  equip:     { gap: 120, fn:(t)=>{ seq(t,[79,84,88],{type:'triangle',dur:0.3,vol:0.14,step:0.055});
                                   noise(t,{dur:0.35,vol:0.045,filter:'highpass',fc:2000,fc1:9000}); } },
  convert:   { gap: 150, fn:(t)=>{ tone(t,{type:'sine',f0:400,f1:1200,dur:0.3,vol:0.14});
                                   seq(t+0.14,[84,91],{type:'square',dur:0.2,vol:0.11,step:0.07}); } },

  // ── ROUND FLOW ──
  countdown: { gap: 200, fn:(t)=>{ tone(t,{type:'square',f0:520,dur:0.16,vol:0.16,hold:0.06});
                                   tone(t,{type:'sine',f0:1040,dur:0.1,vol:0.06}); } },
  go:        { gap: 200, fn:(t)=>{ tone(t,{type:'square',f0:880,dur:0.42,vol:0.2,hold:0.18});
                                   tone(t,{type:'square',f0:1320,dur:0.42,vol:0.09,hold:0.18});
                                   noise(t,{dur:0.3,vol:0.06,filter:'highpass',fc:1200,fc1:8000}); } },
  gameOver:  { gap: 400, fn:(t)=>{ seq(t,[65,62,58,53],{type:'sawtooth',dur:0.45,vol:0.16,step:0.15});
                                   tone(t+0.45,{type:'sine',f0:120,f1:45,dur:0.9,vol:0.18}); } },
  victory:   { gap: 400, fn:(t)=>{ seq(t,[72,76,79,84],{type:'square',dur:0.3,vol:0.16,step:0.1});
                                   seq(t+0.4,[88],{type:'square',dur:0.7,vol:0.17,step:0.1});
                                   noise(t+0.4,{dur:0.8,vol:0.05,filter:'bandpass',fc:2000,fc1:9000,q:1.5}); } },
  results:   { gap: 400, fn:(t)=>{ seq(t,[67,72,76],{type:'triangle',dur:0.35,vol:0.14,step:0.09}); } },

  // ── WEAPONS & IMPACTS ──
  shoot:     { gap: 45,  fn:(t,o)=>{ const p=Math.pow(2,(o.semi||0)/12);
                                   tone(t,{type:'square',f0:940*p,f1:180*p,dur:0.11,vol:0.11,filter:'lowpass',fc:5000,fc1:900}); } },
  plasma:    { gap: 55,  fn:(t)=>{ tone(t,{type:'sawtooth',f0:1300,f1:210,dur:0.16,vol:0.11,filter:'lowpass',fc:4000,fc1:700,q:6});
                                   tone(t,{type:'square',f0:650,f1:120,dur:0.14,vol:0.05}); } },
  missile:   { gap: 60,  fn:(t)=>{ noise(t,{dur:0.28,vol:0.10,filter:'bandpass',fc:500,fc1:2600,q:1.4});
                                   tone(t,{type:'sawtooth',f0:180,f1:640,dur:0.26,vol:0.07}); } },
  enemyShot: { gap: 70,  fn:(t)=>{ tone(t,{type:'sawtooth',f0:420,f1:110,dur:0.13,vol:0.07,filter:'lowpass',fc:2200,fc1:500}); } },
  hit:       { gap: 30,  fn:(t)=>{ noise(t,{dur:0.07,vol:0.13,filter:'bandpass',fc:2200,q:1.2});
                                   tone(t,{type:'square',f0:420,f1:200,dur:0.06,vol:0.07}); } },
  explode:   { gap: 45,  fn:(t)=>{ noise(t,{dur:0.34,vol:0.24,filter:'lowpass',fc:2400,fc1:120});
                                   tone(t,{type:'sine',f0:190,f1:48,dur:0.3,vol:0.16}); } },
  bigExplode:{ gap: 140, fn:(t)=>{ noise(t,{dur:0.75,vol:0.3,filter:'lowpass',fc:3800,fc1:80});
                                   tone(t,{type:'sine',f0:150,f1:34,dur:0.8,vol:0.26});
                                   tone(t,{type:'sawtooth',f0:90,f1:28,dur:0.6,vol:0.1,filter:'lowpass',fc:600}); } },
  slash:     { gap: 60,  fn:(t)=>{ noise(t,{dur:0.13,vol:0.14,filter:'bandpass',fc:3400,fc1:700,q:2.2});
                                   tone(t,{type:'sawtooth',f0:800,f1:260,dur:0.1,vol:0.05}); } },
  dash:      { gap: 90,  fn:(t)=>{ noise(t,{dur:0.24,vol:0.12,filter:'bandpass',fc:700,fc1:3400,q:1.6});
                                   tone(t,{type:'sine',f0:260,f1:820,dur:0.2,vol:0.06}); } },

  // ── PLAYER STATE ──
  hurt:      { gap: 110, fn:(t)=>{ tone(t,{type:'sawtooth',f0:340,f1:90,dur:0.32,vol:0.17,filter:'lowpass',fc:1600,fc1:400});
                                   noise(t,{dur:0.16,vol:0.11,filter:'lowpass',fc:1200}); } },
  shieldHit: { gap: 100, fn:(t)=>{ tone(t,{type:'sine',f0:900,f1:280,dur:0.22,vol:0.13});
                                   noise(t,{dur:0.12,vol:0.07,filter:'bandpass',fc:1800,q:3}); } },
  heal:      { gap: 150, fn:(t)=>{ seq(t,[72,79,84],{type:'sine',dur:0.4,vol:0.13,step:0.07}); } },
  shield:    { gap: 150, fn:(t)=>{ tone(t,{type:'sine',f0:300,f1:1100,dur:0.42,vol:0.13});
                                   tone(t+0.05,{type:'triangle',f0:450,f1:1650,dur:0.4,vol:0.07}); } },
  powerup:   { gap: 120, fn:(t)=>{ seq(t,[67,72,76,79,84],{type:'square',dur:0.24,vol:0.14,step:0.055}); } },
  levelUp:   { gap: 250, fn:(t)=>{ seq(t,[60,64,67,72,76,79,84],{type:'square',dur:0.34,vol:0.15,step:0.06});
                                   noise(t,{dur:0.6,vol:0.05,filter:'highpass',fc:600,fc1:8000}); } },
  ability:   { gap: 160, fn:(t)=>{ tone(t,{type:'sawtooth',f0:120,f1:1400,dur:0.4,vol:0.13,filter:'lowpass',fc:600,fc1:6000,q:5});
                                   seq(t+0.2,[84,91],{type:'square',dur:0.3,vol:0.11,step:0.07}); } },
  charge:    { gap: 200, fn:(t)=>{ tone(t,{type:'sawtooth',f0:200,f1:1600,dur:0.7,vol:0.1,filter:'lowpass',fc:800,fc1:5000,q:8}); } },

  // ── PICKUPS & SCORING ──
  pickup:    { gap: 35,  fn:(t,o)=>{ const p=Math.pow(2,(o.semi||0)/12);
                                   tone(t,{type:'triangle',f0:760*p,f1:1420*p,dur:0.1,vol:0.13}); } },
  eat:       { gap: 35,  fn:(t,o)=>{ const p=Math.pow(2,(o.semi||0)/12);
                                   tone(t,{type:'square',f0:600*p,f1:1000*p,dur:0.08,vol:0.12});
                                   tone(t+0.05,{type:'square',f0:1000*p,dur:0.09,vol:0.09}); } },
  score:     { gap: 45,  fn:(t,o)=>{ const s=o.semi||0; seq(t,[84+s,91+s],{type:'square',dur:0.2,vol:0.13,step:0.055}); } },
  combo:     { gap: 45,  fn:(t,o)=>{ const s=Math.min(12,o.semi||0); seq(t,[79+s,86+s],{type:'square',dur:0.18,vol:0.12,step:0.045}); } },
  wave:      { gap: 300, fn:(t)=>{ seq(t,[62,69,74,81],{type:'square',dur:0.36,vol:0.15,step:0.08});
                                   noise(t,{dur:0.5,vol:0.05,filter:'bandpass',fc:800,fc1:6000,q:1.5}); } },

  // ── PHYSICS / BOARD ──
  bounce:    { gap: 25,  fn:(t,o)=>{ const p=Math.pow(2,(o.semi||0)/12);
                                   tone(t,{type:'square',f0:620*p,f1:520*p,dur:0.07,vol:0.13}); } },
  bounceWall:{ gap: 25,  fn:(t)=>{ tone(t,{type:'square',f0:330,f1:290,dur:0.06,vol:0.10}); } },
  brick:     { gap: 25,  fn:(t,o)=>{ const s=o.semi||0;
                                   tone(t,{type:'square',f0:mtof(72+s),dur:0.08,vol:0.13});
                                   noise(t,{dur:0.06,vol:0.06,filter:'bandpass',fc:3200,q:2}); } },
  jump:      { gap: 40,  fn:(t)=>{ tone(t,{type:'square',f0:300,f1:760,dur:0.13,vol:0.12,filter:'lowpass',fc:3000});
                                   noise(t,{dur:0.09,vol:0.05,filter:'highpass',fc:2000}); } },
  flap:      { gap: 40,  fn:(t)=>{ tone(t,{type:'triangle',f0:420,f1:900,dur:0.1,vol:0.12});
                                   noise(t,{dur:0.08,vol:0.06,filter:'bandpass',fc:1400,fc1:3000,q:1.2}); } },
  rotate:    { gap: 25,  fn:(t)=>{ tone(t,{type:'square',f0:520,f1:640,dur:0.045,vol:0.09}); } },
  move:      { gap: 25,  fn:(t)=>{ tone(t,{type:'square',f0:300,dur:0.028,vol:0.06}); } },
  land:      { gap: 40,  fn:(t)=>{ tone(t,{type:'sine',f0:200,f1:70,dur:0.14,vol:0.16});
                                   noise(t,{dur:0.09,vol:0.09,filter:'lowpass',fc:900}); } },
  hardDrop:  { gap: 60,  fn:(t)=>{ tone(t,{type:'sawtooth',f0:700,f1:90,dur:0.13,vol:0.13,filter:'lowpass',fc:2600,fc1:400});
                                   noise(t+0.1,{dur:0.16,vol:0.14,filter:'lowpass',fc:1000,fc1:200}); } },
  lineClear: { gap: 80,  fn:(t,o)=>{ const n=Math.max(1,Math.min(4,o.semi||1));
                                   seq(t,[72,76,79,84].slice(0,n+1),{type:'square',dur:0.3,vol:0.15,step:0.05});
                                   noise(t,{dur:0.35+n*0.05,vol:0.09,filter:'bandpass',fc:900,fc1:7000,q:1.2}); } },

  // ── PUZZLE / QUIZ ──
  flip:      { gap: 30,  fn:(t)=>{ tone(t,{type:'triangle',f0:700,f1:980,dur:0.06,vol:0.10}); } },
  match:     { gap: 60,  fn:(t,o)=>{ const s=o.semi||0; seq(t,[76+s,83+s],{type:'sine',dur:0.3,vol:0.15,step:0.075}); } },
  correct:   { gap: 50,  fn:(t)=>{ seq(t,[79,86],{type:'square',dur:0.2,vol:0.14,step:0.06}); } },
  wrong:     { gap: 60,  fn:(t)=>{ tone(t,{type:'sawtooth',f0:220,f1:130,dur:0.22,vol:0.13,filter:'lowpass',fc:1100}); } },
  // Node Hacker pitches its 16 keys up a minor-pentatonic ladder, so a correct
  // replay is literally the melody you were just played back.
  node:      { gap: 20,  fn:(t,o)=>{ const scale=[0,3,5,7,10];
                                   const i=Math.max(0,o.semi||0);
                                   const m=57 + scale[i%5] + 12*Math.floor(i/5);
                                   tone(t,{type:'triangle',f0:mtof(m),dur:0.26,vol:0.16});
                                   tone(t,{type:'sine',f0:mtof(m+12),dur:0.2,vol:0.06}); } },
  alarm:     { gap: 500, fn:(t)=>{ tone(t,{type:'square',f0:880,dur:0.16,vol:0.13,hold:0.06});
                                   tone(t+0.2,{type:'square',f0:660,dur:0.2,vol:0.13,hold:0.06}); } },
  tick:      { gap: 200, fn:(t)=>{ tone(t,{type:'square',f0:1200,dur:0.04,vol:0.08}); } }
};

// ── PLAYBACK ──────────────────────────────────────────────────────────
const lastAt = Object.create(null);

function play(name, opts){
  if(mode === 'mute') return;
  const def = BANK[name];
  if(!def) return;
  const now = performance.now();
  if(now - (lastAt[name] || -1e9) < def.gap) return;
  lastAt[name] = now;
  const c = ensureCtx();
  if(!c || c.state !== 'running') return;
  try{ def.fn(c.currentTime + 0.001, opts || {}); }
  catch(e){ /* one bad effect must never take a game frame down with it */ }
}

// ══════════════════════════════════════════════════════════════════════
//  🎵 MUSIC — a step sequencer, not a file
// ══════════════════════════════════════════════════════════════════════
// Same four-chord synthwave loop underneath both tracks (Am–F–C–G); the hub
// plays it as a slow pad-and-arp, a round plays it at nearly 1.5× with a kick,
// a hat and a driving sixteenth arpeggio. Notes are scheduled ahead of the
// clock in a lookahead window, because setInterval is far too jittery to place
// a downbeat on its own.
const CHORDS = [
  { root: 45, notes: [45, 48, 52, 57, 60, 64] },  // Am
  { root: 41, notes: [41, 45, 48, 53, 57, 60] },  // F
  { root: 48, notes: [48, 52, 55, 60, 64, 67] },  // C
  { root: 43, notes: [43, 47, 50, 55, 59, 62] }   // G
];

const TRACKS = {
  hub:  { bpm: 92,  gain: 0.30 },
  game: { bpm: 136, gain: 0.26 }
};

let curTrack = null, pendingTrack = null, schedTimer = null;
let nextStepTime = 0, stepIdx = 0;
const LOOKAHEAD = 0.15, TICK_MS = 25;

function kick(t, vol){
  tone(t, { type:'sine', f0:170, f1:44, dur:0.20, vol:vol, attack:0.002, bus:musicBus });
  noise(t, { dur:0.045, vol:vol*0.5, filter:'lowpass', fc:1600, fc1:300, bus:musicBus });
}
function hat(t, vol, open){
  noise(t, { dur: open?0.14:0.035, vol:vol, filter:'highpass', fc:7000, bus:musicBus });
}
function snare(t, vol){
  noise(t, { dur:0.16, vol:vol, filter:'bandpass', fc:1900, q:0.8, bus:musicBus });
  tone(t, { type:'triangle', f0:330, f1:180, dur:0.12, vol:vol*0.5, bus:musicBus });
}

function musicStep(i, t){
  const track = TRACKS[curTrack];
  const g = track.gain;
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const ch = CHORDS[bar];

  if(curTrack === 'hub'){
    // Pad: a slow-attack triad held across the whole bar, plus a bass root.
    if(s === 0){
      ch.notes.slice(0,3).forEach((n,k)=>{
        tone(t, { type:'sawtooth', f0:mtof(n+12), dur:2.4, vol:g*0.07, attack:0.5,
                  filter:'lowpass', fc:700, fc1:1400, q:1, detune:(k-1)*7, bus:musicBus });
      });
      tone(t, { type:'triangle', f0:mtof(ch.root-12), dur:0.9, vol:g*0.30, bus:musicBus });
    }
    if(s === 8) tone(t, { type:'triangle', f0:mtof(ch.root-12), dur:0.7, vol:g*0.22, bus:musicBus });
    // Sparse arpeggio into the delay — this is the line you actually hum.
    if(s % 4 === 2){
      const n = ch.notes[(Math.floor(i/4) * 2) % ch.notes.length] + 12;
      tone(t, { type:'square', f0:mtof(n), dur:0.34, vol:g*0.10,
                filter:'lowpass', fc:2600, bus:musicBus, send:musicDelay });
    }
    if(s % 8 === 4) hat(t, g*0.06);
  } else {
    // Round music: constant sixteenth arp, four-on-the-floor, offbeat bass.
    if(s % 4 === 0) kick(t, g*0.55);
    if(s === 4 || s === 12) snare(t, g*0.20);
    if(s % 2 === 1) hat(t, g*0.055, s % 8 === 7);

    const bassPat = [1,0,0,1,0,0,1,0,1,0,0,1,0,1,0,0];
    if(bassPat[s]){
      tone(t, { type:'sawtooth', f0:mtof(ch.root-12), dur:0.13, vol:g*0.34,
                filter:'lowpass', fc:420, fc1:180, q:4, bus:musicBus });
    }
    const arpSeq = [0,2,4,5,4,2,3,1];
    const n = ch.notes[arpSeq[s % 8] % ch.notes.length] + 12;
    tone(t, { type:'square', f0:mtof(n), dur:0.11, vol:g*0.075,
              filter:'lowpass', fc:3200, bus:musicBus, send:musicDelay });
    if(s === 0){
      tone(t, { type:'sawtooth', f0:mtof(ch.notes[0]+12), dur:1.6, vol:g*0.05, attack:0.3,
                filter:'lowpass', fc:900, detune:6, bus:musicBus });
    }
  }
}

function scheduler(){
  if(!ctx || !curTrack) return;
  const stepDur = 60 / TRACKS[curTrack].bpm / 4;   // sixteenth notes
  // A backgrounded tab throttles this interval to once a second or worse. Left
  // alone the catch-up loop would then dump forty steps into the same instant.
  if(nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
  while(nextStepTime < ctx.currentTime + LOOKAHEAD){
    try{ musicStep(stepIdx, nextStepTime); }catch(e){}
    nextStepTime += stepDur;
    stepIdx = (stepIdx + 1) % 64;                  // four bars, then round again
  }
}

function music(track){
  if(track !== null && !TRACKS[track]) return;
  // `pendingTrack` is what the game WANTS playing; `curTrack` is what actually
  // is. They diverge whenever the context is still locked or the music is
  // muted, and every path back in (unlock, un-mute) reads the wanted one.
  pendingTrack = track;
  if(track === curTrack && schedTimer) return;     // already running: don't restart
  stopScheduler();
  curTrack = null;
  if(!track || mode !== 'full') return;
  const c = ensureCtx();
  if(!c || c.state !== 'running') return;          // retried from unlock()
  curTrack = track;

  // ── TEMPO-SYNC THE DELAY ──
  // Everything else in the sequencer derives its timing from bpm; the delay was
  // the one exception, pinned at a flat 300ms. Against the hub's 326ms eighth
  // that lands every echo 26ms early, and against the round's 220ms eighth it
  // lines up with nothing at all — so each repeat fell between the sixteenths
  // of the arp it was echoing, and 0.34 feedback stacked that error up until
  // the groove smeared. A dotted eighth (45/bpm) is the synthwave staple: the
  // echo syncopates ACROSS the sixteenths and lands back on the beat every
  // three, which is what makes an arpeggio cascade instead of blur.
  const dotted8 = 45 / TRACKS[track].bpm;            // 0.489s @ 92 · 0.331s @ 136
  musicDelay.delayTime.setTargetAtTime(dotted8, c.currentTime, 0.02);

  stepIdx = 0;
  nextStepTime = c.currentTime + 0.08;
  schedTimer = setInterval(scheduler, TICK_MS);
  scheduler();
}
function stopScheduler(){
  if(schedTimer){ clearInterval(schedTimer); schedTimer = null; }
}
function resumeMusic(){ if(pendingTrack && !schedTimer) music(pendingTrack); }

// ── MODE CONTROL ──────────────────────────────────────────────────────
function applyMode(){
  saveMode(mode);
  if(ctx){
    const t = ctx.currentTime;
    // Ramped, not switched: a hard gain jump on a running pad is an audible pop.
    sfxBus.gain.cancelScheduledValues(t);
    sfxBus.gain.setTargetAtTime(mode === 'mute' ? 0 : 1, t, 0.02);
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(mode === 'full' ? 1 : 0, t, 0.05);
  }
  if(mode === 'full'){
    if(ctx && ctx.state === 'suspended') ctx.resume().then(resumeMusic).catch(()=>{});
    else resumeMusic();
  }else{
    // Keep the desired track on file so un-muting resumes the right one.
    const want = curTrack || pendingTrack;
    stopScheduler();
    curTrack = null;
    pendingTrack = want;
  }
  buttons.forEach(paintButton);
}

const MODE_UI = {
  full: { icon:'🔊', label:'Audio: effects + music',  toast:'🔊 AUDIO ONLINE — effects + music' },
  sfx:  { icon:'🔈', label:'Audio: effects only',     toast:'🔈 MUSIC MUTED — effects only' },
  mute: { icon:'🔇', label:'Audio: muted',            toast:'🔇 AUDIO OFFLINE' }
};

const buttons = [];
function paintButton(el){
  const ui = MODE_UI[mode];
  el.textContent = ui.icon;
  el.title = ui.label + ' (click to change)';
  el.setAttribute('aria-label', ui.label);
  el.classList.toggle('snd-off', mode === 'mute');
  el.classList.toggle('snd-partial', mode === 'sfx');
}
function bindToggle(el){
  if(!el || buttons.includes(el)) return;
  buttons.push(el);
  paintButton(el);
  el.addEventListener('click', e => { e.stopPropagation(); cycleMode(); });
}
function cycleMode(){
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  applyMode();
  unlock();
  play('toggle');
  return mode;
}
function setMode(m){
  if(!MODES.includes(m) || m === mode) return;
  mode = m; applyMode();
}

return {
  play, music, unlock, bindToggle, cycleMode, setMode,
  get mode(){ return mode; },
  modeToast(){ return MODE_UI[mode].toast; },
  get supported(){ return SUPPORTED; }
};
})();

// ══════════════════════════════════════════════════════════════════════
//  🔥 FIREBASE ENGINE SETUP — REALTIME PROTOCOLS (SAFE CONFIG)
// ══════════════════════════════════════════════════════════════════════
const FB = {
  apiKey:            "AIzaSyC1NZy2ZzNLutYAiE_QjPZGH5CymvGCnDs",
  authDomain:        "neal-with-roblox.firebaseapp.com",
  databaseURL:       "https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "neal-with-roblox",
  storageBucket:     "neal-with-roblox.firebasestorage.app",
  messagingSenderId: "984878364213",
  appId:             "1:984878364213:web:fb1147a1a5ff0b02d2a37c"
};

var auth = null;
var db = null;

try { 
  firebase.initializeApp(FB); 
  auth = firebase.auth(); 
  db = firebase.database(); 
} catch(e) { 
  console.warn('Firebase connection context offline:', e.message); 
}

// ════════════════════════════════════════════
//  🌌 ARCADE HUB HUB AMBIENT BACKGROUND
// ════════════════════════════════════════════
(function(){
  const c = document.getElementById('bg-canvas');
  const x = c.getContext('2d');
  let p=[];
  const resize=()=>{c.width=innerWidth;c.height=innerHeight};
  const init=()=>{p=Array.from({length:110},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.3+.2,a:Math.random(),da:(Math.random()*.012+.003)*(Math.random()<.5?1:-1),s:Math.random()*.35+.05}))};
  const draw=()=>{x.clearRect(0,0,c.width,c.height);p.forEach(pt=>{pt.a+=pt.da;if(pt.a>1||pt.a<0)pt.da*=-1;pt.y-=pt.s;if(pt.y<-2){pt.y=c.height+2;pt.x=Math.random()*c.width}x.beginPath();x.arc(pt.x,pt.y,pt.r,0,Math.PI*2);x.fillStyle=`rgba(255,255,255,${Math.max(0,Math.min(.65,pt.a))})`;x.fill()});requestAnimationFrame(draw)};
  resize();init();draw();window.addEventListener('resize',()=>{resize();init()});
})();

// ════════════════════════════════════════════
//  📦 ENGINE GLOBAL COMPLIANCE ENVIRONMENT
// ════════════════════════════════════════════
let user=null, curGame=null, gTimer=null, gameLoopId=null;
let onQuitGame=null; // optional per-game quit handler

// Deferred callbacks belonging to the running game. Every game paints into the
// same shared DOM, so a timeout that outlives its round lands on the round you
// started next — Reaction Time's re-arm would repaint #g-reaction green under a
// fresh round that hadn't armed its own timer. Anything a game schedules goes
// through gLater() and dies with the game in stopGame().
const gTimeouts = new Set();
function gLater(fn, ms){
  const id = setTimeout(() => { gTimeouts.delete(id); fn(); }, ms);
  gTimeouts.add(id);
  return id;
}

function stopGame(){
  clearInterval(gTimer); gTimer=null;
  cancelAnimationFrame(gameLoopId); gameLoopId=null;
  gTimeouts.forEach(clearTimeout); gTimeouts.clear();
  window.onkeydown=window.onkeyup=null;
  if(aCanvas){
    aCanvas.onmousemove=null; aCanvas.onclick=null;
    aCanvas.ontouchmove=null; aCanvas.ontouchstart=null;
    clearCanvasDrag();
  }
  hideTouchHint();
  const rbox=document.getElementById('g-reaction');
  if(rbox){ rbox.onpointerdown=null; rbox.onclick=null; }
  // Battle Bots builds its deploy cards fresh each round, so emptying the deck
  // drops that round's click handlers along with the nodes carrying them —
  // quitting mid-siege can't leave a live "Deploy Tank" behind. Hidden here as
  // well as in prepGame() so the teardown is complete on its own rather than
  // relying on whatever game happens to mount next to tidy up after it.
  const deck=document.getElementById('bb-deck');
  if(deck){ deck.innerHTML=''; deck.style.display='none'; }
  const ramPill=document.getElementById('bb-ram-pill');
  if(ramPill) ramPill.style.display='none';
  const cl=document.getElementById('ctrl-left');
  const cr=document.getElementById('ctrl-right');
  const ca=document.getElementById('ctrl-action');
  const cd=document.getElementById('ctrl-drop');
  clearHold(cl); clearHold(cr); clearHold(ca); clearHold(cd);
  [cl,cr,ca,cd].forEach(el=>{ if(el) el.onclick=null; });
}
const META = {
  click: { name: 'CLICK FRENZY', emoji: '🖱️', maxPts: 500 },
  nebula: { name: 'NEON NEBULA', emoji: '🚀', maxPts: 1000 },
  tetris: { name: 'CYBERPUNK TETRIS', emoji: '🧱', maxPts: 1500 },
  dodge: { name: 'DODGE CORES', emoji: '💥', maxPts: 800 },
  memory: { name: 'MEMORY MATCH', emoji: '🧠', maxPts: 600 },
  math: { name: 'MATH BLITZ', emoji: '🔢', maxPts: 750 },
  reaction: { name: 'REACTION TIME', emoji: '⚡', maxPts: 400 },
  pong: { name: 'CYBER PONG', emoji: '🏓', maxPts: 900 },
  snake: { name: 'GRID SNAKE', emoji: '🐍', maxPts: 1200 },
  flappy: { name: 'FLAPPY DRONE', emoji: '🚁', maxPts: 1000 },
  breaker:{ name: 'ICE BREAKER',  emoji: '🧊', maxPts: 1100 },
  arena:  { name: 'CYBER ARENA',  emoji: '⚔️', maxPts: 99999 },
  runner: { name: 'CYBER RUNNER', emoji: '🌌', maxPts: 1200 },
  hacker: { name: 'NODE HACKER',  emoji: '🔓', maxPts: 800 },
  meteor: { name: 'METEOR SHIELD',emoji: '☄️', maxPts: 1100 },
  battlebots:{name:'BATTLE BOTS', emoji: '🤖', maxPts: 1200 }
};

// ══════════════════════════════════════════════
//  ⚙️ SYSTEM STABILITY — GLOBAL DIFFICULTY ENGINE
// ══════════════════════════════════════════════
// Three operational tiers. `pointMult` scales final awarded score.
// `speedMult` scales hazard/spawn/object velocities (>1 = more intense).
// `timeMult` scales countdown clocks (<1 = less time on the clock).
const DIFFICULTY_TIERS = {
  stable:      { key:'stable',      label:'STABLE CORE',      icon:'🟢', pointMult:1.0, speedMult:1.0, timeMult:1.0 },
  overclocked: { key:'overclocked', label:'OVERCLOCKED',      icon:'🟡', pointMult:1.5, speedMult:1.5, timeMult:0.75 },
  meltdown:    { key:'meltdown',    label:'CRITICAL MELTDOWN',icon:'🔴', pointMult:2.0, speedMult:2.0, timeMult:0.5 }
};

let currentDifficultyTier = 'stable';
let gameDifficultyMultiplier = 1.0; // tracks the active tier's point multiplier

// Speed/hazard modifier for the active tier (>1 = harder/faster)
function getDifficultyModifier(){
  return DIFFICULTY_TIERS[currentDifficultyTier].speedMult;
}
// Countdown/timer modifier for the active tier (<1 = less time)
function getTimeModifier(){
  return DIFFICULTY_TIERS[currentDifficultyTier].timeMult;
}

function setDifficultyTier(tierKey){
  const tier = DIFFICULTY_TIERS[tierKey];
  if(!tier) return;
  currentDifficultyTier = tierKey;
  gameDifficultyMultiplier = tier.pointMult;
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.toggle('active', b.dataset.tier===tierKey));
  const multEl = document.getElementById('diff-mult');
  if(multEl) multEl.textContent = `×${tier.pointMult.toFixed(1)} PTS`;
  // Recolor the ambient glow behind the panel to match the newly active tier,
  // and give it a brief brighter flash so the change reads as an event, not just a state.
  const sel = document.getElementById('diff-selector');
  if(sel){
    sel.classList.remove('tier-stable','tier-overclocked','tier-meltdown');
    sel.classList.add(`tier-${tierKey}`);
    sel.classList.remove('flash');
    void sel.offsetWidth; // restart the animation/transition even if the same tier is clicked again
    sel.classList.add('flash');
    clearTimeout(sel._flashTimer);
    sel._flashTimer = setTimeout(()=>sel.classList.remove('flash'), 350);
  }
  updateGameCardMaxPoints();
  updateHubDiffDisplay();
}

function lockDifficultySelector(){
  const sel = document.getElementById('diff-selector');
  if(!sel) return;
  sel.classList.add('locked');
  sel.querySelectorAll('.diff-btn').forEach(b=>b.disabled = true);
}
function unlockDifficultySelector(){
  const sel = document.getElementById('diff-selector');
  if(!sel) return;
  sel.classList.remove('locked');
  sel.querySelectorAll('.diff-btn').forEach(b=>b.disabled = false);
}

document.querySelectorAll('.diff-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.disabled) return;
    const tierKey = btn.dataset.tier;
    setDifficultyTier(tierKey);
    const tier = DIFFICULTY_TIERS[tierKey];
    // The tier's own pitch: Stable settles, Overclock lifts, Meltdown alarms.
    snd(tierKey==='meltdown' ? 'alarm' : 'score', { semi: tierKey==='stable' ? -5 : 2 });
    toast(`${tier.icon} SYSTEM STABILITY: ${tier.label} (×${tier.pointMult.toFixed(1)} PTS)`, 2500, `toast-${tierKey}`);
  });
});

function initGameCardBasePoints() {
  document.querySelectorAll('.gc-pts').forEach(el => {
    const txt = el.textContent.match(/UP TO (\d+) PTS/);
    if (txt) {
      const base = parseInt(txt[1],10);
      el.dataset.basePts = base;
    }
  });
}
function updateGameCardMaxPoints() {
  const diff = gameDifficultyMultiplier;
  document.querySelectorAll('.gc-pts').forEach(el => {
    // Cyber Arena is uncapped, so its label never matched the "UP TO n PTS"
    // pattern and initGameCardBasePoints() recorded no base for it. Rewriting
    // it anyway printed "UP TO NaN PTS"; cards without a numeric cap keep
    // whatever label they shipped with.
    const base = parseInt(el.dataset.basePts, 10);
    if (!Number.isFinite(base)) return;
    el.textContent = `UP TO ${Math.floor(base * diff)} PTS`;
  });
}
function updateHubDiffDisplay() {
  const diff = gameDifficultyMultiplier;
  const hubPtsEl = document.getElementById('h-pts');
  let diffEl = document.getElementById('hub-diff');
  if (!diffEl) {
    diffEl = document.createElement('span');
    diffEl.id = 'hub-diff';
    diffEl.style.fontSize = '0.8rem';
    diffEl.style.marginLeft = '6px';
    diffEl.style.color = 'var(--dim)';
    // Append after existing content
    hubPtsEl.appendChild(diffEl);
  }
  diffEl.textContent = `(x${diff})`;
}

// Initialize
initGameCardBasePoints();
updateGameCardMaxPoints();
updateHubDiffDisplay();
const multEl = document.getElementById('diff-mult');
if(multEl) multEl.textContent = `×${gameDifficultyMultiplier.toFixed(1)} PTS`;
document.getElementById('diff-selector')?.classList.add(`tier-${currentDifficultyTier}`);

const aCanvas = document.getElementById('arcade-canvas');
const aCtx = aCanvas?.getContext('2d');

// The play field is a fixed coordinate space and every game draws in those
// units. How big the canvas actually is on screen is a separate concern
// handled by fitCanvas(), which installs a base transform to convert — so the
// board can fill a desktop without a single game knowing about it.
//
// The field was 400×500. Widening it to 560 is a real change to the play
// space, not a stretch: cells and sprites keep their proportions and the games
// get 160 more units of room, which is why each one re-lays-out around it
// (Tetris runs a 14-column well instead of 10, Breaker a wider brick wall,
// Nebula wider invader formations, and so on).
const BOARD_W = 560, BOARD_H = 500;

// A screen is hidden with opacity + pointer-events, never display:none, so the
// buttons on the screen you just LEFT stay in the keyboard focus order. Clicking
// "Play Again" therefore left #btn-again focused for the whole of the next round,
// and the first Space or Enter of that round re-fired it and restarted the game —
// which only ever bit the games you can play without touching the mouse, because
// everywhere else the first click moved focus off the button.
// `inert` takes the outgoing screen out of the focus order and drops focus along
// with it; the explicit blur is the fallback where inert isn't supported.
const showScreen=id=>{
  const next=document.getElementById(id);
  document.querySelectorAll('.screen').forEach(s=>{
    s.classList.remove('active');
    s.inert = s!==next;
  });
  const a=document.activeElement;
  if(a?.closest && a.closest('.screen') && a.closest('.screen')!==next) a.blur?.();
  setTimeout(()=>next?.classList.add('active'),40);
};

let _tt;
const toast=(msg,ms=2500,tintClass=null)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('toast-stable','toast-overclocked','toast-meltdown');if(tintClass)el.classList.add(tintClass);el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),ms)};

// ══════════════════════════════════════════════════════════════════════
//  🔊 AUDIO — hookup to the synth engine at the top of this file
// ══════════════════════════════════════════════════════════════════════
// Everything routes through these two shims rather than touching SFX directly,
// so audio that failed to initialise (no Web Audio, or a browser that blocked
// it) degrades to a silent arcade instead of a ReferenceError in a game loop. They're called from hot paths (per shot,
// per brick), so they stay as cheap as a property lookup — the rate limiting
// and the "is audio even unlocked yet" question live inside the engine.
const snd   = (name, opts) => { if(window.SFX) SFX.play(name, opts); };
const music = track        => { if(window.SFX) SFX.music(track); };

// The 🔊 button appears in both the hub bar and the game header; they're two
// views of one setting, so the engine keeps both labelled in sync.
if(window.SFX){
  SFX.bindToggle(document.getElementById('btn-sound-hub'));
  SFX.bindToggle(document.getElementById('btn-sound-game'));
  ['btn-sound-hub','btn-sound-game'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',()=>toast(SFX.modeToast(),2000));
  });
}

// Generic interface feedback, delegated once at the document instead of bolted
// onto ~40 individual handlers. Anything that navigates BACKWARDS gets the
// descending blip, so the hub always sounds like the place you return to.
// Only `.btn`-classed controls are caught here. The game pad, Click Frenzy's
// button, the difficulty tiers, the mission cards and Memory Match's tiles
// deliberately sit outside it — each of those has a sound of its own that says
// something the generic blip can't.
const BACK_BTNS = new Set(['btn-quit','btn-hub','btn-market-back','btn-logout']);
document.addEventListener('click', e=>{
  const el = e.target.closest?.('.btn, .market-tab, .auth-tab, .fb-close');
  if(!el || el.disabled) return;
  // The audio toggle demos the mode it just switched to, and the shop answers
  // with a purchase/equip cue — neither wants a blip on top.
  if(el.classList.contains('btn-sound') || el.classList.contains('shop-btn')) return;
  if(el.classList.contains('market-tab') || el.classList.contains('auth-tab')) { snd('tab'); return; }
  snd(BACK_BTNS.has(el.id) || el.classList.contains('fb-close') ? 'uiBack' : 'ui');
}, true);

// Browsers keep audio suspended until the page has been interacted with, so
// the sign-in screen can't have a soundtrack on arrival — it gets one on the
// first touch instead. music() is a no-op when the track is already playing,
// so signing in and walking into the hub never restarts the loop.
window.addEventListener('pointerdown', ()=>music('hub'), { once:true });

// ── FULLSCREEN TOGGLE ──
// iOS Safari exposes NO Fullscreen API on ordinary elements, and older
// Android/Safari builds only expose the webkit-prefixed one. The previous
// version called the unprefixed method unconditionally, which throws a
// TypeError on iOS before any promise exists — so .catch() never ran and
// the button silently did nothing. Probe for what's actually there.
const FS = (function(){
  const d = document.documentElement;
  const req  = d.requestFullscreen || d.webkitRequestFullscreen || d.webkitRequestFullScreen || d.msRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
  return (req && exit) ? { req, exit } : null;
})();
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
const fsSupported = () => !!FS;

function toggleFullscreen(){
  if(!FS) return;
  try{
    const p = fsElement() ? FS.exit.call(document) : FS.req.call(document.documentElement);
    if(p && p.catch) p.catch(e => console.warn('Fullscreen request refused:', e));
  }catch(e){ console.warn('Fullscreen unavailable:', e); }
}
function updateFsButtons(){
  const isFs=!!fsElement();
  const icon=isFs?'⛉':'⛶';
  const tip=isFs?'Exit Fullscreen':'Enter Fullscreen';
  ['btn-fs-hub','btn-fs-game'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    // No API at all (iPhone Safari): hide rather than leave a dead button
    if(!FS){ el.style.display='none'; return; }
    el.textContent=icon;el.title=tip;
  });
}
['fullscreenchange','webkitfullscreenchange','msfullscreenchange']
  .forEach(ev => document.addEventListener(ev, updateFsButtons));
document.getElementById('btn-fs-hub').onclick=toggleFullscreen;
document.getElementById('btn-fs-game').onclick=toggleFullscreen;
updateFsButtons();   // hides the buttons up front where unsupported

// ── TOUCH-SAFE HOLD BUTTONS ──
// Mobile browsers only synthesise mousedown AFTER the finger lifts, so
// hold-to-move never worked with plain onmousedown/onmouseup. Pointer
// events cover mouse, touch and stylus in one path. Pointer capture keeps
// the release bound to the button even when the finger slides off it, and
// pointercancel stops a direction sticking "on" when the browser or an
// interruption steals the touch mid-hold.
function bindHold(el, onDown, onUp){
  if(!el) return;
  clearHold(el);
  let held = false;
  const press = e => { if(held) return; if(e && e.cancelable) e.preventDefault(); held = true; onDown(); };
  const release = () => { if(!held) return; held = false; onUp(); };

  const bound = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); bound.push([target, type, fn, opts]); };

  // Touch events, not Pointer Events — same reason as bindCanvasDrag. Mobile
  // browsers cancel the pointer stream out from under a held button the moment
  // they suspect a scroll, so hold-to-move died a few frames in. That left
  // Pong and Nebula, whose only controls were these buttons, unplayable on a
  // phone while onclick-driven games looked fine.
  if('ontouchstart' in window){
    on(el, 'touchstart',  press,   { passive:false });
    on(el, 'touchend',    release, { passive:false });
    on(el, 'touchcancel', release, { passive:false });
  }
  on(el, 'mousedown', press);
  on(el, 'mouseleave', release);
  on(window, 'mouseup', release);   // releasing off the button still counts

  el._holdCleanup = () => bound.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
}
function clearHold(el){
  if(!el) return;
  if(el._holdCleanup){ el._holdCleanup(); el._holdCleanup = null; }
  el.onpointerdown = el.onpointerup = el.onpointercancel = el.onlostpointercapture = null;
  el.onmousedown = el.onmouseup = el.onmouseleave = null;
  el.ontouchstart = el.ontouchend = el.ontouchcancel = null;
}

// ══════════════════════════════════════════════════════════════════════
//  📱 TOUCH ENGINE — canvas gestures, board fitting, control pad layout
// ══════════════════════════════════════════════════════════════════════

// Phones and tablets get the finger-first control scheme (drag to move, hold
// to fire, tap to strike); anything with a mouse keeps keyboard + pointer.
const isTouchDevice = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);

// The board is CSS-scaled to fit the screen, so a raw `clientX - rect.left`
// reads short by the scale factor — a finger on the far right of a 340px-wide
// board reported x≈340 into a 560-wide play field, and every game silently lost
// the last chunk of its width. Everything that turns a pointer into game
// coordinates goes through here.
//
// It measures the CONTENT box, not getBoundingClientRect(). The rect spans the
// border box, but the bitmap only fills the content box — and under the global
// `box-sizing:border-box` the canvas's 2px border eats INTO the width fitCanvas
// assigned rather than adding to it. Measuring the rect therefore reports a
// board 4px wider than the one being drawn and offset 2px left of it, which
// pulled every tap ~3 board units toward the centre at either edge: worst
// exactly where you're threading a gap. clientLeft/clientWidth are the content
// box exactly.
function boardPos(clientX, clientY){
  const rect = aCanvas.getBoundingClientRect();
  const w = aCanvas.clientWidth  || rect.width  || 1;
  const h = aCanvas.clientHeight || rect.height || 1;
  return {
    x: (clientX - rect.left - aCanvas.clientLeft) * (BOARD_W / w),
    y: (clientY - rect.top  - aCanvas.clientTop ) * (BOARD_H / h)
  };
}

// Drag binding for the play surface.
//
// This deliberately does NOT use Pointer Events. Pointer capture on a canvas
// is fragile on real phones: mobile Safari and Android Chrome fire
// pointercancel the moment they suspect the gesture might be a scroll, an
// edge swipe or a browser gesture, which kills the drag a few frames in — the
// game looks frozen even though its loop is running fine. Desktop Chromium
// never reproduces it, which is exactly why it shipped.
//
// Touch Events with a non-passive preventDefault hold the gesture properly,
// and mouse events are bound alongside them so hybrid touch laptops work with
// either input. preventDefault on touchstart also suppresses the synthesised
// mouse events, so a tap can't fire both paths.
const _drag = { touch: [], mouse: [] };
function bindCanvasDrag(handlers){
  clearCanvasDrag();
  if(!aCanvas) return;

  const pos = t => boardPos(t.clientX, t.clientY);
  const on = (target, type, fn, bucket) => {
    target.addEventListener(type, fn, { passive: false });
    _drag[bucket].push([target, type, fn]);
  };

  // ── TOUCH ──
  if('ontouchstart' in window){
    let id = null;
    const mine = list => { for(let i=0;i<list.length;i++) if(list[i].identifier === id) return list[i]; return null; };
    on(aCanvas, 'touchstart', e => {
      if(id !== null) return;                    // one finger drives; ignore extras
      const t = e.changedTouches[0];
      if(!t) return;
      e.preventDefault();
      id = t.identifier;
      handlers.onDown && handlers.onDown(pos(t), e);
    }, 'touch');
    on(aCanvas, 'touchmove', e => {
      const t = mine(e.changedTouches);
      if(!t) return;
      e.preventDefault();
      handlers.onMove && handlers.onMove(pos(t), e);
    }, 'touch');
    const endTouch = e => {
      const t = mine(e.changedTouches);
      if(!t) return;
      e.preventDefault();
      id = null;
      handlers.onUp && handlers.onUp(pos(t), e);
    };
    on(aCanvas, 'touchend', endTouch, 'touch');
    on(aCanvas, 'touchcancel', endTouch, 'touch');
  }

  // ── MOUSE ──
  // move/up live on window so a drag survives the cursor leaving the canvas,
  // which is what pointer capture used to buy us.
  let down = false;
  on(aCanvas, 'mousedown', e => {
    e.preventDefault();
    down = true;
    handlers.onDown && handlers.onDown(pos(e), e);
  }, 'mouse');
  on(aCanvas, 'mousemove', e => {
    if(!down) handlers.onHover && handlers.onHover(pos(e), e);
  }, 'mouse');
  on(window, 'mousemove', e => {
    if(down) handlers.onMove && handlers.onMove(pos(e), e);
  }, 'mouse');
  on(window, 'mouseup', e => {
    if(!down) return;
    down = false;
    handlers.onUp && handlers.onUp(pos(e), e);
  }, 'mouse');
}
function clearCanvasDrag(){
  ['touch','mouse'].forEach(k => {
    _drag[k].forEach(([target, type, fn]) => target.removeEventListener(type, fn));
    _drag[k] = [];
  });
  if(!aCanvas) return;
  // Legacy inline handlers from the pre-gesture code, in case anything set them.
  aCanvas.onpointerdown = aCanvas.onpointermove = null;
  aCanvas.onpointerup = aCanvas.onpointercancel = aCanvas.onlostpointercapture = null;
}

// ── BOARD FITTING ──
// 400×500 is taller than most phone viewports once the header, progress bar
// and control pad have taken their cut, so the bottom of the play field ended
// up below the fold. Measure what's actually left and scale the canvas to it,
// preserving aspect ratio.
//
// The scale runs both ways: it used to be capped at 1×, which kept the board
// at a postage-stamp 400×500 on a desktop with most of the window sitting
// empty around it. It now grows into whatever space the layout leaves over,
// and the canvas's backing store grows with it, so a bigger board is drawn at
// full resolution rather than being a stretched-up 400×500 bitmap.
function fitCanvas(){
  const holder = document.getElementById('g-canvas-holder');
  if(!holder || holder.style.display === 'none' || !aCanvas) return;
  const area = document.querySelector('.g-area');
  if(!area) return;

  const controls = document.getElementById('arcade-controls');
  const ctrlVisible = controls && getComputedStyle(controls).display !== 'none';
  // Landscape parks the pad beside the board instead of beneath it, so it eats
  // width there and height everywhere else.
  const beside = ctrlVisible && getComputedStyle(holder).display === 'flex';
  const ctrlBox = ctrlVisible ? controls.getBoundingClientRect() : null;
  const ctrlH = (ctrlVisible && !beside) ? ctrlBox.height + 10 : 0;   // + #arcade-controls margin-top
  const ctrlW = beside ? ctrlBox.width + 12 : 0;

  // Battle Bots' deploy deck sits under the board and costs it height exactly
  // the way the control pad does, so it has to be measured too — otherwise the
  // board sizes itself into the deck and runs off the bottom of the screen.
  const deck = document.getElementById('bb-deck');
  const deckH = (deck && getComputedStyle(deck).display !== 'none')
    ? deck.getBoundingClientRect().height + 10 : 0;   // + #bb-deck margin-top

  const availW = area.clientWidth - ctrlW;
  // The header is measured, never assumed, so its exact height (title line,
  // stat pills, hint caption) costs the board only what it actually uses.
  // holder.top is independent of the canvas's own height, so measuring it
  // before resizing doesn't feed back on itself. The 24px covers the screen's
  // bottom padding and the home-indicator safe area.
  const availH = window.innerHeight - holder.getBoundingClientRect().top - ctrlH - deckH - 24;

  // Floor is deliberately low: on a landscape phone there genuinely isn't much
  // height, and a small board beats one whose bottom half is off-screen. In
  // practice .g-area's 700px cap binds first (1.75×), keeping the board no
  // wider than the header and progress bar above it; the 1.9× ceiling is a
  // backstop for if that ever widens.
  const scale = Math.min(availW / BOARD_W, Math.max(130, availH) / BOARD_H, 1.9);
  const cssW = Math.round(BOARD_W * scale), cssH = Math.round(BOARD_H * scale);
  aCanvas.style.width  = cssW + 'px';
  aCanvas.style.height = cssH + 'px';

  // Let the header and progress bar track the board's width, so the three read
  // as one unit rather than a narrow field under a full-width bar. The CSS
  // floors it, so a small board can't squeeze the header into wrapping (which
  // would change its height and feed back into the measurement above).
  area.closest('.screen')?.style.setProperty('--board-w', cssW + 'px');

  // Match the backing store to the on-screen size (retina included) and let a
  // base transform map the 560×500 game units onto it. Assigning width/height
  // wipes the canvas and resets context state, so only touch it when the size
  // genuinely changed — every game redraws on its next animation frame.
  //
  // The content box is read back rather than reusing cssW/cssH: the 2px border
  // sits inside them under box-sizing:border-box, so the bitmap has to match
  // what the element actually paints. Trusting cssW squeezed the board by
  // 4/cssW horizontally and 4/cssH vertically — a different factor on each
  // axis, since the board isn't square — which skewed it very slightly.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const dispW = aCanvas.clientWidth || cssW, dispH = aCanvas.clientHeight || cssH;
  const pxW = Math.round(dispW * dpr), pxH = Math.round(dispH * dpr);
  if(aCanvas.width !== pxW || aCanvas.height !== pxH){
    aCanvas.width  = pxW;
    aCanvas.height = pxH;
  }
  aCtx?.setTransform(pxW / BOARD_W, 0, 0, pxH / BOARD_H, 0, 0);
}
let _fitRaf = 0;
function scheduleFit(){ cancelAnimationFrame(_fitRaf); _fitRaf = requestAnimationFrame(fitCanvas); }
window.addEventListener('resize', scheduleFit);
// Orientation flips report the old viewport for a beat on iOS, so re-measure late.
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 260));
if(window.visualViewport) visualViewport.addEventListener('resize', scheduleFit);

// ── CONTROL PAD LAYOUT ──
// Every game declares which buttons it wants and what they say; anything not
// named is hidden. Keeps the pad from carrying a stale ROTATE label into the
// next game and sizes the row for however many buttons survive.
function setControls(cfg){
  const bar = document.getElementById('arcade-controls');
  if(!bar) return;
  bar.style.display = cfg ? 'flex' : 'none';
  bar.classList.remove('four-up','solo-action');

  let shown = 0;
  [['left','ctrl-left'],['action','ctrl-action'],['drop','ctrl-drop'],['right','ctrl-right']]
    .forEach(([key, id]) => {
      const el = document.getElementById(id);
      if(!el) return;
      const label = cfg && cfg[key];
      if(label == null){ el.style.display = 'none'; return; }
      el.style.display = '';
      el.textContent = label;
      // A bare glyph (◀, ↑, ⟳) reads tiny at the label font size — scale those
      // up without stretching worded buttons like "⬇⬇ DROP".
      el.classList.toggle('glyph', [...label].length <= 2);
      shown++;
    });
  if(shown >= 4) bar.classList.add('four-up');
  if(shown === 1) bar.classList.add('solo-action');
  // The purple treatment marks a committing action (Tetris's hard drop), so
  // it's opt-in — Snake's ↓ is just another arrow and shouldn't stand out.
  document.getElementById('ctrl-drop')?.classList.toggle('accent', !!(cfg && cfg.accentDrop));
}

// ── TOUCH TUTORIAL ──
// A finger-driven scheme is invisible until someone tries it, so each touch
// game states its gesture once over the board and clears on first contact.
let _hintTimer = null;
function showTouchHint(text, ms = 3600){
  const el = document.getElementById('touch-hint');
  if(!el) return;
  clearTimeout(_hintTimer);
  if(!isTouchDevice || !text){ el.classList.remove('show'); return; }
  el.textContent = text;
  el.classList.add('show');
  _hintTimer = setTimeout(hideTouchHint, ms);
}
function hideTouchHint(){
  clearTimeout(_hintTimer);
  document.getElementById('touch-hint')?.classList.remove('show');
}

// Header hint line: touch players need the gesture, mouse players the keys.
function setControlHint(touchText, keyText){
  const el = document.getElementById('g-controls');
  if(el) el.textContent = (isTouchDevice ? touchText : keyText) || '';
}

const countdown=cb=>{
  const ov=document.getElementById('cd-ov'),nm=document.getElementById('cd-num');
  ov.classList.add('show');let n=3;
  const tick=()=>{nm.className='';nm.textContent=n>0?n:'GO!';void nm.offsetWidth;nm.className='cd-pop';snd(n>0?'countdown':'go');if(n<=0)setTimeout(()=>{ov.classList.remove('show');cb()},700);else{n--;setTimeout(tick,1000)}};
  tick();
};

// ════════════════════════════════════════════
//  🔐 GATEWAY VALIDATION INTERFACE KEYS
// ════════════════════════════════════════════
// Only the failures make a noise — setErr('') is also how every screen CLEARS
// the line, and that must stay silent.
const setErr=msg=>{if(msg)snd('error');document.getElementById('auth-err').textContent=msg};

// True while an explicit sign-in flow is still seeding its player node.
// Keeps onAuthStateChanged from racing ahead and loading a half-written profile.
let authPending=false;

document.getElementById('tab-login').onclick=()=>{
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('form-login').style.display='';
  document.getElementById('form-signup').style.display='none';
  setErr('');
};
document.getElementById('tab-signup').onclick=()=>{
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('form-signup').style.display='';
  document.getElementById('form-login').style.display='none';
  setErr('');
};

document.getElementById('btn-login').onclick=async()=>{
  if(!auth){toast('⚠️ Connection state unconfigured');return}
  const email=document.getElementById('l-email').value.trim();
  const pass=document.getElementById('l-pass').value;
  if(!email||!pass){setErr('Fields cannot remain unassigned.');return}
  try{const c=await auth.signInWithEmailAndPassword(email,pass);await loadUser(c.user.uid)}
  catch(e){console.error('Sign-in failed:',e);setErrCode(e,'email')}
};

document.getElementById('btn-signup').onclick=async()=>{
  if(!auth||!db){toast('⚠️ Connection state unconfigured');return}
  const name=document.getElementById('s-name').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const pass=document.getElementById('s-pass').value;
  if(!name||!email||!pass){setErr('Fields cannot remain unassigned.');return}
  if(!/^[a-zA-Z0-9_-]{2,20}$/.test(name)){setErr('Format error inside username syntax.');return}
  authPending=true;
  try{
    const c=await auth.createUserWithEmailAndPassword(email,pass);
    await db.ref('players/' + c.user.uid).set({ username: name, totalPoints: 0, gamesPlayed: 0 });
    await loadUser(c.user.uid);
  }catch(e){console.error('Sign-up failed:',e);setErrCode(e,'email')}
  finally{authPending=false}
};

const fErrMap={'auth/email-already-in-use':'Target email node already claimed.','auth/wrong-password':'Input encryption key mismatch.','auth/user-not-found':'Identity node missing.','auth/weak-password':'Minimum signature length unfulfilled.','auth/invalid-email':'Malformed structural routing email.','auth/credential-already-in-use':'That email is already bound to another identity node.','auth/provider-already-linked':'This session already holds a permanent identity.','auth/requires-recent-login':'Session too old to re-key. Exit and sign in again.','auth/email-already-exists':'Target email node already claimed.'};

// 'operation-not-allowed' / 'admin-restricted-operation' usually mean "the
// provider this call needs is switched off" — WHICH provider depends on the
// call, so every site passes its own context.
const fErrProviderOff={
  guest:'Guest protocol offline — enable Anonymous sign-in in the Firebase Console.',
  email:'Email protocol offline — enable Email/Password sign-in in the Firebase Console.'
};

// …except Identity Platform also reuses OPERATION_NOT_ALLOWED for something
// unrelated: with email enumeration protection ON, an address cannot be attached
// to an account until it has been verified, and linking a guest counts as
// "changing email". Same code, completely different fix — the server's own text
// is the only thing that separates them, so read it before deciding.
const fErrRaw=e=>{
  const sr=e&&e.customData&&e.customData.serverResponse;
  return String((sr&&sr.error&&sr.error.message)||(e&&e.message)||'');
};
const fErrVerifyFirst='Identity re-key blocked — turn OFF “Email enumeration protection” '+
                      '(Firebase Console → Authentication → Settings → User actions).';

const fErr=(e,ctx)=>{
  const c=e&&e.code;
  if(c==='auth/operation-not-allowed'||c==='auth/admin-restricted-operation'){
    if(/verify.*email|email.*verif/i.test(fErrRaw(e))) return fErrVerifyFirst;
    return fErrProviderOff[ctx]||fErrProviderOff.email;
  }
  return fErrMap[c]||'Matrix validation anomaly.';
};

// Prints the raw Firebase code under the friendly line. The code is the only
// thing that actually identifies the failure, and several distinct causes share
// one message — on a phone there is no console to read it out of, so it goes
// on screen.
function showAuthErr(el, e, ctx){
  if(!el) return;
  snd('error');
  el.textContent = fErr(e, ctx);
  if(e && e.code){
    const tag = document.createElement('div');
    tag.textContent = e.code;
    tag.style.cssText = 'margin-top:6px;font-family:var(--fd),monospace;font-size:.52rem;' +
                        'letter-spacing:.1em;color:var(--dimmer);text-transform:none';
    el.appendChild(tag);
  }
}
const setErrCode = (e, ctx) => showAuthErr(document.getElementById('auth-err'), e, ctx);

// ── 🎮 GUEST ACCESS — FIREBASE ANONYMOUS AUTH ──
// Derives a stable display handle from the anonymous UID, e.g. "Guest_A1B2C".
const guestTag = uid => 'Guest_' + String(uid).replace(/[^a-zA-Z0-9]/g,'').slice(0,5).toUpperCase();

async function signInAsGuest(){
  if(!auth||!db){toast('⚠️ Connection state unconfigured');return}
  const btn=document.getElementById('btn-guest');
  const label=btn.textContent;
  btn.disabled=true;btn.textContent='⏳ Booting guest node...';
  setErr('');
  authPending=true; // hold off onAuthStateChanged until the profile node exists
  try{
    const c=await auth.signInAnonymously();
    const ref=db.ref('players/' + c.user.uid);
    const snap=await ref.once('value');
    if(!snap.exists()){
      await ref.set({
        username: guestTag(c.user.uid),
        totalPoints: 0,
        gamesPlayed: 0,
        credits: 0,
        isGuest: true,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
    await loadUser(c.user.uid);
    toast('🎮 Guest access granted — progress lives in this browser only.',4000);
  }catch(e){
    console.error('Guest sign-in failed:',e);
    setErrCode(e,'guest');
  }finally{
    authPending=false;
    btn.disabled=false;btn.textContent=label;
  }
}

document.getElementById('btn-guest').onclick=signInAsGuest;

function ensureUserDefaults(raw){
  raw = raw || {};
  const defaults = {
    username: 'Player', totalPoints: 0, gamesPlayed: 0, credits: 0,
    owned: { colors: [], cursors: [], skins: [] },
    equipped: { colors: 'col-cyan', cursors: 'cur-default', skins: 'skin-default' }
  };
  return {
    ...defaults, ...raw,
    owned: {
      colors: [...(raw.owned && raw.owned.colors || [])],
      cursors: [...(raw.owned && raw.owned.cursors || [])],
      skins: [...(raw.owned && raw.owned.skins || [])]
    },
    equipped: { ...defaults.equipped, ...(raw.equipped || {}) }
  };
}

async function loadUser(uid){
  if(!db)return;
  const snapshot = await db.ref('players/' + uid).once('value');
  const data = snapshot.exists() ? snapshot.val() : {};
  user = { uid, ...ensureUserDefaults(data) };
  // Anonymous sessions are the source of truth for guest status, not the DB flag.
  user.isGuest = !!(auth && auth.currentUser && auth.currentUser.isAnonymous);
  if(user.isGuest && !snapshot.exists()) user.username = guestTag(uid);
  applyEquippedCosmetics();
  snd('login');
  enterHub();
}

// Restores an existing session on reload — including anonymous guests, whose
// UID persists in browser storage until they sign out or clear site data.
if(auth)auth.onAuthStateChanged(async u=>{
  if(!u||user||authPending)return;
  try{await loadUser(u.uid)}catch(e){console.error('Session restore failed:',e)}
});

// Wipes an unclaimed guest: removes their leaderboard node AND deletes the
// anonymous identity, so abandoned guests don't pile up in Auth or the DB.
// Only ever runs on an account still flagged isAnonymous — once a guest has
// upgraded via linkWithCredential() this is a no-op and their data is safe.
async function purgeGuestAccount(){
  const cu = auth && auth.currentUser;
  if(!cu || !cu.isAnonymous) return false;
  const uid = cu.uid;
  try{ if(db) await db.ref('players/' + uid).remove(); }
  catch(e){ console.warn('Guest data purge failed:', e); }
  try{ await cu.delete(); }            // delete() also ends the session
  catch(e){ console.warn('Guest identity purge failed:', e); if(auth) auth.signOut(); }
  return true;
}

document.getElementById('btn-logout').onclick=async()=>{
  if(user && user.isGuest){
    const pts = (user.totalPoints||0).toLocaleString();
    const warn = (user.totalPoints>0)
      ? `Exiting deletes this guest profile and its ${pts} PTS permanently.\n\nWant to keep them? Cancel, then use “💾 Save Account”.\n\nExit and delete anyway?`
      : 'Exiting deletes this guest profile permanently. Exit anyway?';
    if(!confirm(warn)) return;
    await purgeGuestAccount();
    snd('logout');
    user=null;showScreen('auth-screen');setErr('');toast('🗑️ Guest profile wiped from the grid.');
    return;
  }
  if(auth)auth.signOut();
  snd('logout');
  user=null;showScreen('auth-screen');setErr('');toast('👋 Terminal connection closed.');
};

// ════════════════════════════════════════════
//  🏠 CENTRAL HUB CONTROLLER
// ════════════════════════════════════════════
function enterHub(){
  document.getElementById('h-uname').textContent=user.username;
  let guestTagEl=document.getElementById('h-guest-tag');
  if(user.isGuest){
    if(!guestTagEl){
      guestTagEl=document.createElement('div');
      guestTagEl.id='h-guest-tag';guestTagEl.className='hub-guest-tag';guestTagEl.textContent='GUEST';
      const un=document.getElementById('h-uname');un.parentNode.insertBefore(guestTagEl,un.nextSibling);
    }
    guestTagEl.style.display='';
  }else if(guestTagEl){guestTagEl.style.display='none'}
  // "Save Account" is only meaningful while the session is still anonymous
  const saveBtn=document.getElementById('btn-save-acct');
  if(saveBtn)saveBtn.style.display=user.isGuest?'':'none';
  document.getElementById('h-pts').textContent=`🏆 ${(user.totalPoints||0).toLocaleString()} PTS`;
  document.getElementById('h-credits').textContent=`💎 ${(user.credits||0).toLocaleString()} CR`;
  showScreen('hub-screen');
  music('hub');
  loadLeaderboard();
  unlockDifficultySelector();
}

document.getElementById('btn-market').onclick=()=>openMarket();
document.getElementById('btn-market-back').onclick=()=>enterHub();

document.querySelectorAll('.game-card').forEach(card=>{
  // Desktop only: on a phone every "hover" is really the start of a tap, so
  // the card would blip twice for one press.
  if(!isTouchDevice) card.addEventListener('mouseenter',()=>snd('hover'));
  card.addEventListener('click',()=>{
    const gid=card.dataset.game;
    curGame=gid;
    snd('success');
    document.getElementById('g-title').textContent=META[gid].name;
    showScreen('game-screen');
    prepGame(gid);
  });
});

document.getElementById('btn-quit').onclick=()=>{
  if(onQuitGame){const fn=onQuitGame;onQuitGame=null;fn();return;}
  stopGame();
  setControls(null);
  document.getElementById('game-screen').classList.remove('canvas-game');
  enterHub();
};

// ════════════════════════════════════════════
//  🎮 ROUTING & SCHEDULING INTERFACE
// ════════════════════════════════════════════
function prepGame(gid){
  stopGame();
  onQuitGame=null;
  music('game');
  lockDifficultySelector();
  document.getElementById('g-click').style.display='none';
  document.getElementById('g-canvas-holder').style.display='none';
  document.getElementById('g-memory').style.display='none';
  document.getElementById('g-math').style.display='none';
  document.getElementById('g-reaction').style.display='none';
  document.getElementById('g-hacker').style.display='none';
  document.getElementById('tetris-next-wrap').style.display='none';
  document.getElementById('tetris-lvl-pill').style.display='none';
  document.getElementById('bb-deck').style.display='none';
  document.getElementById('bb-ram-pill').style.display='none';
  setControls(null);                 // every game re-declares its own pad
  document.getElementById('g-controls').textContent='';   // and its own hint
  const canvasGame = ['nebula','tetris','dodge','pong','snake','flappy','breaker','arena','runner','meteor','battlebots'].includes(gid);
  document.getElementById('game-screen').classList.toggle('canvas-game', canvasGame);

  document.getElementById('g-pts').textContent='0';
  document.getElementById('g-time').textContent='—';
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='var(--cyan)';
  window.onkeydown = window.onkeyup = null;
  if(aCanvas) { aCanvas.onmousemove = null; }

  if(gid==='click') countdown(()=>startClick());
  else if(gid==='nebula') countdown(()=>startNebula());
  else if(gid==='tetris') countdown(()=>startTetris());
  else if(gid==='dodge') countdown(()=>startDodge());
  else if(gid==='memory') countdown(()=>startMemory());
  else if(gid==='math') countdown(()=>startMath());
  else if(gid==='reaction') countdown(()=>startReaction());
  else if(gid==='pong') countdown(()=>startPong());
  else if(gid==='snake') countdown(()=>startSnake());
  else if(gid==='flappy') countdown(()=>startFlappy());
  else if(gid==='breaker')countdown(()=>startBreaker());
  else if(gid==='arena')  countdown(()=>startArena());
  else if(gid==='runner') countdown(()=>startRunner());
  else if(gid==='hacker') countdown(()=>startHacker());
  else if(gid==='meteor') countdown(()=>startMeteor());
  else if(gid==='battlebots') countdown(()=>startBattleBots());
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  stopGame();
  music('hub');
  const tier = DIFFICULTY_TIERS[currentDifficultyTier];
  const finalPts = Math.round(pts * gameDifficultyMultiplier);
  const m=META[gid],pct=finalPts/m.maxPts;
  // A three-quarter run earns the fanfare; anything less gets the neutral
  // readout chime, so the sound is honest about how the round actually went.
  // Held back a beat: the screen itself cross-fades over ~340ms, and the games
  // that end in a crash are still playing their death sting right now — this
  // lands the flourish on the card appearing rather than under the explosion.
  // A plain timeout, not gLater(), because stopGame() has already run.
  setTimeout(()=>snd(pct>.75 ? 'victory' : 'results'), 300);
  document.getElementById('res-emoji').textContent=pct>.75?'🎉':'💪';
  document.getElementById('res-gname').textContent=m.name;

  // Bonus badge — shows the active tier's point multiplier (×1.0 / ×1.5 / ×2.0), colored to match
  const gnameEl = document.getElementById('res-gname');
  let bonusEl = document.getElementById('res-bonus');
  if(!bonusEl){
    bonusEl = document.createElement('div');
    bonusEl.id = 'res-bonus';
    gnameEl.parentNode.insertBefore(bonusEl, gnameEl.nextSibling);
  }
  bonusEl.className = `res-bonus res-bonus-${tier.key}`;
  bonusEl.textContent = `${tier.icon} ${tier.label} · ×${tier.pointMult.toFixed(1)} BONUS`;

  document.getElementById('res-pts').textContent=finalPts;
  document.getElementById('res-bd').innerHTML=Object.entries(bd).map(([k,v])=>`<div class="res-row"><span>${k}</span><span class="rv">${v}</span></div>`).join('');
  showScreen('results-screen');
  saveScore(gid,finalPts);
  document.getElementById('btn-again').onclick=()=>{showScreen('game-screen');prepGame(gid)};
  document.getElementById('btn-hub').onclick=()=>{document.getElementById('h-pts').textContent=`🏆 ${(user?.totalPoints||0).toLocaleString()} PTS`;document.getElementById('h-credits').textContent=`💎 ${(user?.credits||0).toLocaleString()} CR`;enterHub()};
}

async function saveScore(gid,pts){
  if(!db || !user) return;
  try {
    const playerRef = db.ref('players/' + user.uid);
    playerRef.once('value', (snapshot) => {
      const d = snapshot.val() || { totalPoints: 0, gamesPlayed: 0, highScores: {} };
      const hs = d.highScores || {};
      const currentHighScore = parseInt(hs[gid] || 0);
      const pointsToAward = parseInt(pts || 0);
      
      const newPoints = parseInt(d.totalPoints || 0) + pointsToAward;
      const newHighScores = { ...hs, [gid]: Math.max(currentHighScore, pointsToAward) };
      
      playerRef.update({ 
        username: user.username, 
        totalPoints: newPoints, 
        gamesPlayed: (parseInt(d.gamesPlayed || 0) + 1), 
        highScores: newHighScores 
      }).then(() => {
        if (user) user.totalPoints = newPoints;
        loadLeaderboard();
      });
    });
    snd('coin');
    toast(`✅ Matrix Sync: +${pts} PTS`);
  } catch (e) { console.error("Score pipeline error:", e) }
}

// ════════════════════════════════════════════
//  🛒 BLACK MARKET — CREDITS & COSMETICS
// ════════════════════════════════════════════
const CONV_RATE = 100; // 100 points = 1 credit (both directions)

const SHOP_ITEMS = {
  colors: [
    { id:'col-cyan',   name:'Cyan Surge',    price:0,  color:'#00f5ff', default:true },
    { id:'col-pink',   name:'Pink Pulse',    price:5,  color:'#ff0090' },
    { id:'col-lime',   name:'Lime Circuit',  price:5,  color:'#39ff14' },
    { id:'col-gold',   name:'Gold Protocol', price:8,  color:'#ffd700' },
    { id:'col-purple', name:'Violet Static', price:8,  color:'#a855f7' },
    { id:'col-orange', name:'Amber Overload',price:10, color:'#ff6600' },
    { id:'col-red',    name:'Crimson Alert', price:10, color:'#ff2442' },
    { id:'col-matrix', name:'Matrix Cascade',price:14, color:'#00ff41' }
  ],
  cursors: [
    { id:'cur-default', name:'Standard Pointer', price:0,  emoji:'➤', default:true },
    { id:'cur-target',  name:'Target Reticle',   price:6,  emoji:'🎯' },
    { id:'cur-blade',   name:'Neon Blade',        price:6,  emoji:'🗡️' },
    { id:'cur-claw',    name:'Cyber Claw',        price:10, emoji:'🦾' },
    { id:'cur-skull',   name:'Ghost Skull',       price:10, emoji:'💀' },
    { id:'cur-star',    name:'Nova Star',         price:12, emoji:'✨' },
    { id:'cur-wraith',  name:'Data Wraith',       price:16, emoji:'👁️' }
  ],
  skins: [
    { id:'skin-default', name:'Recruit',      price:0,  emoji:'🤖', default:true },
    { id:'skin-ninja',   name:'Shadow Ninja', price:15, emoji:'🥷' },
    { id:'skin-android', name:'Android X',    price:15, emoji:'👾' },
    { id:'skin-phantom', name:'Phantom Unit', price:20, emoji:'👻' },
    { id:'skin-mech',    name:'War Mech',     price:25, emoji:'🦿' },
    { id:'skin-alien',   name:'Void Alien',   price:25, emoji:'👽' },
    { id:'skin-quantum', name:'Quantum Dragon',price:30, emoji:'🐉' }
  ]
};

function findItem(cat, id){ return (SHOP_ITEMS[cat]||[]).find(i=>i.id===id); }

// Rarity is computed relative to the other paid items in the same category,
// so the priciest items automatically get the flashiest shop-card treatment.
function getRarity(cat, item){
  if(item.default || !item.price) return null;
  const prices = (SHOP_ITEMS[cat]||[]).filter(i=>!i.default).map(i=>i.price);
  const max = Math.max(...prices), min = Math.min(...prices);
  if(item.price===max) return 'legendary';
  if(item.price >= min + (max-min)*0.5) return 'epic';
  return 'rare';
}

function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
}

// Rotates a hex colour's hue, keeping its saturation and lightness. Lets a game
// build a multi-colour palette out of the one equipped colour without any of the
// derived shades coming out duller than the colour the player actually bought.
function shiftHue(hex, deg){
  const h = hex.replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full,16);
  const r=((n>>16)&255)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  const l=(max+min)/2;
  let hue=0, s=0;
  if(d){
    s = d/(1-Math.abs(2*l-1));
    if(max===r)      hue=((g-b)/d)%6;
    else if(max===g) hue=(b-r)/d+2;
    else             hue=(r-g)/d+4;
    hue=(hue*60+360)%360;
  }
  hue=(hue+deg%360+360)%360;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((hue/60)%2-1)), m=l-c/2;
  const seg = hue<60?[c,x,0] : hue<120?[x,c,0] : hue<180?[0,c,x]
            : hue<240?[0,x,c] : hue<300?[x,0,c] : [c,0,x];
  const hx = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
  return `#${hx(seg[0])}${hx(seg[1])}${hx(seg[2])}`;
}

function getEquippedColorHex(){
  const item = user && findItem('colors', user.equipped && user.equipped.colors);
  return item ? item.color : '#00f5ff';
}
function getEquippedSkinEmoji(){
  const item = user && findItem('skins', user.equipped && user.equipped.skins);
  return item ? item.emoji : null;
}
function drawSkinBadge(x, y, size=13){
  const emoji = getEquippedSkinEmoji();
  if(!emoji) return;
  aCtx.save();
  aCtx.font = `${size}px sans-serif`;
  aCtx.textAlign = 'center';
  aCtx.textBaseline = 'middle';
  aCtx.shadowBlur = 0;
  aCtx.fillText(emoji, x, y);
  aCtx.restore();
}

let customCursorEl = null;
let codeCursorTimer = null;

function ensureCustomCursorEl(){
  if(customCursorEl) return customCursorEl;
  customCursorEl = document.createElement('div');
  customCursorEl.id = 'custom-cursor-fx';
  document.body.appendChild(customCursorEl);
  document.addEventListener('mousemove', e=>{
    customCursorEl.style.left = e.clientX + 'px';
    customCursorEl.style.top = e.clientY + 'px';
  });
  return customCursorEl;
}

function stopCodeCursorAnim(){
  if(codeCursorTimer){ clearInterval(codeCursorTimer); codeCursorTimer = null; }
}

function applyEquippedCosmetics(){
  if(!user) return;
  const colorItem = findItem('colors', user.equipped && user.equipped.colors) || SHOP_ITEMS.colors[0];
  document.documentElement.style.setProperty('--cyan', colorItem.color);

  const cursorItem = findItem('cursors', user.equipped && user.equipped.cursors) || SHOP_ITEMS.cursors[0];
  const cursorRarity = getRarity('cursors', cursorItem);
  let cursorStyleTag = document.getElementById('custom-cursor-style');
  if(!cursorStyleTag){
    cursorStyleTag = document.createElement('style');
    cursorStyleTag.id = 'custom-cursor-style';
    document.head.appendChild(cursorStyleTag);
  }

  stopCodeCursorAnim();
  const fx = ensureCustomCursorEl();

  if(cursorItem.default){
    cursorStyleTag.textContent = '';
    document.body.style.cursor = '';
    fx.style.display = 'none';
    fx.className = '';
  } else if(cursorRarity==='epic' || cursorRarity==='legendary'){
    // Epic/legendary cursors swap the real OS pointer for an animated element that tracks the mouse.
    cursorStyleTag.textContent = `*{cursor:none !important;}`;
    document.body.style.cursor = 'none';
    fx.style.display = 'block';
    if(cursorRarity==='legendary'){
      fx.className = 'ccur ccur-legendary';
      const chars = '01';
      const randomCode = () => Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
      fx.innerHTML = `<span class="ccur-code">${randomCode()}</span>`;
      const codeEl = fx.querySelector('.ccur-code');
      codeCursorTimer = setInterval(() => { codeEl.textContent = randomCode(); }, 130);
    } else {
      fx.className = 'ccur ccur-epic';
      fx.innerHTML = `<span class="ccur-inner">${cursorItem.emoji}</span>`;
    }
  } else {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><text x='0' y='24' font-size='26'>${cursorItem.emoji}</text></svg>`;
    const cursorCss = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, auto`;
    // !important beats element-level cursor:pointer rules on buttons, cards, canvas, etc.
    cursorStyleTag.textContent = `*{cursor:${cursorCss} !important;}`;
    document.body.style.cursor = cursorCss;
    fx.style.display = 'none';
    fx.className = '';
  }
}

function openMarket(){
  showScreen('market-screen');
  refreshMarketBalances();
  ['colors','cursors','skins'].forEach(renderShop);
  switchMarketTab('convert');
}

function refreshMarketBalances(){
  const ptsTxt = `🏆 ${(user?.totalPoints||0).toLocaleString()} PTS`;
  const crTxt = `💎 ${(user?.credits||0).toLocaleString()} CR`;
  document.getElementById('m-pts').textContent = ptsTxt;
  document.getElementById('m-credits').textContent = crTxt;
  document.getElementById('h-pts').textContent = ptsTxt;
  document.getElementById('h-credits').textContent = crTxt;
}

document.querySelectorAll('.market-tab').forEach(tab=>{
  tab.addEventListener('click',()=>switchMarketTab(tab.dataset.tab));
});
function switchMarketTab(tab){
  document.querySelectorAll('.market-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.market-panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+tab));
}

// ── CONVERSION LOGIC ──
const convPtsInput = document.getElementById('conv-pts-input');
const convCreditsInput = document.getElementById('conv-credits-input');

convPtsInput.addEventListener('input',()=>{
  const v = Math.max(0, parseInt(convPtsInput.value)||0);
  document.getElementById('conv-pts-preview').textContent = `= ${Math.floor(v/CONV_RATE)} CR`;
});
convCreditsInput.addEventListener('input',()=>{
  const v = Math.max(0, parseInt(convCreditsInput.value)||0);
  document.getElementById('conv-credits-preview').textContent = `= ${v*CONV_RATE} PTS`;
});

document.getElementById('btn-conv-to-credits').onclick = async ()=>{
  if(!user || !db){ toast('⚠️ Connection state unconfigured'); return }
  const v = Math.max(0, parseInt(convPtsInput.value)||0);
  const credits = Math.floor(v/CONV_RATE);
  if(credits<=0){ snd('deny'); toast(`⚠️ Enter at least ${CONV_RATE} points.`); return }
  if(v>(user.totalPoints||0)){ snd('deny'); toast('⚠️ Insufficient points.'); return }
  const spentPts = credits*CONV_RATE;
  user.totalPoints -= spentPts;
  user.credits = (user.credits||0) + credits;
  await db.ref('players/'+user.uid).update({ totalPoints:user.totalPoints, credits:user.credits });
  convPtsInput.value=''; document.getElementById('conv-pts-preview').textContent='= 0 CR';
  refreshMarketBalances(); loadLeaderboard();
  snd('convert');
  toast(`✅ Converted ${spentPts} PTS → ${credits} CR`);
};

document.getElementById('btn-conv-to-points').onclick = async ()=>{
  if(!user || !db){ toast('⚠️ Connection state unconfigured'); return }
  const v = Math.max(0, parseInt(convCreditsInput.value)||0);
  if(v<=0){ snd('deny'); toast('⚠️ Enter at least 1 credit.'); return }
  if(v>(user.credits||0)){ snd('deny'); toast('⚠️ Insufficient credits.'); return }
  const gainedPts = v*CONV_RATE;
  user.credits -= v;
  user.totalPoints = (user.totalPoints||0) + gainedPts;
  await db.ref('players/'+user.uid).update({ totalPoints:user.totalPoints, credits:user.credits });
  convCreditsInput.value=''; document.getElementById('conv-credits-preview').textContent='= 0 PTS';
  refreshMarketBalances(); loadLeaderboard();
  snd('convert');
  toast(`✅ Converted ${v} CR → ${gainedPts} PTS`);
};

// ── SHOP RENDERING ──
function renderShop(cat){
  const grid = document.getElementById('shop-'+cat);
  if(!grid) return;
  grid.innerHTML = '';
  SHOP_ITEMS[cat].forEach(item=>{
    const owned = item.default || (user?.owned?.[cat]||[]).includes(item.id);
    const equipped = user?.equipped?.[cat]===item.id;
    const rarity = getRarity(cat, item);
    const card = document.createElement('div');
    card.className = 'shop-card' + (rarity ? ` rarity-${rarity}` : '') + (equipped ? ' equipped' : '');
    const preview = cat==='colors'
      ? (item.id==='col-matrix'
          ? `<div class="shop-swatch matrix-swatch"></div>`
          : `<div class="shop-swatch" style="background:${item.color};box-shadow:0 0 20px ${item.color}"></div>`)
      : `<div class="shop-emoji">${item.emoji}</div>`;
    const badge = rarity ? `<div class="rarity-badge ${rarity}">${rarity}</div>` : '';
    let btnHtml;
    if(equipped){
      btnHtml = `<button class="btn btn-secondary btn-sm shop-btn" data-act="unequip" data-cat="${cat}" data-id="${item.id}">Unequip</button>`;
    } else if(owned){
      btnHtml = `<button class="btn btn-primary btn-sm shop-btn" data-act="equip" data-cat="${cat}" data-id="${item.id}">Equip</button>`;
    } else {
      btnHtml = `<button class="btn btn-primary btn-sm shop-btn" data-act="buy" data-cat="${cat}" data-id="${item.id}">Buy · 💎${item.price}</button>`;
    }
    card.innerHTML = `${preview}${badge}<div class="shop-name">${esc(item.name)}</div>${equipped?'<div class="shop-tag">EQUIPPED</div>':''}${btnHtml}`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.shop-btn').forEach(btn=>{
    btn.onclick = () => handleShopAction(btn.dataset.act, btn.dataset.cat, btn.dataset.id);
  });
}

async function handleShopAction(act, cat, id){
  if(!user || !db){ toast('⚠️ Connection state unconfigured'); return }
  const item = findItem(cat, id);
  if(!item) return;

  if(act==='buy'){
    if((user.credits||0) < item.price){ snd('deny'); toast('⚠️ Insufficient credits.'); return }
    user.credits -= item.price;
    user.owned[cat] = [...(user.owned[cat]||[]), id];
    await db.ref('players/'+user.uid).update({ credits:user.credits, ['owned/'+cat]: user.owned[cat] });
    snd('purchase');
    toast(`✅ Purchased ${item.name}`);
  } else if(act==='equip'){
    user.equipped[cat] = id;
    await db.ref('players/'+user.uid).update({ ['equipped/'+cat]: id });
    snd('equip');
    toast(`⚡ Equipped ${item.name}`);
    applyEquippedCosmetics();
  } else if(act==='unequip'){
    const defItem = SHOP_ITEMS[cat].find(i=>i.default);
    user.equipped[cat] = defItem.id;
    await db.ref('players/'+user.uid).update({ ['equipped/'+cat]: defItem.id });
    snd('uiBack');
    toast(`Unequipped ${item.name}`);
    applyEquippedCosmetics();
  }
  refreshMarketBalances();
  renderShop(cat);
}

// ════════════════════════════════════════════
//  🖱️ GAME 1: CLICK FRENZY
// ════════════════════════════════════════════
function startClick(){
  document.getElementById('g-click').style.display='flex';
  let clicks=0,t=10,ended=false;
  document.getElementById('click-count').textContent='0';
  document.getElementById('g-time').textContent='10';
  const btn=document.getElementById('click-btn');
  btn.disabled=false;
  // The blip climbs an octave over eight clicks and wraps, so a fast streak
  // sounds like it's accelerating even though the button is doing one thing.
  btn.onclick=()=>{if(!ended){clicks++;snd('bounce',{semi:(clicks%8)*2});document.getElementById('click-count').textContent=clicks;setLive(Math.min(500,clicks*8))}};
  gTimer=setInterval(()=>{
    t--;document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/10*100}%`;
    if(t<=3&&t>0) snd('tick');
    if(t<=0){
      clearInterval(gTimer);ended=true;btn.disabled=true;btn.onclick=null;
      const pts=Math.min(500,clicks*8);
      setTimeout(()=>showResults('click',pts,{'🖱️ Structural Actions':clicks,'🏆 Final Score':`${pts} PTS`}),400);
    }
  },1000);
}

// ════════════════════════════════════════════
//  🚀 GAME 2: NEON NEBULA (OVERDRIVE ENGINE)
// ════════════════════════════════════════════
function startNebula(){
  document.getElementById('g-canvas-holder').style.display='block';
  // Drag-to-fly is the good way to play, but the D-pad stays put so the game
  // is never dead if a browser refuses the gesture.
  setControls({ left:'◀', action: isTouchDevice ? '⚡ FIRE / ABILITY' : 'SHOOT / ABILITY', right:'▶' });
  setControlHint('HOLD TO FIRE · DRAG TO FLY · OR USE ◀ ▶',
                 '← → / A D = MOVE · SPACE = FIRE · Q/E = ABILITY');
  showTouchHint('HOLD ANYWHERE TO FIRE · DRAG TO FLY');
  fitCanvas();
  const diffMod = getDifficultyModifier();
  let score = 0, gameTime = 60, shield = 100, screenShake = 0;
  // plasmaOrbs: total orbs collected (levels 1-3 = weapon, 4+ = special abilities)
  let plasmaOrbs = 0;
  // Special ability charges earned beyond level 3
  let specialAbilities = []; // queue of ability types earned
  let activeAbility = null;  // currently deployed ability with timer/state
  // Enemy attack arrays
  let projectiles = [], enemyProjectiles = [], enemies = [], powerups = [], particles = [], floatingTexts = [], backgroundStars = [];
  let enemySpawnTimer = 0, enemySpawnInterval = 1000, lastTime = performance.now();
  let shieldFlashTimer = 0; // red flash when hit
  let timeWarpActive = false, timeWarpTimer = 0;
  let shieldBubbleActive = false, shieldBubbleTimer = 0;

  document.getElementById('g-time').textContent = gameTime;
  document.getElementById('prog-fill').style.width = '100%';
  document.getElementById('prog-fill').style.background = 'linear-gradient(90deg, #ff0844, #ff4e50)';

  for (let i = 0; i < 30; i++) backgroundStars.push({ x: Math.random() * BOARD_W, y: Math.random() * BOARD_H, size: 1, speed: 0.5, alpha: 0.4 });
  for (let i = 0; i < 15; i++) backgroundStars.push({ x: Math.random() * BOARD_W, y: Math.random() * BOARD_H, size: 1.6, speed: 1.4, alpha: 0.8 });

  let keys = {}, moveLeft = false, moveRight = false;
  // ── TOUCH FLIGHT STATE ──
  // touchFiring: a finger is down anywhere on the board → hold-to-fire.
  // touchFlying: that finger has taken over steering, so update() stops
  //   integrating velocity and lets the drag drive position directly.
  // grabDX/grabDY: the ship-to-finger offset captured on touch-down, so
  //   grabbing the board never teleports the ship under your thumb.
  let touchFiring = false, touchFlying = false, grabDX = 0, grabDY = 0;
  const FLY_Y_MIN = 300, FLY_Y_MAX = 466;   // ship stays in the lower band

  window.onkeydown = e => {
    if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','KeyQ'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    // Q or E to deploy special ability
    if ((e.code === 'KeyQ' || e.code === 'KeyE') && specialAbilities.length > 0 && !activeAbility) deployAbility();

    // Show ability hint briefly when abilities are available
    if (specialAbilities.length > 0 && !activeAbility && (e.code === 'KeyQ' || e.code === 'KeyE')) {
      // Flash the action button to indicate it's usable
      const actionBtn = document.getElementById('ctrl-action');
      actionBtn.style.transform = 'scale(1.2)';
      setTimeout(() => actionBtn.style.transform = '', 200);

      // Show toast with ability hint
      const nextAbility = specialAbilities[0];
      toast(`Press [ACTION] or [Q]/[E] to use ${nextAbility.label}`, 1500);
    }
  };
  window.onkeyup = e => { if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code)) e.preventDefault(); keys[e.code] = false; };

  // Pressing a direction also drops any stale drag claim, so a gesture the
  // browser cut off mid-flight can't leave the buttons inert.
  // The impulse gives a tap a visible shove; holding still accelerates as before.
  const KICK = 4;
  bindHold(document.getElementById('ctrl-left'),
           ()=>{ touchFlying=false; touchFiring=false; player.vx -= KICK; moveLeft=true; },  ()=>moveLeft=false);
  bindHold(document.getElementById('ctrl-right'),
           ()=>{ touchFlying=false; touchFiring=false; player.vx += KICK; moveRight=true; }, ()=>moveRight=false);
  // ACTION button: shoot if no special ready, else deploy special
  document.getElementById('ctrl-action').onclick = () => {
    if (specialAbilities.length > 0 && !activeAbility) deployAbility();
    else player.shoot();
  };

  // ── HOLD TO FIRE · DRAG TO FLY ──
  // One gesture does both: putting a finger on the board opens fire and
  // grabs the ship, moving it steers, lifting it stops. Firing is driven by
  // the `touchFiring` flag inside player.update() so it respects the same
  // weapon cooldown as holding Space — no tap-spam advantage.
  bindCanvasDrag({
    onDown(p){
      hideTouchHint();
      touchFiring = true; touchFlying = true;
      grabDX = (player.x + player.w / 2) - p.x;
      grabDY = (player.y + player.h / 2) - p.y;
    },
    onMove(p){
      const prevX = player.x;
      player.x = p.x + grabDX - player.w / 2;
      player.y = p.y + grabDY - player.h / 2;
      player.x = Math.max(5, Math.min(BOARD_W - player.w - 5, player.x));
      player.y = Math.max(FLY_Y_MIN, Math.min(FLY_Y_MAX, player.y));
      player.vx = (player.x - prevX) * 0.55;   // feeds the hull's banking tilt
    },
    onUp(){ touchFiring = false; touchFlying = false; }
  });

  // ── SPECIAL ABILITY DEFINITIONS (unlocked at plasma orb 4, 5, 6, 7+) ──
  const ABILITY_DEFS = [
    { id:'SMART_MISSILE', label:'🎯 SMART MISSILE', color:'#00f5ff', desc:'MISSILES LOCK ON!' },
    { id:'SHIELD_BURST',  label:'🛡️ SHIELD BURST',  color:'#a855f7', desc:'SHIELD RESTORED!' },
    { id:'TIME_WARP',     label:'⏳ TIME WARP',     color:'#ffd700', desc:'TIME SLOWED!' },
    { id:'NOVA_BOMB',     label:'💥 NOVA BOMB',     color:'#ff0090', desc:'SCREEN NUKE!' },
  ];
  // Cycle through abilities for each extra orb
  function getAbilityForOrb(orbIndex) {
    // orbIndex = (plasmaOrbs - 3), 1-based → pick from cycle
    return ABILITY_DEFS[(orbIndex - 1) % ABILITY_DEFS.length];
  }

  function deployAbility() {
    if (specialAbilities.length === 0) return;
    const abil = specialAbilities.shift();
    updateAbilityHUD();
    activeAbility = abil;

    snd('ability');

    if (abil.id === 'SMART_MISSILE') {
      // Fire 3 homing missiles that launch FROM the ship nose and track nearest enemies
      popText(BOARD_W / 2, player.y - 24, '🎯 SMART MISSILES!', '#00f5ff');
      screenShake = 6;
      const shipNoseX = player.x + player.w/2;
      const shipNoseY = player.y;
      // Stagger missile launches for visual effect
      [0, 1, 2].forEach(i => {
        setTimeout(() => {
          if (!enemies.length) return;
          // Find target (different enemy for each missile if possible)
          const sortedEnemies = [...enemies].sort((a,b)=>Math.hypot(a.x-shipNoseX,a.y-shipNoseY)-Math.hypot(b.x-shipNoseX,b.y-shipNoseY));
          const target = sortedEnemies[i % sortedEnemies.length];
          projectiles.push({
            x: shipNoseX + (i-1)*6,
            y: shipNoseY,
            vx: (i-1)*1.5,
            vy: -9,
            smart: true,
            lockedTarget: target, // lock to a specific enemy
            smartTimer: 0
          });
          // launch flash
          explode(shipNoseX, shipNoseY, '#00f5ff', 5);
          snd('missile');
        }, i * 120);
      });
      setTimeout(() => { activeAbility = null; }, 2500);

    } else if (abil.id === 'SHIELD_BURST') {
      // Restore shield to 100% — pure healing, no damage component
      snd('shield');
      shield = 100;
      document.getElementById('prog-fill').style.width = '100%';
      shieldBubbleActive = true;
      shieldBubbleTimer = 180; // 3 seconds of invincibility bubble
      enemyProjectiles = []; // clear all incoming fire
      screenShake = 12;
      // Big purple burst from the ship
      for (let i = 0; i < 40; i++) {
        const ang = (i/40)*Math.PI*2, v = Math.random()*5+2;
        particles.push({ x: player.x+player.w/2, y: player.y+player.h/2, vx: Math.cos(ang)*v, vy: Math.sin(ang)*v, alpha: 1, decay: 0.025, color: '#a855f7', size: Math.random()*3+1 });
      }
      popText(BOARD_W / 2, player.y - 24, '🛡️ SHIELD RESTORED!', '#a855f7');
      setTimeout(() => {
        shieldBubbleActive = false;
        activeAbility = null;
      }, 3000);

    } else if (abil.id === 'TIME_WARP') {
      // Slow all enemies and their projectiles to 50% speed for 3 seconds
      timeWarpActive = true;
      timeWarpTimer = 180; // 3 seconds at 60fps
      screenShake = 8;
      popText(BOARD_W / 2, 200, '⏳ TIME WARP!', '#ffd700');
      // Radial particle ring
      for (let i = 0; i < 36; i++) {
        const ang = (i/36)*Math.PI*2;
        particles.push({
          x: BOARD_W / 2 + Math.cos(ang)*120, y: 250 + Math.sin(ang)*100,
          vx: -Math.cos(ang)*0.8, vy: -Math.sin(ang)*0.8,
          alpha: 0.9, decay: 0.008, color: '#ffd700', size: 2.5
        });
      }
      // Auto-end when timer reaches 0 (handled in render loop)

    } else if (abil.id === 'NOVA_BOMB') {
      // Destroy ALL enemies on screen with massive expanding shockwave
      snd('bigExplode');
      screenShake = 30;
      popText(BOARD_W / 2, 200, '💥 NOVA BOMB!', '#ff0090');
      // Award points for all enemies destroyed
      const enemyCount = enemies.length;
      enemies.forEach(e => {
        score += e.pts;
        popText(e.x + e.w/2, e.y, `+${e.pts}`, e.color);
        explode(e.x + e.w/2, e.y + e.h/2, e.color, 20);
      });
      setLive(score);
      enemies = [];
      enemyProjectiles = [];
      // Expanding shockwave rings
      for (let ring = 0; ring < 3; ring++) {
        setTimeout(() => {
          for (let i = 0; i < 60; i++) {
            const ang = (i/60)*Math.PI*2, v = (Math.random()*3+2)*(ring+1)*0.6;
            particles.push({
              x: BOARD_W / 2, y: 250,
              vx: Math.cos(ang)*v, vy: Math.sin(ang)*v,
              alpha: 1, decay: 0.018,
              color: ['#ff0090','#ff6600','#ffd700','#fff','#a855f7'][i%5],
              size: Math.random()*3+1.5
            });
          }
        }, ring * 200);
      }
      setTimeout(() => { activeAbility = null; }, 2000);
    }
  }

  function updateAbilityHUD() {
    // Called after consuming an ability from the queue — no extra DOM needed,
    // the canvas draw handles it. This is a no-op placeholder kept for call-site clarity.
  }

  // ── ABILITY HUD OVERLAY (bottom of canvas) ──
  let abilPulse = 0;
  function drawAbilityHUD() {
    abilPulse += 0.08;
    if (specialAbilities.length === 0 && !activeAbility) return;
    aCtx.save();

    if (specialAbilities.length > 0 && !activeAbility) {
      const next = specialAbilities[0];
      const pulse = Math.sin(abilPulse) * 0.4 + 0.7;
      aCtx.fillStyle = 'rgba(0,0,0,0.7)';
      aCtx.strokeStyle = next.color;
      aCtx.lineWidth = 2;
      aCtx.shadowBlur = 12 * pulse; aCtx.shadowColor = next.color;
      aCtx.beginPath(); aCtx.roundRect(6, 448, BOARD_W - 12, 46, 8); aCtx.fill(); aCtx.stroke();
      aCtx.shadowBlur = 8 * pulse; aCtx.shadowColor = next.color;
      aCtx.fillStyle = next.color;
      // A phone has no Q/E key, and 8.5px Orbitron on a board scaled to ~0.6×
      // renders around 5px — unreadable. Say what the player can actually press.
      aCtx.font = 'bold 10px Orbitron';
      aCtx.fillText(isTouchDevice ? 'TAP  ⚡ FIRE / ABILITY  TO DEPLOY:'
                                  : 'PRESS [ACTION] BUTTON  OR  [Q]/[E] KEY TO DEPLOY:', 14, 462);
      aCtx.fillStyle = '#fff';
      aCtx.font = 'bold 12px Orbitron';
      aCtx.shadowBlur = 10; aCtx.shadowColor = next.color;
      aCtx.fillText(next.label, 14, 487);
      if (specialAbilities.length > 1) {
        aCtx.fillStyle = 'rgba(255,255,255,0.55)';
        aCtx.font = 'bold 9px Orbitron';
        aCtx.fillText('(+' + (specialAbilities.length - 1) + ' more queued)', BOARD_W / 2, 487);
      }
    } else if (activeAbility) {
      aCtx.fillStyle = 'rgba(0,0,0,0.65)';
      aCtx.strokeStyle = activeAbility.color;
      aCtx.lineWidth = 1.5;
      aCtx.beginPath(); aCtx.roundRect(6, 448, BOARD_W - 12, 46, 8); aCtx.fill(); aCtx.stroke();
      aCtx.fillStyle = activeAbility.color;
      aCtx.font = 'bold 10px Orbitron';
      aCtx.shadowBlur = 12; aCtx.shadowColor = activeAbility.color;
      aCtx.textAlign = 'center';
      aCtx.fillText('ACTIVE: ' + activeAbility.desc, BOARD_W / 2, 475);
      aCtx.textAlign = 'left';
    }

    aCtx.restore();
  }

  // ── PLASMA ORB LEVEL DISPLAY ──
  function drawPlasmaLevel() {
    const wl = Math.min(3, plasmaOrbs + 1); // visual weapon tier 1-3
    const extra = Math.max(0, plasmaOrbs - 2); // extra orbs beyond max weapon
    aCtx.save();
    aCtx.fillStyle = 'rgba(0,0,0,0.5)'; aCtx.strokeStyle = '#39ff14'; aCtx.lineWidth = 1;
    aCtx.beginPath(); aCtx.roundRect(8, 10, 110, 24, 5); aCtx.fill(); aCtx.stroke();
    aCtx.fillStyle = '#39ff14'; aCtx.font = 'bold 8px Orbitron'; aCtx.shadowBlur = 6; aCtx.shadowColor = '#39ff14';
    const label = plasmaOrbs < 3 ? `PLASMA LV${wl}` : `PLASMA MAX +${extra}`;
    aCtx.fillText(label, 14, 25);
    // Pip bars
    for (let i = 0; i < Math.min(5, plasmaOrbs + 1); i++) {
      aCtx.fillStyle = i < 3 ? '#39ff14' : ['#00f5ff','#ffd700','#ff0090','#a855f7'][i-3];
      aCtx.shadowColor = aCtx.fillStyle; aCtx.shadowBlur = 8;
      aCtx.fillRect(82 + i * 7, 14, 5, 14);
    }
    aCtx.restore();
  }

  const player = {
    x: (BOARD_W - 34) / 2, y: 430, w: 34, h: 26, vx: 0, vy: 0, friction: 0.85, accel: 1.2, cooldown: 0, angle: 0,
    get weaponLevel() { return Math.min(3, plasmaOrbs + 1); },
    update(dt) {
      if (touchFlying) {
        // The finger owns position this frame — only decay the velocity so
        // the hull keeps banking into the turn it was just thrown through.
        this.vx *= this.friction; this.vy = 0;
        this.angle = this.vx * 0.05;
      } else {
        if (keys['ArrowLeft']  || keys['KeyA'] || moveLeft)  this.vx -= this.accel;
        if (keys['ArrowRight'] || keys['KeyD'] || moveRight) this.vx += this.accel;
        // Vertical thrust keeps keyboard play in step with what a drag can do.
        if (keys['ArrowUp']    || keys['KeyW']) this.vy -= this.accel;
        if (keys['ArrowDown']  || keys['KeyS']) this.vy += this.accel;
        this.vx *= this.friction; this.vy *= this.friction;
        this.x += this.vx; this.y += this.vy;
        this.angle = this.vx * 0.05;
      }
      if (this.x < 5) { this.x = 5; this.vx = 0; }
      if (this.x > BOARD_W - this.w - 5) { this.x = BOARD_W - this.w - 5; this.vx = 0; }
      if (this.y < FLY_Y_MIN) { this.y = FLY_Y_MIN; this.vy = 0; }
      if (this.y > FLY_Y_MAX) { this.y = FLY_Y_MAX; this.vy = 0; }
      if (this.cooldown > 0) this.cooldown -= dt;
      // Holding a finger on the board fires on the same cooldown as Space,
      // so touch gets no tap-spam edge over keyboard.
      if ((keys['Space'] || touchFiring) && this.cooldown <= 0) { this.shoot(); this.cooldown = 150; }
    },
    shoot() {
      const wl = this.weaponLevel;
      // The gun drops a semitone per weapon level and switches to the fatter
      // plasma sample once the spread bolts unlock — the upgrade is audible
      // before you've had time to notice the extra bullets on screen.
      snd(plasmaOrbs >= 3 ? 'plasma' : 'shoot', { semi: -(wl - 1) * 2 });
      if (wl === 1) {
        projectiles.push({ x: this.x + this.w/2, y: this.y, vx: 0, vy: -10 });
      } else if (wl === 2) {
        projectiles.push({ x: this.x + 6, y: this.y + 5, vx: -1.5, vy: -10 });
        projectiles.push({ x: this.x + this.w - 6, y: this.y + 5, vx: 1.5, vy: -10 });
      } else {
        projectiles.push({ x: this.x + 5, y: this.y + 5, vx: -2, vy: -10 });
        projectiles.push({ x: this.x + this.w/2, y: this.y, vx: 0, vy: -12 });
        projectiles.push({ x: this.x + this.w - 5, y: this.y + 5, vx: 2, vy: -10 });
        // Extra orbs beyond lv3: add spread plasma bolts
        if (plasmaOrbs >= 3) {
          projectiles.push({ x: this.x + this.w/2, y: this.y + 5, vx: -3.5, vy: -8, plasma: true });
          projectiles.push({ x: this.x + this.w/2, y: this.y + 5, vx: 3.5, vy: -8, plasma: true });
        }
        if (plasmaOrbs >= 5) {
          projectiles.push({ x: this.x + this.w/2, y: this.y + 8, vx: -5, vy: -6, plasma: true });
          projectiles.push({ x: this.x + this.w/2, y: this.y + 8, vx: 5, vy: -6, plasma: true });
        }
      }
    },
    draw() {
      aCtx.save(); aCtx.translate(this.x + this.w/2, this.y + this.h/2); aCtx.rotate(this.angle);
      // Shield bubble visual
      if (shieldBubbleActive) {
        aCtx.strokeStyle = `rgba(168,85,247,${0.4 + Math.sin(shieldBubbleTimer*0.3)*0.3})`;
        aCtx.lineWidth = 3; aCtx.shadowBlur = 20; aCtx.shadowColor = '#a855f7';
        aCtx.beginPath(); aCtx.arc(0, 0, 30, 0, Math.PI*2); aCtx.stroke();
      }
      const glowColor = plasmaOrbs >= 3 ? '#a855f7' : getEquippedColorHex();
      aCtx.shadowBlur = plasmaOrbs >= 3 ? 25 : 15; aCtx.shadowColor = glowColor; aCtx.fillStyle = glowColor;
      aCtx.beginPath(); aCtx.moveTo(0, -this.h/2); aCtx.lineTo(-this.w/2, this.h/2); aCtx.lineTo(-this.w/4, this.h/4);
      aCtx.lineTo(this.w/4, this.h/4); aCtx.lineTo(this.w/2, this.h/2); aCtx.closePath(); aCtx.fill();
      aCtx.shadowBlur = 5; aCtx.shadowColor = '#fff'; aCtx.fillStyle = '#fff';
      aCtx.beginPath(); aCtx.moveTo(0, -this.h/3); aCtx.lineTo(-3, 3); aCtx.lineTo(3, 3); aCtx.closePath(); aCtx.fill();
      aCtx.fillStyle = Math.random() > 0.5 ? '#ff0844' : '#ff6600'; aCtx.fillRect(-3, this.h/2 - 2, 6, Math.random()*6+3);
      aCtx.restore();
      drawSkinBadge(this.x + this.w/2, this.y - 10);
    }
  };

  // ── ENEMY CLASS (with attack behaviours) ──
  class Enemy {
    constructor(type) {
      this.type = type; this.x = Math.random() * (BOARD_W - 60) + 10; this.y = -30; this.offset = Math.random() * 100;
      this.attackTimer = 0;
      if (type === 'SCOUT') {
        // PINK — dives straight down fast, accelerates over time
        this.w = 20; this.h = 20; this.speed = 3.5; this.hp = 1; this.color = '#ff0090'; this.pts = 15;
        this.dive = false; this.diveSpeed = 0;
      } else if (type === 'BOMBER') {
        // ORANGE — moves slowly, drops bombs periodically
        this.w = 36; this.h = 28; this.speed = 1.2; this.hp = 3; this.color = '#ff6600'; this.pts = 40;
        this.attackCooldown = 120; // frames between bombs (2s at 60fps)
      } else {
        // PURPLE FIGHTER — weaves, shoots lasers at player
        this.w = 26; this.h = 22; this.speed = 2.2; this.hp = 2; this.color = '#a855f7'; this.pts = 25;
        this.attackCooldown = 90; // frames between laser shots
        this.laserFlash = 0;
      }
    }

    update(frame) {
      const warpMult = timeWarpActive ? 0.5 : 1.0;

      if (this.type === 'SCOUT') {
        // Pink scout: dive behaviour — after entering screen, occasionally
        // locks onto player X and dives diagonally
        if (!this.dive && this.y > 50 && Math.random() < 0.004) {
          this.dive = true; this.diveSpeed = 6 + Math.random() * 3;
          this.diveVx = (player.x - this.x) * 0.04;
        }
        if (this.dive) {
          this.y += this.diveSpeed * warpMult;
          this.x += this.diveVx * warpMult;
          this.diveSpeed = Math.min(12, this.diveSpeed + 0.12); // accelerate
        } else {
          this.y += this.speed * warpMult;
        }

      } else if (this.type === 'BOMBER') {
        this.y += this.speed * warpMult;
        this.attackTimer++;
        if (this.attackTimer >= this.attackCooldown / warpMult) {
          this.attackTimer = 0;
          snd('enemyShot', { semi: -5 });
          // Drop a bomb straight down from the enemy center
          enemyProjectiles.push({
            type: 'BOMB', x: this.x + this.w/2, y: this.y + this.h,
            vx: (Math.random() - 0.5) * 1.2, vy: 3.5,
            r: 7, alpha: 1, trail: [], fuseTimer: 0
          });
        }

      } else {
        // Purple FIGHTER — sine wave + laser shots
        this.y += this.speed * warpMult;
        this.x += Math.sin(this.y * 0.03 + this.offset) * 1.5 * warpMult;
        this.attackTimer++;
        if (this.laserFlash > 0) this.laserFlash--;
        if (this.attackTimer >= this.attackCooldown / warpMult) {
          this.attackTimer = 0; this.laserFlash = 8;
          snd('enemyShot');
          // Shoot laser aimed at player
          const dx = player.x + player.w/2 - (this.x + this.w/2);
          const dy = player.y + player.h/2 - (this.y + this.h/2);
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const speed = 5.5;
          enemyProjectiles.push({
            type: 'LASER', x: this.x + this.w/2, y: this.y + this.h,
            vx: (dx/dist)*speed, vy: (dy/dist)*speed,
            len: 18, alpha: 1
          });
        }
      }
    }

    draw() {
      aCtx.save(); aCtx.shadowBlur = 12; aCtx.shadowColor = this.color;

      if (this.type === 'BOMBER') {
        // Orange chunky diamond-ish shape
        aCtx.fillStyle = this.dive ? '#ffaa00' : this.color;
        aCtx.beginPath();
        aCtx.moveTo(this.x + this.w/2, this.y + this.h);
        aCtx.lineTo(this.x, this.y + this.h*0.4);
        aCtx.lineTo(this.x + this.w*0.2, this.y);
        aCtx.lineTo(this.x + this.w*0.8, this.y);
        aCtx.lineTo(this.x + this.w, this.y + this.h*0.4);
        aCtx.closePath(); aCtx.fill();
        // Warning glow when about to bomb
        if (this.attackTimer > this.attackCooldown * 0.7) {
          const glow = Math.sin(this.attackTimer * 0.4) * 0.5 + 0.5;
          aCtx.strokeStyle = `rgba(255,255,0,${glow})`; aCtx.lineWidth = 2;
          aCtx.stroke();
        }

      } else if (this.type === 'FIGHTER') {
        // Purple fighter — arrow with laser charge glow
        aCtx.fillStyle = this.laserFlash > 0 ? '#ffffff' : this.color;
        aCtx.shadowBlur = this.laserFlash > 0 ? 25 : 12;
        aCtx.beginPath();
        aCtx.moveTo(this.x + this.w/2, this.y + this.h);
        aCtx.lineTo(this.x, this.y);
        aCtx.lineTo(this.x + this.w*0.35, this.y + this.h*0.4);
        aCtx.lineTo(this.x + this.w/2, this.y + this.h*0.2);
        aCtx.lineTo(this.x + this.w*0.65, this.y + this.h*0.4);
        aCtx.lineTo(this.x + this.w, this.y);
        aCtx.closePath(); aCtx.fill();

      } else {
        // Pink scout — sleek triangle, red-hot when diving
        aCtx.fillStyle = this.dive ? '#ff4444' : this.color;
        aCtx.shadowBlur = this.dive ? 22 : 12;
        aCtx.shadowColor = this.dive ? '#ff0000' : this.color;
        aCtx.beginPath();
        aCtx.moveTo(this.x + this.w/2, this.y + this.h);
        aCtx.lineTo(this.x, this.y);
        aCtx.lineTo(this.x + this.w, this.y);
        aCtx.closePath(); aCtx.fill();
        // Dive trail
        if (this.dive) {
          aCtx.strokeStyle = 'rgba(255,68,68,0.4)'; aCtx.lineWidth = 1;
          aCtx.beginPath(); aCtx.moveTo(this.x+this.w/2, this.y); aCtx.lineTo(this.x+this.w/2, this.y-18); aCtx.stroke();
        }
      }

      // HP bar (only for multi-HP enemies)
      if ((this.type === 'BOMBER' && this.hp < 3) || (this.type === 'FIGHTER' && this.hp < 2)) {
        const maxHp = this.type === 'BOMBER' ? 3 : 2;
        aCtx.fillStyle = 'rgba(0,0,0,0.6)'; aCtx.fillRect(this.x, this.y - 7, this.w, 4);
        aCtx.fillStyle = '#39ff14'; aCtx.fillRect(this.x, this.y - 7, this.w * (this.hp/maxHp), 4);
      }

      aCtx.restore();
    }
  }

  // ── ENEMY PROJECTILE DRAWING & UPDATE ──
  function updateEnemyProjectiles(dt) {
    const warpMult = timeWarpActive ? 0.5 : 1.0;
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = enemyProjectiles[i];
      ep.x += ep.vx * warpMult; ep.y += ep.vy * warpMult;

      if (ep.type === 'BOMB') {
        ep.fuseTimer++;
        // Trail
        ep.trail.push({ x: ep.x, y: ep.y, alpha: 0.7 });
        if (ep.trail.length > 10) ep.trail.shift();
        // Draw trail
        ep.trail.forEach((t, ti) => {
          aCtx.save(); aCtx.globalAlpha = t.alpha * (ti/ep.trail.length) * 0.5;
          aCtx.fillStyle = '#ff6600';
          aCtx.beginPath(); aCtx.arc(t.x, t.y, 3, 0, Math.PI*2); aCtx.fill(); aCtx.restore();
        });
        // Draw bomb
        aCtx.save();
        aCtx.shadowBlur = 14; aCtx.shadowColor = '#ff6600';
        // Pulsing fuse glow
        const fuseGlow = Math.sin(ep.fuseTimer * 0.3) * 0.4 + 0.6;
        aCtx.fillStyle = `rgba(255,100,0,${fuseGlow})`;
        aCtx.beginPath(); aCtx.arc(ep.x, ep.y, ep.r, 0, Math.PI*2); aCtx.fill();
        aCtx.strokeStyle = '#ffcc00'; aCtx.lineWidth = 1.5; aCtx.stroke();
        // Fuse spark
        aCtx.fillStyle = '#ffff00';
        aCtx.beginPath(); aCtx.arc(ep.x + Math.sin(ep.fuseTimer*0.8)*3, ep.y - ep.r - 3, 2, 0, Math.PI*2); aCtx.fill();
        aCtx.restore();

        // Shield collision — immune if bubble active
        if (!shieldBubbleActive &&
            Math.hypot(ep.x - (player.x+player.w/2), ep.y - (player.y+player.h/2)) < ep.r + 14) {
          explode(ep.x, ep.y, '#ff6600', 18);
          snd('hurt');
          shield -= 20; screenShake = 16; shieldFlashTimer = 15;
          document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
          enemyProjectiles.splice(i,1); if (shield <= 0) end(); continue;
        }
        if (ep.y > BOARD_H + 20) { enemyProjectiles.splice(i,1); continue; }

      } else if (ep.type === 'LASER') {
        // Draw laser bolt
        aCtx.save();
        aCtx.shadowBlur = 12; aCtx.shadowColor = '#a855f7';
        aCtx.strokeStyle = '#a855f7'; aCtx.lineWidth = 2.5;
        aCtx.beginPath();
        aCtx.moveTo(ep.x, ep.y);
        aCtx.lineTo(ep.x - ep.vx * (ep.len/5), ep.y - ep.vy * (ep.len/5));
        aCtx.stroke();
        aCtx.strokeStyle = 'rgba(255,255,255,0.7)'; aCtx.lineWidth = 1;
        aCtx.beginPath();
        aCtx.moveTo(ep.x, ep.y);
        aCtx.lineTo(ep.x - ep.vx*2, ep.y - ep.vy*2);
        aCtx.stroke();
        aCtx.restore();

        // Player collision
        if (!shieldBubbleActive &&
            collide({ x: ep.x - 4, y: ep.y - 4, w: 8, h: 8 }, { x: player.x, y: player.y, w: player.w, h: player.h })) {
          explode(ep.x, ep.y, '#a855f7', 8);
          snd('shieldHit');
          shield -= 12; screenShake = 10; shieldFlashTimer = 10;
          document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
          enemyProjectiles.splice(i,1); if (shield <= 0) end(); continue;
        }
        // Same stale bound as the player's bullets: enemy lasers evaporated
        // over the right quarter of the board instead of reaching you.
        if (ep.y > BOARD_H + 20 || ep.y < -20 || ep.x < -20 || ep.x > BOARD_W + 20) { enemyProjectiles.splice(i,1); continue; }
      }
    }
  }

  function explode(x, y, color, qty = 10) {
    for (let i = 0; i < qty; i++) {
      let ang = Math.random() * Math.PI * 2, v = Math.random() * 4 + 1;
      particles.push({ x, y, vx: Math.cos(ang)*v, vy: Math.sin(ang)*v, alpha: 1, decay: Math.random()*0.03+0.02, color, size: Math.random()*2+1 });
    }
  }
  function popText(x, y, txt, color) { floatingTexts.push({ x, y, txt, color, alpha: 1, vy: -0.8 }); }
  const collide = (r1, r2) => r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;

  gTimer = setInterval(() => { gameTime--; document.getElementById('g-time').textContent = gameTime; if (gameTime <= 0) end(); }, 1000);

  let frame = 0;

  function pipeline(now) {
    if (isOver) return;
    let dt = now - lastTime; lastTime = now;
    frame++;
    aCtx.clearRect(0, 0, BOARD_W, BOARD_H);

    aCtx.save();
    if (screenShake > 0.5) { aCtx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake *= 0.88; }

    // Shield flash overlay
    if (shieldFlashTimer > 0) {
      shieldFlashTimer--;
      aCtx.fillStyle = `rgba(255,0,0,${shieldFlashTimer/15*0.25})`;
      aCtx.fillRect(0, 0, BOARD_W, BOARD_H);
    }

    // Time warp visual (blue tint + slowdown label)
    if (timeWarpActive) {
      if (timeWarpTimer > 0) {
        timeWarpTimer--;
      } else {
        // Time warp has ended
        timeWarpActive = false;
        activeAbility = null;
      }
      aCtx.fillStyle = 'rgba(255,215,0,0.04)';
      aCtx.fillRect(0, 0, BOARD_W, BOARD_H);
      // Pulsing border
      aCtx.strokeStyle = `rgba(255,215,0,${0.3 + Math.sin(frame*0.2)*0.2})`;
      aCtx.lineWidth = 3;
      aCtx.strokeRect(2, 2, BOARD_W - 4, BOARD_H - 4);
    }

    backgroundStars.forEach(s => {
      s.y += s.speed * (timeWarpActive ? 0.35 : 1);
      if (s.y > BOARD_H) s.y = 0;
      aCtx.fillStyle = `rgba(255,255,255,${s.alpha})`; aCtx.fillRect(s.x, s.y, s.size, s.size);
    });

    player.update(dt); player.draw();

    // Shield bubble countdown
    if (shieldBubbleActive && shieldBubbleTimer > 0) shieldBubbleTimer--;

    enemySpawnTimer += dt;
    if (enemySpawnTimer >= enemySpawnInterval) {
      let r = Math.random(), type = 'SCOUT';
      if (score > 150 && r > 0.75) type = 'BOMBER';
      else if (score > 60 && r > 0.4) type = 'FIGHTER';
      enemies.push(new Enemy(type)); enemySpawnTimer = 0;
      enemySpawnInterval = Math.max(300 / diffMod, 1100 / diffMod - score * 0.5 * diffMod);
    }

    // ── Player projectiles ──
    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const p = projectiles[pi];
      // Smart missile homing — lock onto assigned target or nearest if target gone
      if (p.smart) {
        let target = null;
        // Use locked target if it's still alive
        if (p.lockedTarget && enemies.includes(p.lockedTarget)) {
          target = p.lockedTarget;
        } else if (enemies.length > 0) {
          // Re-lock to nearest enemy
          let bestD = Infinity;
          enemies.forEach(e => {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bestD) { bestD = d; target = e; }
          });
          p.lockedTarget = target;
        }
        if (target) {
          const tx = (target.x + target.w/2) - p.x;
          const ty = (target.y + target.h/2) - p.y;
          const dist = Math.hypot(tx, ty) || 1;
          p.vx += (tx/dist) * 1.1;
          p.vy += (ty/dist) * 1.1;
          // Cap speed
          const spd = Math.hypot(p.vx, p.vy);
          if (spd > 12) { p.vx = p.vx/spd*12; p.vy = p.vy/spd*12; }
        }
        // Cyan homing trail
        particles.push({ x:p.x, y:p.y, vx:(Math.random()-0.5)*0.5, vy:0.5, alpha:0.8, decay:0.07, color:'#00f5ff', size:2 });
      }
      p.x += p.vx; p.y += p.vy;
      // Draw
      aCtx.save();
      if (p.smart) {
        aCtx.shadowBlur = 15; aCtx.shadowColor = '#00f5ff';
        aCtx.fillStyle = '#fff';
        aCtx.beginPath(); aCtx.arc(p.x, p.y, 4, 0, Math.PI*2); aCtx.fill();
        aCtx.fillStyle = '#00f5ff';
        aCtx.beginPath(); aCtx.arc(p.x, p.y, 2, 0, Math.PI*2); aCtx.fill();
      } else if (p.plasma) {
        // Extra wide plasma bolt from max+ level
        aCtx.shadowBlur = 14; aCtx.shadowColor = '#a855f7';
        aCtx.fillStyle = '#a855f7';
        aCtx.beginPath(); aCtx.arc(p.x, p.y, 3, 0, Math.PI*2); aCtx.fill();
        aCtx.fillStyle = '#ff0090';
        aCtx.beginPath(); aCtx.arc(p.x, p.y, 1.5, 0, Math.PI*2); aCtx.fill();
      } else {
        aCtx.shadowBlur = 10; aCtx.shadowColor = '#00f5ff'; aCtx.fillStyle = '#00f5ff';
        aCtx.fillRect(p.x - 1.5, p.y, 3, 10);
      }
      aCtx.restore();
      // Off-board cull. These bounds are BOARD-relative on purpose: hardcoded
      // to the old 400-wide field, the x>420 test deleted every shot fired from
      // the right quarter of the 560-wide board on the same frame it spawned —
      // the ship's own muzzle sits past 420 once it's right of x≈403, so the
      // gun was simply dead over there.
      if (p.y < -20 || p.y > BOARD_H + 20 || p.x < -20 || p.x > BOARD_W + 20) { projectiles.splice(pi, 1); }
    }

    // ── Power-ups (plasma orbs) ──
    for (let pui = powerups.length - 1; pui >= 0; pui--) {
      const pu = powerups[pui];
      pu.y += 1.8; pu.pulse += 0.1;
      // Colour shifts based on how many orbs already collected
      const orbColor = ['#39ff14','#00f5ff','#ffd700','#ff0090','#a855f7'][Math.min(4, plasmaOrbs)];
      aCtx.save();
      aCtx.shadowBlur = 14; aCtx.shadowColor = orbColor; aCtx.fillStyle = orbColor;
      aCtx.translate(pu.x, pu.y); aCtx.rotate(pu.pulse * 0.2);
      // Octagon shape for max+ orbs
      if (plasmaOrbs >= 3) {
        aCtx.beginPath();
        for (let s=0;s<8;s++) { const a=(s/8)*Math.PI*2; aCtx.lineTo(Math.cos(a)*8, Math.sin(a)*8); }
        aCtx.closePath(); aCtx.fill();
      } else {
        aCtx.fillRect(-6, -6, 12, 12);
      }
      aCtx.restore();

      if (collide({ x: player.x, y: player.y, w: player.w, h: player.h }, { x: pu.x-8, y: pu.y-8, w: 16, h: 16 })) {
        plasmaOrbs++;
        powerups.splice(pui, 1);
        explode(pu.x, pu.y, orbColor, 18);
        if (plasmaOrbs <= 3) {
          snd('powerup');
          popText(player.x, player.y - 10, `PLASMA LV${plasmaOrbs}!`, '#39ff14');
        } else {
          const abilIndex = plasmaOrbs - 3;
          const abil = getAbilityForOrb(abilIndex);
          specialAbilities.push(abil);
          snd('charge');
          popText(player.x, player.y - 10, abil.label + ' CHARGED!', abil.color);
          // Big particle burst for bonus orbs
          for (let k=0;k<6;k++) {
            setTimeout(()=>explode(pu.x + (Math.random()-0.5)*40, pu.y + (Math.random()-0.5)*30, abil.color, 12), k*80);
          }
        }
      } else if (pu.y > BOARD_H + 20) powerups.splice(pui, 1);
    }

    // ── Enemies ──
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      e.update(frame); e.draw();

      if (e.y > 510) {
        snd('shieldHit');
        enemies.splice(ei, 1); shield -= 15 * diffMod; screenShake = 10; shieldFlashTimer = 12;
        document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
        if (shield <= 0) end(); continue;
      }
      if (!shieldBubbleActive && collide({ x: player.x, y: player.y, w: player.w, h: player.h }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        explode(e.x + e.w/2, e.y + e.h/2, e.color, 20);
        snd('hurt');
        enemies.splice(ei, 1); shield -= 25 * diffMod; screenShake = 18; shieldFlashTimer = 18;
        document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
        if (shield <= 0) end(); continue;
      }
      // Check player projectile hits
      let destroyed = false;
      for (let pi = projectiles.length - 1; pi >= 0; pi--) {
        const p = projectiles[pi];
        const pBox = p.smart
          ? { x: p.x-5, y: p.y-5, w: 10, h: 10 }
          : { x: p.x-2, y: p.y, w: 4, h: 12 };
        if (collide(pBox, { x: e.x, y: e.y, w: e.w, h: e.h })) {
          projectiles.splice(pi, 1);
          e.hp -= p.plasma ? 2 : 1; // plasma bolts do double damage
          explode(p.x, p.y, p.plasma ? '#a855f7' : '#00f5ff', p.plasma ? 6 : 3);
          snd('hit');
          if (e.hp <= 0) {
            explode(e.x + e.w/2, e.y + e.h/2, e.color, 15);
            snd('explode');
            popText(e.x, e.y, `+${e.pts}`, e.color);
            if (Math.random() < 0.18 / diffMod) powerups.push({ x: e.x + e.w/2, y: e.y + e.h/2, pulse: 0 });
            score += e.pts; setLive(score); enemies.splice(ei, 1); destroyed = true; break;
          }
        }
      }
      if (destroyed) continue;
    }

    // ── Enemy projectiles ──
    updateEnemyProjectiles(dt);

    // ── Particles ──
    for (let pi = particles.length - 1; pi >= 0; pi--) {
      const p = particles[pi];
      p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
      if (p.alpha <= 0) { particles.splice(pi, 1); continue; }
      aCtx.save(); aCtx.globalAlpha = p.alpha; aCtx.fillStyle = p.color;
      const sz = p.size || 2;
      aCtx.fillRect(p.x, p.y, sz, sz); aCtx.restore();
    }

    // ── Floating texts ──
    for (let fti = floatingTexts.length - 1; fti >= 0; fti--) {
      const ft = floatingTexts[fti];
      ft.y += ft.vy || -0.8; ft.alpha -= 0.018;
      if (ft.alpha <= 0) { floatingTexts.splice(fti, 1); continue; }
      aCtx.save(); aCtx.globalAlpha = ft.alpha;
      // Bigger font for ability announcements (longer strings)
      const isAbility = ft.txt.length > 8;
      const fontSize = isAbility ? 13 : 11;
      aCtx.shadowBlur = isAbility ? 14 : 8; aCtx.shadowColor = ft.color;
      aCtx.font = `bold ${fontSize}px Orbitron`; aCtx.fillStyle = ft.color;
      aCtx.textAlign = 'center';
      // Clamp x so text stays within canvas — board-relative, or every popup
      // from the right half snapped back to 340 and read as the wrong kill.
      const clampedX = Math.max(60, Math.min(BOARD_W - 60, ft.x));
      aCtx.fillText(ft.txt, clampedX, ft.y); aCtx.restore();
    }

    drawPlasmaLevel();
    drawAbilityHUD();

    aCtx.restore();
    gameLoopId = requestAnimationFrame(pipeline);
  }

  let isOver = false;
  function end() {
    if (isOver) return; isOver = true;
    snd('gameOver');
    const finalPts = Math.min(1000, score);
    showResults('nebula', finalPts, {
      '👾 Alien Matrices Purged': Math.floor(score / 20),
      '⚡ Plasma Orbs Absorbed': plasmaOrbs,
      '🛡️ Shield Grid Status': `${Math.max(0, shield)}%`,
      '🏆 Final Earnings': `${finalPts} PTS`
    });
  }

  gameLoopId = requestAnimationFrame(pipeline);
}

// ══════════════════════════════════════════════════════════════════════
//  🧱 GAME 3: CYBERPUNK TETRIS (PREMIUM STANDALONE ENGINE INTEGRATED)
// ══════════════════════════════════════════════════════════════════════
function startTetris(){
  document.getElementById('g-canvas-holder').style.display='block';
  document.getElementById('tetris-next-wrap').style.display='block';
  document.getElementById('tetris-lvl-pill').style.display='block';
  setControls({ left:'◀', action:'⟳', drop:'⬇⬇ DROP', right:'▶', accentDrop:true });
  setControlHint('DRAG = SLIDE · TAP = ROTATE · ⬇⬇ = SLAM IT DOWN',
                 '← → = MOVE · ↑ = ROTATE · ↓ = SOFT DROP · SPACE = HARD DROP');
  showTouchHint('DRAG TO SLIDE · TAP TO ROTATE · ⬇⬇ TO SLAM');
  fitCanvas();
  const diffMod = getDifficultyModifier();

  const nCanvas = document.getElementById('nextCanvas');
  const nCtx = nCanvas.getContext('2d');

  let tetrisOver=false;
  // The clock is shortened by the tier, so the bar has to be measured against
  // the clock this run actually started with — against a hardcoded 60 it opened
  // two-thirds full on Overclock and half full on Meltdown.
  const startTime = 60 / diffMod;
  let score=0, level=1, linesCleared=0, time=startTime;
  const TET_COLS = Math.floor(BOARD_W / 40);   // 40 = cell width, so cells keep their shape
  let arena=createMatrix(TET_COLS,20), player={pos:{x:0,y:0}, matrix:null}, nextPiece=null;
  let dropCounter=0, dropInterval=600 * diffMod, lastTime=performance.now(), screenShake=0;
  let particles = [];
  
  document.getElementById('g-time').textContent=time;
  document.getElementById('tetris-lvl').textContent=level;

  // Exact Standardized Shape Definitions
  const PIECES = {
    'T': [[0,1,0],[1,1,1],[0,0,0]],
    'I': [[0,2,0,0],[0,2,0,0],[0,2,0,0],[0,2,0,0]],
    'O': [[3,3],[3,3]],
    'Z': [[4,4,0],[0,4,4],[0,0,0]],
    'S': [[0,5,5],[5,5,0],[0,0,0]],
    'J': [[0,6,0],[0,6,0],[6,6,0]],
    'L': [[0,7,0],[0,7,0],[0,7,7]]
  };
  
  // Cyberpunk Color Palette
  const COLORS = [null, '#ff007f', '#00f0ff', '#ffbc00', '#9d4edd', '#39ff14', '#ff5e00', '#001eff'];

  function createMatrix(w, h){ const matrix=[]; while(h--) matrix.push(new Array(w).fill(0)); return matrix; }
  
  function getPiece(){ const p='TILJOSZ'; return PIECES[p[p.length*Math.random()|0]]; }
  
  function resetPlayer(){
    if(!nextPiece) { player.matrix = getPiece(); nextPiece = getPiece(); }
    else { player.matrix = nextPiece; nextPiece = getPiece(); }
    player.pos.y = 0; player.pos.x = (arena[0].length/2|0) - (player.matrix[0].length/2|0);
    if(collide(arena, player)) end();
  }
  
  function collide(a, p){
    const m=p.matrix, o=p.pos;
    for(let y=0; y<m.length; ++y) for(let x=0; x<m[y].length; ++x) {
      if(m[y][x]!==0 && (a[y+o.y] && a[y+o.y][x+o.x])!==0) return true;
    } return false;
  }
  
  function merge(a, p){
    p.matrix.forEach((row,y)=>{ row.forEach((val,x)=>{ if(val!==0) a[y+p.pos.y][x+p.pos.x]=val; }); });
  }

  function rotate(m, dir){
    for(let y=0; y<m.length; ++y) for(let x=0; x<y; ++x) [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
    if(dir>0) m.forEach(row=>row.reverse()); else m.reverse();
  }

  function playerMove(dir){ player.pos.x+=dir; if(collide(arena,player)) player.pos.x-=dir; else snd('move'); }
  function playerRotate(dir){
    snd('rotate');
    const pos=player.pos.x; let offset=1; rotate(player.matrix, dir);
    while(collide(arena,player)){ player.pos.x+=offset; offset=-(offset+(offset>0?1:-1)); if(offset>player.matrix[0].length) { rotate(player.matrix, -dir); player.pos.x=pos; return; } }
  }
  
  function playerDrop(){
    player.pos.y++;
    if(collide(arena,player)){
      player.pos.y--; merge(arena,player); snd('land'); resetPlayer(); arenaSweep();
    } dropCounter=0;
  }

  // Included Hard Drop standard logic
  function playerHardDrop(){
    while(!collide(arena, player)) player.pos.y++;
    player.pos.y--; merge(arena, player); snd('hardDrop'); screenShake=8; resetPlayer(); arenaSweep();
    dropCounter=0;
  }

  function explodeLine(y, width) {
    for(let x=0; x<width; x++) {
      for(let i=0; i<3; i++) {
        let ang = Math.random()*Math.PI*2, v=Math.random()*3+1;
        particles.push({x: x*40+20, y: y*25+12, vx: Math.cos(ang)*v, vy: Math.sin(ang)*v, alpha: 1, color: COLORS[Math.floor(Math.random()*7)+1]});
      }
    }
  }

  function arenaSweep(){
    let rowCount=1;
    // How many rows went in ONE sweep, which is not what rowCount tracks —
    // that doubles per row as a score multiplier. The clear chime gets longer
    // and higher with the size of the clear, so a quad is unmistakable.
    let sweptRows=0, leveled=false;
    outer: for(let y=arena.length-1; y>0; --y){
      for(let x=0; x<arena[y].length; ++x) if(arena[y][x]===0) continue outer;
      const row = arena.splice(y,1)[0].fill(0); arena.unshift(row);
      explodeLine(y, arena[0].length);
      ++y; score += rowCount*10; linesCleared++; rowCount*=2; sweptRows++;
      setLive(score); screenShake=12;

      // Included progressive drop speed calculation logic
      if(linesCleared%10===0 && level<50) {
        level++; document.getElementById('tetris-lvl').textContent=level;
        dropInterval = Math.max(50, (600 * Math.pow(0.85, level - 1)) / diffMod);
        leveled=true;
      }
    }
    if(sweptRows) snd('lineClear',{semi:sweptRows});
    if(leveled) snd('levelUp');
  }

  function drawMatrix(matrix, offset, ctx, isGhost=false){
    matrix.forEach((row,y)=>{
      row.forEach((value,x)=>{
        if(value!==0){
          if(isGhost) {
            ctx.fillStyle = COLORS[value]; ctx.globalAlpha = 0.2;
            ctx.fillRect((x+offset.x)*40, (y+offset.y)*25, 38, 23);
            ctx.globalAlpha = 1;
          } else {
            ctx.shadowBlur = 10; ctx.shadowColor = COLORS[value];
            ctx.fillStyle = COLORS[value];
            if(ctx===nCtx) ctx.fillRect((x+offset.x)*20, (y+offset.y)*20, 18, 18);
            else ctx.fillRect((x+offset.x)*40, (y+offset.y)*25, 38, 23);
            ctx.shadowBlur = 0;
          }
        }
      });
    });
  }

  window.onkeydown=e=>{
    if(e.code==='ArrowLeft') { playerMove(-1); e.preventDefault(); }
    if(e.code==='ArrowRight') { playerMove(1); e.preventDefault(); }
    if(e.code==='ArrowDown') { playerDrop(); e.preventDefault(); }
    if(e.code==='ArrowUp') { playerRotate(1); e.preventDefault(); }
    if(e.code==='Space') { playerHardDrop(); e.preventDefault(); } // Space bar hard drop
  };
  // ── CONTROL PAD ──
  // Tapping ◀ nine times to cross the board is miserable on a phone, so the
  // arrows auto-repeat on hold after the usual delayed-auto-shift pause.
  const repeatStoppers = [];
  function bindRepeat(el, fn){
    let delay = null, rep = null;
    const stop = () => { clearTimeout(delay); clearInterval(rep); delay = rep = null; };
    const tick = () => { if(tetrisOver){ stop(); return; } fn(); };
    bindHold(el, () => { tick(); delay = setTimeout(() => { rep = setInterval(tick, 60); }, 220); }, stop);
    repeatStoppers.push(stop);
  }
  bindRepeat(document.getElementById('ctrl-left'),  ()=>playerMove(-1));
  bindRepeat(document.getElementById('ctrl-right'), ()=>playerMove(1));
  document.getElementById('ctrl-action').onclick = ()=>{ if(!tetrisOver) playerRotate(1); };
  // Slam the active piece straight to the stack — the mobile stand-in for
  // holding Space, and the only way to keep pace once the drop speed climbs.
  document.getElementById('ctrl-drop').onclick = ()=>{ if(!tetrisOver) playerHardDrop(); };

  // ── BOARD GESTURES ──
  // Drag sideways to slide a column at a time, pull down to soft drop, flick
  // down to slam, tap to rotate. The pad below does the same jobs for anyone
  // who'd rather press buttons.
  const COL_PX = 40, ROW_PX = 25;          // one cell of the 10×20 board
  let gStartX=0, gStartY=0, gAccX=0, gAccY=0, gStartT=0, gMoved=false;
  bindCanvasDrag({
    onDown(p){
      hideTouchHint();
      gStartX = gAccX = p.x; gStartY = gAccY = p.y;
      gStartT = performance.now(); gMoved = false;
    },
    onMove(p){
      if(tetrisOver) return;
      while(p.x - gAccX >= COL_PX){ playerMove(1);  gAccX += COL_PX; gMoved = true; }
      while(gAccX - p.x >= COL_PX){ playerMove(-1); gAccX -= COL_PX; gMoved = true; }
      // Soft drop only once the gesture has settled into a slow pull-down. A
      // fast flick skips this entirely so it can't sink the piece, lock it,
      // and then hard-drop the *next* one on release.
      if(performance.now() - gStartT > 260){
        while(p.y - gAccY >= ROW_PX){ playerDrop(); gAccY += ROW_PX; gMoved = true; }
      }
      if(p.y < gAccY) gAccY = p.y;         // pulling back up re-arms the drop
    },
    onUp(p){
      if(tetrisOver) return;
      const held = performance.now() - gStartT;
      const dy = p.y - gStartY, dx = Math.abs(p.x - gStartX);
      if(held < 260 && dy > 55 && dy > dx * 1.6) playerHardDrop();   // flick down
      else if(!gMoved && held < 260 && dy < 20 && dx < 20) playerRotate(1);  // tap
    }
  });

  gTimer=setInterval(()=>{
    time--; document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${Math.max(0,time/startTime)*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0) end();
  },1000);

  resetPlayer();

  function loop(now){
    if(tetrisOver)return;
    const dt = now - lastTime; lastTime = now;
    aCtx.clearRect(0,0,BOARD_W,BOARD_H); nCtx.clearRect(0,0,80,80);
    
    dropCounter += dt; if(dropCounter > dropInterval) playerDrop();
    
    aCtx.save();
    if(screenShake>0.5) { aCtx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake*=0.8; }
    
    // Calculate Ghost Piece position
    let ghost = { matrix: player.matrix, pos: {x: player.pos.x, y: player.pos.y} };
    while(!collide(arena, ghost)) ghost.pos.y++;
    ghost.pos.y--;
    
    // Draw Environment
    aCtx.strokeStyle='rgba(255,255,255,0.05)';
    for(let i=0; i<=TET_COLS; i++) { aCtx.beginPath(); aCtx.moveTo(i*40,0); aCtx.lineTo(i*40,BOARD_H); aCtx.stroke(); }
    for(let i=0; i<20; i++) { aCtx.beginPath(); aCtx.moveTo(0,i*25); aCtx.lineTo(BOARD_W,i*25); aCtx.stroke(); }
    
    drawMatrix(ghost.matrix, ghost.pos, aCtx, true);
    drawMatrix(arena, {x:0, y:0}, aCtx);
    drawMatrix(player.matrix, player.pos, aCtx);
    
    // Draw Next Piece preview canvas
    if(nextPiece){
      const offsetX = (4 - nextPiece[0].length) / 2;
      const offsetY = (4 - nextPiece.length) / 2;
      drawMatrix(nextPiece, {x: offsetX, y: offsetY}, nCtx);
    }
    
    // Process Particles. Walked backwards, not with forEach: splicing during a
    // forEach shifts the tail down and skips the next entry, so roughly half
    // the line-clear debris was never faded out and sat on the board.
    for (let pi = particles.length - 1; pi >= 0; pi--) {
      const p = particles[pi];
      p.x += p.vx; p.y += p.vy; p.alpha -= 0.03;
      if (p.alpha <= 0) { particles.splice(pi, 1); continue; }
      aCtx.save(); aCtx.globalAlpha = p.alpha; aCtx.fillStyle = p.color; aCtx.fillRect(p.x, p.y, 4, 4); aCtx.restore();
    }

    aCtx.restore();
    gameLoopId=requestAnimationFrame(loop);
  }
  
  function end(){
    if(tetrisOver)return;tetrisOver=true;
    // Only a top-out is a death; running the clock out is a finished round.
    snd(time<=0 ? 'results' : 'gameOver');
    repeatStoppers.forEach(stop=>stop());   // don't leave a held arrow ticking
    showResults('tetris',Math.min(1500,score),{'🧱 Base Core Lines Resolved':linesCleared, '🏆 Final Output Score':`${score} PTS`});
  }
  
  gameLoopId=requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════════════════
//  💥 GAME 4: DODGE CORES (STABILIZED SMOOTH MOUSE TRAIL TRACKING)
// ══════════════════════════════════════════════════════════════════════
function startDodge(){
  document.getElementById('g-canvas-holder').style.display='block';
  setControls(null);   // pure drag control — no pad to steal board height
  setControlHint('DRAG ANYWHERE TO STEER YOUR CORE', 'MOVE THE MOUSE TO STEER YOUR CORE');
  showTouchHint('DRAG ANYWHERE TO STEER');
  fitCanvas();
  let score=0, time=30, isGameOver=false, player={x:BOARD_W/2,y:BOARD_H/2,r:8}, obstacles=[];
  document.getElementById('g-time').textContent=time;

  const place = (x, y) => {
    player.x = Math.max(player.r, Math.min(BOARD_W - player.r, x));
    player.y = Math.max(player.r, Math.min(BOARD_H - player.r, y));
  };

  // ── STEERING ──
  // Mouse keeps the cursor-is-the-dot feel. Touch uses a *relative* drag: the
  // dot tracks how far the finger travels rather than snapping under it, so
  // your thumb never covers the one pixel you're trying to thread between
  // cores. Grab anywhere on the board and steer from there.
  let lastP = null;
  bindCanvasDrag({
    onHover(p){ if(!isTouchDevice) place(p.x, p.y); },
    onDown(p){
      hideTouchHint();
      lastP = p;
      if(!isTouchDevice) place(p.x, p.y);
    },
    onMove(p){
      if(isTouchDevice && lastP) place(player.x + (p.x - lastP.x), player.y + (p.y - lastP.y));
      else place(p.x, p.y);
      lastP = p;
    },
    onUp(){ lastP = null; }
  });

  gTimer=setInterval(()=>{
    if(isGameOver) return;
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/30*100}%`;
    score+=25;setLive(score);
    // Surviving another second IS the scoring event here, so it gets a beat.
    snd(time<=5&&time>0 ? 'tick' : 'score', {semi:-7});
    if(time<=0) end();
  },1000);

  let obstacleColors = ['#ff6600','#ff2442','#ffd700','#ff0090','#a855f7'];
  let frame = 0;

  function loop(){
    if(isGameOver) return;
    frame++;

    // Solid dark background so nothing blends into page
    aCtx.fillStyle = '#0a0a1a';
    aCtx.fillRect(0,0,BOARD_W,BOARD_H);

    // Subtle grid lines for depth
    aCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    aCtx.lineWidth = 1;
    for(let gx=0;gx<=BOARD_W;gx+=40){ aCtx.beginPath();aCtx.moveTo(gx,0);aCtx.lineTo(gx,BOARD_H);aCtx.stroke(); }
    for(let gy=0;gy<=BOARD_H;gy+=40){ aCtx.beginPath();aCtx.moveTo(0,gy);aCtx.lineTo(BOARD_W,gy);aCtx.stroke(); }

    // Player dot — equipped color with glow
    aCtx.save();
    const dodgeColor = getEquippedColorHex();
    aCtx.shadowBlur = 24; aCtx.shadowColor = dodgeColor;
    aCtx.beginPath(); aCtx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    aCtx.fillStyle = dodgeColor; aCtx.fill();
    aCtx.shadowBlur = 6; aCtx.shadowColor = '#fff';
    aCtx.strokeStyle = '#fff'; aCtx.lineWidth = 2; aCtx.stroke();
    aCtx.restore();
    drawSkinBadge(player.x, player.y - player.r - 10);

    // Spawn obstacles
    if(Math.random() < .08 * (BOARD_W / 400)) {
      const col = obstacleColors[Math.floor(Math.random()*obstacleColors.length)];
      obstacles.push({
        x: Math.random()*(BOARD_W-20)+10, y: -10,
        vx: (Math.random()-0.5)*4, vy: Math.random()*3+3,
        r: Math.random()*6+8,
        color: col
      });
    }

    // Draw & move obstacles
    for(let i=obstacles.length-1; i>=0; i--){
      let o = obstacles[i];
      o.x += o.vx; o.y += o.vy;

      // Glowing obstacle
      aCtx.save();
      aCtx.shadowBlur = 18; aCtx.shadowColor = o.color;
      aCtx.beginPath(); aCtx.arc(o.x, o.y, o.r, 0, Math.PI*2);
      aCtx.fillStyle = o.color; aCtx.fill();
      // Bright core highlight
      aCtx.shadowBlur = 0;
      aCtx.beginPath(); aCtx.arc(o.x - o.r*0.28, o.y - o.r*0.28, o.r*0.3, 0, Math.PI*2);
      aCtx.fillStyle = 'rgba(255,255,255,0.35)'; aCtx.fill();
      aCtx.restore();

      const dx = o.x - player.x, dy = o.y - player.y;
      if(Math.sqrt(dx*dx + dy*dy) < o.r + player.r){ isGameOver=true; snd('bigExplode'); end(); return; }
      if(o.y > BOARD_H + 20) obstacles.splice(i,1);
    }

    gameLoopId = requestAnimationFrame(loop);
  }
  
  function end(){
    clearCanvasDrag();
    showResults('dodge',Math.min(800,score),{'⏱️ Operational Lifespan':score/25+'s','🏆 Score Accumulation':`${score} PTS`});
  }
  gameLoopId=requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🧠 GAME 5: MEMORY MATCH
// ════════════════════════════════════════════
function startMemory(){
  const wrap = document.getElementById('g-memory');wrap.style.display='grid';wrap.innerHTML='';
  let icons=['🚀','🚀','🧱','🧱','🖱️','🖱️','💥','💥','🧠','🧠','🔢','🔢','⚡','⚡','🏆','🏆'], flipped=[], matched=0, score=0, time=25;
  document.getElementById('g-time').textContent=time;
  icons.sort(()=>Math.random()-.5);

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/25*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0) end();
  },1000);

  icons.forEach((icon,idx)=>{
    const card=document.createElement('div');card.className='mem-card';card.dataset.val=icon;card.textContent='?';
    card.onclick=()=>{
      if(flipped.length<2&&!card.classList.contains('flipped')){
        card.classList.add('flipped');card.textContent=icon;flipped.push(card);snd('flip');
        if(flipped.length===2){
          // Each pair rings a step higher than the last, so the board sings its
          // way up as it empties.
          if(flipped[0].dataset.val===flipped[1].dataset.val){score+=75;setLive(score);matched++;snd('match',{semi:matched*2});flipped=[];if(matched===8)end()}
          else{snd('wrong');setTimeout(()=>{flipped[0].classList.remove('flipped');flipped[0].textContent='?';flipped[1].classList.remove('flipped');flipped[1].textContent='?';flipped=[]},700)}
        }
      }
    };
    wrap.appendChild(card);
  });
  let memEnded=false;
  function end(){if(memEnded)return;memEnded=true;showResults('memory',Math.min(600,score),{'🧩 Clusters Unified':matched,'🏆 Score Accumulation':`${score} PTS`})}
}

// ════════════════════════════════════════════
//  🔢 GAME 6: MATH BLITZ
// ════════════════════════════════════════════
function startMath(){
  document.getElementById('g-math').style.display='block';
  let score=0, time=20, curAns=0;
  document.getElementById('g-time').textContent=time;

  function gen(){
    let a=Math.floor(Math.random()*12)+2, b=Math.floor(Math.random()*12)+2, ops=['+','-','*'], op=ops[Math.floor(Math.random()*3)];
    document.getElementById('math-question').textContent=`${a} ${op} ${b}`;
    curAns=op==='+'?a+b:op==='-'?a-b:a*b;
    document.getElementById('math-answer').value='';document.getElementById('math-answer').focus();
  }
  gen();

  const check=()=>{
    let input=parseInt(document.getElementById('math-answer').value);
    if(input===curAns){score+=50;setLive(score);snd('correct')}else{snd('wrong')}gen();
  };
  document.getElementById('math-submit').onclick=check;
  document.getElementById('math-answer').onkeydown=e=>{if(e.code==='Enter')check()};

  let mathEnded=false;
  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/20*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0&&!mathEnded){mathEnded=true;document.getElementById('math-answer').onkeydown=null;document.getElementById('math-submit').onclick=null;showResults('math',Math.min(750,score),{'🔢 Nodes Resolved':score/50,'🏆 Score Accumulation':`${score} PTS`})}
  },1000);
}

// ════════════════════════════════════════════
//  ⚡ GAME 7: REACTION TIME
// ════════════════════════════════════════════
function startReaction(){
  const box=document.getElementById('g-reaction');box.style.display='flex';box.style.background='var(--red)';
  const txt=document.getElementById('reaction-text');txt.textContent='WAIT FOR GREEN...';
  let state='wait', startT=0, time=15, score=0, reactionEnded=false;
  document.getElementById('g-time').textContent=time;

  // Re-arms go through the shared registry so stopGame() kills them on a quit,
  // plus a local guard for the clock-expiry path. Left running, one of these
  // repainted the box green under the NEXT round without arming that round's
  // startT — the replay showed GO while its own state still said WAIT, so the
  // tap scored "TOO FAST" and the round never became playable.
  const later=(fn,ms)=>gLater(()=>{ if(!reactionEnded) fn(); },ms);

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/15*100}%`;
    if(time<=0) end();
  },1000);

  setControlHint('TAP THE INSTANT IT TURNS GREEN','CLICK THE INSTANT IT TURNS GREEN');
  const goLabel = isTouchDevice ? 'TAP NOW!' : 'CLICK NOW!';

  let trigger=later(()=>{if(state==='wait'){state='go';box.style.background='var(--lime)';txt.textContent=goLabel;snd('go');startT=performance.now()}},Math.random()*2500+1500);

  // Timed on pointerdown, not click. A synthesised click doesn't land until
  // the finger lifts, which was quietly adding its own latency to every
  // reading — this game's whole score is that number.
  box.onpointerdown=e=>{
    e.preventDefault();
    if(state==='wait'){clearTimeout(trigger);snd('wrong');txt.textContent='TOO FAST! RESETTING...';box.style.background='var(--orange)';state='hold';later(()=>{if(time>0){state='wait';box.style.background='var(--red)';txt.textContent='WAIT...';trigger=later(()=>{state='go';box.style.background='var(--lime)';txt.textContent=goLabel;snd('go');startT=performance.now()},Math.random()*2000+1000)}},1200)}
    else if(state==='go'){
      let diff=Math.round(performance.now()-startT);
      let earned=Math.max(10,400-diff);score+=earned;setLive(score);
      // Faster reflex, higher chime — a 150ms tap is audibly better than 320ms.
      snd('score',{semi:Math.max(0,Math.round((400-diff)/40))});
      txt.textContent=`${diff}ms! REBOOTING...`;box.style.background='var(--cyan)';state='hold';
      later(()=>{if(time>0){state='wait';box.style.background='var(--red)';txt.textContent='WAIT...';trigger=later(()=>{state='go';box.style.background='var(--lime)';txt.textContent=goLabel;snd('go');startT=performance.now()},Math.random()*2000+1000)}},1500);
    }
  };
  function end(){if(reactionEnded)return;reactionEnded=true;clearTimeout(trigger);box.onpointerdown=null;showResults('reaction',Math.min(400,score),{'🏆 Final Sync Score':score})}
}

// ════════════════════════════════════════════
//  🏆 SYNCED DATA MATRIX LEADERBOARD BUILDER
// ════════════════════════════════════════════
async function loadLeaderboard(){
  const panel=document.getElementById('lb-panel');if(!db){panel.innerHTML='<div class="lb-empty">⚠️ Connecting Live Registry...</div>';return}
  try{
    db.ref('players').orderByChild('totalPoints').limitToLast(20).once('value', (snapshot) => {
      if(!snapshot.exists()){panel.innerHTML='<div class="lb-empty">No logged scores inside network nodes.</div>';return}
      const players=[];snapshot.forEach(c=>{players.push({uid:c.key,...c.val()})});players.reverse();
      const medals=['🥇','🥈','🥉'];panel.innerHTML='<div class="lb-title">🏆 TOP PLAYERS</div>';
      players.forEach((d,i)=>{
        // Podium place and "this is you" are independent: a logged-in player
        // sitting 2nd keeps the silver row and gets the blue marker too.
        const isMe=user&&d.uid===user.uid;
        const cls=[i<3?`r${i+1}`:'', isMe?'me':''].filter(Boolean).join(' ');
        const row=document.createElement('div');row.className=`lb-row ${cls}`.trim();
        row.innerHTML=`<div class="lb-rank">${medals[i]||'#'+(i+1)}</div><div class="lb-name">${esc(d.username)}${isMe?' ← You':''}</div><div class="lb-score">${(parseInt(d.totalPoints)||0).toLocaleString()} PTS</div>`;
        panel.appendChild(row);
      });
    });
  }catch(e){console.error(e)}
}
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ════════════════════════════════════════════
//  🏓 GAME 8: CYBER PONG
// ════════════════════════════════════════════
function startPong(){
  document.getElementById('g-canvas-holder').style.display='block';
  // Drag is the natural way to rally, but the buttons stay so the game still
  // plays if a browser refuses the gesture.
  setControls({ left:'▲ UP', right:'▼ DOWN' });
  setControlHint('DRAG TO RALLY · OR USE ▲ ▼', '↑ ↓ OR MOUSE TO MOVE YOUR PADDLE');
  showTouchHint('DRAG UP AND DOWN TO MOVE YOUR PADDLE');
  fitCanvas();

  const W=BOARD_W, H=BOARD_H, PAD_W=10, PAD_H=70, BALL_R=7;
  const X_SCALE = W / 400;   // keeps a rally the same length in seconds
  let userScore=0, cpuScore=0, time=45, isOver=false;
  let playerY=H/2-PAD_H/2, aiY=H/2-PAD_H/2;
  let ballX=W/2, ballY=H/2, ballVX=4*X_SCALE*(Math.random()<0.5?1:-1), ballVY=3*(Math.random()<0.5?1:-1);
  let aiSpeed=2.8;
  let rallyCount = 0; // Track current rally length
  const updateScore = () => {
    const raw = (userScore - cpuScore) * 50;
    const displayScore = Math.max(0, raw);
    setLive(displayScore);
  };
  updateScore();
  document.getElementById('g-time').textContent=Math.ceil(time);
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--cyan),var(--purple))';

  // Mouse / touch control. Pointer capture matters here: a rally pulls your
  // finger past the top and bottom edges constantly, and without it the
  // paddle used to stall the instant the touch left the canvas.
  const trackPaddle = p => {
    playerY = Math.max(0, Math.min(H-PAD_H, p.y - PAD_H/2));
  };
  bindCanvasDrag({
    onHover(p){ if(!isTouchDevice) trackPaddle(p); },
    onDown(p){ hideTouchHint(); trackPaddle(p); },
    onMove: trackPaddle
  });

  // Mobile buttons. Each press nudges immediately as well as starting the
  // glide — hold-to-move alone meant a quick tap moved the paddle by a couple
  // of pixels and read as a dead button.
  let moveUp=false,moveDown=false;
  const NUDGE=34;
  bindHold(document.getElementById('ctrl-left'),
           ()=>{ playerY=Math.max(0,playerY-NUDGE); moveUp=true; },   ()=>moveUp=false);
  bindHold(document.getElementById('ctrl-right'),
           ()=>{ playerY=Math.min(H-PAD_H,playerY+NUDGE); moveDown=true; }, ()=>moveDown=false);

  // Keyboard
  let keys={};
  window.onkeydown=e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown'].includes(e.code))e.preventDefault()};
  window.onkeyup=e=>{keys[e.code]=false};

  gTimer=setInterval(()=>{
    if(isOver)return;
    time--;document.getElementById('g-time').textContent=Math.ceil(time);
    document.getElementById('prog-fill').style.width=`${time/45*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0)end();
  },1000);

  function end(){
    if(isOver)return; isOver=true;
    const pts = Math.min(900, Math.max(0, (userScore - cpuScore) * 50));
    showResults('pong', pts, {'🏓 Your Goals': userScore, '🤖 CPU Goals': cpuScore, '🏆 Final Score': `${pts} PTS`});
  }

  function drawGlow(color,alpha=0.18){
    aCtx.save();aCtx.shadowBlur=18;aCtx.shadowColor=color;aCtx.globalAlpha=alpha;aCtx.restore();
  }

  function loop(){
    if(isOver)return;

    // Keyboard / button paddle movement
    const SPEED=6;
    if(keys['ArrowUp']||moveUp) playerY=Math.max(0,playerY-SPEED);
    if(keys['ArrowDown']||moveDown) playerY=Math.min(H-PAD_H,playerY+SPEED);

    // AI paddle — tracks ball with slight lag
    const aiCenter=aiY+PAD_H/2;
    const diff=ballY-aiCenter;
    aiY+=Math.sign(diff)*Math.min(aiSpeed,Math.abs(diff));
    aiY=Math.max(0,Math.min(H-PAD_H,aiY));

    // Ball movement
    const prevX=ballX;
    ballX+=ballVX; ballY+=ballVY;

    // Top/bottom wall bounce
    if(ballY-BALL_R<0){ballY=BALL_R;ballVY=Math.abs(ballVY);snd('bounceWall');}
    if(ballY+BALL_R>H){ballY=H-BALL_R;ballVY=-Math.abs(ballVY);snd('bounceWall');}

    // Paddle hits are SWEPT — they ask whether the ball crossed the paddle's
    // face this frame, not whether it happens to be sitting inside the 10-unit
    // slab right now. The rally speeds the ball up 4% per hit from an opening
    // 5.6, so past ~10 units/frame it stepped clean over the slab and scored
    // against you through a paddle that was in exactly the right place.
    const pFace=20+PAD_W;                       // player paddle's inner face
    const aFace=W-20-PAD_W;                     // AI paddle's inner face

    // Player paddle (left, x=20..20+PAD_W)
    if(ballVX<0 && prevX-BALL_R>=pFace && ballX-BALL_R<=pFace && ballY>playerY && ballY<playerY+PAD_H){
      // Player hit the ball - increase rally count
      rallyCount++;
      // The rally climbs in pitch as the ball speeds up — you can hear a long
      // rally getting dangerous without taking your eyes off the paddle.
      snd('bounce',{semi:Math.min(14,rallyCount)});
      ballVX=Math.abs(ballVX)*1.04;
      ballVY=((ballY-(playerY+PAD_H/2))/(PAD_H/2))*6;
      ballX=20+PAD_W+BALL_R;
    }

    // AI paddle (right, x=W-20-PAD_W..W-20)
    if(ballVX>0 && prevX+BALL_R<=aFace && ballX+BALL_R>=aFace && ballY>aiY && ballY<aiY+PAD_H){
      // AI hit the ball - rally continues
      rallyCount++;
      snd('bounce',{semi:Math.min(14,rallyCount)-12});
      ballVX=-Math.abs(ballVX)*1.02;
      ballVY=((ballY-(aiY+PAD_H/2))/(PAD_H/2))*5;
      ballX=W-20-PAD_W-BALL_R;
    }

    // Ball misses — reset and award points
    if(ballX<0||ballX>W){
      if(ballX < 0) {
        // Ball passed LEFT wall — player missed — CPU scores
        cpuScore++;
        snd('hurt');
        updateScore();
      } else {
        // Ball passed RIGHT wall — CPU missed — player scores
        userScore++;
        snd('score');
        updateScore();
      }

      // Reset for next point — random side, at the same pace as the opening
      // serve. X_SCALE has to be here too: without it every rally after the
      // first crossed the wider board at the old 400-wide speed, so the game
      // got conspicuously sluggish the moment anyone scored.
      rallyCount = 0;
      ballX=W/2; ballY=H/2;
      ballVX=4*X_SCALE*(Math.random()<0.5?1:-1);
      ballVY=3*(Math.random()<0.5?1:-1);
      aiSpeed=Math.min(5,2.8+userScore*0.002);
    }

    // ── DRAW ──
    aCtx.clearRect(0,0,W,H);

    // Centre dashed line
    aCtx.setLineDash([8,12]);aCtx.strokeStyle='rgba(255,255,255,0.08)';aCtx.lineWidth=2;
    aCtx.beginPath();aCtx.moveTo(W/2,0);aCtx.lineTo(W/2,H);aCtx.stroke();
    aCtx.setLineDash([]);

    // Player paddle (equipped color)
    const pongColor = getEquippedColorHex();
    aCtx.save();aCtx.shadowBlur=20;aCtx.shadowColor=pongColor;
    aCtx.fillStyle=pongColor;aCtx.beginPath();
    aCtx.roundRect(20,playerY,PAD_W,PAD_H,4);aCtx.fill();aCtx.restore();
    drawSkinBadge(20+PAD_W/2, playerY-12);

    // AI paddle (pink)
    aCtx.save();aCtx.shadowBlur=20;aCtx.shadowColor='#ff0090';
    aCtx.fillStyle='#ff0090';aCtx.beginPath();
    aCtx.roundRect(W-20-PAD_W,aiY,PAD_W,PAD_H,4);aCtx.fill();aCtx.restore();

    // Ball (white glow)
    aCtx.save();aCtx.shadowBlur=22;aCtx.shadowColor='#fff';
    aCtx.fillStyle='#ffffff';aCtx.beginPath();aCtx.arc(ballX,ballY,BALL_R,0,Math.PI*2);aCtx.fill();aCtx.restore();

    // Labels
    aCtx.font='bold 0.65rem Orbitron,monospace';aCtx.fillStyle='rgba(255,255,255,0.25)';
    aCtx.textAlign='center';
    aCtx.fillText('YOU',W/4,22);aCtx.fillText('CPU',3*W/4,22);

    gameLoopId=requestAnimationFrame(loop);
  }
  loop();
}

// ════════════════════════════════════════════
//  🐍 GAME 9: GRID SNAKE
// ════════════════════════════════════════════
function startSnake(){
  document.getElementById('g-canvas-holder').style.display='block';
  // Four absolute arrows. The old pad was two relative turns plus a cycle
  // button, which meant working out "which way is left of me right now" while
  // the snake was already moving — arrows say where you're going outright.
  setControls({ left:'←', action:'↑', drop:'↓', right:'→' });
  setControlHint('SWIPE OR TAP AN ARROW TO STEER', 'ARROW KEYS TO STEER');
  showTouchHint('SWIPE ANY DIRECTION TO STEER');
  fitCanvas();

  const diffMod = getDifficultyModifier();
  const baseTime = 60;
  const adjustedTime = baseTime / diffMod;

  const W=BOARD_W,H=BOARD_H,CELL=20,COLS=W/CELL,ROWS=H/CELL;
  let score=0,time=adjustedTime,isOver=false;
  let dir={x:1,y:0},nextDir={x:1,y:0};
  let snake=[{x:10,y:12},{x:9,y:12},{x:8,y:12}];
  let food=spawnFood(),speed=160 / diffMod,lastMoveTime=0,particles=[];

  document.getElementById('g-time').textContent=Math.ceil(time);
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--lime),var(--cyan))';
  document.getElementById('prog-fill').style.width='100%';

  function spawnFood(){
    let pos;
    do{pos={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)}}
    while(snake.some(s=>s.x===pos.x&&s.y===pos.y));
    return pos;
  }

  // Keyboard
  window.onkeydown=e=>{
    if(e.code==='ArrowLeft'&&dir.x!==1) {nextDir={x:-1,y:0};e.preventDefault();}
    if(e.code==='ArrowRight'&&dir.x!==-1){nextDir={x:1,y:0};e.preventDefault();}
    if(e.code==='ArrowUp'&&dir.y!==1)   {nextDir={x:0,y:-1};e.preventDefault();}
    if(e.code==='ArrowDown'&&dir.y!==-1){nextDir={x:0,y:1};e.preventDefault();}
  };

  // Turning onto your own neck is a no-op, exactly as pressing the opposite
  // arrow key already was.
  const steer=(x,y)=>{ if(x!==-dir.x||y!==-dir.y) nextDir={x,y}; };

  // Four absolute arrows, matching the arrow keys one for one.
  document.getElementById('ctrl-left').onclick  = ()=>steer(-1, 0);
  document.getElementById('ctrl-action').onclick= ()=>steer( 0,-1);
  document.getElementById('ctrl-drop').onclick  = ()=>steer( 0, 1);
  document.getElementById('ctrl-right').onclick = ()=>steer( 1, 0);

  // ── SWIPE STEERING ──
  // Flick the way you want to go — the same four directions as the arrows.
  let swStartX=0, swStartY=0, swDone=false;
  bindCanvasDrag({
    onDown(p){ hideTouchHint(); swStartX=p.x; swStartY=p.y; swDone=false; },
    onMove(p){
      if(swDone) return;
      const dx=p.x-swStartX, dy=p.y-swStartY;
      if(Math.max(Math.abs(dx),Math.abs(dy))<26) return;   // ignore jitter
      if(Math.abs(dx)>Math.abs(dy)) steer(dx>0?1:-1,0); else steer(0,dy>0?1:-1);
      // One turn per swipe, then re-arm from here so a long S-curve drag can
      // chain turns without lifting your finger.
      swStartX=p.x; swStartY=p.y;
    },
    onUp(){ swDone=true; }
  });

  gTimer=setInterval(()=>{
    if(isOver)return;
    time--;document.getElementById('g-time').textContent=Math.ceil(time);
    document.getElementById('prog-fill').style.width=`${time/adjustedTime*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0)end('timeout');
  },1000);

  function end(reason){
    if(isOver)return;isOver=true;
    if(reason!=='timeout') snd('gameOver');
    showResults('snake',Math.min(1200,score),{
      '🐍 Nodes Consumed':Math.floor(score/30),
      '📏 Max Length':snake.length,
      '🏆 Score Accumulation':`${score} PTS`
    });
  }

  function loop(now){
    if(isOver)return;
    gameLoopId=requestAnimationFrame(loop);

    // Move snake at fixed interval
    if(now-lastMoveTime>=speed){
      lastMoveTime=now;
      dir={...nextDir};
      const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};

      // Wall collision
      if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS){snd('bigExplode');end('wall');return;}
      // Self collision
      if(snake.some(s=>s.x===head.x&&s.y===head.y)){snd('bigExplode');end('self');return;}

      snake.unshift(head);

      if(head.x===food.x&&head.y===food.y){
        score+=30;setLive(score);
        // Pitch tracks length, so the chain you've built is something you hear.
        snd('eat',{semi:Math.min(19,snake.length-3)});
        // Particle burst on food eat
        for(let i=0;i<8;i++){
          const ang=Math.random()*Math.PI*2,v=Math.random()*3+1;
          particles.push({x:food.x*CELL+CELL/2,y:food.y*CELL+CELL/2,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,alpha:1,color:'#39ff14'});
        }
        food=spawnFood();
        speed=Math.max(70,speed-3); // speed up as snake grows
      } else {
        snake.pop();
      }
    }

    // ── DRAW ──
    aCtx.clearRect(0,0,W,H);

    // Grid
    aCtx.strokeStyle='rgba(57,255,20,0.05)';aCtx.lineWidth=1;
    for(let i=0;i<=COLS;i++){aCtx.beginPath();aCtx.moveTo(i*CELL,0);aCtx.lineTo(i*CELL,H);aCtx.stroke();}
    for(let i=0;i<=ROWS;i++){aCtx.beginPath();aCtx.moveTo(0,i*CELL);aCtx.lineTo(W,i*CELL);aCtx.stroke();}

    // Snake body
    const snakeHeadColor = getEquippedColorHex();
    snake.forEach((seg,i)=>{
      const t=1-i/snake.length;
      aCtx.save();
      if(i===0){aCtx.shadowBlur=16;aCtx.shadowColor=snakeHeadColor;}
      aCtx.fillStyle=i===0?snakeHeadColor:`rgba(57,255,20,${0.2+t*0.7})`;
      aCtx.fillRect(seg.x*CELL+1,seg.y*CELL+1,CELL-2,CELL-2);
      if(i===0){
        // eyes
        aCtx.fillStyle='#000';
        const ex=dir.x===1?CELL-5:dir.x===-1?3:CELL/2-4;
        const ey=dir.y===1?CELL-5:dir.y===-1?3:CELL/2-4;
        aCtx.fillRect(seg.x*CELL+ex,seg.y*CELL+ey,3,3);
        aCtx.fillRect(seg.x*CELL+ex+(dir.y!==0?6:0),seg.y*CELL+ey+(dir.x!==0?6:0),3,3);
      }
      aCtx.restore();
      if(i===0) drawSkinBadge(seg.x*CELL+CELL/2, seg.y*CELL-8, 12);
    });

    // Food — pulsing dot
    const pulse=0.7+0.3*Math.sin(now*0.006);
    aCtx.save();aCtx.shadowBlur=18*pulse;aCtx.shadowColor='#ff0090';
    aCtx.fillStyle='#ff0090';
    aCtx.beginPath();aCtx.arc(food.x*CELL+CELL/2,food.y*CELL+CELL/2,CELL/2-2,0,Math.PI*2);aCtx.fill();
    // inner highlight
    aCtx.fillStyle='rgba(255,255,255,0.4)';
    aCtx.beginPath();aCtx.arc(food.x*CELL+CELL/2-2,food.y*CELL+CELL/2-2,3,0,Math.PI*2);aCtx.fill();
    aCtx.restore();

    // Particles
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx;p.y+=p.vy;p.alpha-=0.04;
      if(p.alpha<=0){particles.splice(i,1);continue;}
      aCtx.save();aCtx.globalAlpha=p.alpha;aCtx.fillStyle=p.color;
      aCtx.fillRect(p.x,p.y,4,4);aCtx.restore();
    }
  }
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🚁 GAME 10: FLAPPY DRONE
// ════════════════════════════════════════════
function startFlappy(){
  document.getElementById('g-canvas-holder').style.display='block';
  setControls({ action: isTouchDevice ? 'TAP / FLAP' : 'CLICK / FLAP' });
  setControlHint('TAP ANYWHERE TO FLAP', 'SPACE OR CLICK TO FLAP');
  showTouchHint('TAP ANYWHERE TO FLAP');
  fitCanvas();

  const diffMod = getDifficultyModifier();

  const W=BOARD_W,H=BOARD_H,GAP=140,PIPE_W=46,PIPE_SPEED=2.4*diffMod*(BOARD_W/400);

  // ── VERTICAL FEEL ──
  // A tier's bite belongs in the horizontal pressure — PIPE_SPEED and the spawn
  // rate — not in how fast you have to tap. The old curve scaled gravity UP by
  // diffMod and the flap impulse DOWN by the same factor, a double penalty: one
  // tap bought ~63px of climb on Stable but only ~7px on Meltdown, against a
  // 140px gap — holding altitude there needed roughly five times the tapping
  // rate Stable does. Now gravity ramps at half the tier rate and the flap ramps
  // a little faster than the square root of gravity — sqrt being the exponent
  // that holds climb-per-tap flat — so the drone lifts at least as far per tap
  // on every tier as it does on Stable, and the fall never outruns it. Harder
  // tiers ask for tighter timing, never for faster fingers. Stable is untouched.
  const gravMod=1+(diffMod-1)*0.5;        // 1.00 / 1.25 / 1.50
  const GRAVITY=0.42*gravMod;
  const FLAP=-7.5*Math.pow(gravMod,0.65); // climb per tap: 63px / 67px / 71px
  let score=0,time=0,isOver=false,frame=0;
  let droneY=H/2,droneVY=0;
  let pipes=[],particles=[];
  const DRONE_X=80,DRONE_H=28,DRONE_W=38;

  document.getElementById('g-time').textContent='∞';
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--gold),var(--orange))';

  function flap(){if(!isOver){droneVY=FLAP;snd('flap');}}

  document.getElementById('ctrl-action').onclick=flap;
  window.onkeydown=e=>{if(e.code==='Space'){flap();e.preventDefault();}};

  // Tap anywhere on the board. One pointerdown path instead of click +
  // touchstart, so a single tap can't register as two flaps — and it lifts on
  // contact rather than waiting out the click synthesis.
  bindCanvasDrag({ onDown(){ hideTouchHint(); flap(); } });

  function spawnPipe(){
    const topH=Math.random()*(H-GAP-80)+40;
    pipes.push({x:W,topH,scored:false});
  }

  // Initial pipe
  spawnPipe();

  function end(){
    if(isOver)return;isOver=true;
    const earned=Math.min(1000,score*50);
    showResults('flappy',earned,{
      '🚧 Firewalls Cleared':score,
      '🏆 Score Accumulation':`${earned} PTS`
    });
  }

  function drawDrone(y,isDead){
    aCtx.save();
    const cx=DRONE_X,cy=y;
    const wobble=isDead?0:Math.sin(frame*0.18)*1.2;

    // Propeller arcs
    const propSpin=frame*0.3;
    [cx-16,cx+16].forEach(px=>{
      aCtx.save();aCtx.translate(px,cy-DRONE_H/2-4);
      aCtx.rotate(propSpin);
      aCtx.strokeStyle=isDead?'#555':'rgba(255,215,0,0.85)';
      aCtx.lineWidth=2;aCtx.shadowBlur=isDead?0:10;aCtx.shadowColor='#ffd700';
      for(let b=0;b<2;b++){
        aCtx.beginPath();aCtx.arc(0,0,12,b*Math.PI,(b+0.45)*Math.PI);aCtx.stroke();
      }
      aCtx.restore();
    });

    // Body
    const droneColor = getEquippedColorHex();
    aCtx.shadowBlur=isDead?0:14;aCtx.shadowColor=droneColor;
    aCtx.fillStyle=isDead?'#444':droneColor;
    aCtx.beginPath();
    aCtx.roundRect(cx-DRONE_W/2,cy-DRONE_H/2+wobble,DRONE_W,DRONE_H,6);
    aCtx.fill();

    // Arms
    aCtx.strokeStyle=isDead?'#555':'rgba(255,215,0,0.6)';aCtx.lineWidth=3;
    aCtx.beginPath();aCtx.moveTo(cx-DRONE_W/2,cy+wobble);aCtx.lineTo(cx-DRONE_W/2-10,cy-DRONE_H/2-4+wobble);aCtx.stroke();
    aCtx.beginPath();aCtx.moveTo(cx+DRONE_W/2,cy+wobble);aCtx.lineTo(cx+DRONE_W/2+10,cy-DRONE_H/2-4+wobble);aCtx.stroke();

    // Lens
    aCtx.fillStyle=isDead?'#333':'#04040e';
    aCtx.beginPath();aCtx.arc(cx+10,cy+2+wobble,5,0,Math.PI*2);aCtx.fill();
    aCtx.fillStyle=isDead?'#666':'rgba(0,245,255,0.9)';
    aCtx.beginPath();aCtx.arc(cx+11,cy+1+wobble,2.5,0,Math.PI*2);aCtx.fill();

    aCtx.restore();
    if(!isDead) drawSkinBadge(cx, cy-DRONE_H/2-16, 12);
  }

  function loop(){
    if(isOver)return;
    frame++;
    gameLoopId=requestAnimationFrame(loop);

    // Physics
    droneVY+=GRAVITY;
    droneY+=droneVY;

    // Spawn pipes every ~90 frames -> adjusted by difficulty
    if(frame%(90/diffMod)===0)spawnPipe();

    // Move & score pipes
    for(let i=pipes.length-1;i>=0;i--){
      const p=pipes[i];
      p.x-=PIPE_SPEED;
      if(!p.scored&&p.x+PIPE_W<DRONE_X-DRONE_W/2){
        score++;setLive(score);p.scored=true;
        snd('score',{semi:Math.min(12,score-1)});
        // particle burst on clear
        for(let k=0;k<6;k++){
          const ang=Math.random()*Math.PI*2,v=Math.random()*3+1;
          particles.push({x:DRONE_X,y:droneY,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,alpha:1,color:'#ffd700'});
        }
      }
      if(p.x+PIPE_W<0)pipes.splice(i,1);

      // Collision: top pipe
      if(DRONE_X+DRONE_W/2>p.x&&DRONE_X-DRONE_W/2<p.x+PIPE_W){
        if(droneY-DRONE_H/2<p.topH||droneY+DRONE_H/2>p.topH+GAP){
          drawDrone(droneY,true);snd('bigExplode');end();return;
        }
      }
    }

    // Floor / ceiling
    if(droneY+DRONE_H/2>H||droneY-DRONE_H/2<0){drawDrone(droneY,true);snd('bigExplode');end();return;}

    // ── DRAW ──
    aCtx.clearRect(0,0,W,H);

    // Scrolling bg grid
    const gridOff=(frame*PIPE_SPEED)%40;
    aCtx.strokeStyle='rgba(255,215,0,0.04)';aCtx.lineWidth=1;
    for(let x=-gridOff;x<W;x+=40){aCtx.beginPath();aCtx.moveTo(x,0);aCtx.lineTo(x,H);aCtx.stroke();}
    for(let y=0;y<H;y+=40){aCtx.beginPath();aCtx.moveTo(0,y);aCtx.lineTo(W,y);aCtx.stroke();}

    // Pipes (firewall columns)
    pipes.forEach(p=>{
      // Top pipe
      const grad=aCtx.createLinearGradient(p.x,0,p.x+PIPE_W,0);
      grad.addColorStop(0,'#b45309');grad.addColorStop(0.4,'#ffd700');grad.addColorStop(1,'#b45309');
      aCtx.save();aCtx.shadowBlur=14;aCtx.shadowColor='rgba(255,215,0,0.5)';
      aCtx.fillStyle=grad;
      aCtx.fillRect(p.x,0,PIPE_W,p.topH);
      // Cap
      aCtx.fillStyle='#ffd700';aCtx.fillRect(p.x-4,p.topH-16,PIPE_W+8,16);
      // Bottom pipe
      aCtx.fillStyle=grad;
      aCtx.fillRect(p.x,p.topH+GAP,PIPE_W,H-(p.topH+GAP));
      // Cap
      aCtx.fillStyle='#ffd700';aCtx.fillRect(p.x-4,p.topH+GAP,PIPE_W+8,16);
      aCtx.restore();

      // Circuit lines on pipes
      aCtx.strokeStyle='rgba(255,165,0,0.3)';aCtx.lineWidth=1;aCtx.setLineDash([4,6]);
      aCtx.beginPath();aCtx.moveTo(p.x+PIPE_W/2,0);aCtx.lineTo(p.x+PIPE_W/2,p.topH-16);aCtx.stroke();
      aCtx.beginPath();aCtx.moveTo(p.x+PIPE_W/2,p.topH+GAP+16);aCtx.lineTo(p.x+PIPE_W/2,H);aCtx.stroke();
      aCtx.setLineDash([]);
    });

    // Score display
    aCtx.save();aCtx.shadowBlur=12;aCtx.shadowColor='#ffd700';
    aCtx.fillStyle='rgba(255,255,255,0.85)';aCtx.font='bold 2.2rem Orbitron,monospace';
    aCtx.textAlign='center';aCtx.fillText(score,W/2,55);aCtx.restore();

    // Particles
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx;p.y+=p.vy;p.alpha-=0.04;
      if(p.alpha<=0){particles.splice(i,1);continue;}
      aCtx.save();aCtx.globalAlpha=p.alpha;aCtx.fillStyle=p.color;
      aCtx.beginPath();aCtx.arc(p.x,p.y,4,0,Math.PI*2);aCtx.fill();aCtx.restore();
    }

    drawDrone(droneY,false);
  }
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🧊 GAME 11: ICE BREAKER
// ════════════════════════════════════════════
function startBreaker(){
  document.getElementById('g-canvas-holder').style.display='block';
  // Drag is the fast way to slide the deflector; the arrows stay so the game
  // still plays if a browser refuses the gesture — same deal as Pong.
  setControls({ left:'◀', action:'🚀 LAUNCH', right:'▶' });
  setControlHint('DRAG TO SLIDE · TAP TO LAUNCH', '← → OR MOUSE TO SLIDE · SPACE TO LAUNCH');
  showTouchHint('DRAG TO SLIDE · TAP TO LAUNCH');
  fitCanvas();

  const diffMod = getDifficultyModifier();
  const W=BOARD_W, H=BOARD_H;
  const ROWS=5, B_W=44, B_H=18, B_GAP=6, B_TOP=64;
  const COLS=Math.floor((W+B_GAP)/(B_W+B_GAP));   // 8 at 400 wide, 11 at 560
  const B_LEFT=(W-(COLS*B_W+(COLS-1)*B_GAP))/2;
  const PAD_H=11, PAD_Y=H-34, BALL_R=6;

  // A straight ×2 on ball speed at Meltdown crosses the board in under a
  // second — past reacting, into guessing. Damped, so the tier still bites
  // without turning the run into a coin flip. The deflector shrinks instead,
  // which punishes sloppy positioning rather than human reflex limits.
  const BASE_SPEED = 5.0 * (1 + (diffMod-1)*0.45);
  const BASE_PAD_W = Math.round(84 - (diffMod-1)*22);

  const baseTime = 90;
  const adjustedTime = Math.round(baseTime * getTimeModifier());

  // Top rows are worth more, so the greedy line — digging a tunnel up the side
  // and letting the ball loose behind the wall — is also the high-scoring one.
  const ROW_COLORS = ['#ff0090','#a855f7','#00f5ff','#39ff14','#ffd700'];
  const ROW_PTS    = [22,19,16,13,10];

  const CHIPS = [
    { key:'wide',  glyph:'⬌', color:'#39ff14', label:'WIDE DEFLECTOR' },
    { key:'slow',  glyph:'⏱', color:'#00f5ff', label:'TIME DILATION' },
    { key:'bonus', glyph:'★', color:'#ffd700', label:'+50 DATA' }
  ];

  let score=0, time=adjustedTime, isOver=false;
  let shields=3, combo=0, bestCombo=0, broken=0, shake=0;
  let padX=W/2-BASE_PAD_W/2, padW=BASE_PAD_W, speed=BASE_SPEED;
  let moveL=false, moveR=false, keys={};
  let stuck=true, ball={x:0,y:0,vx:0,vy:0};
  let trail=[], chips=[], particles=[], floats=[];
  let wideUntil=0, slowUntil=0, nowMs=performance.now();

  document.getElementById('g-time').textContent=time;
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--purple),var(--cyan))';

  const bricks=[];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    // Armoured ICE only appears once the core is unstable: the top row at
    // Overclock, the top two at Meltdown.
    const armour = (diffMod>=2 && r<2) || (diffMod>1 && r<1) ? 2 : 1;
    bricks.push({
      x:B_LEFT+c*(B_W+B_GAP), y:B_TOP+r*(B_H+B_GAP),
      hp:armour, maxHp:armour, color:ROW_COLORS[r], pts:ROW_PTS[r]
    });
  }

  const slide = x => { padX = Math.max(0, Math.min(W-padW, x)); };

  function burst(x,y,color,n){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, v=Math.random()*3+1;
      particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,alpha:1,color});
    }
  }

  function launch(){
    if(isOver||!stuck) return;
    stuck=false;
    const ang=(Math.random()*0.5-0.25)+(Math.random()<0.5?-0.35:0.35);
    ball.vx=Math.sin(ang)*speed; ball.vy=-Math.cos(ang)*speed;
  }

  // ── STEERING ──
  // Mouse steers absolutely — the cursor is the deflector. Touch steers
  // *relatively* from wherever you grab, so tapping to launch doesn't yank the
  // deflector out from under the rally, and your hand never has to sit on the
  // board to move it.
  let lastX=null;
  bindCanvasDrag({
    onHover(p){ if(!isTouchDevice) slide(p.x-padW/2); },
    onDown(p){ hideTouchHint(); lastX=p.x; if(!isTouchDevice) slide(p.x-padW/2); launch(); },
    onMove(p){
      if(isTouchDevice && lastX!==null) slide(padX+(p.x-lastX));
      else slide(p.x-padW/2);
      lastX=p.x;
    },
    onUp(){ lastX=null; }
  });

  // Each press shifts the deflector immediately as well as starting the glide —
  // hold-to-move alone makes a quick tap travel a couple of pixels and read as
  // a dead button, the same trap Pong's pad fell into.
  const NUDGE=26;
  bindHold(document.getElementById('ctrl-left'),
           ()=>{ slide(padX-NUDGE); moveL=true; },  ()=>moveL=false);
  bindHold(document.getElementById('ctrl-right'),
           ()=>{ slide(padX+NUDGE); moveR=true; },  ()=>moveR=false);
  document.getElementById('ctrl-action').onclick = launch;

  window.onkeydown=e=>{
    if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) e.preventDefault();
    keys[e.code]=true;
    if(e.code==='Space') launch();
  };
  window.onkeyup=e=>{ keys[e.code]=false; };

  gTimer=setInterval(()=>{
    if(isOver)return;
    time--; document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/adjustedTime*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0) end('timeout');
  },1000);

  function applyChip(ch){
    snd('powerup');
    if(ch.type.key==='wide') wideUntil=nowMs+8000;
    else if(ch.type.key==='slow') slowUntil=nowMs+6000;
    else { score+=50; setLive(score); }
    floats.push({x:padX+padW/2, y:PAD_Y-22, text:ch.type.label, color:ch.type.color, life:1});
    burst(ch.x, ch.y, ch.type.color, 8);
  }

  function hitBrick(b){
    b.hp--;
    if(b.hp>0){ burst(b.x+B_W/2, b.y+B_H/2, b.color, 4); snd('hit'); return; }
    broken++;
    combo++; if(combo>bestCombo) bestCombo=combo;
    // Chain climb: the shatter note rises with the combo the same way the score
    // does, so a tunnel run behind the wall sounds like the run it is.
    snd('brick',{semi:Math.min(14,combo-1)});
    // Every brick cleared before the ball comes home is worth more than the
    // last, so a well-aimed tunnel pays for itself — capped, because a ball
    // loose behind the wall can chain thirty bricks on its own and would
    // otherwise max the run without the player touching the deflector.
    const gain=b.pts+Math.min(combo-1,6)*2;
    score+=gain; setLive(score);
    burst(b.x+B_W/2, b.y+B_H/2, b.color, 10);
    floats.push({x:b.x+B_W/2, y:b.y+B_H/2, text:'+'+gain, color:b.color, life:1});
    if(Math.random()<0.12) chips.push({x:b.x+B_W/2, y:b.y+B_H/2, type:CHIPS[Math.floor(Math.random()*CHIPS.length)]});
    if(bricks.every(k=>k.hp<=0)){ score+=150; setLive(score); end('cleared'); }
  }

  function loseShield(){
    shields--; combo=0; shake=14;
    burst(ball.x, H-8, '#ff2442', 14);
    snd(shields<=0 ? 'gameOver' : 'hurt');
    if(shields<=0){ end('breached'); return; }
    stuck=true; trail=[];
  }

  // Sub-stepped so a fast ball can't tunnel straight through a brick row
  // between frames — at Meltdown it travels most of a brick's height per tick.
  function step(f){
    ball.x+=ball.vx*f; ball.y+=ball.vy*f;

    if(ball.x-BALL_R<0){ ball.x=BALL_R; ball.vx=Math.abs(ball.vx); snd('bounceWall'); }
    if(ball.x+BALL_R>W){ ball.x=W-BALL_R; ball.vx=-Math.abs(ball.vx); snd('bounceWall'); }
    if(ball.y-BALL_R<0){ ball.y=BALL_R; ball.vy=Math.abs(ball.vy); snd('bounceWall'); }

    // Deflector — the bounce angle comes off where you hit, not off the
    // incoming vector, so aiming is a real skill and the speed stays constant.
    if(ball.vy>0 && ball.y+BALL_R>=PAD_Y && ball.y-BALL_R<=PAD_Y+PAD_H &&
       ball.x>=padX-BALL_R && ball.x<=padX+padW+BALL_R){
      const rel=Math.max(-1,Math.min(1,(ball.x-(padX+padW/2))/(padW/2)));
      const ang=rel*1.05;                        // ±60° off vertical at the edges
      ball.vx=Math.sin(ang)*speed; ball.vy=-Math.cos(ang)*speed;
      ball.y=PAD_Y-BALL_R-0.5;
      combo=0;
      snd('bounce');
      burst(ball.x, PAD_Y, getEquippedColorHex(), 3);
    }

    for(const b of bricks){
      if(b.hp<=0) continue;
      if(ball.x+BALL_R<b.x || ball.x-BALL_R>b.x+B_W || ball.y+BALL_R<b.y || ball.y-BALL_R>b.y+B_H) continue;
      // Leave along the shallower overlap, i.e. back the way it came in —
      // flipping the wrong axis makes corner hits look like the ball
      // teleported through the wall.
      const oX=Math.min(ball.x+BALL_R-b.x, b.x+B_W-(ball.x-BALL_R));
      const oY=Math.min(ball.y+BALL_R-b.y, b.y+B_H-(ball.y-BALL_R));
      // Flipping the component isn't enough on its own — the ball is still
      // sitting inside the brick it just hit, so the next step finds another
      // overlap and flips again. Left alone it random-walks through the wall
      // eating it from the inside, and the run plays itself. Push it back out
      // along the axis it bounced on.
      if(oX<oY){ ball.vx=-ball.vx; ball.x += ball.x<b.x+B_W/2 ? -oX : oX; }
      else     { ball.vy=-ball.vy; ball.y += ball.y<b.y+B_H/2 ? -oY : oY; }
      hitBrick(b);
      break;                                     // one brick per step reads cleanly
    }

    if(ball.y-BALL_R>H) loseShield();
  }

  function end(reason){
    if(isOver)return; isOver=true;
    // Shields are worth points on the way out, so playing the last one
    // carefully beats throwing it away for one more brick.
    const survive=shields*40;
    const final=Math.min(1100,score+survive);
    showResults('breaker',final,{
      '📡 Run Terminated': reason==='cleared'?'ICE WALL CLEARED':reason==='timeout'?'CLOCK EXPIRED':'SHIELDS BREACHED',
      '🧊 ICE Shattered': `${broken}/${bricks.length}`,
      '🔥 Longest Chain': `${bestCombo}×`,
      '🛡️ Shields Intact': `${shields} (+${survive})`,
      '🏆 Score Accumulation': `${final} PTS`
    });
  }

  function draw(now){
    aCtx.clearRect(0,0,W,H);
    aCtx.save();
    if(shake>0){
      aCtx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
      shake*=0.86; if(shake<0.4) shake=0;
    }

    aCtx.strokeStyle='rgba(168,85,247,0.06)'; aCtx.lineWidth=1;
    for(let x=0;x<=W;x+=40){aCtx.beginPath();aCtx.moveTo(x,0);aCtx.lineTo(x,H);aCtx.stroke();}
    for(let y=0;y<=H;y+=40){aCtx.beginPath();aCtx.moveTo(0,y);aCtx.lineTo(W,y);aCtx.stroke();}

    bricks.forEach(b=>{
      if(b.hp<=0) return;
      const cracked=b.hp<b.maxHp;
      aCtx.save();
      aCtx.shadowBlur=cracked?6:12; aCtx.shadowColor=b.color;
      aCtx.globalAlpha=cracked?0.5:1;
      aCtx.fillStyle=b.color;
      aCtx.beginPath(); aCtx.roundRect(b.x,b.y,B_W,B_H,4); aCtx.fill();
      aCtx.shadowBlur=0;
      aCtx.fillStyle='rgba(255,255,255,0.28)';
      aCtx.fillRect(b.x+3,b.y+3,B_W-6,2);        // bevel — slabs, not flat rectangles
      if(cracked){
        aCtx.globalAlpha=1; aCtx.strokeStyle='rgba(0,0,0,0.55)'; aCtx.lineWidth=1.5;
        aCtx.beginPath();
        aCtx.moveTo(b.x+8,b.y+2);            aCtx.lineTo(b.x+B_W*0.42,b.y+B_H-3);
        aCtx.moveTo(b.x+B_W*0.42,b.y+B_H*0.5); aCtx.lineTo(b.x+B_W-7,b.y+3);
        aCtx.stroke();
      }
      aCtx.restore();
    });

    chips.forEach(ch=>{
      aCtx.save();
      aCtx.shadowBlur=14; aCtx.shadowColor=ch.type.color;
      aCtx.fillStyle=hexToRgba(ch.type.color,0.18);
      aCtx.strokeStyle=ch.type.color; aCtx.lineWidth=1.5;
      aCtx.beginPath(); aCtx.roundRect(ch.x-11,ch.y-9,22,18,5); aCtx.fill(); aCtx.stroke();
      aCtx.shadowBlur=0; aCtx.fillStyle=ch.type.color;
      aCtx.font='bold 11px Orbitron,monospace'; aCtx.textAlign='center'; aCtx.textBaseline='middle';
      aCtx.fillText(ch.type.glyph, ch.x, ch.y+1);
      aCtx.restore();
    });

    trail.forEach((t,i)=>{
      const a=(i+1)/trail.length*0.35;
      aCtx.save(); aCtx.globalAlpha=a; aCtx.fillStyle='#fff';
      aCtx.beginPath(); aCtx.arc(t.x,t.y,BALL_R*(0.35+a),0,Math.PI*2); aCtx.fill(); aCtx.restore();
    });

    const dilated=nowMs<slowUntil;
    aCtx.save();
    aCtx.shadowBlur=dilated?26:18; aCtx.shadowColor=dilated?'#00f5ff':'#fff';
    aCtx.fillStyle='#fff';
    aCtx.beginPath(); aCtx.arc(ball.x,ball.y,BALL_R,0,Math.PI*2); aCtx.fill();
    aCtx.restore();

    const padColor=getEquippedColorHex();
    aCtx.save(); aCtx.shadowBlur=20; aCtx.shadowColor=padColor; aCtx.fillStyle=padColor;
    aCtx.beginPath(); aCtx.roundRect(padX,PAD_Y,padW,PAD_H,5); aCtx.fill();
    aCtx.shadowBlur=0; aCtx.fillStyle='rgba(255,255,255,0.55)';
    aCtx.fillRect(padX+padW/2-8,PAD_Y+3,16,2);   // centre mark — hit here to send it straight up
    aCtx.restore();
    drawSkinBadge(padX+padW/2, PAD_Y-16, 12);

    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.alpha-=0.045;
      if(p.alpha<=0){ particles.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=p.alpha; aCtx.fillStyle=p.color;
      aCtx.fillRect(p.x,p.y,3,3); aCtx.restore();
    }

    for(let i=floats.length-1;i>=0;i--){
      const f=floats[i];
      f.y-=0.6; f.life-=0.02;
      if(f.life<=0){ floats.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=Math.max(0,f.life);
      aCtx.fillStyle=f.color; aCtx.font='bold 0.6rem Orbitron,monospace'; aCtx.textAlign='center';
      aCtx.fillText(f.text,f.x,f.y); aCtx.restore();
    }

    // ── HUD ──
    for(let i=0;i<3;i++){
      const on=i<shields;
      aCtx.save();
      aCtx.globalAlpha=on?1:0.16; aCtx.fillStyle=on?'#00f5ff':'#fff';
      if(on){ aCtx.shadowBlur=10; aCtx.shadowColor='#00f5ff'; }
      aCtx.beginPath(); aCtx.roundRect(12+i*16,14,11,7,2); aCtx.fill();
      aCtx.restore();
    }
    if(combo>1){
      aCtx.save(); aCtx.shadowBlur=12; aCtx.shadowColor='#ffd700';
      aCtx.fillStyle='rgba(255,215,0,0.9)'; aCtx.font='bold 0.75rem Orbitron,monospace'; aCtx.textAlign='right';
      aCtx.fillText(`CHAIN ×${combo}`,W-12,22); aCtx.restore();
    }
    if(stuck){
      aCtx.save(); aCtx.globalAlpha=0.55+0.45*Math.sin(now*0.006);
      aCtx.fillStyle='#fff'; aCtx.font='bold 0.7rem Orbitron,monospace'; aCtx.textAlign='center';
      aCtx.fillText(isTouchDevice?'TAP TO LAUNCH':'SPACE TO LAUNCH',W/2,PAD_Y-42);
      aCtx.restore();
    }

    aCtx.restore();
  }

  function loop(now){
    if(isOver)return;
    gameLoopId=requestAnimationFrame(loop);
    nowMs=now;

    padW=Math.round(BASE_PAD_W*(now<wideUntil?1.45:1));
    // The wall creeps faster the emptier it gets, so a long run doesn't coast.
    speed=BASE_SPEED*(now<slowUntil?0.72:1)*(1+Math.min(0.25,broken*0.006));
    slide(padX);   // re-clamp: a WIDE chip can push the deflector past the edge

    const PAD_SPEED=7;
    if(keys['ArrowLeft'] ||keys['KeyA']||moveL) slide(padX-PAD_SPEED);
    if(keys['ArrowRight']||keys['KeyD']||moveR) slide(padX+PAD_SPEED);

    if(stuck){
      ball.x=padX+padW/2; ball.y=PAD_Y-BALL_R-2; ball.vx=0; ball.vy=0;
      trail=[];
    }else{
      const steps=Math.max(1,Math.ceil(speed/3));
      for(let s=0;s<steps;s++){ step(1/steps); if(isOver) return; if(stuck) break; }

      if(!stuck){
        // Brick bounces only flip components, so rounding would slowly drift the
        // rally off its intended speed — renormalise every frame instead.
        const sp=Math.hypot(ball.vx,ball.vy)||1;
        ball.vx=ball.vx/sp*speed; ball.vy=ball.vy/sp*speed;
        // And never let it settle into a near-horizontal groove it can't escape.
        if(Math.abs(ball.vy)<speed*0.30){
          ball.vy=(ball.vy<0?-1:1)*speed*0.30;
          ball.vx=(ball.vx<0?-1:1)*Math.sqrt(Math.max(0,speed*speed-ball.vy*ball.vy));
        }
        trail.push({x:ball.x,y:ball.y}); if(trail.length>10) trail.shift();
      }
    }

    for(let i=chips.length-1;i>=0;i--){
      const ch=chips[i];
      ch.y+=2.1;
      if(ch.y>H+12){ chips.splice(i,1); continue; }
      if(ch.y>PAD_Y-10 && ch.y<PAD_Y+PAD_H+10 && ch.x>padX-10 && ch.x<padX+padW+10){
        applyChip(ch); chips.splice(i,1);
      }
    }

    draw(now);
  }
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  ⚔️ GAME 12: CYBER ARENA (AVATAR SIMULATOR)
// ════════════════════════════════════════════
function startArena() {
  document.getElementById('g-canvas-holder').style.display = 'block';
  // The board is the controller on touch — drag to move, tap to slash — but
  // the original pad stays underneath it so the game is never unplayable, with
  // the spare slot carrying the ability that used to be keyboard-only.
  setControls(isTouchDevice ? { left:'◀', action:'⚔ SLASH', drop:'✦ ABIL', right:'▶' }
                            : { left:'◀', action:'⚔ SLASH', right:'▶' });
  // Hint text has to land before fitCanvas() measures — it's a header row, and
  // adding it afterwards pushes the board it just sized off the bottom.
  setControlHint('DRAG = MOVE · TAP = SLASH · DOUBLE-TAP = ABILITY · ⚡ = DASH',
                 'WASD/ARROWS=MOVE · SPACE=SLASH · SHIFT=DASH · E=ABILITY · AIM WITH MOUSE');
  showTouchHint('DRAG TO MOVE · TAP TO SLASH · DOUBLE-TAP = ABILITY', 4200);
  fitCanvas();

  // ── CONSTANTS ──
  const W = BOARD_W, H = BOARD_H;
  const ARENA_W = 800, ARENA_H = 900; // scrollable world larger than canvas
  const TILE = 40;

  // ── STATE ──
  let score = 0, isOver = false, frame = 0;
  let camX = 0, camY = 0;
  let particles = [], floatingTexts = [], enemyBots = [], dataNodes = [], walls = [];
  let xpOrbs = [];
  let playerLevel = 1, playerXP = 0, playerXPNext = 100;
  let dashCooldown = 0, dashTimer = 0, isDashing = false;
  let slashActive = false, slashTimer = 0, slashAngle = 0;
  let screenShake = 0;
  let keys = {}, moveLeft = false, moveRight = false, moveUp = false, moveDown = false;
  // ── VIRTUAL STICK ──
  // Touching the board plants an invisible thumbstick wherever the finger
  // lands; steering is the offset from that anchor. Only becomes a stick once
  // the finger clears the dead zone, so a clean tap still reads as a slash.
  const STICK_R = 46, STICK_DEAD = 14;
  let stickActive = false, stickX = 0, stickY = 0, stickOX = 0, stickOY = 0;
  let botSpawnTimer = 0, botWave = 1;
  let invincibleTimer = 0;
  let comboCount = 0, comboTimer = 0;
  // Temporary buffs picked up from data nodes
  let buffHasteTimer = 0, buffShieldTimer = 0, buffOverchargeTimer = 0;
  // Special abilities earned from CORE data nodes — queued, deployed with E / double-tap
  let specialAbilities = [];
  let lastTapTime = 0;
  const ABILITY_TYPES = [
    { id:'NOVA',       label:'NOVA BLAST',  color:'#ffd700', desc:'Damages & knocks back all nearby bots' },
    { id:'FREEZE',     label:'TIME FREEZE', color:'#00f5ff', desc:'Stuns every bot on the field' },
    { id:'HEAL',       label:'REPAIR PULSE',color:'#39ff14', desc:'Instantly restores HP' },
    { id:'OVERCHARGE', label:'OVERCHARGE',  color:'#ff2442', desc:'Boosts attack & speed for a few seconds' },
    { id:'SHIELD',     label:'AEGIS SHIELD',color:'#a855f7', desc:'Grants temporary invincibility' },
  ];
  function deployAbility() {
    if (specialAbilities.length === 0) return;
    const abil = specialAbilities.shift();
    screenShake = 10;
    snd(abil.id === 'NOVA' ? 'bigExplode' : abil.id === 'HEAL' ? 'heal' : 'ability');
    popText(player.x, player.y - 34, abil.label + '!', abil.color);
    if (abil.id === 'NOVA') {
      enemyBots.forEach(bot => {
        if (bot.dead) return;
        const dx = bot.x - player.x, dy = bot.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 220) {
          const dmg = Math.round((player.attackPower + (playerLevel - 1) * 5) * 1.3);
          bot.hp -= dmg;
          bot.vx += (dx / (dist || 1)) * 8; bot.vy += (dy / (dist || 1)) * 8;
          bot.stunTimer = 20;
          explode(bot.x, bot.y, abil.color, 10);
          popText(bot.x, bot.y - 14, `-${dmg}`, abil.color);
          if (bot.hp <= 0 && !bot.dead) {
            bot.dead = true;
            const earned = Math.round(bot.pts * (1 + (playerLevel - 1) * 0.1));
            score += earned; setLive(score);
            explode(bot.x, bot.y, bot.color, 18);
          }
        }
      });
      explode(player.x, player.y, abil.color, 30);
    } else if (abil.id === 'FREEZE') {
      enemyBots.forEach(bot => { if (!bot.dead) bot.stunTimer = 150; });
      explode(player.x, player.y, abil.color, 20);
    } else if (abil.id === 'HEAL') {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
      document.getElementById('prog-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
      explode(player.x, player.y, abil.color, 20);
    } else if (abil.id === 'OVERCHARGE') {
      buffOverchargeTimer = 360; buffHasteTimer = 360;
      explode(player.x, player.y, abil.color, 20);
    } else if (abil.id === 'SHIELD') {
      buffShieldTimer = 240;
      explode(player.x, player.y, abil.color, 20);
    }
  }

  // ── PLAYER ──
  const player = {
    x: ARENA_W / 2, y: ARENA_H / 2,
    r: 14, hp: 100, maxHp: 100,
    speed: 3.2,
    vx: 0, vy: 0,
    angle: 0,    // facing direction
    color: '#00f5ff',
    slashRange: 60,
    slashDamage: 35,
    slashCooldown: 0,
    attackPower: 35,
    get canSlash() { return this.slashCooldown <= 0 && !isDashing; }
  };

  // ── PROGRESS BAR = PLAYER HP ──
  document.getElementById('g-time').textContent = '∞';
  document.getElementById('prog-fill').style.background = 'linear-gradient(90deg,var(--cyan),var(--purple))';
  document.getElementById('prog-fill').style.width = '100%';

  // ── WORLD GENERATION ──
  // Scatter walls (obstacles / cover)
  const wallDefs = [
    {x:120,y:80,w:80,h:20},{x:300,y:80,w:80,h:20},{x:560,y:80,w:80,h:20},
    {x:60,y:200,w:20,h:80},{x:220,y:180,w:60,h:20},{x:400,y:200,w:20,h:80},
    {x:600,y:160,w:20,h:100},{x:700,y:80,w:20,h:80},
    {x:100,y:340,w:100,h:20},{x:320,y:300,w:20,h:100},{x:500,y:340,w:100,h:20},
    {x:680,y:300,w:20,h:80},
    {x:60,y:460,w:80,h:20},{x:240,y:420,w:20,h:100},{x:380,y:460,w:100,h:20},
    {x:560,y:440,w:20,h:80},{x:700,y:440,w:60,h:20},
    {x:120,y:580,w:60,h:20},{x:300,y:560,w:80,h:20},{x:480,y:580,w:20,h:80},
    {x:640,y:580,w:80,h:20},
    {x:80,y:700,w:20,h:80},{x:200,y:680,w:80,h:20},{x:380,y:700,w:80,h:20},
    {x:560,y:700,w:20,h:60},{x:680,y:680,w:80,h:20},
    {x:120,y:820,w:80,h:20},{x:340,y:800,w:20,h:80},{x:500,y:820,w:80,h:20},
    {x:700,y:820,w:20,h:60},
  ];
  walls = wallDefs;

  // Initial data node scatter
  // Weighted node type pool — mostly plain DATA, with rarer utility/buff/ability nodes
  const NODE_POOL = [
    { type:'DATA',       weight:58 },
    { type:'MEGA',       weight:14 },
    { type:'HEAL',       weight:10 },
    { type:'HASTE',      weight:7  },
    { type:'OVERCHARGE', weight:6  },
    { type:'SHIELD',     weight:4  },
    { type:'CORE',       weight:3  },
  ];
  function pickNodeType() {
    const totalW = NODE_POOL.reduce((s, n) => s + n.weight, 0);
    let r = Math.random() * totalW;
    for (const n of NODE_POOL) { r -= n.weight; if (r <= 0) return n.type; }
    return 'DATA';
  }
  function spawnDataNodes(count) {
    for (let i = 0; i < count; i++) {
      let nx, ny, attempts = 0;
      do {
        nx = Math.random() * (ARENA_W - 60) + 30;
        ny = Math.random() * (ARENA_H - 60) + 30;
        attempts++;
      } while (attempts < 20 && isCollidingWall(nx, ny, 10));
      dataNodes.push({
        x: nx, y: ny, r: 9,
        type: pickNodeType(),
        pulse: Math.random() * Math.PI * 2,
        collected: false
      });
    }
  }
  spawnDataNodes(22);

  // ── COLLISION HELPERS ──
  function isCollidingWall(cx, cy, cr) {
    return walls.some(w =>
      cx + cr > w.x && cx - cr < w.x + w.w &&
      cy + cr > w.y && cy - cr < w.y + w.h
    );
  }
  function resolveWall(obj, cr) {
    walls.forEach(w => {
      if (obj.x + cr > w.x && obj.x - cr < w.x + w.w &&
          obj.y + cr > w.y && obj.y - cr < w.y + w.h) {
        // Push out: find smallest overlap axis
        const overlapL = (obj.x + cr) - w.x;
        const overlapR = (w.x + w.w) - (obj.x - cr);
        const overlapT = (obj.y + cr) - w.y;
        const overlapB = (w.y + w.h) - (obj.y - cr);
        const minO = Math.min(overlapL, overlapR, overlapT, overlapB);
        if (minO === overlapL) obj.x -= overlapL;
        else if (minO === overlapR) obj.x += overlapR;
        else if (minO === overlapT) obj.y -= overlapT;
        else obj.y += overlapB;
      }
    });
  }

  // ── ENEMY BOT CLASS ──
  const BOT_TYPES = [
    { id:'GRUNT',    color:'#ff0090', r:12, speed:1.5, hp:40,  maxHp:40,  dmg:12, pts:20,  xp:15,  label:'GRUNT'    },
    { id:'CHASER',   color:'#ff6600', r:11, speed:2.6, hp:25,  maxHp:25,  dmg:8,  pts:30,  xp:20,  label:'CHASER'   },
    { id:'TANK',     color:'#a855f7', r:18, speed:0.9, hp:120, maxHp:120, dmg:20, pts:60,  xp:50,  label:'TANK'     },
    { id:'SNIPER',   color:'#ffd700', r:10, speed:1.8, hp:30,  maxHp:30,  dmg:15, pts:40,  xp:35,  label:'SNIPER'   },
    { id:'ELITE',    color:'#ff2442', r:14, speed:2.0, hp:80,  maxHp:80,  dmg:25, pts:100, xp:80,  label:'ELITE'    },
    { id:'SWARMER',  color:'#39ff14', r:8,  speed:3.4, hp:15,  maxHp:15,  dmg:6,  pts:15,  xp:10,  label:'SWARMER'  },
    { id:'BOMBER',   color:'#ff6600', r:13, speed:1.7, hp:35,  maxHp:35,  dmg:35, pts:50,  xp:30,  label:'BOMBER'   },
    { id:'SHIELDER', color:'#00f5ff', r:15, speed:1.1, hp:70,  maxHp:70,  dmg:14, pts:70,  xp:45,  label:'SHIELDER' },
    { id:'HEALER',   color:'#ff90e8', r:11, speed:1.3, hp:35,  maxHp:35,  dmg:6,  pts:55,  xp:40,  label:'HEALER'   },
  ];

  class Bot {
    constructor(type, x, y) {
      Object.assign(this, type);
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.hp = type.hp; this.maxHp = type.maxHp;
      this.angle = 0;
      this.attackTimer = 0;
      this.attackCooldown = type.id === 'SNIPER' ? 180 : type.id === 'TANK' ? 90 : 60;
      this.projectile = null;
      this.stunTimer = 0;
      this.aggroRadius = type.id === 'SNIPER' ? 280 : 200;
      this.wobble = Math.random() * Math.PI * 2;
      this.dead = false;
      this.deathTimer = 0;
      // ── per-type extras ──
      this.jitterTimer = 0; // SWARMER erratic movement
      this.healCooldown = 90; // HEALER
      this.exploded = false; // BOMBER
      this.shieldAngle = Math.random() * Math.PI * 2; // SHIELDER — rotates slowly, must be flanked
    }

    update() {
      if (this.dead) { this.deathTimer++; return; }
      if (this.stunTimer > 0) { this.stunTimer--; return; }

      const dx = player.x - this.x, dy = player.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      this.angle = Math.atan2(dy, dx);
      this.wobble += 0.05;
      if (this.id === 'SHIELDER') this.shieldAngle += 0.018; // shield slowly rotates — flank it to land full damage

      const warpMult = 1.0; // future: can tie into time warp
      const inRange = true; // bots always actively chase/attack the player, regardless of distance

      if (inRange) {
        if (this.id === 'SNIPER' && dist > 120) {
          // Sniper keeps distance
          this.vx += (dx / dist) * this.speed * 0.3;
          this.vy += (dy / dist) * this.speed * 0.3;
        } else if (this.id === 'HEALER' && dist < 160) {
          // Healer keeps its distance from the player, preferring to hover near allies
          this.vx -= (dx / dist) * this.speed * 0.3;
          this.vy -= (dy / dist) * this.speed * 0.3;
        } else if (this.id === 'SWARMER') {
          // Swarmer darts erratically while closing in
          this.jitterTimer--;
          if (this.jitterTimer <= 0) {
            this.jitterTimer = 10 + Math.random() * 14;
            const jitterAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
            this.vx += Math.cos(jitterAngle) * this.speed * 0.4;
            this.vy += Math.sin(jitterAngle) * this.speed * 0.4;
          }
          this.vx += (dx / dist) * this.speed * 0.22;
          this.vy += (dy / dist) * this.speed * 0.22;
        } else {
          this.vx += (dx / dist) * this.speed * 0.25;
          this.vy += (dy / dist) * this.speed * 0.25;
        }

        // BOMBER: charge in and self-destruct in a damaging blast
        if (this.id === 'BOMBER' && !this.exploded) {
          if (dist < this.r + player.r + 26) {
            this.exploded = true;
            this.dead = true;
            this.deathTimer = 0;
            explode(this.x, this.y, this.color, 26);
            popText(this.x, this.y - 10, 'BOOM!', '#ff6600');
            const bdx = player.x - this.x, bdy = player.y - this.y;
            const bdist = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
            if (bdist < 70) hitPlayer(this.dmg, this.color);
          }
        }

        // HEALER: periodically pulse-heal the most wounded nearby ally
        if (this.id === 'HEALER') {
          this.healCooldown--;
          if (this.healCooldown <= 0) {
            this.healCooldown = 150;
            let target = null, lowestPct = 1;
            enemyBots.forEach(ally => {
              if (ally === this || ally.dead) return;
              const adx = ally.x - this.x, ady = ally.y - this.y;
              if (Math.sqrt(adx * adx + ady * ady) > 180) return;
              const pct = ally.hp / ally.maxHp;
              if (pct < 1 && pct < lowestPct) { lowestPct = pct; target = ally; }
            });
            if (target) {
              target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.3);
              popText(target.x, target.y - target.r - 14, '+HEAL', '#ff90e8');
              explode(target.x, target.y, '#ff90e8', 8);
            }
          }
        }

        // Attack logic
        this.attackTimer++;
        if (this.attackTimer >= this.attackCooldown) {
          this.attackTimer = 0;
          if (this.id === 'SNIPER' || this.id === 'ELITE') {
            // Fire projectile
            const speed = this.id === 'ELITE' ? 5.5 : 4.2;
            botProjectiles.push({
              x: this.x, y: this.y,
              vx: (dx / dist) * speed, vy: (dy / dist) * speed,
              r: 5, color: this.color, dmg: this.dmg,
              alpha: 1, trail: []
            });
          } else if (this.id !== 'BOMBER' && this.id !== 'HEALER' && dist < this.r + player.r + 20) {
            // Melee
            hitPlayer(this.dmg, this.color);
          }
        }
      }

      // Friction + friction-limit speed
      this.vx *= 0.78; this.vy *= 0.78;
      const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (spd > this.speed * warpMult) {
        this.vx = (this.vx / spd) * this.speed * warpMult;
        this.vy = (this.vy / spd) * this.speed * warpMult;
      }
      this.x += this.vx; this.y += this.vy;
      // Arena bounds
      this.x = Math.max(this.r, Math.min(ARENA_W - this.r, this.x));
      this.y = Math.max(this.r, Math.min(ARENA_H - this.r, this.y));
      resolveWall(this, this.r);

      // Direct melee collision with player
      if (dist < this.r + player.r + 4 && this.id !== 'SNIPER' && this.id !== 'ELITE' && this.id !== 'BOMBER' && this.id !== 'HEALER') {
        if (this.attackTimer <= 0) {
          this.attackTimer = this.attackCooldown * 0.6;
          hitPlayer(this.dmg * 0.4, this.color);
        }
      }
    }

    draw(cx, cy) {
      if (this.dead) return;
      aCtx.save();
      aCtx.translate(cx, cy);

      // Bot body
      const pulse = 0.85 + Math.sin(this.wobble) * 0.15;
      aCtx.shadowBlur = 14 * pulse;
      aCtx.shadowColor = this.color;

      if (this.id === 'TANK') {
        // Chunky hexagon
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          i === 0 ? aCtx.moveTo(Math.cos(a) * this.r, Math.sin(a) * this.r)
                  : aCtx.lineTo(Math.cos(a) * this.r, Math.sin(a) * this.r);
        }
        aCtx.closePath(); aCtx.fill();
        // Armor detail
        aCtx.strokeStyle = 'rgba(255,255,255,0.3)'; aCtx.lineWidth = 2;
        aCtx.stroke();
      } else if (this.id === 'SNIPER') {
        // Diamond + crosshair
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.beginPath();
        aCtx.moveTo(0, -this.r); aCtx.lineTo(this.r, 0);
        aCtx.lineTo(0, this.r); aCtx.lineTo(-this.r, 0);
        aCtx.closePath(); aCtx.fill();
        // Barrel
        aCtx.strokeStyle = this.color; aCtx.lineWidth = 3;
        aCtx.beginPath();
        aCtx.moveTo(0, 0);
        aCtx.lineTo(Math.cos(this.angle) * (this.r + 14), Math.sin(this.angle) * (this.r + 14));
        aCtx.stroke();
      } else if (this.id === 'ELITE') {
        // Star shape
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r2 = i % 2 === 0 ? this.r : this.r * 0.55;
          i === 0 ? aCtx.moveTo(Math.cos(a) * r2, Math.sin(a) * r2)
                  : aCtx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        }
        aCtx.closePath(); aCtx.fill();
        // Rotating ring
        aCtx.strokeStyle = `rgba(255,36,66,${0.4 + pulse * 0.4})`; aCtx.lineWidth = 1.5;
        aCtx.beginPath(); aCtx.arc(0, 0, this.r + 6, 0, Math.PI * 2); aCtx.stroke();
      } else if (this.id === 'SWARMER') {
        // Tiny sharp triangle, always pointed toward the player
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.save(); aCtx.rotate(this.angle);
        aCtx.beginPath();
        aCtx.moveTo(this.r * 1.3, 0);
        aCtx.lineTo(-this.r * 0.8, this.r * 0.8);
        aCtx.lineTo(-this.r * 0.8, -this.r * 0.8);
        aCtx.closePath(); aCtx.fill();
        aCtx.restore();
      } else if (this.id === 'BOMBER') {
        // Spiky bomb that flashes faster the closer it gets
        const flash = Math.sin(this.wobble * 3) > 0;
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : (flash ? '#fff' : this.color);
        aCtx.beginPath(); aCtx.arc(0, 0, this.r, 0, Math.PI * 2); aCtx.fill();
        aCtx.strokeStyle = this.color; aCtx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          aCtx.beginPath();
          aCtx.moveTo(Math.cos(a) * this.r, Math.sin(a) * this.r);
          aCtx.lineTo(Math.cos(a) * (this.r + 6), Math.sin(a) * (this.r + 6));
          aCtx.stroke();
        }
      } else if (this.id === 'SHIELDER') {
        // Core body
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : '#0d3a3f';
        aCtx.beginPath(); aCtx.arc(0, 0, this.r, 0, Math.PI * 2); aCtx.fill();
        aCtx.strokeStyle = this.color; aCtx.lineWidth = 1.5; aCtx.stroke();
        // Rotating shield arc — reduces damage taken from this side, must be flanked
        aCtx.strokeStyle = this.color; aCtx.lineWidth = 5;
        aCtx.shadowBlur = 16; aCtx.shadowColor = this.color;
        aCtx.beginPath();
        aCtx.arc(0, 0, this.r + 6, this.shieldAngle - Math.PI * 0.4, this.shieldAngle + Math.PI * 0.4);
        aCtx.stroke();
      } else if (this.id === 'HEALER') {
        // Circle with a cross, pulsing when about to heal
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.beginPath(); aCtx.arc(0, 0, this.r, 0, Math.PI * 2); aCtx.fill();
        aCtx.fillStyle = '#fff';
        aCtx.fillRect(-2, -this.r * 0.6, 4, this.r * 1.2);
        aCtx.fillRect(-this.r * 0.6, -2, this.r * 1.2, 4);
        if (this.healCooldown < 20) {
          aCtx.strokeStyle = `rgba(255,144,232,${1 - this.healCooldown / 20})`;
          aCtx.lineWidth = 2;
          aCtx.beginPath(); aCtx.arc(0, 0, this.r + 8, 0, Math.PI * 2); aCtx.stroke();
        }
      } else {
        // GRUNT / CHASER — circle with direction indicator
        aCtx.fillStyle = this.stunTimer > 0 ? '#888' : this.color;
        aCtx.beginPath(); aCtx.arc(0, 0, this.r, 0, Math.PI * 2); aCtx.fill();
        // Direction nub
        aCtx.fillStyle = 'rgba(0,0,0,0.5)';
        aCtx.beginPath();
        aCtx.arc(Math.cos(this.angle) * (this.r * 0.55), Math.sin(this.angle) * (this.r * 0.55), 4, 0, Math.PI * 2);
        aCtx.fill();
      }

      // HP bar
      const barW = this.r * 2.4, barH = 4;
      const bx = -barW / 2, by = -this.r - 9;
      aCtx.fillStyle = 'rgba(0,0,0,0.6)';
      aCtx.fillRect(bx, by, barW, barH);
      const hpPct = this.hp / this.maxHp;
      aCtx.fillStyle = hpPct > 0.5 ? '#39ff14' : hpPct > 0.25 ? '#ffd700' : '#ff2442';
      aCtx.shadowBlur = 0;
      aCtx.fillRect(bx, by, barW * hpPct, barH);

      aCtx.restore();
    }
  }

  let botProjectiles = [];

  // ── SPAWN BOTS ──
  function spawnBot() {
    // Pick a spawn point far from player
    let bx, by, attempts = 0;
    do {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { bx = Math.random() * ARENA_W; by = -20; }
      else if (edge === 1) { bx = ARENA_W + 20; by = Math.random() * ARENA_H; }
      else if (edge === 2) { bx = Math.random() * ARENA_W; by = ARENA_H + 20; }
      else { bx = -20; by = Math.random() * ARENA_H; }
      attempts++;
    } while (attempts < 15 && Math.hypot(bx - player.x, by - player.y) < 200);

    // Clamp into arena bounds with margin
    bx = Math.max(30, Math.min(ARENA_W - 30, bx));
    by = Math.max(30, Math.min(ARENA_H - 30, by));

    // Pick type by wave — pool grows with wave for more variety over time
    const byId = id => BOT_TYPES.find(t => t.id === id);
    let typePool;
    if (botWave <= 1) typePool = [byId('GRUNT'), byId('CHASER'), byId('SWARMER')];
    else if (botWave <= 2) typePool = [byId('GRUNT'), byId('CHASER'), byId('SWARMER'), byId('SNIPER')];
    else if (botWave <= 3) typePool = [byId('GRUNT'), byId('CHASER'), byId('SWARMER'), byId('SNIPER'), byId('BOMBER')];
    else if (botWave <= 4) typePool = [byId('GRUNT'), byId('CHASER'), byId('SWARMER'), byId('SNIPER'), byId('BOMBER'), byId('TANK')];
    else if (botWave <= 5) typePool = [byId('GRUNT'), byId('CHASER'), byId('SWARMER'), byId('SNIPER'), byId('BOMBER'), byId('TANK'), byId('SHIELDER')];
    else typePool = BOT_TYPES; // full roster, ELITE and HEALER join in
    const type = typePool[Math.floor(Math.random() * typePool.length)];
    enemyBots.push(new Bot(type, bx, by));
  }

  // Initial bots
  for (let i = 0; i < 4; i++) spawnBot();

  // ── HELPER: PLAYER HIT ──
  function hitPlayer(dmg, color) {
    if (invincibleTimer > 0 || buffShieldTimer > 0) return;
    player.hp = Math.max(0, player.hp - dmg);
    invincibleTimer = 30;
    screenShake = 8;
    snd('hurt');
    // Flash particles
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * 3 + 1;
      particles.push({ x: player.x, y: player.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, alpha: 1, decay: 0.07, color: color || '#ff2442', size: 3 });
    }
    // Update HP bar
    document.getElementById('prog-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
    const hpPct = player.hp / player.maxHp;
    document.getElementById('prog-fill').style.background =
      hpPct > 0.5 ? 'linear-gradient(90deg,var(--cyan),var(--purple))'
      : hpPct > 0.25 ? 'linear-gradient(90deg,var(--gold),var(--orange))'
      : 'linear-gradient(90deg,var(--red),#ff6600)';

    if (player.hp <= 0) endArena();
  }

  // ── HELPER: FLOATING TEXT ──
  function popText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, alpha: 1, vy: -1.4, life: 0 });
  }

  // ── HELPER: EXPLODE PARTICLES ──
  function explode(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const v = Math.random() * 4 + 1.5;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, alpha: 1, decay: 0.035 + Math.random() * 0.02, color, size: Math.random() * 3 + 1 });
    }
  }

  // ── PLAYER SLASH ──
  function doSlash() {
    if (!player.canSlash) return;
    slashActive = true;
    slashTimer = 14;
    slashAngle = player.angle;
    player.slashCooldown = 28;
    screenShake = 3;
    snd('slash');
    // Check hit on bots
    let hitAny = false;
    enemyBots.forEach(bot => {
      if (bot.dead) return;
      const dx = bot.x - player.x, dy = bot.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < player.slashRange + bot.r) {
        // Check angle cone (~120° arc)
        const angleToBot = Math.atan2(dy, dx);
        let diff = angleToBot - slashAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < Math.PI * 0.67) {
          let dmg = player.attackPower + (playerLevel - 1) * 5 + (buffOverchargeTimer > 0 ? 20 : 0);
          let blocked = false;
          if (bot.id === 'SHIELDER') {
            // Hits landing on the shielded side are heavily reduced — flank for full damage
            let sdiff = angleToBot - bot.shieldAngle;
            while (sdiff > Math.PI) sdiff -= Math.PI * 2;
            while (sdiff < -Math.PI) sdiff += Math.PI * 2;
            if (Math.abs(sdiff) < Math.PI * 0.4) { dmg = Math.round(dmg * 0.2); blocked = true; }
          }
          dmg = Math.round(dmg);
          bot.hp -= dmg;
          bot.stunTimer = 12;
          hitAny = true;
          explode(bot.x, bot.y, blocked ? '#00f5ff' : bot.color, blocked ? 3 : 6);
          snd(blocked ? 'bounceWall' : 'hit');
          popText(bot.x, bot.y - 14, blocked ? `-${dmg} (BLOCKED)` : `-${dmg}`, blocked ? '#00f5ff' : '#ff2442');
          // Combo
          comboCount++;
          comboTimer = 120;
          if (comboCount >= 3) {
            const bonus = comboCount * 5;
            score += bonus;
            snd('combo', { semi: Math.min(12, comboCount - 3) });
            popText(bot.x, bot.y - 28, `${comboCount}x COMBO! +${bonus}`, '#ffd700');
          }
          if (bot.hp <= 0 && !bot.dead) {
            bot.dead = true;
            const earned = bot.pts * (1 + (playerLevel - 1) * 0.1);
            score += Math.round(earned);
            setLive(score);
            explode(bot.x, bot.y, bot.color, 18);
            snd('explode');
            popText(bot.x, bot.y, `+${Math.round(earned)}`, '#ffd700');
            // Drop XP orbs
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * Math.PI * 2, v = Math.random() * 2 + 1;
              xpOrbs.push({ x: bot.x, y: bot.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 5, xp: Math.round(bot.xp / 3), color: bot.color, alpha: 1 });
            }
          }
        }
      }
    });
    if (!hitAny) {
      // Slash particles in arc direction regardless
      for (let i = -3; i <= 3; i++) {
        const a = slashAngle + i * 0.2, v = 5;
        particles.push({ x: player.x, y: player.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, alpha: 0.9, decay: 0.1, color: '#00f5ff', size: 2 });
      }
    }
  }

  // ── PLAYER DASH ──
  function doDash() {
    if (dashCooldown > 0) return;
    isDashing = true;
    dashTimer = 12;
    dashCooldown = 70;
    invincibleTimer = 12;
    // Dash in facing direction
    player.vx = Math.cos(player.angle) * 12;
    player.vy = Math.sin(player.angle) * 12;
    snd('dash');
    explode(player.x, player.y, '#00f5ff', 8);
  }

  // ── XP & LEVEL UP ──
  function gainXP(amount) {
    playerXP += amount;
    if (playerXP >= playerXPNext) {
      playerXP -= playerXPNext;
      playerLevel++;
      playerXPNext = Math.round(playerXPNext * 1.45);
      player.maxHp += 20;
      player.hp = Math.min(player.maxHp, player.hp + 30);
      player.attackPower += 8;
      player.speed = Math.min(5, player.speed + 0.15);
      screenShake = 15;
      snd('levelUp');
      popText(player.x, player.y - 30, `⬆ LEVEL ${playerLevel}!`, '#ffd700');
      explode(player.x, player.y, '#ffd700', 30);
      document.getElementById('prog-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
      toast(`⬆ LEVEL UP! Now Level ${playerLevel}`, 2000);
      botWave = playerLevel;
    }
  }

  // ── END GAME ──
  function endArena() {
    if (isOver) return;
    isOver = true;
    snd('gameOver');
    showResults('arena', score, {
      '⚔️ Bots Eliminated': enemyBots.filter(b => b.dead).length,
      '📡 Data Nodes Collected': Math.floor(score / 20),
      '🎖️ Arena Level Reached': playerLevel,
      '🏆 Final Score': `${score} PTS`
    });
  }

  // ── CONTROLS ──
  window.onkeydown = e => {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); doSlash(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); doDash(); }
    if (e.code === 'KeyE') { e.preventDefault(); deployAbility(); }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  };
  window.onkeyup = e => { keys[e.code] = false; };

  // Pad controls. Same on both: hold to strafe, tap to slash. Touch gets the
  // extra ABILITY key, which was E-only before. Pressing a direction clears any
  // stale stick claim so a gesture the browser cut off can't jam the buttons.
  bindHold(document.getElementById('ctrl-left'),
           ()=>{ stickActive=false; stickX=stickY=0; moveLeft=true; },  ()=>moveLeft=false);
  bindHold(document.getElementById('ctrl-right'),
           ()=>{ stickActive=false; stickX=stickY=0; moveRight=true; }, ()=>moveRight=false);
  document.getElementById('ctrl-action').onclick = () => doSlash();
  const abilBtn = document.getElementById('ctrl-drop');
  if (abilBtn) abilBtn.onclick = () => deployAbility();

  // ── BOARD GESTURES ──
  // Drag = move (and face where you're heading). Tap = slash toward the point
  // you tapped. Double-tap = deploy the queued ability, same as KeyE.
  let tapT = 0, tapX = 0, tapY = 0;
  bindCanvasDrag({
    // Mouse hover keeps free aiming; a coarse pointer has no hover to speak of.
    onHover(p){
      if (isTouchDevice) return;
      player.angle = Math.atan2((p.y + camY) - player.y, (p.x + camX) - player.x);
    },
    onDown(p){
      hideTouchHint();
      tapT = performance.now(); tapX = p.x; tapY = p.y;
      stickOX = p.x; stickOY = p.y; stickActive = false; stickX = stickY = 0;
    },
    onMove(p){
      const dx = p.x - stickOX, dy = p.y - stickOY;
      const dist = Math.hypot(dx, dy);
      if (dist < STICK_DEAD) {
        if (!stickActive) return;          // still inside the tap dead zone
        stickX = stickY = 0;
        return;
      }
      stickActive = true;
      stickX = dx / dist; stickY = dy / dist;
      player.angle = Math.atan2(dy, dx);   // you face where you're running
      // Let the anchor trail the finger so the stick never runs out of throw
      // on a long drag across the board.
      if (dist > STICK_R) {
        stickOX = p.x - stickX * STICK_R;
        stickOY = p.y - stickY * STICK_R;
      }
    },
    onUp(p){
      const wasStick = stickActive;
      stickActive = false; stickX = stickY = 0;
      if (wasStick) return;                // that was steering, not a tap
      if (performance.now() - tapT > 320) return;
      if (Math.hypot(p.x - tapX, p.y - tapY) > STICK_DEAD) return;

      const now = Date.now();
      if (now - lastTapTime < 320) { deployAbility(); lastTapTime = 0; return; }
      lastTapTime = now;
      // Aim at what you tapped, unless you tapped yourself — then keep facing.
      const sx = player.x - camX, sy = player.y - camY;
      if (Math.hypot(p.x - sx, p.y - sy) > 12) {
        player.angle = Math.atan2((p.y + camY) - player.y, (p.x + camX) - player.x);
      }
      doSlash();
    }
  });

  // Virtual stick overlay — drawn only while a finger is steering, so it never
  // sits on the board as clutter.
  function drawTouchStick(){
    if (!stickActive) return;
    aCtx.save();
    aCtx.strokeStyle = '#00f5ff'; aCtx.lineWidth = 2;
    aCtx.shadowBlur = 12; aCtx.shadowColor = '#00f5ff';
    aCtx.globalAlpha = 0.45;
    aCtx.beginPath(); aCtx.arc(stickOX, stickOY, STICK_R, 0, Math.PI * 2); aCtx.stroke();
    aCtx.globalAlpha = 0.8;
    aCtx.beginPath();
    aCtx.arc(stickOX + stickX * STICK_R, stickOY + stickY * STICK_R, 15, 0, Math.PI * 2);
    aCtx.fillStyle = 'rgba(0,245,255,0.25)'; aCtx.fill(); aCtx.stroke();
    aCtx.restore();
  }

  // ── WORLD TILE COLORS (cyber grid) ──
  function drawWorld() {
    const cols = Math.ceil(W / TILE) + 2;
    const rows = Math.ceil(H / TILE) + 2;
    const startX = Math.floor(camX / TILE) * TILE - camX;
    const startY = Math.floor(camY / TILE) * TILE - camY;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = Math.floor(camX / TILE) + c;
        const ty = Math.floor(camY / TILE) + r;
        const isDark = (tx + ty) % 2 === 0;
        aCtx.fillStyle = isDark ? '#04040e' : '#060610';
        aCtx.fillRect(startX + c * TILE, startY + r * TILE, TILE, TILE);
      }
    }
    // Grid lines
    aCtx.strokeStyle = 'rgba(0,245,255,0.035)'; aCtx.lineWidth = 1;
    for (let c = 0; c < cols; c++) {
      aCtx.beginPath();
      aCtx.moveTo(startX + c * TILE, 0); aCtx.lineTo(startX + c * TILE, H); aCtx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      aCtx.beginPath();
      aCtx.moveTo(0, startY + r * TILE); aCtx.lineTo(W, startY + r * TILE); aCtx.stroke();
    }
  }

  function drawWalls() {
    walls.forEach(w => {
      const sx = w.x - camX, sy = w.y - camY;
      if (sx + w.w < -10 || sx > W + 10 || sy + w.h < -10 || sy > H + 10) return;
      // Wall body
      const grad = aCtx.createLinearGradient(sx, sy, sx + w.w, sy + w.h);
      grad.addColorStop(0, '#1a0a2e'); grad.addColorStop(1, '#0d0520');
      aCtx.fillStyle = grad;
      aCtx.fillRect(sx, sy, w.w, w.h);
      // Neon border
      aCtx.strokeStyle = 'rgba(168,85,247,0.4)'; aCtx.lineWidth = 1.5;
      aCtx.shadowBlur = 6; aCtx.shadowColor = '#a855f7';
      aCtx.strokeRect(sx + 0.5, sy + 0.5, w.w - 1, w.h - 1);
      // Circuit line detail
      aCtx.strokeStyle = 'rgba(168,85,247,0.15)'; aCtx.lineWidth = 1; aCtx.shadowBlur = 0;
      aCtx.setLineDash([4, 8]);
      aCtx.beginPath(); aCtx.moveTo(sx + 4, sy + w.h / 2); aCtx.lineTo(sx + w.w - 4, sy + w.h / 2); aCtx.stroke();
      aCtx.setLineDash([]);
    });
    aCtx.shadowBlur = 0;
  }

  // ── DRAW PLAYER ──
  function drawPlayer() {
    const sx = player.x - camX, sy = player.y - camY;
    const eqColor = getEquippedColorHex();
    const skinEmoji = getEquippedSkinEmoji();
    aCtx.save();
    aCtx.translate(sx, sy);

    // Invincible flicker
    if (invincibleTimer > 0 && Math.floor(invincibleTimer / 3) % 2 === 0) {
      aCtx.globalAlpha = 0.35;
    }

    // AEGIS SHIELD buff glow ring
    if (buffShieldTimer > 0) {
      aCtx.save();
      aCtx.strokeStyle = `rgba(168,85,247,${0.5 + Math.sin(frame * 0.2) * 0.3})`;
      aCtx.lineWidth = 3; aCtx.shadowBlur = 16; aCtx.shadowColor = '#a855f7';
      aCtx.beginPath(); aCtx.arc(0, 0, player.r + 12, 0, Math.PI * 2); aCtx.stroke();
      aCtx.restore();
    }

    // Dash trail
    if (isDashing) {
      aCtx.shadowBlur = 30; aCtx.shadowColor = eqColor;
    }

    // Outer glow ring
    const ringPulse = 0.4 + Math.sin(frame * 0.08) * 0.2;
    aCtx.strokeStyle = hexToRgba(eqColor, ringPulse); aCtx.lineWidth = 2;
    aCtx.beginPath(); aCtx.arc(0, 0, player.r + 5, 0, Math.PI * 2); aCtx.stroke();

    // Body (octagon)
    aCtx.fillStyle = eqColor; aCtx.shadowBlur = 18; aCtx.shadowColor = eqColor;
    aCtx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      i === 0 ? aCtx.moveTo(Math.cos(a) * player.r, Math.sin(a) * player.r)
              : aCtx.lineTo(Math.cos(a) * player.r, Math.sin(a) * player.r);
    }
    aCtx.closePath(); aCtx.fill();

    // Face direction indicator
    aCtx.fillStyle = '#ffffff'; aCtx.shadowBlur = 5; aCtx.shadowColor = '#fff';
    aCtx.beginPath();
    aCtx.arc(Math.cos(player.angle) * 8, Math.sin(player.angle) * 8, 4, 0, Math.PI * 2);
    aCtx.fill();

    // Equipped skin badge
    if (skinEmoji) {
      aCtx.save();
      aCtx.shadowBlur = 0;
      aCtx.font = '14px sans-serif';
      aCtx.textAlign = 'center';
      aCtx.textBaseline = 'middle';
      aCtx.fillText(skinEmoji, 0, -player.r - 12);
      aCtx.restore();
    }

    // Slash arc
    if (slashActive) {
      const t = 1 - slashTimer / 14;
      aCtx.globalAlpha = 1 - t;
      aCtx.strokeStyle = eqColor; aCtx.lineWidth = 4;
      aCtx.shadowBlur = 25; aCtx.shadowColor = eqColor;
      aCtx.beginPath();
      aCtx.arc(0, 0, player.slashRange, slashAngle - Math.PI * 0.55, slashAngle + Math.PI * 0.55);
      aCtx.stroke();
      aCtx.globalAlpha = 1;
    }

    aCtx.restore();
    aCtx.textAlign = 'left';
  }

  // ── DRAW DATA NODES ──
  function drawDataNodes() {
    dataNodes.forEach(node => {
      if (node.collected) return;
      node.pulse += 0.06;
      const sx = node.x - camX, sy = node.y - camY;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;

      const p = 0.7 + Math.sin(node.pulse) * 0.3;
      const NODE_STYLE = {
        DATA:       { color:'#39ff14', size:8  },
        MEGA:       { color:'#ffd700', size:11 },
        HEAL:       { color:'#ff4d6d', size:10 },
        HASTE:      { color:'#00f5ff', size:10 },
        OVERCHARGE: { color:'#ff2442', size:10 },
        SHIELD:     { color:'#a855f7', size:10 },
        CORE:       { color:'#ffffff', size:12 },
      };
      const style = NODE_STYLE[node.type] || NODE_STYLE.DATA;
      const color = style.color, size = style.size;

      aCtx.save();
      aCtx.shadowBlur = 14 * p; aCtx.shadowColor = color;
      aCtx.fillStyle = color;
      aCtx.translate(sx, sy);

      if (node.type === 'HEAL') {
        // Cross icon
        aCtx.fillRect(-size/2, -2, size, 4);
        aCtx.fillRect(-2, -size/2, 4, size);
      } else if (node.type === 'CORE') {
        // Rotating diamond ring — ability core
        aCtx.rotate(node.pulse * 0.8);
        aCtx.beginPath();
        aCtx.moveTo(0, -size); aCtx.lineTo(size, 0); aCtx.lineTo(0, size); aCtx.lineTo(-size, 0);
        aCtx.closePath(); aCtx.fill();
        aCtx.strokeStyle = '#00f5ff'; aCtx.lineWidth = 1.5;
        aCtx.beginPath(); aCtx.arc(0, 0, size + 5, 0, Math.PI * 2); aCtx.stroke();
      } else if (node.type === 'HASTE') {
        // Chevron / speed arrow
        aCtx.rotate(node.pulse * 0.4);
        aCtx.beginPath();
        aCtx.moveTo(-size*0.6, -size*0.7); aCtx.lineTo(size*0.6, 0); aCtx.lineTo(-size*0.6, size*0.7);
        aCtx.closePath(); aCtx.fill();
      } else if (node.type === 'SHIELD') {
        // Hexagon shield icon
        aCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          i === 0 ? aCtx.moveTo(Math.cos(a) * size, Math.sin(a) * size) : aCtx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        }
        aCtx.closePath(); aCtx.fill();
      } else {
        // DATA / MEGA / OVERCHARGE — rotating square
        aCtx.rotate(node.pulse * 0.6);
        aCtx.fillRect(-size / 2, -size / 2, size, size);
        aCtx.fillStyle = '#ffffff';
        aCtx.fillRect(-2, -2, 4, 4);
      }
      aCtx.restore();
    });
  }

  // ── DRAW XP ORBS ──
  function drawXPOrbs() {
    for (let i = xpOrbs.length - 1; i >= 0; i--) {
      const orb = xpOrbs[i];
      orb.x += orb.vx; orb.y += orb.vy;
      orb.vx *= 0.9; orb.vy *= 0.9;

      // Magnetic pull toward player when close
      const dx = player.x - orb.x, dy = player.y - orb.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 80) {
        orb.vx += (dx / dist) * 3;
        orb.vy += (dy / dist) * 3;
      }
      // Collect
      if (dist < player.r + orb.r + 2) {
        gainXP(orb.xp);
        xpOrbs.splice(i, 1);
        continue;
      }

      const sx = orb.x - camX, sy = orb.y - camY;
      aCtx.save();
      aCtx.shadowBlur = 10; aCtx.shadowColor = orb.color;
      aCtx.fillStyle = orb.color; aCtx.globalAlpha = orb.alpha;
      aCtx.beginPath(); aCtx.arc(sx, sy, orb.r, 0, Math.PI * 2); aCtx.fill();
      aCtx.restore();
    }
  }

  // ── DRAW BOT PROJECTILES ──
  function updateBotProjectiles() {
    for (let i = botProjectiles.length - 1; i >= 0; i--) {
      const p = botProjectiles[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
      p.x += p.vx; p.y += p.vy;
      p.alpha -= 0.005;

      // Off arena
      if (p.x < 0 || p.x > ARENA_W || p.y < 0 || p.y > ARENA_H || p.alpha <= 0) {
        botProjectiles.splice(i, 1); continue;
      }
      // Wall hit
      if (isCollidingWall(p.x, p.y, p.r)) {
        explode(p.x, p.y, p.color, 4);
        botProjectiles.splice(i, 1); continue;
      }
      // Player hit
      const dx = p.x - player.x, dy = p.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < player.r + p.r) {
        hitPlayer(p.dmg, p.color);
        explode(p.x, p.y, p.color, 5);
        botProjectiles.splice(i, 1); continue;
      }

      // Draw trail
      const sx = p.x - camX, sy = p.y - camY;
      p.trail.forEach((pt, idx) => {
        const ta = (idx / p.trail.length) * 0.5;
        aCtx.fillStyle = p.color;
        aCtx.globalAlpha = ta;
        aCtx.beginPath(); aCtx.arc(pt.x - camX, pt.y - camY, p.r * 0.5, 0, Math.PI * 2); aCtx.fill();
      });
      aCtx.globalAlpha = 1;
      aCtx.save();
      aCtx.shadowBlur = 12; aCtx.shadowColor = p.color;
      aCtx.fillStyle = p.color;
      aCtx.beginPath(); aCtx.arc(sx, sy, p.r, 0, Math.PI * 2); aCtx.fill();
      aCtx.restore();
    }
    aCtx.globalAlpha = 1;
  }

  // ── DRAW PARTICLES ──
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.alpha -= p.decay;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }
      aCtx.save(); aCtx.globalAlpha = p.alpha;
      aCtx.fillStyle = p.color; aCtx.shadowBlur = 6; aCtx.shadowColor = p.color;
      aCtx.beginPath(); aCtx.arc(p.x - camX, p.y - camY, p.size, 0, Math.PI * 2); aCtx.fill();
      aCtx.restore();
    }
    aCtx.globalAlpha = 1;
  }

  // ── DRAW FLOATING TEXTS ──
  function updateFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const t = floatingTexts[i];
      t.y += t.vy; t.alpha -= 0.018; t.life++;
      if (t.alpha <= 0) { floatingTexts.splice(i, 1); continue; }
      aCtx.save(); aCtx.globalAlpha = t.alpha;
      aCtx.fillStyle = t.color; aCtx.shadowBlur = 8; aCtx.shadowColor = t.color;
      aCtx.font = `bold ${t.text.includes('COMBO') || t.text.includes('LEVEL') ? '11' : '9'}px Orbitron`;
      aCtx.textAlign = 'center';
      aCtx.fillText(t.text, t.x - camX, t.y - camY);
      aCtx.restore();
    }
    aCtx.textAlign = 'left'; aCtx.globalAlpha = 1;
  }

  // ── HUD OVERLAY ──
  function drawHUD() {
    // XP bar (top strip)
    const xpPct = playerXP / playerXPNext;
    aCtx.fillStyle = 'rgba(0,0,0,0.55)'; aCtx.fillRect(0, 0, W, 22);
    aCtx.fillStyle = '#ffd700'; aCtx.fillRect(0, 18, W * xpPct, 4);
    aCtx.fillStyle = '#ffd700'; aCtx.font = 'bold 8px Orbitron';
    aCtx.shadowBlur = 5; aCtx.shadowColor = '#ffd700';
    aCtx.fillText(`LV ${playerLevel}  XP ${playerXP}/${playerXPNext}`, 8, 14);
    // Score
    aCtx.textAlign = 'right';
    aCtx.fillStyle = '#00f5ff'; aCtx.shadowColor = '#00f5ff';
    aCtx.fillText(`${score} PTS`, W - 8, 14);
    aCtx.textAlign = 'left'; aCtx.shadowBlur = 0;

    // Slash cooldown indicator (bottom right)
    if (player.slashCooldown > 0) {
      const pct = 1 - player.slashCooldown / 28;
      aCtx.fillStyle = 'rgba(0,0,0,0.6)'; aCtx.fillRect(W - 56, H - 30, 48, 14);
      aCtx.fillStyle = '#00f5ff'; aCtx.fillRect(W - 56, H - 30, 48 * pct, 14);
      aCtx.fillStyle = '#fff'; aCtx.font = '7px Orbitron'; aCtx.textAlign = 'center';
      aCtx.fillText('SLASH', W - 32, H - 20);
      aCtx.textAlign = 'left';
    } else {
      aCtx.fillStyle = '#00f5ff'; aCtx.font = '7px Orbitron'; aCtx.shadowBlur = 8; aCtx.shadowColor = '#00f5ff';
      aCtx.textAlign = 'center'; aCtx.fillText('⚔ READY', W - 32, H - 20);
      aCtx.textAlign = 'left'; aCtx.shadowBlur = 0;
    }

    // Dash cooldown (bottom left)
    if (dashCooldown > 0) {
      const pct2 = 1 - dashCooldown / 70;
      aCtx.fillStyle = 'rgba(0,0,0,0.6)'; aCtx.fillRect(8, H - 30, 48, 14);
      aCtx.fillStyle = '#a855f7'; aCtx.fillRect(8, H - 30, 48 * pct2, 14);
      aCtx.fillStyle = '#fff'; aCtx.font = '7px Orbitron'; aCtx.textAlign = 'center';
      aCtx.fillText('DASH', 32, H - 20);
    } else {
      aCtx.fillStyle = '#a855f7'; aCtx.font = '7px Orbitron'; aCtx.shadowBlur = 8; aCtx.shadowColor = '#a855f7';
      aCtx.textAlign = 'center'; aCtx.fillText('💨 READY', 32, H - 20);
      aCtx.shadowBlur = 0;
    }
    aCtx.textAlign = 'left';

    // Bot count
    const alive = enemyBots.filter(b => !b.dead).length;
    aCtx.fillStyle = 'rgba(0,0,0,0.55)';
    aCtx.fillRect(W / 2 - 40, 4, 80, 16);
    aCtx.fillStyle = '#ff0090'; aCtx.font = '7.5px Orbitron'; aCtx.textAlign = 'center'; aCtx.shadowBlur = 5; aCtx.shadowColor = '#ff0090';
    aCtx.fillText(`${alive} BOTS ALIVE`, W / 2, 15);
    aCtx.textAlign = 'left'; aCtx.shadowBlur = 0;

    // Combo display
    if (comboTimer > 0 && comboCount >= 2) {
      aCtx.save();
      const comboAlpha = Math.min(1, comboTimer / 30);
      aCtx.globalAlpha = comboAlpha;
      aCtx.fillStyle = '#ffd700'; aCtx.font = `bold ${9 + comboCount}px Orbitron`;
      aCtx.textAlign = 'center'; aCtx.shadowBlur = 12; aCtx.shadowColor = '#ffd700';
      aCtx.fillText(`${comboCount}x COMBO`, W / 2, 42);
      aCtx.restore();
      aCtx.textAlign = 'left';
    }

    // Controls hint (fades after 5s). Keyboard only — 7px Orbitron scaled down
    // to phone size is unreadable, so touch gets the #touch-hint overlay
    // instead and this stays out of its way.
    if (frame < 300 && !isTouchDevice) {
      const hintAlpha = Math.max(0, 1 - frame / 300);
      aCtx.save(); aCtx.globalAlpha = hintAlpha * 0.7;
      aCtx.fillStyle = 'rgba(0,0,0,0.6)'; aCtx.fillRect(W/2 - 100, H/2 + 30, 200, 48);
      aCtx.fillStyle = '#ffffff'; aCtx.font = '7px Orbitron'; aCtx.textAlign = 'center';
      aCtx.fillText('WASD / ARROWS = MOVE', W/2, H/2 + 44);
      aCtx.fillText('SPACE = SLASH  SHIFT = DASH', W/2, H/2 + 58);
      aCtx.fillText('E (OR DOUBLE-TAP) = ABILITY', W/2, H/2 + 72);
      aCtx.restore(); aCtx.textAlign = 'left';
    }

    // Special ability queue indicator (top center, below bot count)
    if (specialAbilities.length > 0) {
      const abil = specialAbilities[0];
      const bob = Math.sin(frame * 0.1) * 2;
      aCtx.save();
      aCtx.fillStyle = 'rgba(0,0,0,0.6)'; aCtx.fillRect(W / 2 - 70, 24 + bob, 140, 15);
      aCtx.strokeStyle = abil.color; aCtx.lineWidth = 1; aCtx.strokeRect(W / 2 - 70, 24 + bob, 140, 15);
      aCtx.fillStyle = abil.color; aCtx.font = 'bold 7px Orbitron'; aCtx.textAlign = 'center';
      aCtx.shadowBlur = 8; aCtx.shadowColor = abil.color;
      aCtx.fillText(`[E] ${abil.label}${specialAbilities.length > 1 ? ` x${specialAbilities.length}` : ''}`, W / 2, 34 + bob);
      aCtx.restore(); aCtx.textAlign = 'left';
    }

    // Active buff indicators (right side, under score)
    let buffY = 30;
    const drawBuff = (label, color, timer, maxTimer) => {
      if (timer <= 0) return;
      const pct = timer / maxTimer;
      aCtx.save();
      aCtx.fillStyle = 'rgba(0,0,0,0.55)'; aCtx.fillRect(W - 66, buffY, 58, 12);
      aCtx.fillStyle = color; aCtx.globalAlpha = 0.85; aCtx.fillRect(W - 66, buffY, 58 * pct, 12);
      aCtx.globalAlpha = 1; aCtx.fillStyle = '#000'; aCtx.font = 'bold 6.5px Orbitron'; aCtx.textAlign = 'center';
      aCtx.fillText(label, W - 37, buffY + 9);
      aCtx.restore(); aCtx.textAlign = 'left';
      buffY += 15;
    };
    drawBuff('HASTE', '#00f5ff', buffHasteTimer, 300);
    drawBuff('OVERCHARGE', '#ff2442', buffOverchargeTimer, 300);
    drawBuff('AEGIS', '#a855f7', buffShieldTimer, 180);
  }

  // ── MAIN LOOP ──
  function loop() {
    if (isOver) return;
    frame++;
    gameLoopId = requestAnimationFrame(loop);

    // ── UPDATE PLAYER ──
    if (!isOver) {
      // Movement
      let dx = 0, dy = 0;
      if (keys['ArrowLeft']  || keys['KeyA'] || moveLeft)  dx -= 1;
      if (keys['ArrowRight'] || keys['KeyD'] || moveRight) dx += 1;
      if (keys['ArrowUp']    || keys['KeyW'])              dy -= 1;
      if (keys['ArrowDown']  || keys['KeyS'])              dy += 1;
      if (stickActive) { dx += stickX; dy += stickY; }

      const hasteMult = buffHasteTimer > 0 ? 1.6 : 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const spd = (isDashing ? player.speed * 3 : player.speed) * hasteMult;
        player.vx += (dx / len) * spd * 0.4;
        player.vy += (dy / len) * spd * 0.4;
        // Update facing if not mouse-aiming recently
        if (!aCanvas.onmousemove || (dx !== 0 || dy !== 0)) {
          // Don't override mouse aim; angle only updates from mouse
        }
      }
      player.vx *= 0.82; player.vy *= 0.82;
      const pspd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      const maxSpd = (isDashing ? player.speed * 4 : player.speed) * hasteMult;
      if (pspd > maxSpd) { player.vx = (player.vx / pspd) * maxSpd; player.vy = (player.vy / pspd) * maxSpd; }

      player.x += player.vx; player.y += player.vy;
      player.x = Math.max(player.r, Math.min(ARENA_W - player.r, player.x));
      player.y = Math.max(player.r, Math.min(ARENA_H - player.r, player.y));
      resolveWall(player, player.r);

      // Timers
      if (invincibleTimer > 0) invincibleTimer--;
      if (player.slashCooldown > 0) player.slashCooldown--;
      if (dashCooldown > 0) dashCooldown--;
      if (slashTimer > 0) slashTimer--; else slashActive = false;
      if (dashTimer > 0) dashTimer--; else isDashing = false;
      if (comboTimer > 0) comboTimer--; else if (comboTimer === 0 && comboCount > 0) comboCount = 0;
      if (buffHasteTimer > 0) buffHasteTimer--;
      if (buffShieldTimer > 0) buffShieldTimer--;
      if (buffOverchargeTimer > 0) buffOverchargeTimer--;

      // ── UPDATE BOTS ──
      enemyBots.forEach(bot => bot.update());

      // ── COLLECT DATA NODES ──
      dataNodes.forEach(node => {
        if (node.collected) return;
        const dx2 = player.x - node.x, dy2 = player.y - node.y;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < player.r + node.r + 4) {
          node.collected = true;
          if (node.type === 'MEGA') {
            score += 50; setLive(score); gainXP(30);
            snd('pickup', { semi: 7 });
            explode(node.x, node.y, '#ffd700', 8);
            popText(node.x, node.y - 12, '+50', '#ffd700');
          } else if (node.type === 'DATA') {
            score += 20; setLive(score); gainXP(10);
            snd('pickup');
            explode(node.x, node.y, '#39ff14', 8);
            popText(node.x, node.y - 12, '+20', '#39ff14');
          } else if (node.type === 'HEAL') {
            player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.25);
            document.getElementById('prog-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
            snd('heal');
            explode(node.x, node.y, '#ff4d6d', 10);
            popText(node.x, node.y - 12, '+HP', '#ff4d6d');
          } else if (node.type === 'HASTE') {
            buffHasteTimer = 300;
            snd('powerup');
            explode(node.x, node.y, '#00f5ff', 10);
            popText(node.x, node.y - 12, 'HASTE!', '#00f5ff');
          } else if (node.type === 'OVERCHARGE') {
            buffOverchargeTimer = 300;
            snd('powerup');
            explode(node.x, node.y, '#ff2442', 10);
            popText(node.x, node.y - 12, 'OVERCHARGE!', '#ff2442');
          } else if (node.type === 'SHIELD') {
            buffShieldTimer = 180;
            snd('shield');
            explode(node.x, node.y, '#a855f7', 10);
            popText(node.x, node.y - 12, 'SHIELDED!', '#a855f7');
          } else if (node.type === 'CORE') {
            const abil = ABILITY_TYPES[Math.floor(Math.random() * ABILITY_TYPES.length)];
            specialAbilities.push(abil);
            snd('charge');
            if (specialAbilities.length > 3) specialAbilities.shift();
            explode(node.x, node.y, abil.color, 14);
            popText(node.x, node.y - 12, `${abil.label} READY`, abil.color);
            toast(`⚡ Ability acquired: ${abil.label} — press E (or double-tap) to use`, 2200);
          }
        }
      });

      // Respawn collected nodes
      const activeNodes = dataNodes.filter(n => !n.collected).length;
      if (activeNodes < 10 && frame % 120 === 0) spawnDataNodes(4);

      // ── SPAWN BOTS ──
      botSpawnTimer++;
      const spawnInterval = Math.max(180, 420 - botWave * 30);
      if (botSpawnTimer >= spawnInterval) {
        botSpawnTimer = 0;
        const maxBots = Math.min(12, 4 + botWave * 2);
        const alive = enemyBots.filter(b => !b.dead).length;
        if (alive < maxBots) spawnBot();
      }

      // Clean dead bots after death animation
      for (let i = enemyBots.length - 1; i >= 0; i--) {
        if (enemyBots[i].dead && enemyBots[i].deathTimer > 40) enemyBots.splice(i, 1);
      }

      // ── CAMERA FOLLOW ──
      const targetCamX = player.x - W / 2;
      const targetCamY = player.y - H / 2;
      camX += (targetCamX - camX) * 0.1;
      camY += (targetCamY - camY) * 0.1;
      camX = Math.max(0, Math.min(ARENA_W - W, camX));
      camY = Math.max(0, Math.min(ARENA_H - H, camY));

      // Screen shake
      let shakeX = 0, shakeY = 0;
      if (screenShake > 0) {
        shakeX = (Math.random() - 0.5) * screenShake;
        shakeY = (Math.random() - 0.5) * screenShake;
        screenShake = Math.max(0, screenShake - 1.5);
      }

      // ── DRAW ──
      aCtx.save();
      aCtx.translate(shakeX, shakeY);
      drawWorld();
      drawWalls();
      drawDataNodes();
      drawXPOrbs();
      // Draw bots
      enemyBots.forEach(bot => {
        const sx = bot.x - camX, sy = bot.y - camY;
        if (sx > -40 && sx < W + 40 && sy > -40 && sy < H + 40) bot.draw(sx, sy);
      });
      updateBotProjectiles();
      drawPlayer();
      updateParticles();
      updateFloatingTexts();
      drawHUD();
      aCtx.restore();
      drawTouchStick();   // outside the shake transform — a control shouldn't jitter
    }
  }

  onQuitGame = () => { if(!isOver) endArena(); };
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🌌 GAME 13: CYBER RUNNER
// ════════════════════════════════════════════
function startRunner(){
  document.getElementById('g-canvas-holder').style.display='block';
  // Lane shifts are discrete, so these are plain clicks rather than hold-to-
  // repeat — holding ◀ should not walk you across the whole track.
  setControls({ left:'◀', action:'⤒ JUMP', right:'▶' });
  setControlHint('SWIPE ◀ ▶ TO SHIFT LANE · TAP TO JUMP',
                 '← → / A D = SHIFT LANE · SPACE / ↑ / W = JUMP');
  showTouchHint('SWIPE LEFT / RIGHT TO SHIFT LANE · TAP TO JUMP');
  fitCanvas();

  const diffMod = getDifficultyModifier();
  const W=BOARD_W, H=BOARD_H;
  const LANES=3, LANE_W=W/LANES;
  const laneX = i => LANE_W*i + LANE_W/2;
  const RIDE_Y = H-92;          // the hover-bike's ground line
  const HIT_H  = 26;            // vertical slack on a collision test

  // The speed ramp IS this game's difficulty curve. A straight ×2 on the
  // ceiling at Meltdown puts the track past reacting and into guessing — the
  // same problem Ice Breaker's ball had — so the tier scales the RAMP fully
  // (you reach terminal velocity much sooner) but the start and ceiling only
  // partially. Rows still arrive at a readable rate; there are just more of
  // them, sooner.
  const BASE_SPEED = 3.6*(1+(diffMod-1)*0.5);
  const RAMP       = 0.0024*diffMod;
  const MAX_SPEED  = 11*(1+(diffMod-1)*0.4);
  const JUMP_FRAMES = 34;

  let speed=BASE_SPEED, dist=0, cubes=0, hull=3, frame=0, elapsed=0;
  let lane=1, visX=laneX(1), jumpT=0, invuln=0, shake=0, isOver=false;
  let items=[], particles=[], floats=[], spawnCd=90;

  document.getElementById('g-time').textContent='0';
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--pink),var(--purple))';

  const score = () => Math.floor(dist/13) + cubes*30;
  const pop = (x,y,txt,color) => floats.push({x,y,txt,color,alpha:1,vy:-0.9});
  function burst(x,y,color,n){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, v=Math.random()*3+1;
      particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,alpha:1,color,r:Math.random()*2+1});
    }
  }

  function shift(dir){
    if(isOver) return;
    const nl=Math.max(0,Math.min(LANES-1,lane+dir));
    if(nl===lane) return;
    lane=nl;
    snd('move');
    burst(visX, RIDE_Y+12, getEquippedColorHex(), 5);
  }
  function jump(){
    if(isOver||jumpT>0) return;
    jumpT=JUMP_FRAMES;
    snd('jump');
    burst(visX, RIDE_Y+14, '#ff0090', 8);
  }

  // ── STEERING ──
  // One gesture set covers both input styles: a horizontal drag past the
  // threshold shifts lane (and re-anchors, so a long swipe can cross two
  // lanes), while a short stationary press is a jump. Works identically with
  // a mouse, which is why there is no separate desktop path.
  let anchorX=0, swiped=false, downAt=0;
  bindCanvasDrag({
    onDown(p){ hideTouchHint(); anchorX=p.x; swiped=false; downAt=performance.now(); },
    onMove(p){
      const dx=p.x-anchorX;
      if(Math.abs(dx)>34){ shift(dx>0?1:-1); anchorX=p.x; swiped=true; }
    },
    onUp(){ if(!swiped && performance.now()-downAt<420) jump(); }
  });

  document.getElementById('ctrl-left').onclick  = ()=>shift(-1);
  document.getElementById('ctrl-right').onclick = ()=>shift(1);
  document.getElementById('ctrl-action').onclick= jump;

  window.onkeydown = e => {
    // Enter does nothing here, but it still activates whatever button holds
    // focus — swallow it alongside the keys the game actually uses.
    if(['ArrowLeft','ArrowRight','ArrowUp','Space','Enter','KeyA','KeyD','KeyW'].includes(e.code)) e.preventDefault();
    if(e.repeat) return;                       // one shift per keypress
    if(e.code==='ArrowLeft' ||e.code==='KeyA') shift(-1);
    if(e.code==='ArrowRight'||e.code==='KeyD') shift(1);
    if(e.code==='ArrowUp'   ||e.code==='KeyW'||e.code==='Space') jump();
  };

  gTimer=setInterval(()=>{ if(!isOver){ elapsed++; document.getElementById('g-time').textContent=elapsed; } },1000);

  // Every row leaves at least one clean lane, so no arrangement is unwinnable.
  // Spacing is measured in DISTANCE, not frames — the gap between rows stays
  // constant on the track while the time you get to read it shrinks with speed.
  function spawnRow(){
    const safe=Math.floor(Math.random()*LANES);
    for(let i=0;i<LANES;i++){
      if(i===safe){
        if(Math.random()<0.42) items.push({kind:'cube',lane:i,y:-26,spin:Math.random()*6});
        continue;
      }
      const r=Math.random();
      if(r<0.74)      items.push({kind: Math.random()<0.45?'spike':'wall', lane:i, y:-32});
      else if(r<0.90) items.push({kind:'cube',lane:i,y:-26,spin:Math.random()*6});
    }
  }

  function takeHit(){
    hull--; invuln=64; shake=16;
    snd(hull<=0 ? 'bigExplode' : 'hurt');
    burst(visX, RIDE_Y, '#ff2442', 18);
    pop(visX, RIDE_Y-30, 'HULL BREACH', '#ff2442');
    document.getElementById('prog-fill').style.width=`${Math.max(0,hull)/3*100}%`;
    if(hull<=0) end();
  }

  function end(){
    if(isOver)return; isOver=true;
    const final=Math.min(1200, score());
    showResults('runner', final, {
      '🌌 Distance Run': `${Math.floor(dist/10)} M`,
      '💠 Data Cubes': cubes,
      '⚡ Top Velocity': `${(speed/BASE_SPEED).toFixed(2)}×`,
      '⏱️ Uptime': `${elapsed}s`,
      '🏆 Score Accumulation': `${final} PTS`
    });
  }

  function drawTrack(){
    // Lane dividers
    aCtx.strokeStyle='rgba(255,0,144,0.22)'; aCtx.lineWidth=2;
    aCtx.shadowBlur=10; aCtx.shadowColor='#ff0090';
    for(let i=1;i<LANES;i++){
      aCtx.beginPath(); aCtx.moveTo(LANE_W*i,0); aCtx.lineTo(LANE_W*i,H); aCtx.stroke();
    }
    aCtx.shadowBlur=0;
    // Scrolling rungs — the whole sense of speed lives here
    const off=dist%56;
    for(let y=-56+off; y<H; y+=56){
      const a=0.05+(y/H)*0.16;
      aCtx.strokeStyle=`rgba(168,85,247,${a})`; aCtx.lineWidth=1;
      aCtx.beginPath(); aCtx.moveTo(0,y); aCtx.lineTo(W,y); aCtx.stroke();
    }
    // Horizon bloom
    const g=aCtx.createLinearGradient(0,0,0,150);
    g.addColorStop(0,'rgba(255,0,144,0.16)'); g.addColorStop(1,'rgba(255,0,144,0)');
    aCtx.fillStyle=g; aCtx.fillRect(0,0,W,150);
  }

  // eq is the equipped Black Market colour, resolved once per frame by loop().
  // Only the cube — the thing you WANT to hit — takes it; the firewall and the
  // spikes keep their fixed red/orange so no cosmetic can disguise a hazard.
  function drawItem(it, eq){
    const x=laneX(it.lane), y=it.y;
    aCtx.save();
    if(it.kind==='wall'){
      // Firewall barrier — spans the lane, cannot be jumped
      aCtx.shadowBlur=16; aCtx.shadowColor='#ff2442';
      aCtx.fillStyle='rgba(255,36,66,0.9)';
      aCtx.fillRect(x-LANE_W/2+8, y-10, LANE_W-16, 20);
      aCtx.fillStyle='rgba(4,4,14,0.85)';
      for(let s=-LANE_W/2+10; s<LANE_W/2-8; s+=16) aCtx.fillRect(x+s, y-10, 7, 20);
      aCtx.strokeStyle='#fff'; aCtx.lineWidth=1; aCtx.shadowBlur=8; aCtx.shadowColor='#fff';
      aCtx.strokeRect(x-LANE_W/2+8, y-10, LANE_W-16, 20);
    } else if(it.kind==='spike'){
      // Spike hazard — low enough to clear with a jump
      aCtx.shadowBlur=14; aCtx.shadowColor='#ff6600';
      aCtx.fillStyle='#ff6600';
      for(let s=-1;s<=1;s++){
        const sx=x+s*22;
        aCtx.beginPath(); aCtx.moveTo(sx,y-14); aCtx.lineTo(sx+9,y+8); aCtx.lineTo(sx-9,y+8);
        aCtx.closePath(); aCtx.fill();
      }
    } else {
      // Data cube — a slowly tumbling wireframe box
      it.spin+=0.06;
      aCtx.translate(x,y); aCtx.rotate(it.spin);
      aCtx.shadowBlur=18; aCtx.shadowColor=eq;
      aCtx.strokeStyle=eq; aCtx.lineWidth=2;
      aCtx.strokeRect(-11,-11,22,22);
      aCtx.fillStyle=hexToRgba(eq,0.28); aCtx.fillRect(-11,-11,22,22);
      aCtx.strokeStyle='rgba(255,255,255,0.85)'; aCtx.lineWidth=1.5;
      aCtx.strokeRect(-5,-5,10,10);
    }
    aCtx.restore();
  }

  function drawRider(){
    const t = jumpT>0 ? 1-jumpT/JUMP_FRAMES : 0;
    const lift = Math.sin(t*Math.PI)*46;
    const y = RIDE_Y-lift, sc = 1+lift/320;
    const col = getEquippedColorHex();

    // Ground shadow shrinks as the bike climbs — the only cue that says
    // "you are airborne" while the sprite itself barely moves on a small board.
    aCtx.save();
    aCtx.globalAlpha=0.34-lift*0.005;
    aCtx.fillStyle='#000';
    aCtx.beginPath(); aCtx.ellipse(visX, RIDE_Y+20, 19-lift*0.16, 5, 0,0,Math.PI*2); aCtx.fill();
    aCtx.restore();

    aCtx.save();
    aCtx.translate(visX,y); aCtx.scale(sc,sc);
    if(invuln>0) aCtx.globalAlpha=0.35+Math.abs(Math.sin(frame*0.4))*0.65;
    // Thruster
    aCtx.shadowBlur=14; aCtx.shadowColor='#ff0090';
    aCtx.fillStyle=Math.random()>0.5?'#ff0090':'#a855f7';
    aCtx.beginPath(); aCtx.moveTo(-7,13); aCtx.lineTo(7,13);
    aCtx.lineTo(0,13+Math.random()*13+(jumpT>0?14:7)); aCtx.closePath(); aCtx.fill();
    // Hull
    aCtx.shadowBlur=18; aCtx.shadowColor=col; aCtx.fillStyle=col;
    aCtx.beginPath();
    aCtx.moveTo(0,-21); aCtx.lineTo(15,9); aCtx.lineTo(7,15);
    aCtx.lineTo(-7,15); aCtx.lineTo(-15,9); aCtx.closePath(); aCtx.fill();
    // Canopy
    aCtx.shadowBlur=6; aCtx.shadowColor='#fff'; aCtx.fillStyle='rgba(255,255,255,.92)';
    aCtx.beginPath(); aCtx.moveTo(0,-12); aCtx.lineTo(5,3); aCtx.lineTo(-5,3); aCtx.closePath(); aCtx.fill();
    aCtx.restore();

    drawSkinBadge(visX, y-32, 13);
  }

  function drawHUD(){
    aCtx.save();
    aCtx.fillStyle='rgba(0,0,0,0.5)'; aCtx.strokeStyle='rgba(255,0,144,0.5)'; aCtx.lineWidth=1;
    aCtx.beginPath(); aCtx.roundRect(8,10,150,26,6); aCtx.fill(); aCtx.stroke();
    aCtx.fillStyle='#ff0090'; aCtx.font='bold 9px Orbitron,monospace';
    aCtx.shadowBlur=6; aCtx.shadowColor='#ff0090';
    aCtx.fillText(`${Math.floor(dist/10)}M`, 15, 27);
    const eq=getEquippedColorHex();
    aCtx.fillStyle=eq; aCtx.shadowColor=eq;
    aCtx.fillText(`◇${cubes}`, 62, 27);
    aCtx.fillStyle='#ffd700'; aCtx.shadowColor='#ffd700';
    aCtx.fillText(`${(speed/BASE_SPEED).toFixed(1)}×`, 110, 27);

    // Hull pips, top-right
    for(let i=0;i<3;i++){
      const on=i<hull;
      aCtx.fillStyle=on?'#39ff14':'rgba(255,255,255,0.14)';
      aCtx.shadowBlur=on?10:0; aCtx.shadowColor='#39ff14';
      aCtx.beginPath(); aCtx.roundRect(W-22-i*18, 14, 13, 13, 3); aCtx.fill();
    }
    aCtx.restore();
  }

  function loop(){
    if(isOver) return;
    gameLoopId=requestAnimationFrame(loop);
    frame++;

    speed=Math.min(MAX_SPEED, speed+RAMP);
    dist+=speed;
    if(jumpT>0) jumpT--;
    if(invuln>0) invuln--;
    visX+=(laneX(lane)-visX)*0.28;

    spawnCd-=speed;
    if(spawnCd<=0){ spawnRow(); spawnCd=152+Math.random()*66; }

    // ── ITEMS & COLLISIONS ──
    for(let i=items.length-1;i>=0;i--){
      const it=items[i];
      it.y+=speed;
      if(it.y>H+44){ items.splice(i,1); continue; }
      if(it.lane!==lane || Math.abs(it.y-RIDE_Y)>HIT_H) continue;

      if(it.kind==='cube'){
        cubes++; setLive(score());
        // Cubes walk a repeating four-note figure rather than one flat blip, so
        // a clean run of them sounds like a phrase instead of a stutter.
        snd('pickup',{semi:[0,4,7,12][cubes%4]});
        const eq=getEquippedColorHex();
        pop(laneX(it.lane), it.y-14, '+30', eq);
        burst(laneX(it.lane), it.y, eq, 9);
        items.splice(i,1);
      } else if(it.kind==='spike' && jumpT>0){
        continue;                                  // cleared it on the hop
      } else if(invuln<=0){
        items.splice(i,1);
        takeHit();
        if(isOver) return;
      }
    }

    if(frame%10===0) setLive(score());

    // ── DRAW ──
    aCtx.clearRect(0,0,W,H);
    aCtx.save();
    if(shake>0){
      aCtx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
      shake*=0.85; if(shake<0.4) shake=0;
    }

    drawTrack();
    const eq=getEquippedColorHex();
    items.forEach(it=>drawItem(it,eq));
    drawRider();

    // No shadowBlur on particles: a blurred shadow is per-pixel work on a board
    // that can be 2× retina, and there can be dozens of these in a frame. The
    // other games draw sparks as flat fills for the same reason.
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy+speed*0.35; p.alpha-=0.035;
      if(p.alpha<=0){ particles.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=p.alpha; aCtx.fillStyle=p.color;
      aCtx.beginPath(); aCtx.arc(p.x,p.y,p.r,0,Math.PI*2); aCtx.fill(); aCtx.restore();
    }
    for(let i=floats.length-1;i>=0;i--){
      const f=floats[i];
      f.y+=f.vy; f.alpha-=0.02;
      if(f.alpha<=0){ floats.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=f.alpha; aCtx.fillStyle=f.color;
      aCtx.font='bold 12px Orbitron,monospace'; aCtx.textAlign='center';
      aCtx.shadowBlur=10; aCtx.shadowColor=f.color;
      aCtx.fillText(f.txt,f.x,f.y); aCtx.restore();
    }

    aCtx.restore();
    drawHUD();
  }
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🔓 GAME 14: NODE HACKER
// ════════════════════════════════════════════
function startHacker(){
  const wrap=document.getElementById('g-hacker');
  wrap.style.display='flex';
  setControlHint('TAP THE NODES IN THE ORDER THEY PULSED',
                 'CLICK NODES · OR THE 1234 / QWER / ASDF / ZXCV KEYPAD');

  const grid=document.getElementById('hack-grid');
  const statusEl=document.getElementById('hack-status');
  const seqEl=document.getElementById('hack-seq');
  // The LEVEL pill in .g-hdr is generic chrome that only Tetris happened to
  // claim first — reused here rather than adding a second identical pill.
  const lvlPill=document.getElementById('tetris-lvl-pill');
  const lvlEl=document.getElementById('tetris-lvl');
  lvlPill.style.display='';

  const diffMod=getDifficultyModifier();
  const KEYS=['1','2','3','4','Q','W','E','R','A','S','D','F','Z','X','C','V'];
  // Each row gets its own neon, so a long key is memorable by colour as well as
  // position. The four are hue-rotations of the equipped Black Market colour —
  // the keypad re-themes on equip while the rows stay distinct from each other.
  // The offsets are the original cyan/pink/lime/gold spacing, which is why the
  // default cyan still reproduces the palette this game shipped with.
  const ROW_COLORS=[0,144,-72,-132].map(d=>shiftHue(getEquippedColorHex(),d));
  const START_LEN=3;
  // Same sequence, less time to burn it in — the honest way to make a memory
  // game harder without making it unfair.
  const FLASH=Math.round(400/diffMod), GAP=Math.round(170/diffMod);
  const time0=Math.round(90*getTimeModifier());

  let level=1, score=0, seq=[], inputIdx=0, phase='play';
  let cleared=0, best=0, time=time0, ended=false;

  document.getElementById('g-time').textContent=time;
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--lime),var(--cyan))';

  // Rebuilding the keypad each round drops the previous round's click handlers
  // with the nodes that carried them — same trick Memory Match uses.
  grid.innerHTML='';
  const nodes=KEYS.map((k,i)=>{
    const n=document.createElement('div');
    n.className='hack-node';
    const c=ROW_COLORS[Math.floor(i/4)];
    n.style.setProperty('--nc', c);
    n.style.setProperty('--nc-soft', hexToRgba(c,0.22));
    n.style.setProperty('--nc-glow', hexToRgba(c,0.30));
    n.innerHTML=`<span class="hack-key">${k}</span>`;
    n.onclick=()=>press(i);
    grid.appendChild(n);
    return n;
  });

  function rnd(){ return Math.floor(Math.random()*16); }
  function setStatus(txt,cls){ statusEl.className='hack-status'+(cls?' '+cls:''); statusEl.textContent=txt; }
  function paintPips(){
    seqEl.innerHTML='';
    seq.forEach((_,i)=>{
      const p=document.createElement('div');
      p.className='hack-pip'+(i<inputIdx?' done':'');
      seqEl.appendChild(p);
    });
  }
  // Every deferred step goes through gLater(), so quitting mid-playback can't
  // leave a stray flash landing on the next round's keypad.
  // Each node carries its own pitch — the mainframe's broadcast is a melody,
  // and replaying it correctly plays that melody back. Getting one wrong is
  // audible before you've read the status line.
  function flash(i,ms){
    nodes[i].classList.add('lit');
    snd('node',{semi:i});
    gLater(()=>nodes[i].classList.remove('lit'), ms);
  }

  function playback(){
    phase='play';
    grid.classList.add('locked');
    inputIdx=0; paintPips();
    setStatus(`▶ BROADCASTING ${seq.length}-NODE KEY…`);
    let t=420;
    seq.forEach(idx=>{
      gLater(()=>{ if(!ended) flash(idx,FLASH); }, t);
      t+=FLASH+GAP;
    });
    gLater(()=>{
      if(ended) return;
      phase='input';
      grid.classList.remove('locked');
      setStatus('◀ REPLICATE THE SEQUENCE');
    }, t+120);
  }

  function nextLevel(){
    if(ended) return;
    // Seeds three at once, then grows by one per cleared level.
    if(!seq.length) for(let i=0;i<START_LEN;i++) seq.push(rnd());
    else seq.push(rnd());
    best=Math.max(best,seq.length);
    lvlEl.textContent=level;
    playback();
  }

  function press(i){
    if(ended || phase!=='input') return;
    if(seq[inputIdx]===i){
      flash(i,190);
      inputIdx++; score+=5; setLive(score); paintPips();
      if(inputIdx===seq.length){
        phase='clear';
        grid.classList.add('locked');
        cleared++;
        const bonus=40+level*12;
        score+=bonus; setLive(score);
        snd('success');
        setStatus(`✅ NODE DECRYPTED · +${bonus} PTS`);
        level++;
        gLater(nextLevel,950);
      }
    } else {
      systemLock(i);
    }
  }

  function systemLock(i){
    phase='lock';
    grid.classList.add('locked');
    nodes[i].classList.add('err');
    snd('error');
    setStatus('⛔ SYSTEM LOCK — INTRUSION TRACED','fail');
    // Show the node it should have been: a lockout you can learn something from.
    gLater(()=>{ if(!ended) flash(seq[inputIdx],700); }, 430);
    gLater(()=>end('locked'),1550);
  }

  window.onkeydown=e=>{
    if(e.ctrlKey||e.metaKey||e.altKey) return;   // don't eat browser shortcuts
    // Neither key is on the keypad, but both fire a focused button, so they get
    // swallowed before the early return rather than leaking out to the UI.
    if(e.code==='Space'||e.code==='Enter') e.preventDefault();
    const idx=KEYS.indexOf(String(e.key).toUpperCase());
    if(idx<0) return;
    e.preventDefault();
    press(idx);
  };

  gTimer=setInterval(()=>{
    if(ended) return;
    time--;
    document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/time0*100}%`;
    if(time<=8 && time>0 && phase==='input'){ setStatus('⚠️ TRACE INCOMING — HURRY','warn'); if(time<=5) snd('tick'); }
    if(time<=0) end('timeout');
  },1000);

  function end(reason){
    if(ended) return; ended=true;
    grid.classList.add('locked');
    const final=Math.min(800,score);
    showResults('hacker',final,{
      '📡 Run Terminated': reason==='timeout'?'TRACE TIMEOUT':'SYSTEM LOCK',
      '🔓 Mainframes Decrypted': cleared,
      '🧠 Longest Key': `${best} NODES`,
      '🏆 Score Accumulation': `${final} PTS`
    });
  }

  setStatus('⚡ UPLINK ESTABLISHED — WATCH THE NODES');
  nextLevel();
}

// ════════════════════════════════════════════
//  ☄️ GAME 15: METEOR SHIELD
// ════════════════════════════════════════════
function startMeteor(){
  document.getElementById('g-canvas-holder').style.display='block';
  setControls(null);   // the board itself is the control — no pad to steal height
  setControlHint('TAP TO BLAST · TAP THE PAD BELOW TO DEPLOY AN ABILITY',
                 'CLICK TO FIRE · ARROWS / WASD AIM · SPACE FIRES · Q/E ABILITY');
  showTouchHint('TAP ANYWHERE TO DETONATE A BLAST');
  fitCanvas();

  const diffMod=getDifficultyModifier();
  const W=BOARD_W, H=BOARD_H;
  const GROUND=H-34;
  // A tighter blast at higher tiers asks for better timing rather than faster
  // tapping — the ammo bank already caps how fast you can fire.
  const BLAST_R=Math.round(62/(1+(diffMod-1)*0.28));
  const MISSILE_V=9.5, AMMO_MAX=8, RELOAD=Math.round(820*diffMod);
  const time0=Math.round(80*getTimeModifier());
  const GLYPHS=['0','1','#','$','%','&','@','?','//','<>','01','ERR'];

  // ── TURRET GEOMETRY ──
  // The barrel pivots on top of the rack. Aim is measured from straight up,
  // positive to the right, and clamped short of horizontal so a battery can
  // never swing far enough to point into its own server stack.
  const PIVOT_Y=GROUND-30, BARREL_L=19, RECOIL_PX=6, AIM_LIMIT=1.32;

  let score=0, time=time0, wave=1, isOver=false, frame=0, shake=0;
  let ammo=AMMO_MAX, reloadT=0, killed=0, bestChain=1;
  let frags=[], missiles=[], blasts=[], particles=[], floats=[];
  let toSpawn=0, spawnT=0, banner=120;
  let retX=W/2, retY=H*0.45, keys={}, lastT=performance.now();

  // aim/recoil/muzzle drive the animation; flash is the existing damage blink.
  const bases=[0.18,0.5,0.82].map(f=>({x:W*f, hp:2, alive:true, flash:0, aim:0, recoil:0, muzzle:0}));

  // ── BATTERY ABILITIES ──
  // One charge per wave purged, cycling the list. Deployed with Q/E or the pad
  // on the ground strip. Effect timers are in frames; the queue caps at three.
  const ABILITIES=[
    { id:'SALVO',  label:'🔥 RAPID SALVO', color:'#ff6600', desc:'AUTO-SALVO FIRING' },
    { id:'AEGIS',  label:'🛡️ AEGIS DOME',  color:'#39ff14', desc:'DOME ABSORBING HITS' },
    { id:'OVER',   label:'⚡ OVERCHARGE',  color:'#ffd700', desc:'WIDE BLASTS · FAST RELOAD' },
    { id:'REPAIR', label:'🔧 NANO-REPAIR', color:'#00f5ff', desc:'SERVER RESTORED' }
  ];
  const ABIL_MAX=3, OVER_FRAMES=420, DOME_FRAMES=420, SALVO_SHOTS=6;
  const DOME_RX=W*0.5, DOME_RY=96;
  const AB_PAD={x:10, y:GROUND+6, w:108, h:22};
  let abilQueue=[], abilEarned=0, activeAbil=null, abilT=0;
  let salvoLeft=0, salvoT=0, domeT=0, overT=0;

  document.getElementById('g-time').textContent=time;
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--orange),var(--gold))';

  const pop=(x,y,txt,color)=>floats.push({x,y,txt,color,alpha:1,vy:-0.9});
  function burst(x,y,color,n){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, v=Math.random()*3.4+1;
      particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,alpha:1,color,r:Math.random()*2+1});
    }
  }

  function startWave(){ toSpawn=5+wave*2; spawnT=0; banner=120; }
  startWave();

  // allowSplit is strictly one generation deep. A child is born BELOW the
  // altitude band splitY is drawn from, so if it were allowed to roll its own
  // split it would fire on the very next frame — and so would its children.
  // That is a branching process, not a weapon: it grows without bound and
  // takes the frame rate with it.
  function spawnFrag(x, y, targetX, allowSplit){
    const alive=bases.filter(b=>b.alive);
    const tx = targetX!=null ? targetX
             : (alive.length ? alive[Math.floor(Math.random()*alive.length)].x : W/2);
    const sp=(1.05+wave*0.11)*diffMod;
    const dx=tx-x, dy=GROUND-y, d=Math.hypot(dx,dy)||1;
    frags.push({
      x, y, ox:x, oy:y, vx:dx/d*sp, vy:dy/d*sp,
      glyph:GLYPHS[Math.floor(Math.random()*GLYPHS.length)],
      // MIRV fragments only show up once the run has warmed up.
      split: !!allowSplit && wave>=3 && Math.random()<0.26,
      splitY: 130+Math.random()*120
    });
  }

  // Launches come from whichever server is nearest the target, so losing a
  // server costs you reach as well as a life.
  function nearestBase(tx){
    const alive=bases.filter(b=>b.alive);
    if(!alive.length) return null;
    let from=alive[0];
    alive.forEach(b=>{ if(Math.abs(b.x-tx)<Math.abs(from.x-tx)) from=b; });
    return from;
  }

  function aimAt(b,tx,ty){
    const a=Math.atan2(tx-b.x, PIVOT_Y-ty);
    return Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, a));
  }
  // recoil is passed rather than read, so a launch can ask for the tip at full
  // extension while the drawing asks for wherever the barrel currently sits.
  function barrelTip(b, recoil){
    const len=BARREL_L-recoil*RECOIL_PX;
    return { x:b.x+Math.sin(b.aim)*len, y:PIVOT_Y-Math.cos(b.aim)*len };
  }

  // Overcharge widens every blast and cuts the reload; both are read through
  // these so the buff can't drift out of sync with the HUD that reports it.
  const blastR  = () => overT>0 ? BLAST_R*1.7 : BLAST_R;
  const reloadMs= () => overT>0 ? RELOAD*0.35 : RELOAD;

  function inDome(x,y){
    if(y>GROUND) return false;
    const nx=(x-W/2)/DOME_RX, ny=(y-GROUND)/DOME_RY;
    return nx*nx+ny*ny<=1;
  }

  // free shots come from RAPID SALVO and skip the ammo bank.
  function fire(tx,ty,free){
    if(isOver) return;
    if(!free && ammo<=0){ snd('deny'); pop(tx,ty,'RELOADING','#ff2442'); return; }
    const from=nearestBase(tx);
    if(!from) return;
    if(!free) ammo--;
    snd('missile');
    // Snap the firing battery onto the shot before measuring the muzzle. A tap
    // can beat the idle tracking to a target, and a missile leaving the side of
    // a barrel is the one thing that would give the animation away.
    from.aim=aimAt(from,tx,ty);
    const tip=barrelTip(from, 0);
    from.recoil=1; from.muzzle=1;
    shake=Math.max(shake,3);
    const sx=tip.x, sy=tip.y, d=Math.hypot(tx-sx,ty-sy)||1;
    missiles.push({x:sx,y:sy,sx,sy,tx,ty,vx:(tx-sx)/d*MISSILE_V,vy:(ty-sy)/d*MISSILE_V});
    burst(sx,sy,'#ffd700',4);
  }

  function detonate(x,y,r,chain){
    blasts.push({x,y,r:2,max:r,grow:true,chain:chain||0});
    shake=Math.max(shake,6);
    // Secondary detonations in a chain are quieter and higher than the shot
    // that started them, so a big cluster reads as one rolling blast.
    snd(chain ? 'explode' : 'bigExplode');
    burst(x,y,getEquippedColorHex(),8);
  }

  function grantAbility(){
    // A full bank loses the wave's charge, but the rotation does NOT advance —
    // otherwise hoarding could skip you past NANO-REPAIR entirely, which is the
    // one charge you most want available when a rack is already down.
    if(abilQueue.length>=ABIL_MAX) return;
    const a=ABILITIES[abilEarned % ABILITIES.length];
    abilEarned++;
    abilQueue.push(a);
    pop(W/2, H*0.47, `${a.label} READY`, a.color);
  }

  function deployAbility(){
    if(isOver || !abilQueue.length) return;
    const a=abilQueue.shift();
    activeAbil=a; abilT=170;
    shake=Math.max(shake,7);
    snd(a.id==='REPAIR' ? 'heal' : a.id==='AEGIS' ? 'shield' : 'ability');
    pop(W/2, H*0.34, a.label, a.color);

    if(a.id==='SALVO'){ salvoLeft=SALVO_SHOTS; salvoT=0; }
    else if(a.id==='AEGIS'){ domeT=DOME_FRAMES; }
    else if(a.id==='OVER'){ overT=OVER_FRAMES; ammo=AMMO_MAX; reloadT=0; }
    else if(a.id==='REPAIR'){
      // Revive a downed rack first, else patch the most damaged one. If every
      // rack is already full the charge refills the ammo bank rather than
      // silently doing nothing.
      const dead=bases.find(b=>!b.alive);
      const hurt=bases.filter(b=>b.alive && b.hp<2).sort((p,q)=>p.hp-q.hp)[0];
      if(dead){
        dead.alive=true; dead.hp=1; dead.flash=24; dead.aim=0; dead.recoil=0; dead.muzzle=0;
        pop(dead.x, GROUND-46, 'SERVER ONLINE', '#39ff14');
        burst(dead.x, GROUND-14, '#39ff14', 20);
      } else if(hurt){
        hurt.hp=2; hurt.flash=24;
        pop(hurt.x, GROUND-46, 'SHIELD RESTORED', '#39ff14');
        burst(hurt.x, GROUND-14, '#39ff14', 16);
      } else {
        ammo=AMMO_MAX; reloadT=0;
        pop(W/2, H*0.4, 'AMMO BANK REFILLED', '#39ff14');
      }
    }
  }

  const inAbilPad=(px,py)=>px>=AB_PAD.x && px<=AB_PAD.x+AB_PAD.w
                        && py>=AB_PAD.y && py<=AB_PAD.y+AB_PAD.h;

  bindCanvasDrag({
    onDown(p){
      hideTouchHint();
      // The pad sits in the ground strip — terrain, not airspace. A blast down
      // there is worthless anyway, so claiming those taps costs no shots.
      if(inAbilPad(p.x,p.y)){ if(abilQueue.length) deployAbility(); return; }
      retX=p.x; retY=p.y; fire(p.x,p.y);
    },
    onHover(p){ if(!isTouchDevice){ retX=p.x; retY=p.y; } }
  });

  window.onkeydown=e=>{
    if(['Space','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
    keys[e.code]=true;
    if(e.code==='Space'||e.code==='Enter') fire(retX,retY);
    if(!e.repeat && (e.code==='KeyQ'||e.code==='KeyE')) deployAbility();
  };
  window.onkeyup=e=>{ keys[e.code]=false; };

  gTimer=setInterval(()=>{
    if(isOver) return;
    time--;
    document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/time0*100}%`;
    if(time<=5&&time>0) snd('tick');
    if(time<=0) end('timeout');
  },1000);

  function end(reason){
    if(isOver) return; isOver=true;
    const aliveN=bases.filter(b=>b.alive).length;
    const survive=aliveN*70;
    const final=Math.min(1100, score+survive);
    showResults('meteor',final,{
      '📡 Run Terminated': reason==='overrun'?'ALL SERVERS DOWN':'MISSION CLOCK EXPIRED',
      '☄️ Fragments Purged': killed,
      '🌊 Wave Reached': wave,
      '💥 Best Chain': `${bestChain}×`,
      '🖥️ Servers Intact': `${aliveN} (+${survive})`,
      '🏆 Score Accumulation': `${final} PTS`
    });
  }

  function damageBase(b){
    b.hp--; b.flash=20; shake=18;
    burst(b.x,GROUND-10,'#ff2442',22);
    if(b.hp<=0){
      b.alive=false;
      snd('gameOver');
      pop(b.x,GROUND-40,'SERVER LOST','#ff2442');
      if(!bases.some(s=>s.alive)) end('overrun');
    } else {
      snd('hurt');
      pop(b.x,GROUND-40,'SHIELD DOWN','#ff6600');
    }
  }

  function drawBase(b){
    aCtx.save();
    const x=b.x;
    if(!b.alive){
      // Wreckage: a dead rack still marks the position you failed to hold
      aCtx.fillStyle='rgba(60,60,70,0.85)';
      aCtx.beginPath(); aCtx.moveTo(x-22,GROUND); aCtx.lineTo(x-12,GROUND-14);
      aCtx.lineTo(x+6,GROUND-8); aCtx.lineTo(x+22,GROUND); aCtx.closePath(); aCtx.fill();
      if(frame%7===0) particles.push({x:x+(Math.random()-0.5)*20,y:GROUND-12,vx:(Math.random()-0.5)*0.6,vy:-0.9,alpha:0.5,color:'#555',r:3});
      aCtx.restore(); return;
    }
    const hurt=b.hp<=1;
    const col=b.flash>0 ? '#fff' : (hurt?'#ff6600':'#39ff14');
    aCtx.shadowBlur=hurt?18:12; aCtx.shadowColor=col;
    aCtx.fillStyle='rgba(10,14,26,0.95)';
    aCtx.beginPath(); aCtx.roundRect(x-22,GROUND-30,44,30,4); aCtx.fill();
    aCtx.strokeStyle=col; aCtx.lineWidth=2; aCtx.stroke();
    // Rack LEDs
    for(let r=0;r<3;r++){
      const on = !hurt || (frame+r*9)%26<15;
      aCtx.fillStyle = on ? col : 'rgba(255,255,255,0.1)';
      aCtx.fillRect(x-16, GROUND-25+r*8, 32, 4);
    }
    aCtx.restore();

    // ── TURRET ──
    // Everything below rides in the barrel's own rotated frame, so the recoil
    // slide and the muzzle flare stay true to the aim at any angle.
    const kick=b.recoil*RECOIL_PX;
    const tipY=-BARREL_L+kick;
    aCtx.save();
    aCtx.translate(x, PIVOT_Y);
    aCtx.rotate(b.aim);

    // Barrel — dark body, lit edge, muzzle collar at the tip
    aCtx.shadowBlur=hurt?14:9; aCtx.shadowColor=col;
    aCtx.fillStyle='rgba(10,14,26,0.95)';
    aCtx.beginPath(); aCtx.roundRect(-3.5, tipY, 7, BARREL_L, 2); aCtx.fill();
    aCtx.strokeStyle=col; aCtx.lineWidth=1.5; aCtx.stroke();
    aCtx.fillStyle=col;
    aCtx.fillRect(-4.5, tipY, 9, 3);

    // Muzzle flare — a bright cone that collapses back into the barrel
    if(b.muzzle>0.02){
      aCtx.globalAlpha=b.muzzle;
      aCtx.shadowBlur=20; aCtx.shadowColor='#ffd700';
      aCtx.fillStyle='#fff';
      aCtx.beginPath();
      aCtx.moveTo(0, tipY-14*b.muzzle);
      aCtx.lineTo(7*b.muzzle, tipY+3);
      aCtx.lineTo(-7*b.muzzle, tipY+3);
      aCtx.closePath(); aCtx.fill();
      aCtx.globalAlpha=1;
    }
    aCtx.restore();

    // Yoke sits outside the rotation so the pivot itself never appears to spin
    aCtx.save();
    aCtx.shadowBlur=hurt?12:8; aCtx.shadowColor=col;
    aCtx.fillStyle='rgba(10,14,26,0.95)';
    aCtx.beginPath(); aCtx.arc(x, PIVOT_Y, 6, 0, Math.PI*2); aCtx.fill();
    aCtx.strokeStyle=col; aCtx.lineWidth=1.5; aCtx.stroke();
    aCtx.restore();

    if(b.flash>0) b.flash--;
  }

  function drawHUD(){
    aCtx.save();
    aCtx.fillStyle='rgba(0,0,0,0.5)'; aCtx.strokeStyle='rgba(255,102,0,0.5)'; aCtx.lineWidth=1;
    aCtx.beginPath(); aCtx.roundRect(8,10,132,26,6); aCtx.fill(); aCtx.stroke();
    aCtx.fillStyle='#ff6600'; aCtx.font='bold 9px Orbitron,monospace';
    aCtx.shadowBlur=6; aCtx.shadowColor='#ff6600';
    aCtx.fillText(`WAVE ${wave}`, 15, 27);
    aCtx.fillStyle='#ffd700'; aCtx.shadowColor='#ffd700';
    aCtx.fillText(`☄ ${killed}`, 78, 27);

    // Ammo pips — the whole tactical constraint in one row
    const eq=getEquippedColorHex();
    for(let i=0;i<AMMO_MAX;i++){
      const on=i<ammo;
      aCtx.fillStyle=on?eq:'rgba(255,255,255,0.13)';
      aCtx.shadowBlur=on?8:0; aCtx.shadowColor=eq;
      aCtx.beginPath(); aCtx.roundRect(W-16-i*15, 14, 9, 16, 2); aCtx.fill();
    }
    // Partial recharge on the next empty slot
    if(ammo<AMMO_MAX){
      aCtx.fillStyle=hexToRgba(eq,0.45); aCtx.shadowBlur=0;
      const h=16*Math.min(1, reloadT/reloadMs());
      aCtx.fillRect(W-16-ammo*15, 30-h, 9, h);
    }

    // Active-effect chips, stacked under the wave box
    let cy=44;
    const chip=(txt,frac,color)=>{
      aCtx.shadowBlur=0;
      aCtx.fillStyle='rgba(0,0,0,0.45)';
      aCtx.beginPath(); aCtx.roundRect(8,cy,104,13,4); aCtx.fill();
      aCtx.fillStyle=hexToRgba(color,0.30);
      aCtx.beginPath(); aCtx.roundRect(8,cy,104*Math.max(0,Math.min(1,frac)),13,4); aCtx.fill();
      aCtx.fillStyle=color; aCtx.font='bold 7px Orbitron,monospace';
      aCtx.fillText(txt, 13, cy+9);
      cy+=16;
    };
    if(overT>0)     chip('⚡ OVERCHARGE', overT/OVER_FRAMES, '#ffd700');
    if(domeT>0)     chip('🛡 AEGIS DOME', domeT/DOME_FRAMES, '#39ff14');
    if(salvoLeft>0) chip(`🔥 SALVO ×${salvoLeft}`, salvoLeft/SALVO_SHOTS, '#ff6600');
    aCtx.restore();
  }

  // ── ABILITY PAD ──
  // Lives in the ground strip so it costs the playfield no height, and reads as
  // part of the installation rather than an overlay.
  function drawAbilityPad(){
    const next=abilQueue[0] || null;
    const col=next ? next.color : 'rgba(255,255,255,0.20)';
    const pulse=next ? 0.55+Math.sin(frame*0.13)*0.45 : 0;
    aCtx.save();
    aCtx.fillStyle='rgba(0,0,0,0.55)';
    aCtx.strokeStyle=col; aCtx.lineWidth=1.5;
    if(next){ aCtx.shadowBlur=14*pulse; aCtx.shadowColor=next.color; }
    aCtx.beginPath(); aCtx.roundRect(AB_PAD.x,AB_PAD.y,AB_PAD.w,AB_PAD.h,6);
    aCtx.fill(); aCtx.stroke();
    aCtx.shadowBlur=0;

    aCtx.textAlign='center'; aCtx.textBaseline='middle';
    aCtx.fillStyle=col; aCtx.font='bold 8px Orbitron,monospace';
    aCtx.fillText(next ? next.label : 'NO CHARGE', AB_PAD.x+AB_PAD.w/2, AB_PAD.y+8);
    aCtx.fillStyle=next ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)';
    aCtx.font='bold 6px Orbitron,monospace';
    aCtx.fillText(next ? (isTouchDevice?'TAP TO DEPLOY':'CLICK OR [Q]') : 'CLEAR A WAVE',
                  AB_PAD.x+AB_PAD.w/2, AB_PAD.y+16);

    // Queued charges beyond the one on deck
    for(let i=1;i<abilQueue.length;i++){
      aCtx.fillStyle=abilQueue[i].color;
      aCtx.beginPath(); aCtx.arc(AB_PAD.x+AB_PAD.w+7+(i-1)*9, AB_PAD.y+AB_PAD.h/2, 3, 0, Math.PI*2);
      aCtx.fill();
    }
    aCtx.restore();
  }

  function loop(now){
    if(isOver) return;
    gameLoopId=requestAnimationFrame(loop);
    const dt=Math.min(50, now-lastT); lastT=now;
    frame++;
    // Everything the player owns — reticle, missiles, blast core, kill sparks —
    // is drawn in the equipped Black Market colour. Incoming fragments keep their
    // fixed red and the servers their green, so a loud cosmetic can never make a
    // threat or a dying base harder to read.
    const eq=getEquippedColorHex();

    // Reticle steering for keyboard players
    const RS=7;
    if(keys['ArrowLeft'] ||keys['KeyA']) retX-=RS;
    if(keys['ArrowRight']||keys['KeyD']) retX+=RS;
    if(keys['ArrowUp']   ||keys['KeyW']) retY-=RS;
    if(keys['ArrowDown'] ||keys['KeyS']) retY+=RS;
    retX=Math.max(8,Math.min(W-8,retX)); retY=Math.max(8,Math.min(GROUND-14,retY));

    if(ammo<AMMO_MAX){
      reloadT+=dt;
      if(reloadT>=reloadMs()){ ammo++; reloadT=0; }
    }
    if(banner>0) banner--;

    // ── TURRETS ──
    // Idle batteries ease onto the reticle so the guns are always looking where
    // you are; recoil and muzzle flare decay on their own clocks.
    bases.forEach(b=>{
      if(!b.alive) return;
      b.aim += (aimAt(b,retX,retY)-b.aim)*0.18;
      b.recoil*=0.82; if(b.recoil<0.01) b.recoil=0;
      b.muzzle*=0.74; if(b.muzzle<0.02) b.muzzle=0;
    });

    // ── ABILITY TIMERS ──
    if(abilT>0){ abilT--; if(!abilT) activeAbil=null; }
    if(overT>0) overT--;
    if(domeT>0) domeT--;
    if(salvoLeft>0){
      salvoT+=dt;
      // Shots stay banked while the sky is empty rather than firing into
      // nothing, so a salvo deployed on the last fragment isn't wasted.
      if(salvoT>=130 && frags.length){
        salvoT=0;
        let target=frags[0];
        frags.forEach(f=>{ if(f.y>target.y) target=f; });   // lowest = closest to landing
        const src=nearestBase(target.x);
        if(src){
          // Lead the shot, or an auto-salvo mostly detonates behind its marks.
          const t=Math.hypot(target.x-src.x, target.y-PIVOT_Y)/MISSILE_V;
          const lx=Math.max(10, Math.min(W-10, target.x+target.vx*t));
          const ly=Math.max(14, Math.min(GROUND-8, target.y+target.vy*t));
          fire(lx,ly,true);
          salvoLeft--;
        }
      }
    }

    // ── SPAWNING ──
    spawnT+=dt;
    const interval=Math.max(360, 1150-wave*70)/diffMod;
    if(toSpawn>0 && spawnT>=interval && banner<=0){
      spawnT=0; toSpawn--;
      spawnFrag(Math.random()*(W-40)+20, -16, null, true);
    }
    if(toSpawn===0 && !frags.length && !missiles.length){
      const bonus=40+wave*20;
      score+=bonus; setLive(score);
      snd('wave');
      pop(W/2,H*0.4,`WAVE ${wave} PURGED +${bonus}`,'#39ff14');
      grantAbility();
      wave++; startWave();
    }

    // ── MISSILES ──
    for(let i=missiles.length-1;i>=0;i--){
      const m=missiles[i];
      m.x+=m.vx; m.y+=m.vy;
      if(Math.hypot(m.tx-m.x, m.ty-m.y)<=MISSILE_V){
        detonate(m.tx,m.ty,blastR(),0);
        missiles.splice(i,1);
      }
    }

    // ── FRAGMENTS ──
    for(let i=frags.length-1;i>=0;i--){
      const f=frags[i];
      f.x+=f.vx; f.y+=f.vy;
      if(f.split && f.y>f.splitY){
        f.split=false;
        const alive=bases.filter(b=>b.alive);
        for(let k=0;k<2;k++){
          const t=alive.length?alive[Math.floor(Math.random()*alive.length)].x:W/2;
          spawnFrag(f.x, f.y, t, false);
        }
        burst(f.x,f.y,'#a855f7',10);
      }
      // Aegis burns anything that reaches the dome. The test is the same
      // ellipse the dome is drawn from, so the barrier stops exactly where it
      // looks like it stops.
      if(domeT>0 && inDome(f.x,f.y)){
        burst(f.x,f.y,'#39ff14',12);
        snd('hit');
        score+=10; killed++; setLive(score);
        pop(f.x,f.y-12,'+10','#39ff14');
        frags.splice(i,1);
        continue;
      }
      if(f.y>=GROUND){
        burst(f.x,GROUND,'#ff6600',14);
        const hit=bases.find(b=>b.alive && Math.abs(b.x-f.x)<28);
        if(hit) damageBase(hit); else shake=Math.max(shake,6);
        frags.splice(i,1);
        if(isOver) return;
      }
    }

    // ── BLASTS ──
    for(let i=blasts.length-1;i>=0;i--){
      const b=blasts[i];
      if(b.grow){ b.r+=3.4; if(b.r>=b.max) b.grow=false; }
      else { b.r-=2.2; if(b.r<=0){ blasts.splice(i,1); continue; } }

      for(let j=frags.length-1;j>=0;j--){
        const f=frags[j];
        if(Math.hypot(f.x-b.x, f.y-b.y)>b.r) continue;
        b.chain++;
        bestChain=Math.max(bestChain,b.chain);
        snd('combo',{semi:Math.min(12,b.chain-1)});
        // Each extra kill inside one blast is worth more than the last, so
        // waiting for a cluster beats swatting fragments one at a time.
        const pts=20*b.chain;
        score+=pts; killed++; setLive(score);
        pop(f.x,f.y,`+${pts}`, b.chain>1?'#ffd700':eq);
        burst(f.x,f.y,eq,10);
        frags.splice(j,1);
        // Secondary detonation keeps the chain rolling outward, Missile-Command style
        detonate(f.x,f.y,blastR()*0.62,b.chain);
      }
    }

    // ── DRAW ──
    aCtx.clearRect(0,0,W,H);
    aCtx.save();
    if(shake>0){
      aCtx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
      shake*=0.86; if(shake<0.4) shake=0;
    }

    aCtx.strokeStyle='rgba(255,102,0,0.05)'; aCtx.lineWidth=1;
    for(let x=0;x<=W;x+=40){aCtx.beginPath();aCtx.moveTo(x,0);aCtx.lineTo(x,H);aCtx.stroke();}
    for(let y=0;y<=H;y+=40){aCtx.beginPath();aCtx.moveTo(0,y);aCtx.lineTo(W,y);aCtx.stroke();}

    // Ground
    aCtx.fillStyle='rgba(255,102,0,0.09)'; aCtx.fillRect(0,GROUND,W,H-GROUND);
    aCtx.strokeStyle='rgba(255,102,0,0.55)'; aCtx.lineWidth=2;
    aCtx.shadowBlur=12; aCtx.shadowColor='#ff6600';
    aCtx.beginPath(); aCtx.moveTo(0,GROUND); aCtx.lineTo(W,GROUND); aCtx.stroke();
    aCtx.shadowBlur=0;

    bases.forEach(drawBase);

    // Aegis dome — drawn from the same ellipse inDome() tests against
    if(domeT>0){
      const fade=Math.min(1, domeT/50);
      const pulse=0.45+Math.sin(frame*0.16)*0.13;
      aCtx.save();
      aCtx.beginPath(); aCtx.ellipse(W/2,GROUND,DOME_RX,DOME_RY,0,Math.PI,Math.PI*2);
      aCtx.closePath();
      aCtx.fillStyle=`rgba(57,255,20,${fade*0.07})`; aCtx.fill();
      aCtx.strokeStyle=`rgba(57,255,20,${fade*pulse})`; aCtx.lineWidth=2.5;
      aCtx.shadowBlur=20; aCtx.shadowColor='#39ff14';
      aCtx.stroke();
      aCtx.restore();
    }

    // Fragment trails + heads
    frags.forEach(f=>{
      aCtx.save();
      aCtx.strokeStyle='rgba(255,36,66,0.32)'; aCtx.lineWidth=1.5;
      aCtx.setLineDash([5,5]);
      aCtx.beginPath(); aCtx.moveTo(f.ox,f.oy); aCtx.lineTo(f.x,f.y); aCtx.stroke();
      aCtx.setLineDash([]);
      aCtx.shadowBlur=14; aCtx.shadowColor='#ff2442';
      aCtx.fillStyle='#ff2442'; aCtx.font='bold 13px Orbitron,monospace';
      aCtx.textAlign='center'; aCtx.textBaseline='middle';
      aCtx.fillText(f.glyph,f.x,f.y);
      aCtx.restore();
    });

    // Missiles
    missiles.forEach(m=>{
      aCtx.save();
      aCtx.strokeStyle=hexToRgba(eq,0.5); aCtx.lineWidth=2;
      aCtx.shadowBlur=10; aCtx.shadowColor=eq;
      aCtx.beginPath(); aCtx.moveTo(m.sx,m.sy); aCtx.lineTo(m.x,m.y); aCtx.stroke();
      aCtx.fillStyle='#fff';
      aCtx.beginPath(); aCtx.arc(m.x,m.y,3,0,Math.PI*2); aCtx.fill();
      // Target marker
      aCtx.strokeStyle=hexToRgba(eq,0.35); aCtx.lineWidth=1;
      aCtx.beginPath(); aCtx.arc(m.tx,m.ty,5,0,Math.PI*2); aCtx.stroke();
      aCtx.restore();
    });

    // Blasts
    blasts.forEach(b=>{
      aCtx.save();
      const g=aCtx.createRadialGradient(b.x,b.y,0,b.x,b.y,Math.max(1,b.r));
      g.addColorStop(0,'rgba(255,255,255,0.95)');
      g.addColorStop(0.45,hexToRgba(eq,0.55));
      g.addColorStop(1,hexToRgba(eq,0));
      aCtx.fillStyle=g;
      aCtx.beginPath(); aCtx.arc(b.x,b.y,Math.max(1,b.r),0,Math.PI*2); aCtx.fill();
      aCtx.strokeStyle='rgba(255,255,255,0.7)'; aCtx.lineWidth=1.5;
      aCtx.stroke();
      aCtx.restore();
    });

    // Reticle
    aCtx.save();
    aCtx.strokeStyle=hexToRgba(eq,0.75); aCtx.lineWidth=1.5;
    aCtx.shadowBlur=10; aCtx.shadowColor=eq;
    aCtx.beginPath(); aCtx.arc(retX,retY,11,0,Math.PI*2); aCtx.stroke();
    aCtx.beginPath();
    aCtx.moveTo(retX-17,retY); aCtx.lineTo(retX-5,retY);
    aCtx.moveTo(retX+5,retY);  aCtx.lineTo(retX+17,retY);
    aCtx.moveTo(retX,retY-17); aCtx.lineTo(retX,retY-5);
    aCtx.moveTo(retX,retY+5);  aCtx.lineTo(retX,retY+17);
    aCtx.stroke();
    aCtx.restore();

    // Flat fills, no per-particle shadowBlur — see the note in Cyber Runner.
    // A dense wave here can put a hundred sparks on screen at once.
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.alpha-=0.03;
      if(p.alpha<=0){ particles.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=p.alpha; aCtx.fillStyle=p.color;
      aCtx.beginPath(); aCtx.arc(p.x,p.y,p.r,0,Math.PI*2); aCtx.fill(); aCtx.restore();
    }
    for(let i=floats.length-1;i>=0;i--){
      const f=floats[i];
      f.y+=f.vy; f.alpha-=0.018;
      if(f.alpha<=0){ floats.splice(i,1); continue; }
      aCtx.save(); aCtx.globalAlpha=f.alpha; aCtx.fillStyle=f.color;
      aCtx.font='bold 12px Orbitron,monospace'; aCtx.textAlign='center';
      aCtx.shadowBlur=10; aCtx.shadowColor=f.color;
      aCtx.fillText(f.txt,f.x,f.y); aCtx.restore();
    }

    aCtx.restore();
    drawHUD();
    drawAbilityPad();

    if(activeAbil){
      aCtx.save();
      aCtx.globalAlpha=Math.min(1, abilT/30);
      aCtx.fillStyle=activeAbil.color; aCtx.font='bold 10px Orbitron,monospace';
      aCtx.textAlign='center'; aCtx.shadowBlur=12; aCtx.shadowColor=activeAbil.color;
      aCtx.fillText(`ACTIVE: ${activeAbil.desc}`, W/2, 56);
      aCtx.restore();
    }

    if(banner>0){
      aCtx.save();
      aCtx.globalAlpha=Math.min(1,banner/40);
      aCtx.fillStyle='#ff6600'; aCtx.font='bold 22px Orbitron,monospace';
      aCtx.textAlign='center'; aCtx.shadowBlur=18; aCtx.shadowColor='#ff6600';
      aCtx.fillText(`WAVE ${wave}`, W/2, H*0.42);
      aCtx.fillStyle='rgba(255,255,255,0.7)'; aCtx.font='bold 10px Orbitron,monospace';
      aCtx.fillText('INCOMING MALICIOUS CODE', W/2, H*0.42+22);
      aCtx.restore();
    }
  }
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  🤖 GAME 16: BATTLE BOTS — LANE SIEGE
// ════════════════════════════════════════════
// A side-scrolling lane defence. RAM accrues on its own, you spend it on bots
// that walk right under their own power, and the two fronts brawl wherever
// they happen to meet. Bring The Glitch down before it breaches the Mainframe.
//
// The game owns no timers of its own: the siege clock is gTimer, the battle
// loop is gameLoopId, deferred effects go through gLater() and the keyboard
// lives on window.onkeydown — all four are torn down by stopGame(), which also
// empties the deploy deck. Quitting therefore leaves nothing of this running.
//
// The BB* consts below are initialised at load time and read BOARD_W, so they
// have to stay below its declaration — which is why the whole game sits here
// with the other start* functions rather than at the top of the file.
// ── TUNING ──
// Everything that decides how the siege feels lives here, so balancing never
// means reading the simulation.
const BB = {
  baseHP: 1000,

  // Bases are fortified: a bot that reaches one deals only this fraction of its
  // damage there. Without it, whoever's first blob gets across simply wins —
  // four Scouts would delete a 1000 HP base in ten seconds and the siege would
  // never become a siege. It's deliberately low, and paired with player units
  // that clearly out-duel their counterparts: together those two make the
  // battle's LENGTH come from chewing through a fixed 1000 HP, which is linear
  // and predictable, rather than from wherever the lane's attrition equilibrium
  // happens to settle — a knife edge where an 8% enemy buff is the difference
  // between a reliable win and a permanent midfield stall. This is the dial to
  // turn for battle length; unit-vs-unit combat is balanced on its own terms.
  siege: 0.30,

  // Edge gap a unit keeps behind the ally in front of it in its own lane.
  // Without this queueing, both sides' units occupy the same x and the WHOLE
  // stack attacks the single front enemy at once — army size then multiplies
  // damage instead of adding depth, and the larger stack wins every fight with
  // no losses at all. Queued, each lane resolves as a duel and reinforcements
  // matter because they step up when the unit in front dies.
  spacing: 3,

  // Economy. Bots are cheap enough to feel disposable; the upgrade is a real
  // decision, costing several Tanks up front to pay off over the whole siege.
  ram:      { start: 80, cap: 999, rate: 20, step: 8, tiers: [150, 260, 420, 700] },

  // Player units. `reach` is the EDGE gap at which a unit stops and swings, so
  // small numbers read as melee — the two sprites end up nearly touching.
  // A Scout beats a lone BUG comfortably: the early game has to let you push
  // the line forward, or there's no siege to fight back from later.
  units: {
    scout: { key:'scout', icon:'🤖', name:'SCOUT', cost:30,  hp:110, atk:14, speed:40, reach:8,  rate:520, cool:800,  w:22, h:26 },
    tank:  { key:'tank',  icon:'🛡️', name:'TANK',  cost:110, hp:380, atk:30, speed:22, reach:12, rate:950, cool:2400, w:30, h:34 }
  },

  // Hostiles. `from` is the elapsed second at which the type joins the spawn
  // pool, and `bounty` is the RAM a kill pays back — pushing the front line
  // forward is how you part-fund the next push. Bounties stay well under what
  // the kill cost you: paying for itself turns a winning Scout into free
  // reinforcement and the battle snowballs out of the player's hands.
  foes: {
    bug:   { key:'bug',   icon:'🐛', name:'BUG',      hp:70,  atk:10, speed:34, reach:8,  rate:620,  w:22, h:24, color:'#ff0090', from:0,   bounty:5  },
    virus: { key:'virus', icon:'🦠', name:'VIRUS',    hp:170, atk:18, speed:22, reach:10, rate:880,  w:28, h:30, color:'#a855f7', from:45,  bounty:12 },
    worm:  { key:'worm',  icon:'🪱', name:'WORM.EXE', hp:430, atk:34, speed:16, reach:12, rate:1150, w:34, h:38, color:'#ff2442', from:105, bounty:28 }
  },

  // Siege clock. Fixed across all three stability tiers — see startBattleBots().
  seconds: 240,

  // Waves start lazy and tighten as the siege drags on.
  // Three duelling lanes can only chew through roughly one hostile per second,
  // so spawning faster than that just banks an unkillable queue off-screen and
  // the siege is decided by a backlog the player never sees. This ramps from
  // ~0.3/s to ~1.3/s: comfortably under the front's throughput early, over it
  // by the end, which is what makes the late clock genuinely tense.
  wave: { first: 3000, start: 3500, floor: 2200, tighten: 4, burst: 300 },

  // 550 + 400 + 250 tops out at exactly the 1200 cap. The time bonus pays in
  // full for winning with `timeFull` of the clock still on it rather than
  // scaling all the way from an unreachable zero-second purge — a real siege
  // takes ~170s, so a linear scale would have quietly capped the game at ~1030
  // and made the card's "UP TO 1200" a lie. A loss still banks up to 400 for
  // the damage you did put through; a near-miss shouldn't pay nothing.
  score: { win: 550, hpBonus: 400, timeBonus: 250, timeFull: 0.55, lossMax: 400, cap: 1200 }
};

// ── GEOMETRY ── (all in the engine's 560×500 board units)
const BB_GROUND = 402;                      // the lane the units walk on
const BB_TOWER_W = 68, BB_TOWER_H = 104;
const BB_P_TOWER = 6, BB_E_TOWER = BOARD_W - 6 - BB_TOWER_W;
const BB_P_SPAWN = 86, BB_E_SPAWN = BOARD_W - 86;
const BB_P_LINE = 90, BB_E_LINE = BOARD_W - 90;   // where a unit starts hitting a base
const BB_LANES = [-14, 0, 14];              // visual stagger, so a stack of four still reads

function startBattleBots(){
  const holder = document.getElementById('g-canvas-holder');
  const deck   = document.getElementById('bb-deck');
  const ramPill= document.getElementById('bb-ram-pill');
  const ramEl  = document.getElementById('bb-ram');
  const progEl = document.getElementById('prog-fill');
  const timeEl = document.getElementById('g-time');

  holder.style.display = 'block';
  deck.style.display   = 'flex';
  ramPill.style.display= '';
  setControls(null);              // the deck IS the control pad — no arrows to show
  setControlHint('TAP A CARD TO DEPLOY · YOUR BOTS ADVANCE ON THEIR OWN',
                 'CLICK A CARD OR PRESS 1 / 2 / 3 · YOUR BOTS ADVANCE ON THEIR OWN');
  showTouchHint('TAP THE CARDS BELOW TO DEPLOY');

  const diffMod = getDifficultyModifier();
  // ── HOW THE STABILITY TIER APPLIES HERE ──
  // A lane battle is an attrition race with a TIPPING POINT, not a dial: either
  // your side out-trades theirs and the front walks forward, or it doesn't and
  // the game stalls at midfield until the clock runs out. Outcomes either side
  // of that point are bimodal — clean win or dead stall, very little between —
  // so the tier gets ONE gentle penalty applied three ways rather than several
  // stacked ones. Stacking tougher hostiles, more of them, less RAM AND less
  // time (each modest alone) put both hard tiers so far past the tipping point
  // that they were unwinnable at any skill level, which made the ×1.5 / ×2.0
  // payout — the entire reason the tiers exist — impossible to collect.
  //
  // Two deliberate omissions:
  //  · No RAM cut. Extra income doesn't move a stalled front, it just lengthens
  //    the queue behind it, so throttling income cost the player nothing they
  //    could feel and bought no real difficulty.
  //  · No time cut. Alone among the hub's games, this one's win condition is a
  //    race the clock can put out of reach outright rather than merely scoring
  //    lower — a halved Meltdown clock left 120s for a ~170s siege.
  const foeHpScale  = 1 + (diffMod - 1) * 0.16;  // 1.00 / 1.08 / 1.16
  const foeAtkScale = 1 + (diffMod - 1) * 0.16;
  const waveScale   = 1 + (diffMod - 1) * 0.16;
  const TOTAL = BB.seconds;

  // Player colours follow the Black Market equip, the way every other game's
  // player sprite does. The Tank is a hue-rotation of it rather than a fixed
  // second colour, so the pair always reads as one faction.
  const pColor = getEquippedColorHex();
  const tColor = shiftHue(pColor, 42);
  const colorOf = { scout: pColor, tank: tColor };

  let ram = BB.ram.start, ramRate = BB.ram.rate, upgIdx = 0;
  let mainHP = BB.baseHP, glitchHP = BB.baseHP;
  let bots = [], foes = [], parts = [];
  let pLane = 0, eLane = 0;         // round-robin, so a deploy spreads your force
  let elapsed = 0, time = TOTAL, waveNo = 0, waveT = BB.wave.first;
  let kills = 0, deployed = 0, ended = false, outro = null;
  let hurtFlash = 0, hitFlash = 0, banner = null, scroll = 0, last = 0;

  timeEl.textContent = fmtTime(time);
  progEl.style.width = '100%';
  progEl.style.background = 'linear-gradient(90deg,var(--red),var(--gold))';
  setLive(0);

  // ── DEPLOY DECK ──
  // Rebuilt from scratch every round, so the previous round's click handlers
  // die with the nodes that carried them — the same trick Node Hacker's keypad
  // and Memory Match's tiles use. stopGame() empties the container, which means
  // quitting mid-siege drops them too.
  const cards = [
    { kind:'unit', spec: BB.units.scout, color: colorOf.scout, cdLeft: 0 },
    { kind:'unit', spec: BB.units.tank,  color: colorOf.tank,  cdLeft: 0 },
    { kind:'upg',  icon:'⚡', name:'RAM SPEED', color:'#ffd700', cdLeft: 0 }
  ];
  deck.innerHTML = '';
  const btns = cards.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'bb-btn';
    b.style.setProperty('--bc', c.color);
    b.innerHTML = `<span class="bb-ico">${c.kind === 'unit' ? c.spec.icon : c.icon}</span>` +
                  `<span class="bb-name">${c.kind === 'unit' ? c.spec.name : c.name}</span>` +
                  `<span class="bb-cost"></span>`;
    b.onclick = () => buy(i);
    deck.appendChild(b);
    return { el: b, cost: b.querySelector('.bb-cost'), lastCost: '', lastState: '', lastCd: -1 };
  });

  // The deck changes the board's available height, so it has to be in the DOM
  // and visible before the canvas measures itself.
  fitCanvas();
  paintDeck();

  function costOf(i){
    const c = cards[i];
    if(c.kind === 'unit') return c.spec.cost;
    return upgIdx < BB.ram.tiers.length ? BB.ram.tiers[upgIdx] : Infinity;
  }

  function buy(i){
    if(ended) return;
    const c = cards[i], cost = costOf(i);
    if(!Number.isFinite(cost)){ snd('deny'); toast('⚡ RAM THROUGHPUT ALREADY MAXED'); return; }
    if(c.cdLeft > 0){ snd('deny'); return; }
    if(ram < cost){ snd('deny'); toast(`⚠️ INSUFFICIENT RAM — NEED ${Math.ceil(cost - ram)} MORE`); return; }

    ram -= cost;
    if(c.kind === 'upg'){
      upgIdx++;
      ramRate += BB.ram.step;
      snd('levelUp');
      toast(`⚡ RAM THROUGHPUT → ${Math.round(ramRate)}/s`);
      banner = { text: `⚡ THROUGHPUT ${Math.round(ramRate)}/s`, life: 1400, color: '#ffd700' };
    } else {
      spawnBot(c.spec);
      c.cdLeft = c.spec.cool;
      deployed++;
      snd(c.spec.key === 'tank' ? 'ability' : 'powerup');
    }
    paintDeck();
  }

  // Only touches the DOM when something actually changed — this runs every
  // frame, and a blind write per card per frame is layout churn for nothing.
  function paintDeck(){
    cards.forEach((c, i) => {
      const b = btns[i], cost = costOf(i);
      const label = Number.isFinite(cost) ? `${cost} RAM` : 'MAXED';
      if(label !== b.lastCost){ b.cost.textContent = label; b.lastCost = label; }

      const state = !Number.isFinite(cost) ? 'maxed' : (ram < cost ? 'broke' : '');
      if(state !== b.lastState){
        b.el.classList.toggle('broke', state === 'broke');
        b.el.classList.toggle('maxed', state === 'maxed');
        b.lastState = state;
      }

      const cd = c.kind === 'unit' ? Math.max(0, c.cdLeft) / c.spec.cool : 0;
      const q = Math.round(cd * 20) / 20;            // quantised — 20 steps is plenty
      if(q !== b.lastCd){ b.el.style.setProperty('--cd', q); b.lastCd = q; }
    });
  }

  // ── SPAWNING ──
  function mkUnit(spec, side, x, color){
    const lane = side < 0 ? eLane++ % 3 : pLane++ % 3;
    return {
      spec, side, x, color, lane,
      hp: spec.hp * (side < 0 ? foeHpScale : 1),
      hpMax: spec.hp * (side < 0 ? foeHpScale : 1),
      atk: spec.atk * (side < 0 ? foeAtkScale : 1),
      w: spec.w, h: spec.h, speed: spec.speed, reach: spec.reach, rate: spec.rate,
      cd: 0, yOff: BB_LANES[lane],
      flash: 0, bob: Math.random() * 6
    };
  }
  function spawnBot(spec){ bots.push(mkUnit(spec, +1, BB_P_SPAWN, colorOf[spec.key])); }
  function spawnFoe(spec){ foes.push(mkUnit(spec, -1, BB_E_SPAWN, spec.color)); }

  // Later waves lean on the heavier types without ever dropping BUGs entirely,
  // so the lane keeps its chaff while the real threats arrive behind it.
  function pickFoe(){
    const pool = Object.values(BB.foes).filter(f => elapsed >= f.from);
    const weights = pool.map(f => f.key === 'bug' ? 3 : (elapsed - f.from) / 40 + 1);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for(let i = 0; i < pool.length; i++){ if((r -= weights[i]) <= 0) return pool[i]; }
    return pool[0];
  }

  function spawnWave(){
    waveNo++;
    const count = Math.min(3, 1 + Math.floor(elapsed / 70));
    for(let i = 0; i < count; i++){
      const f = pickFoe();
      // Trickled rather than dumped, so a wave arrives as a column you can
      // watch build instead of four sprites appearing on one pixel.
      gLater(() => { if(!ended) spawnFoe(f); }, i * BB.wave.burst);
    }
    waveT = Math.max(BB.wave.floor, BB.wave.start - elapsed * BB.wave.tighten) / waveScale;
    if(waveNo % 5 === 0){
      snd('wave');
      banner = { text: `⚠ WAVE ${waveNo} INBOUND`, life: 1700, color: '#ff2442' };
    }
  }

  // ── COMBAT ──
  // Three lanes, each resolving as its own duel: a unit walks until the edge gap
  // to the frontmost opponent IN ITS LANE closes to `reach`, then stops dead and
  // trades blows. The lanes are the same three the renderer staggers units into,
  // so what you see on the board is exactly what the simulation is doing.
  function frontTarget(u, list, dir){
    let best = null, bestGap = Infinity;
    for(const f of list){
      if(f.hp <= 0 || f.lane !== u.lane) continue;
      const gap = dir > 0 ? (f.x - f.w / 2) - (u.x + u.w / 2)
                          : (u.x - u.w / 2) - (f.x + f.w / 2);
      if(gap < -44) continue;                 // long past each other — don't moonwalk back
      if(gap < bestGap){ bestGap = gap; best = f; }
    }
    return { target: best, gap: bestGap };
  }

  // Gap to the nearest ally ahead in the same lane — the queue that stops a
  // column collapsing onto one x.
  function allyGap(u, list, dir){
    let best = Infinity;
    for(const a of list){
      if(a === u || a.hp <= 0 || a.lane !== u.lane) continue;
      const gap = dir > 0 ? (a.x - a.w / 2) - (u.x + u.w / 2)
                          : (u.x - u.w / 2) - (a.x + a.w / 2);
      if(gap >= 0 && gap < best) best = gap;
    }
    return best;
  }

  function stepSide(list, opposing, dir, dt){
    const line = dir > 0 ? BB_E_LINE : BB_P_LINE;
    for(const u of list){
      if(u.hp <= 0) continue;
      if(u.flash > 0) u.flash -= dt;

      const { target, gap } = frontTarget(u, opposing, dir);
      if(target && gap <= u.reach){
        u.cd -= dt;
        if(u.cd <= 0){
          u.cd = u.rate;
          u.flash = 130;
          target.hp -= u.atk;
          snd('hit');
          if(target.hp <= 0) killUnit(target, dir);
        }
        continue;
      }

      const atBase = dir > 0 ? (u.x + u.w / 2 >= line) : (u.x - u.w / 2 <= line);
      if(atBase){
        u.cd -= dt;
        if(u.cd <= 0){
          u.cd = u.rate;
          u.flash = 130;
          hitBase(u, dir);
        }
        continue;
      }

      // Hold position behind the ally in front rather than walking through it.
      if(allyGap(u, list, dir) <= BB.spacing) continue;

      u.x += dir * u.speed * dt / 1000;
      u.bob += dt / 90;
    }
  }

  function killUnit(u, dir){
    burst(u.x, BB_GROUND + u.yOff - u.h / 2, u.color, 9);
    snd('explode');
    if(dir > 0){                       // a player bot did the killing
      kills++;
      ram = Math.min(BB.ram.cap, ram + u.spec.bounty);
      snd('coin');
    }
  }

  function hitBase(u, dir){
    const dmg = u.atk * BB.siege;
    if(dir > 0){
      glitchHP -= dmg;
      hitFlash = 1;
      snd('brick', { semi: 3 });
      if(glitchHP <= 0){ glitchHP = 0; end('win'); }
    } else {
      mainHP -= dmg;
      hurtFlash = 1;
      snd('brick', { semi: -7 });
      if(mainHP <= 0){ mainHP = 0; end('loss'); }
    }
  }

  function burst(x, y, color, n){
    for(let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 110;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 1, color, sz: 2 + Math.random() * 2.5 });
    }
  }

  // ── SIEGE CLOCK ──
  // One second per tick is all the clock needs; the simulation runs on the
  // frame delta so the RAM counter climbs smoothly rather than in steps.
  gTimer = setInterval(() => {
    if(ended) return;
    time--;
    timeEl.textContent = fmtTime(time);
    progEl.style.width = `${Math.max(0, time / TOTAL) * 100}%`;
    if(time <= 5 && time > 0) snd('tick');
    if(time <= 0) end('timeout');
  }, 1000);

  window.onkeydown = e => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    // Neither fires anything here, but both activate a focused button, so they
    // get swallowed rather than leaking out into the UI behind the board.
    if(e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    const i = ['1', '2', '3'].indexOf(e.key);
    if(i < 0) return;
    e.preventDefault();
    hideTouchHint();
    buy(i);
  };

  // ── SIMULATION ──
  function simulate(dt){
    elapsed += dt / 1000;
    ram = Math.min(BB.ram.cap, ram + ramRate * dt / 1000);

    cards.forEach(c => { if(c.cdLeft > 0) c.cdLeft = Math.max(0, c.cdLeft - dt); });

    waveT -= dt;
    if(waveT <= 0) spawnWave();

    stepSide(bots, foes, +1, dt);
    stepSide(foes, bots, -1, dt);
    bots = bots.filter(u => u.hp > 0);
    foes = foes.filter(u => u.hp > 0);

    // What you'd bank if the siege ended right now, climbing as you chew
    // through The Glitch. A win replaces it with the full formula.
    setLive(Math.round(BB.score.lossMax * (1 - Math.max(0, glitchHP) / BB.baseHP)));
  }

  function stepFx(dt){
    scroll += dt * 0.012;
    if(hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt / 420);
    if(hitFlash  > 0) hitFlash  = Math.max(0, hitFlash  - dt / 300);
    if(banner){ banner.life -= dt; if(banner.life <= 0) banner = null; }
    for(let i = parts.length - 1; i >= 0; i--){
      const p = parts[i];
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 420 * dt / 1000;
      p.life -= dt / 620;
      if(p.life <= 0) parts.splice(i, 1);
    }
  }

  // ── RENDER ──
  function rrect(x, y, w, h, r){
    aCtx.beginPath();
    aCtx.moveTo(x + r, y);
    aCtx.arcTo(x + w, y, x + w, y + h, r);
    aCtx.arcTo(x + w, y + h, x, y + h, r);
    aCtx.arcTo(x, y + h, x, y, r);
    aCtx.arcTo(x, y, x + w, y, r);
    aCtx.closePath();
  }

  function drawField(){
    aCtx.fillStyle = '#07070f';
    aCtx.fillRect(0, 0, BOARD_W, BOARD_H);

    // Drifting grid in the sky band — cheap parallax that sells the side-scroll
    // without moving anything the simulation cares about.
    aCtx.save();
    aCtx.strokeStyle = 'rgba(255,255,255,0.045)';
    aCtx.lineWidth = 1;
    const off = scroll % 40;
    for(let x = -off; x <= BOARD_W; x += 40){
      aCtx.beginPath(); aCtx.moveTo(x, 56); aCtx.lineTo(x, BB_GROUND); aCtx.stroke();
    }
    for(let y = 56; y <= BB_GROUND; y += 40){
      aCtx.beginPath(); aCtx.moveTo(0, y); aCtx.lineTo(BOARD_W, y); aCtx.stroke();
    }
    aCtx.restore();

    // Ground slab + the lit lane the whole game happens on
    aCtx.fillStyle = '#0b0b16';
    aCtx.fillRect(0, BB_GROUND, BOARD_W, BOARD_H - BB_GROUND);
    aCtx.save();
    aCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    const goff = (scroll * 2) % 28;
    for(let x = -goff; x <= BOARD_W; x += 28){
      aCtx.beginPath(); aCtx.moveTo(x, BB_GROUND); aCtx.lineTo(x - 16, BOARD_H); aCtx.stroke();
    }
    aCtx.shadowBlur = 12; aCtx.shadowColor = pColor;
    aCtx.strokeStyle = hexToRgba(pColor, 0.55); aCtx.lineWidth = 2;
    aCtx.beginPath(); aCtx.moveTo(0, BB_GROUND); aCtx.lineTo(BOARD_W, BB_GROUND); aCtx.stroke();
    aCtx.restore();
  }

  function drawTower(x, color, icon, label, hp, flash){
    const top = BB_GROUND - BB_TOWER_H;
    aCtx.save();
    aCtx.shadowBlur = 20; aCtx.shadowColor = color;
    aCtx.fillStyle = hexToRgba(color, 0.10 + flash * 0.35);
    aCtx.strokeStyle = color; aCtx.lineWidth = 2;
    rrect(x, top, BB_TOWER_W, BB_TOWER_H, 6);
    aCtx.fill(); aCtx.stroke();
    aCtx.shadowBlur = 0;

    // Window lights, dimming as the base loses integrity — the tower itself
    // reports its health, so the fight reads without looking up at the bars.
    const lit = Math.max(0, hp) / BB.baseHP;
    for(let r = 0; r < 3; r++){
      for(let c = 0; c < 2; c++){
        const on = Math.random() < 0.06 ? 0.15 : lit;
        aCtx.fillStyle = hexToRgba(color, 0.18 + on * 0.55);
        aCtx.fillRect(x + 13 + c * 28, top + 40 + r * 18, 16, 9);
      }
    }
    aCtx.font = '17px sans-serif';
    aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
    aCtx.fillText(icon, x + BB_TOWER_W / 2, top + 20);

    aCtx.font = 'bold 8px Orbitron,monospace';
    aCtx.fillStyle = hexToRgba(color, 0.85);
    aCtx.fillText(label, x + BB_TOWER_W / 2, BB_GROUND + 16);
    aCtx.restore();
  }

  function drawUnit(u){
    const feet = BB_GROUND + u.yOff;
    // u.bob only advances while a unit is walking, so an engaged unit stands
    // still rather than jittering in place through the whole brawl.
    const top = feet - u.h + Math.sin(u.bob) * 1.2;

    aCtx.save();
    aCtx.globalAlpha = 0.32;
    aCtx.fillStyle = '#000';
    aCtx.beginPath(); aCtx.ellipse(u.x, feet + 2, u.w * 0.5, 3.5, 0, 0, Math.PI * 2); aCtx.fill();
    aCtx.globalAlpha = 1;

    aCtx.shadowBlur = u.flash > 0 ? 22 : 13;
    aCtx.shadowColor = u.color;
    aCtx.fillStyle = hexToRgba(u.color, u.flash > 0 ? 0.45 : 0.17);
    aCtx.strokeStyle = u.color; aCtx.lineWidth = 2;
    rrect(u.x - u.w / 2, top, u.w, u.h, 5);
    aCtx.fill(); aCtx.stroke();
    aCtx.shadowBlur = 0;

    aCtx.font = `${Math.round(u.h * 0.5)}px sans-serif`;
    aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
    aCtx.fillText(u.spec.icon, u.x, top + u.h * 0.5);

    // HP pip — flips red once a unit is nearly spent, which is the cue to send
    // the next one rather than watch this one die.
    const frac = Math.max(0, u.hp / u.hpMax), pw = u.w + 4;
    aCtx.fillStyle = 'rgba(0,0,0,0.6)';
    aCtx.fillRect(u.x - pw / 2, top - 7, pw, 3);
    aCtx.fillStyle = frac > 0.35 ? u.color : '#ff2442';
    aCtx.fillRect(u.x - pw / 2, top - 7, pw * frac, 3);

    if(u.flash > 0){
      const dir = u.side, mx = u.x + dir * (u.w / 2 + 3);
      aCtx.strokeStyle = '#fff'; aCtx.lineWidth = 2;
      aCtx.globalAlpha = Math.min(1, u.flash / 130);
      aCtx.beginPath();
      aCtx.moveTo(mx, top + u.h * 0.55);
      aCtx.lineTo(mx + dir * 9, top + u.h * 0.55);
      aCtx.stroke();
    }
    aCtx.restore();
  }

  function drawHPBar(x, y, w, h, frac, color, label, value, rightAlign){
    aCtx.save();
    aCtx.font = 'bold 9px Orbitron,monospace';
    aCtx.textBaseline = 'alphabetic';
    aCtx.textAlign = rightAlign ? 'right' : 'left';
    aCtx.fillStyle = hexToRgba(color, 0.9);
    aCtx.fillText(label, rightAlign ? x + w : x, y - 5);

    aCtx.fillStyle = 'rgba(255,255,255,0.06)';
    aCtx.fillRect(x, y, w, h);
    const fw = Math.max(0, Math.min(1, frac)) * w;
    aCtx.shadowBlur = 12; aCtx.shadowColor = color;
    aCtx.fillStyle = color;
    aCtx.fillRect(rightAlign ? x + w - fw : x, y, fw, h);
    aCtx.shadowBlur = 0;
    aCtx.strokeStyle = 'rgba(255,255,255,0.16)'; aCtx.lineWidth = 1;
    aCtx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    aCtx.font = 'bold 9px Orbitron,monospace';
    aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
    aCtx.fillStyle = '#fff';
    aCtx.fillText(value, x + w / 2, y + h / 2 + 0.5);
    aCtx.restore();
  }

  function drawHUD(){
    drawHPBar(16, 20, 244, 15, mainHP / BB.baseHP, pColor,
              '🛡️ MAINFRAME', `${Math.max(0, Math.ceil(mainHP))}`, false);
    drawHPBar(BOARD_W - 260, 20, 244, 15, glitchHP / BB.baseHP, '#ff2442',
              '☠️ THE GLITCH', `${Math.max(0, Math.ceil(glitchHP))}`, true);

    aCtx.save();
    aCtx.font = 'bold 8px Orbitron,monospace';
    aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
    aCtx.fillStyle = 'rgba(255,255,255,0.34)';
    aCtx.fillText(`WAVE ${waveNo}  ·  ${Math.round(ramRate)}/s RAM`, BOARD_W / 2, 48);
    aCtx.restore();

    if(banner){
      const a = Math.min(1, banner.life / 400);
      aCtx.save();
      aCtx.globalAlpha = a;
      aCtx.font = 'bold 15px Orbitron,monospace';
      aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
      aCtx.shadowBlur = 16; aCtx.shadowColor = banner.color;
      aCtx.fillStyle = banner.color;
      aCtx.fillText(banner.text, BOARD_W / 2, 100);
      aCtx.restore();
    }

    if(outro){
      aCtx.save();
      aCtx.fillStyle = 'rgba(4,4,14,0.62)';
      aCtx.fillRect(0, 0, BOARD_W, BOARD_H);
      aCtx.font = 'bold 26px Orbitron,monospace';
      aCtx.textAlign = 'center'; aCtx.textBaseline = 'middle';
      aCtx.shadowBlur = 26; aCtx.shadowColor = outro.color;
      aCtx.fillStyle = outro.color;
      aCtx.fillText(outro.text, BOARD_W / 2, BOARD_H / 2);
      aCtx.restore();
    }

    // Damage vignettes: red when the Mainframe is hit, the equipped colour when
    // The Glitch takes one, so the two are never confusable at a glance.
    if(hurtFlash > 0){
      aCtx.save();
      aCtx.globalAlpha = hurtFlash * 0.3;
      aCtx.fillStyle = '#ff2442';
      aCtx.fillRect(0, 0, BOARD_W, BOARD_H);
      aCtx.restore();
    }
    if(hitFlash > 0){
      aCtx.save();
      aCtx.globalAlpha = hitFlash * 0.16;
      aCtx.fillStyle = pColor;
      aCtx.fillRect(BOARD_W * 0.55, 0, BOARD_W * 0.45, BOARD_H);
      aCtx.restore();
    }
  }

  function draw(){
    drawField();
    drawTower(BB_P_TOWER, pColor,   '🖥️', 'MAINFRAME',  mainHP,   hurtFlash);
    drawTower(BB_E_TOWER, '#ff2442', '👾', 'THE GLITCH', glitchHP, hitFlash);
    drawSkinBadge(BB_P_TOWER + BB_TOWER_W / 2, BB_GROUND - BB_TOWER_H - 14, 14);

    // Back lane first, so a crowded front line layers instead of z-fighting.
    [...bots, ...foes].sort((a, b) => a.yOff - b.yOff).forEach(drawUnit);

    for(const p of parts){
      aCtx.save();
      aCtx.globalAlpha = Math.max(0, p.life);
      aCtx.fillStyle = p.color;
      aCtx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      aCtx.restore();
    }
    drawHUD();
    ramEl.textContent = Math.floor(ram);
  }

  // ── LOOP ──
  // Drawing outlives the simulation on purpose: `ended` freezes the battle but
  // the frame keeps running so the final explosion and the verdict card play
  // out. stopGame() cancels it for real, from showResults() or from Quit.
  function loop(now){
    const dt = last ? Math.min(50, now - last) : 16;   // a stalled tab must not teleport the front line
    last = now;
    if(!ended) simulate(dt);
    stepFx(dt);
    if(!ended) paintDeck();
    draw();
    gameLoopId = requestAnimationFrame(loop);
  }

  function end(outcome){
    if(ended) return;
    ended = true;
    const win = outcome === 'win';
    let pts, verdict;

    if(win){
      pts = Math.min(BB.score.cap,
        BB.score.win +
        Math.round(BB.score.hpBonus * Math.max(0, mainHP) / BB.baseHP) +
        Math.round(BB.score.timeBonus * Math.min(1, (Math.max(0, time) / TOTAL) / BB.score.timeFull)));
      verdict = '☠️ THE GLITCH PURGED';
      outro = { text: 'GLITCH PURGED', color: '#39ff14' };
      burst(BB_E_TOWER + BB_TOWER_W / 2, BB_GROUND - BB_TOWER_H / 2, '#ff2442', 40);
      snd('bigExplode');
    } else {
      pts = Math.round(BB.score.lossMax * (1 - Math.max(0, glitchHP) / BB.baseHP));
      verdict = outcome === 'timeout' ? '⏱️ SIEGE TIMED OUT' : '💀 MAINFRAME BREACHED';
      outro = { text: outcome === 'timeout' ? 'SIEGE FAILED' : 'MAINFRAME BREACHED', color: '#ff2442' };
      if(outcome !== 'timeout') burst(BB_P_TOWER + BB_TOWER_W / 2, BB_GROUND - BB_TOWER_H / 2, pColor, 40);
      snd(outcome === 'timeout' ? 'alarm' : 'gameOver');
    }
    setLive(pts);
    btns.forEach(b => b.el.classList.add('broke'));

    // Let the explosion and the verdict land before the results card wipes the
    // board. gLater(), so quitting inside that window cancels it cleanly.
    gLater(() => {
      showResults('battlebots', pts, {
        '⚔️ Outcome': verdict,
        '🛡️ Mainframe Integrity': `${Math.max(0, Math.ceil(mainHP))} / ${BB.baseHP}`,
        '☠️ Glitch Integrity': `${Math.max(0, Math.ceil(glitchHP))} / ${BB.baseHP}`,
        '💀 Hostiles Deleted': kills,
        '🤖 Bots Deployed': deployed,
        '🌊 Waves Repelled': waveNo,
        '⚡ RAM Throughput': `${Math.round(ramRate)}/s`,
        '🏆 Score Accumulation': `${pts} PTS`
      });
    }, 1050);
  }

  gameLoopId = requestAnimationFrame(loop);
}

function fmtTime(s){
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

showScreen('auth-screen');
// ══════════════════════════════════════════════════════════════════════
//  💬 FEEDBACK TERMINAL — modal, validation, transmit hook
// ══════════════════════════════════════════════════════════════════════

/**
 * ⬇️  BACKEND HOOK — THIS IS THE ONLY FUNCTION YOU NEED TO EDIT  ⬇️
 *
 * Receives the assembled payload and delivers it somewhere. Resolve to
 * signal success; throw to surface an error inside the modal.
 *
 * payload = {
 *   username, type, typeLabel, rating, message,
 *   uid, isGuest, totalPoints, credits, difficultyTier,
 *   submittedAt, userAgent, screen
 * }
 *
 * Archives to the Realtime Database, then emails via Formspree.
 */
// Formspree endpoint — every report is emailed to the inbox registered on
// this form's Formspree account. Change the recipient in the Formspree
// dashboard, not here. Set to '' to stop sending mail; reports are always
// archived to the database either way.
const FEEDBACK_EMAIL_ENDPOINT = 'https://formspree.io/f/xpqvbjjp';

async function sendFeedback(payload){
  if(!db) throw new Error('Database offline');

  // ── 1. Always archive to the Realtime Database ─────────────────────
  // One push-key per report under the "feedback" node. This is the record
  // of truth — it survives even if the email step below fails.
  const saved = await db.ref('feedback').push({
    ...payload,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    handled: false            // flip to true in the console once actioned
  });

  // ── 2. Also email it, if an endpoint is configured ─────────────────
  // Deliberately non-fatal: the report is already saved, so a mail outage
  // must not show the player an error or make them retype anything.
  if(FEEDBACK_EMAIL_ENDPOINT){
    try{
      const res = await fetch(FEEDBACK_EMAIL_ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body: JSON.stringify({
          // Flat, readable fields — this is what lands in your inbox
          _subject: `[POINT INVADERS] ${payload.typeLabel} from ${payload.username}`,
          player:     payload.username,
          type:       payload.typeLabel,
          rating:     payload.rating ? `${payload.rating}/5` : 'not rated',
          message:    payload.message,
          difficulty: payload.difficultyTier,
          points:     payload.totalPoints,
          credits:    payload.credits,
          guest:      payload.isGuest ? 'yes' : 'no',
          uid:        payload.uid,
          submitted:  payload.submittedAt
        })
      });
      if(!res.ok) console.warn('[FEEDBACK] email relay returned', res.status, '— report is still saved in the database');
    }catch(e){
      console.warn('[FEEDBACK] email relay unreachable — report is still saved in the database:', e);
    }
  }

  return saved;

  /* ── ALTERNATIVE · EmailJS (add its CDN <script> to index.html first) ──
  return emailjs.send('SERVICE_ID','TEMPLATE_ID', payload, 'PUBLIC_KEY');
  */

  /* ── OPTION C · your own API ───────────────────────────────────────
  const r = await fetch('/api/feedback', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`API responded ${r.status}`);
  return r.json();
  */

  /* ── OPTION D · simulate only (no delivery, logs to console) ───────
  console.log('[FEEDBACK] payload →', payload);
  await new Promise(res => setTimeout(res, 900));
  return { ok:true };
  */
}

(function(){
  const overlay = document.getElementById('fb-overlay');
  if(!overlay) return;                     // markup absent — bail quietly

  const body    = document.getElementById('fb-body');
  const success = document.getElementById('fb-success');
  const term    = document.getElementById('fb-term');
  const nameEl  = document.getElementById('fb-name');
  const typeEl  = document.getElementById('fb-type');
  const msgEl   = document.getElementById('fb-msg');
  const errEl   = document.getElementById('fb-err');
  const countEl = document.getElementById('fb-count');
  const rateWrap= document.getElementById('fb-rating');
  const rateLbl = document.getElementById('fb-rating-lbl');
  const submitEl= document.getElementById('fb-submit');

  const MIN_CHARS = 5;
  const RATING_LABELS = ['','☠️ Critical Failure','⚠️ Unstable','➖ Functional','⚡ Overclocked','🏆 Legendary'];

  let rating = 0;
  let isOpen = false;
  let sending = false;
  let lastFocus = null;
  let termTimers = [];

  // ── Rating: five core nodes ──
  for(let i=1;i<=5;i++){
    const node = document.createElement('button');
    node.type='button'; node.className='fb-node'; node.dataset.v=i;
    node.textContent='◆';
    node.setAttribute('role','radio');
    node.setAttribute('aria-label',`${i} of 5 — ${RATING_LABELS[i]}`);
    rateWrap.appendChild(node);
  }
  const paintRating = v => {
    rateWrap.querySelectorAll('.fb-node').forEach(n=>{
      n.classList.toggle('lit', Number(n.dataset.v) <= v);
      n.setAttribute('aria-checked', Number(n.dataset.v) === rating ? 'true' : 'false');
    });
    rateLbl.textContent = v ? RATING_LABELS[v] : 'Awaiting calibration…';
    rateLbl.classList.toggle('set', !!v);
  };
  rateWrap.addEventListener('click', e=>{
    const n = e.target.closest('.fb-node'); if(!n) return;
    rating = Number(n.dataset.v); paintRating(rating);
    snd('node',{semi:rating-1});      // the five nodes ring up the scale
  });
  rateWrap.addEventListener('mouseover', e=>{
    const n = e.target.closest('.fb-node'); if(n) paintRating(Number(n.dataset.v));
  });
  rateWrap.addEventListener('mouseleave', ()=>paintRating(rating));

  // ── Character counter ──
  msgEl.addEventListener('input', ()=>{
    const len = msgEl.value.length;
    countEl.textContent = len;
    countEl.parentNode.classList.toggle('warn', len > 900);
    if(errEl.textContent) errEl.textContent='';
  });

  // ── Open / close ─────────────────────────────────────────────────
  // Purely additive: never calls showScreen(), so the hub stays mounted
  // and the player's PTS/CR state is untouched.
  function openFeedback(){
    if(isOpen) return;
    lastFocus = document.activeElement;
    // Prefill the handle from the live session (read-only — never writes back)
    if(!nameEl.value && typeof user !== 'undefined' && user && user.username){
      nameEl.value = user.username;
    }
    errEl.textContent='';
    isOpen = true;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    setTimeout(()=>msgEl.focus(), 260);
  }

  function closeFeedback(){
    if(!isOpen || sending) return;
    isOpen = false;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    termTimers.forEach(clearTimeout); termTimers=[];
    // Reset back to the form state for next time
    setTimeout(()=>{
      if(isOpen) return;
      success.classList.remove('show');
      body.style.display='';
      term.innerHTML='';
    }, 240);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.getElementById('btn-feedback').onclick = openFeedback;
  document.getElementById('fb-close').onclick = closeFeedback;
  overlay.addEventListener('mousedown', e=>{ if(e.target === overlay) closeFeedback(); });

  // Capture phase: while the modal is open, swallow keys before they can
  // reach any window.onkeydown handler a mini-game may still have bound.
  document.addEventListener('keydown', e=>{
    if(!isOpen) return;
    if(e.key === 'Escape'){ closeFeedback(); return; }
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); transmit(); }
    e.stopPropagation();
  }, true);

  // ── Terminal readout ──
  function typeTerminal(lines, done){
    term.innerHTML=''; let delay=0;
    lines.forEach((line, i)=>{
      delay += 420;
      termTimers.push(setTimeout(()=>{
        const div=document.createElement('div');
        div.className = line.ok ? 'ok' : '';
        div.textContent = line.text;
        term.appendChild(div);
        if(i === lines.length-1){
          const c=document.createElement('span'); c.className='caret'; c.textContent='▊';
          term.appendChild(c);
          if(done) termTimers.push(setTimeout(done, 900));
        }
      }, delay));
    });
  }

  // ── Submit ───────────────────────────────────────────────────────
  async function transmit(){
    if(sending) return;
    const message = msgEl.value.trim();
    if(message.length < MIN_CHARS){
      snd('error');
      errEl.textContent = `Transmission too short — ${MIN_CHARS} characters minimum.`;
      msgEl.focus(); return;
    }

    const payload = {
      username:   nameEl.value.trim() || (typeof user!=='undefined' && user && user.username) || 'Anonymous Operative',
      type:       typeEl.value,
      typeLabel:  typeEl.options[typeEl.selectedIndex].text,
      rating:     rating,                              // 0 = not rated
      message:    message,
      uid:            (typeof user!=='undefined' && user) ? user.uid : null,
      isGuest:        !!(typeof user!=='undefined' && user && user.isGuest),
      totalPoints:    (typeof user!=='undefined' && user) ? user.totalPoints : null,
      credits:        (typeof user!=='undefined' && user) ? user.credits : null,
      difficultyTier: (typeof currentDifficultyTier !== 'undefined') ? currentDifficultyTier : null,
      submittedAt: new Date().toISOString(),
      userAgent:   navigator.userAgent,
      screen:      (document.querySelector('.screen.active')||{}).id || null
    };

    sending = true;
    errEl.textContent='';
    submitEl.disabled = true;
    submitEl.textContent = '📡 Transmitting…';

    try{
      await sendFeedback(payload);                     // ← the hook above
      sending = false;                                 // readout is dismissible
      body.style.display='none';
      success.classList.add('show');
      snd('success');
      typeTerminal([
        { text:'> establishing uplink…' },
        { text:'> encrypting payload…' },
        { text:'> FEEDBACK UPLOADED TO MAINFRAME SUCCESSFULLY', ok:true },
        { text:'> signal received. thanks, operative.' }
      ], closeFeedback);
      toast('📡 Feedback uploaded to Mainframe successfully!', 3200);
      // Clear for the next report
      msgEl.value=''; countEl.textContent='0';
      rating=0; paintRating(0);
    }catch(err){
      console.error('[FEEDBACK] transmission failed:', err);
      snd('error');
      errEl.textContent = 'Uplink failed — mainframe unreachable. Try again.';
      sending = false;
    }finally{
      submitEl.disabled = false;
      submitEl.textContent = '📡 Transmit Feedback';
    }
  }

  submitEl.onclick = transmit;
  paintRating(0);

  // Optional: lets you open the terminal from anywhere, e.g. openFeedbackTerminal()
  window.openFeedbackTerminal = openFeedback;
})();

// ══════════════════════════════════════════════════════════════════════
//  💾 SAVE ACCOUNT — guest → permanent, keeping the same UID
// ══════════════════════════════════════════════════════════════════════
(function(){
  const overlay = document.getElementById('up-overlay');
  if(!overlay) return;

  const body    = document.getElementById('up-body');
  const success = document.getElementById('up-success');
  const term    = document.getElementById('up-term');
  const carryEl = document.getElementById('up-carry');
  const nameEl  = document.getElementById('up-name');
  const emailEl = document.getElementById('up-email');
  const passEl  = document.getElementById('up-pass');
  const errEl   = document.getElementById('up-err');
  const submitEl= document.getElementById('up-submit');

  let isOpen = false, saving = false, timers = [];

  function openUpgrade(){
    if(isOpen || !user || !user.isGuest) return;
    // Show exactly what's being carried across, so the value is obvious
    carryEl.innerHTML =
      `CARRYING OVER<br><b>${(user.totalPoints||0).toLocaleString()}</b> PTS · ` +
      `<b>${(user.credits||0).toLocaleString()}</b> CR · ` +
      `<b>${(user.gamesPlayed||0).toLocaleString()}</b> MISSIONS`;
    errEl.textContent='';
    isOpen = true;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    setTimeout(()=>nameEl.focus(), 260);
  }

  function closeUpgrade(){
    if(!isOpen || saving) return;
    isOpen = false;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    timers.forEach(clearTimeout); timers=[];
    setTimeout(()=>{
      if(isOpen) return;
      success.classList.remove('show');
      body.style.display='';
      term.innerHTML='';
    }, 240);
  }

  document.getElementById('btn-save-acct').onclick = openUpgrade;
  document.getElementById('up-close').onclick = closeUpgrade;
  overlay.addEventListener('mousedown', e=>{ if(e.target === overlay) closeUpgrade(); });
  document.addEventListener('keydown', e=>{
    if(!isOpen) return;
    if(e.key === 'Escape'){ closeUpgrade(); return; }
    if(e.key === 'Enter'){ e.preventDefault(); upgrade(); }
    e.stopPropagation();
  }, true);

  function typeTerm(lines, done){
    term.innerHTML=''; let delay=0;
    lines.forEach((l,i)=>{
      delay += 420;
      timers.push(setTimeout(()=>{
        const d=document.createElement('div');
        d.className = l.ok ? 'ok' : ''; d.textContent = l.text;
        term.appendChild(d);
        if(i === lines.length-1){
          const c=document.createElement('span'); c.className='caret'; c.textContent='▊';
          term.appendChild(c);
          if(done) timers.push(setTimeout(done, 1000));
        }
      }, delay));
    });
  }

  async function upgrade(){
    if(saving) return;
    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();
    const pass  = passEl.value;

    if(!name || !email || !pass){ snd('error'); errEl.textContent='Fields cannot remain unassigned.'; return; }
    if(!/^[a-zA-Z0-9_-]{2,20}$/.test(name)){ snd('error'); errEl.textContent='Format error inside username syntax.'; return; }
    if(pass.length < 6){ snd('error'); errEl.textContent='Minimum signature length unfulfilled.'; return; }
    if(!auth || !auth.currentUser || !auth.currentUser.isAnonymous){
      snd('error'); errEl.textContent='No guest session to upgrade.'; return;
    }

    saving = true;
    errEl.textContent='';
    submitEl.disabled = true;
    submitEl.textContent = '🔒 Re-keying identity…';

    try{
      // linkWithCredential keeps the SAME uid — every score, credit and
      // cosmetic already stored under players/<uid> stays exactly where it is.
      const cred = firebase.auth.EmailAuthProvider.credential(email, pass);
      await auth.currentUser.linkWithCredential(cred);

      const uid = auth.currentUser.uid;
      await db.ref('players/' + uid).update({
        username:   name,
        isGuest:    false,
        upgradedAt: firebase.database.ServerValue.TIMESTAMP
      });

      user.username = name;
      user.isGuest  = false;

      saving = false;
      body.style.display='none';
      success.classList.add('show');
      snd('victory');
      typeTerm([
        { text:'> binding credentials to node…' },
        { text:`> handle registered: ${name}` },
        { text:'> ACCOUNT SECURED — PROGRESS PRESERVED', ok:true },
        { text:'> welcome to the grid, operative.' }
      ], ()=>{ closeUpgrade(); enterHub(); });

      toast(`🔒 Account saved — welcome, ${name}!`, 3500);
      loadLeaderboard();
    }catch(e){
      console.error('Account upgrade failed:', e);
      showAuthErr(errEl, e, 'email');
      saving = false;
    }finally{
      submitEl.disabled = false;
      submitEl.textContent = '🔒 Lock In Account';
    }
  }

  submitEl.onclick = upgrade;
  window.openSaveAccount = openUpgrade;
})();
