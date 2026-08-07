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
// The engine is deliberately independent of app.js: it knows nothing about
// games, screens or scores, so it can be lifted into another project as-is.
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
