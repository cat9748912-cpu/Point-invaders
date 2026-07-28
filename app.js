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

function stopGame(){
  clearInterval(gTimer); gTimer=null;
  cancelAnimationFrame(gameLoopId); gameLoopId=null;
  window.onkeydown=window.onkeyup=null;
  if(aCanvas){
    aCanvas.onmousemove=null; aCanvas.onclick=null;
    aCanvas.ontouchmove=null; aCanvas.ontouchstart=null;
  }
  const cl=document.getElementById('ctrl-left');
  const cr=document.getElementById('ctrl-right');
  const ca=document.getElementById('ctrl-action');
  if(cl){cl.onmousedown=cl.onmouseup=cl.ontouchstart=cl.ontouchend=null;}
  if(cr){cr.onmousedown=cr.onmouseup=cr.ontouchstart=cr.ontouchend=null;}
  if(ca){ca.onclick=null;}
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
  arena:  { name: 'CYBER ARENA',  emoji: '⚔️', maxPts: 99999 }
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
    const base = parseInt(el.dataset.basePts,10);
    const displayed = Math.floor(base * diff);
    el.textContent = `UP TO ${displayed} PTS`;
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

const showScreen=id=>{
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  setTimeout(()=>document.getElementById(id)?.classList.add('active'),40);
};

let _tt;
const toast=(msg,ms=2500,tintClass=null)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('toast-stable','toast-overclocked','toast-meltdown');if(tintClass)el.classList.add(tintClass);el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),ms)};

// ── FULLSCREEN TOGGLE ──
function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen().catch(()=>{});
  }
}
function updateFsButtons(){
  const isFs=!!document.fullscreenElement;
  const icon=isFs?'⛉':'⛶';
  const tip=isFs?'Exit Fullscreen':'Enter Fullscreen';
  ['btn-fs-hub','btn-fs-game'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.textContent=icon;el.title=tip;}
  });
}
document.addEventListener('fullscreenchange',updateFsButtons);
document.getElementById('btn-fs-hub').onclick=toggleFullscreen;
document.getElementById('btn-fs-game').onclick=toggleFullscreen;

const countdown=cb=>{
  const ov=document.getElementById('cd-ov'),nm=document.getElementById('cd-num');
  ov.classList.add('show');let n=3;
  const tick=()=>{nm.className='';nm.textContent=n>0?n:'GO!';void nm.offsetWidth;nm.className='cd-pop';if(n<=0)setTimeout(()=>{ov.classList.remove('show');cb()},700);else{n--;setTimeout(tick,1000)}};
  tick();
};

// ════════════════════════════════════════════
//  🔐 GATEWAY VALIDATION INTERFACE KEYS
// ════════════════════════════════════════════
const setErr=msg=>document.getElementById('auth-err').textContent=msg;

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
  catch(e){setErr(fErr(e.code))}
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
  }catch(e){setErr(fErr(e.code))}
  finally{authPending=false}
};

const fErr=c=>({'auth/email-already-in-use':'Target email node already claimed.','auth/wrong-password':'Input encryption key mismatch.','auth/user-not-found':'Identity node missing.','auth/weak-password':'Minimum signature length unfulfilled.','auth/invalid-email':'Malformed structural routing email.','auth/operation-not-allowed':'Guest protocol offline — enable Anonymous sign-in in the Firebase Console.','auth/admin-restricted-operation':'Guest protocol offline — enable Anonymous sign-in in the Firebase Console.','auth/credential-already-in-use':'That email is already bound to another identity node.','auth/provider-already-linked':'This session already holds a permanent identity.','auth/requires-recent-login':'Session too old to re-key. Exit and sign in again.','auth/email-already-exists':'Target email node already claimed.'}[c]||'Matrix validation anomaly.');

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
    setErr(fErr(e.code));
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
    user=null;showScreen('auth-screen');setErr('');toast('🗑️ Guest profile wiped from the grid.');
    return;
  }
  if(auth)auth.signOut();
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
  loadLeaderboard();
  unlockDifficultySelector();
}

document.getElementById('btn-market').onclick=()=>openMarket();
document.getElementById('btn-market-back').onclick=()=>enterHub();

document.querySelectorAll('.game-card').forEach(card=>{
  card.addEventListener('click',()=>{
    const gid=card.dataset.game;
    curGame=gid;
    document.getElementById('g-title').textContent=META[gid].name;
    showScreen('game-screen');
    prepGame(gid);
  });
});

document.getElementById('btn-quit').onclick=()=>{
  if(onQuitGame){const fn=onQuitGame;onQuitGame=null;fn();return;}
  stopGame();
  document.getElementById('ctrl-left').style.display='';
  document.getElementById('ctrl-right').style.display='';
  enterHub();
};

// ════════════════════════════════════════════
//  🎮 ROUTING & SCHEDULING INTERFACE
// ════════════════════════════════════════════
function prepGame(gid){
  stopGame();
  onQuitGame=null;
  lockDifficultySelector();
  document.getElementById('g-click').style.display='none';
  document.getElementById('g-canvas-holder').style.display='none';
  document.getElementById('g-memory').style.display='none';
  document.getElementById('g-math').style.display='none';
  document.getElementById('g-reaction').style.display='none';
  document.getElementById('tetris-next-wrap').style.display='none';
  document.getElementById('tetris-lvl-pill').style.display='none';
  document.getElementById('ctrl-left').style.display='';
  document.getElementById('ctrl-right').style.display='';
  
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
  else if(gid==='arena')  countdown(()=>startArena());
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  stopGame();
  const tier = DIFFICULTY_TIERS[currentDifficultyTier];
  const finalPts = Math.round(pts * gameDifficultyMultiplier);
  const m=META[gid],pct=finalPts/m.maxPts;
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
  if(credits<=0){ toast(`⚠️ Enter at least ${CONV_RATE} points.`); return }
  if(v>(user.totalPoints||0)){ toast('⚠️ Insufficient points.'); return }
  const spentPts = credits*CONV_RATE;
  user.totalPoints -= spentPts;
  user.credits = (user.credits||0) + credits;
  await db.ref('players/'+user.uid).update({ totalPoints:user.totalPoints, credits:user.credits });
  convPtsInput.value=''; document.getElementById('conv-pts-preview').textContent='= 0 CR';
  refreshMarketBalances(); loadLeaderboard();
  toast(`✅ Converted ${spentPts} PTS → ${credits} CR`);
};

document.getElementById('btn-conv-to-points').onclick = async ()=>{
  if(!user || !db){ toast('⚠️ Connection state unconfigured'); return }
  const v = Math.max(0, parseInt(convCreditsInput.value)||0);
  if(v<=0){ toast('⚠️ Enter at least 1 credit.'); return }
  if(v>(user.credits||0)){ toast('⚠️ Insufficient credits.'); return }
  const gainedPts = v*CONV_RATE;
  user.credits -= v;
  user.totalPoints = (user.totalPoints||0) + gainedPts;
  await db.ref('players/'+user.uid).update({ totalPoints:user.totalPoints, credits:user.credits });
  convCreditsInput.value=''; document.getElementById('conv-credits-preview').textContent='= 0 PTS';
  refreshMarketBalances(); loadLeaderboard();
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
    if((user.credits||0) < item.price){ toast('⚠️ Insufficient credits.'); return }
    user.credits -= item.price;
    user.owned[cat] = [...(user.owned[cat]||[]), id];
    await db.ref('players/'+user.uid).update({ credits:user.credits, ['owned/'+cat]: user.owned[cat] });
    toast(`✅ Purchased ${item.name}`);
  } else if(act==='equip'){
    user.equipped[cat] = id;
    await db.ref('players/'+user.uid).update({ ['equipped/'+cat]: id });
    toast(`⚡ Equipped ${item.name}`);
    applyEquippedCosmetics();
  } else if(act==='unequip'){
    const defItem = SHOP_ITEMS[cat].find(i=>i.default);
    user.equipped[cat] = defItem.id;
    await db.ref('players/'+user.uid).update({ ['equipped/'+cat]: defItem.id });
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
  btn.onclick=()=>{if(!ended){clicks++;document.getElementById('click-count').textContent=clicks;setLive(Math.min(500,clicks*8))}};
  gTimer=setInterval(()=>{
    t--;document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/10*100}%`;
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
  document.getElementById('arcade-controls').style.display='flex';
  document.getElementById('ctrl-action').textContent='SHOOT / ABILITY';
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

  for (let i = 0; i < 30; i++) backgroundStars.push({ x: Math.random() * 400, y: Math.random() * 500, size: 1, speed: 0.5, alpha: 0.4 });
  for (let i = 0; i < 15; i++) backgroundStars.push({ x: Math.random() * 400, y: Math.random() * 500, size: 1.6, speed: 1.4, alpha: 0.8 });

  let keys = {}, moveLeft = false, moveRight = false;
  window.onkeydown = e => {
    if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD','KeyQ'].includes(e.code)) e.preventDefault();
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
  window.onkeyup = e => { if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) e.preventDefault(); keys[e.code] = false; };

  document.getElementById('ctrl-left').onmousedown = () => moveLeft = true; document.getElementById('ctrl-left').onmouseup = () => moveLeft = false;
  document.getElementById('ctrl-right').onmousedown = () => moveRight = true; document.getElementById('ctrl-right').onmouseup = () => moveRight = false;
  // ACTION button: shoot if no special ready, else deploy special
  document.getElementById('ctrl-action').onclick = () => {
    if (specialAbilities.length > 0 && !activeAbility) deployAbility();
    else player.shoot();
  };

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

    if (abil.id === 'SMART_MISSILE') {
      // Fire 3 homing missiles that launch FROM the ship nose and track nearest enemies
      popText(200, player.y - 24, '🎯 SMART MISSILES!', '#00f5ff');
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
        }, i * 120);
      });
      setTimeout(() => { activeAbility = null; }, 2500);

    } else if (abil.id === 'SHIELD_BURST') {
      // Restore shield to 100% — pure healing, no damage component
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
      popText(200, player.y - 24, '🛡️ SHIELD RESTORED!', '#a855f7');
      setTimeout(() => {
        shieldBubbleActive = false;
        activeAbility = null;
      }, 3000);

    } else if (abil.id === 'TIME_WARP') {
      // Slow all enemies and their projectiles to 50% speed for 3 seconds
      timeWarpActive = true;
      timeWarpTimer = 180; // 3 seconds at 60fps
      screenShake = 8;
      popText(200, 200, '⏳ TIME WARP!', '#ffd700');
      // Radial particle ring
      for (let i = 0; i < 36; i++) {
        const ang = (i/36)*Math.PI*2;
        particles.push({
          x: 200 + Math.cos(ang)*120, y: 250 + Math.sin(ang)*100,
          vx: -Math.cos(ang)*0.8, vy: -Math.sin(ang)*0.8,
          alpha: 0.9, decay: 0.008, color: '#ffd700', size: 2.5
        });
      }
      // Auto-end when timer reaches 0 (handled in render loop)

    } else if (abil.id === 'NOVA_BOMB') {
      // Destroy ALL enemies on screen with massive expanding shockwave
      screenShake = 30;
      popText(200, 200, '💥 NOVA BOMB!', '#ff0090');
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
              x: 200, y: 250,
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
      aCtx.beginPath(); aCtx.roundRect(6, 448, 388, 46, 8); aCtx.fill(); aCtx.stroke();
      aCtx.shadowBlur = 8 * pulse; aCtx.shadowColor = next.color;
      aCtx.fillStyle = next.color;
      aCtx.font = 'bold 8.5px Orbitron';
      aCtx.fillText('PRESS [ACTION] BUTTON  OR  [Q]/[E] KEY TO DEPLOY:', 14, 462);
      aCtx.fillStyle = '#fff';
      aCtx.font = 'bold 12px Orbitron';
      aCtx.shadowBlur = 10; aCtx.shadowColor = next.color;
      aCtx.fillText(next.label, 14, 487);
      if (specialAbilities.length > 1) {
        aCtx.fillStyle = 'rgba(255,255,255,0.55)';
        aCtx.font = 'bold 9px Orbitron';
        aCtx.fillText('(+' + (specialAbilities.length - 1) + ' more queued)', 200, 487);
      }
    } else if (activeAbility) {
      aCtx.fillStyle = 'rgba(0,0,0,0.65)';
      aCtx.strokeStyle = activeAbility.color;
      aCtx.lineWidth = 1.5;
      aCtx.beginPath(); aCtx.roundRect(6, 448, 388, 46, 8); aCtx.fill(); aCtx.stroke();
      aCtx.fillStyle = activeAbility.color;
      aCtx.font = 'bold 10px Orbitron';
      aCtx.shadowBlur = 12; aCtx.shadowColor = activeAbility.color;
      aCtx.textAlign = 'center';
      aCtx.fillText('ACTIVE: ' + activeAbility.desc, 200, 475);
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
    x: 183, y: 430, w: 34, h: 26, vx: 0, friction: 0.85, accel: 1.2, cooldown: 0, angle: 0,
    get weaponLevel() { return Math.min(3, plasmaOrbs + 1); },
    update(dt) {
      const speedMult = timeWarpActive ? 1.0 : 1.0; // player always normal
      if (keys['ArrowLeft'] || keys['KeyA'] || moveLeft) this.vx -= this.accel;
      if (keys['ArrowRight'] || keys['KeyD'] || moveRight) this.vx += this.accel;
      this.vx *= this.friction; this.x += this.vx; this.angle = this.vx * 0.05;
      if (this.x < 5) { this.x = 5; this.vx = 0; }
      if (this.x > 400 - this.w - 5) { this.x = 400 - this.w - 5; this.vx = 0; }
      if (this.cooldown > 0) this.cooldown -= dt;
      if (keys['Space'] && this.cooldown <= 0) { this.shoot(); this.cooldown = 150; }
    },
    shoot() {
      const wl = this.weaponLevel;
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
      this.type = type; this.x = Math.random() * 340 + 10; this.y = -30; this.offset = Math.random() * 100;
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
          shield -= 20; screenShake = 16; shieldFlashTimer = 15;
          document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
          enemyProjectiles.splice(i,1); if (shield <= 0) end(); continue;
        }
        if (ep.y > 520) { enemyProjectiles.splice(i,1); continue; }

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
          shield -= 12; screenShake = 10; shieldFlashTimer = 10;
          document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
          enemyProjectiles.splice(i,1); if (shield <= 0) end(); continue;
        }
        if (ep.y > 520 || ep.y < -20 || ep.x < -20 || ep.x > 420) { enemyProjectiles.splice(i,1); continue; }
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
    aCtx.clearRect(0, 0, 400, 500);

    aCtx.save();
    if (screenShake > 0.5) { aCtx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake *= 0.88; }

    // Shield flash overlay
    if (shieldFlashTimer > 0) {
      shieldFlashTimer--;
      aCtx.fillStyle = `rgba(255,0,0,${shieldFlashTimer/15*0.25})`;
      aCtx.fillRect(0, 0, 400, 500);
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
      aCtx.fillRect(0, 0, 400, 500);
      // Pulsing border
      aCtx.strokeStyle = `rgba(255,215,0,${0.3 + Math.sin(frame*0.2)*0.2})`;
      aCtx.lineWidth = 3;
      aCtx.strokeRect(2, 2, 396, 496);
    }

    backgroundStars.forEach(s => {
      s.y += s.speed * (timeWarpActive ? 0.35 : 1);
      if (s.y > 500) s.y = 0;
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
      if (p.y < -20 || p.y > 520 || p.x < -20 || p.x > 420) { projectiles.splice(pi, 1); }
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
          popText(player.x, player.y - 10, `PLASMA LV${plasmaOrbs}!`, '#39ff14');
        } else {
          const abilIndex = plasmaOrbs - 3;
          const abil = getAbilityForOrb(abilIndex);
          specialAbilities.push(abil);
          popText(player.x, player.y - 10, abil.label + ' CHARGED!', abil.color);
          // Big particle burst for bonus orbs
          for (let k=0;k<6;k++) {
            setTimeout(()=>explode(pu.x + (Math.random()-0.5)*40, pu.y + (Math.random()-0.5)*30, abil.color, 12), k*80);
          }
        }
      } else if (pu.y > 520) powerups.splice(pui, 1);
    }

    // ── Enemies ──
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      e.update(frame); e.draw();

      if (e.y > 510) {
        enemies.splice(ei, 1); shield -= 15 * diffMod; screenShake = 10; shieldFlashTimer = 12;
        document.getElementById('prog-fill').style.width = `${Math.max(0,shield)}%`;
        if (shield <= 0) end(); continue;
      }
      if (!shieldBubbleActive && collide({ x: player.x, y: player.y, w: player.w, h: player.h }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        explode(e.x + e.w/2, e.y + e.h/2, e.color, 20);
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
          if (e.hp <= 0) {
            explode(e.x + e.w/2, e.y + e.h/2, e.color, 15);
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
      // Clamp x so text stays within canvas
      const clampedX = Math.max(60, Math.min(340, ft.x));
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
  const diffMod = getDifficultyModifier();

  const nCanvas = document.getElementById('nextCanvas');
  const nCtx = nCanvas.getContext('2d');

  let score=0, level=1, linesCleared=0, time=60 / diffMod;
  let arena=createMatrix(10,20), player={pos:{x:0,y:0}, matrix:null}, nextPiece=null;
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

  function playerMove(dir){ player.pos.x+=dir; if(collide(arena,player)) player.pos.x-=dir; }
  function playerRotate(dir){
    const pos=player.pos.x; let offset=1; rotate(player.matrix, dir);
    while(collide(arena,player)){ player.pos.x+=offset; offset=-(offset+(offset>0?1:-1)); if(offset>player.matrix[0].length) { rotate(player.matrix, -dir); player.pos.x=pos; return; } }
  }
  
  function playerDrop(){
    player.pos.y++;
    if(collide(arena,player)){
      player.pos.y--; merge(arena,player); resetPlayer(); arenaSweep();
    } dropCounter=0;
  }
  
  // Included Hard Drop standard logic
  function playerHardDrop(){
    while(!collide(arena, player)) player.pos.y++;
    player.pos.y--; merge(arena, player); screenShake=8; resetPlayer(); arenaSweep();
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
    outer: for(let y=arena.length-1; y>0; --y){
      for(let x=0; x<arena[y].length; ++x) if(arena[y][x]===0) continue outer;
      const row = arena.splice(y,1)[0].fill(0); arena.unshift(row);
      explodeLine(y, arena[0].length);
      ++y; score += rowCount*10; linesCleared++; rowCount*=2;
      setLive(score); screenShake=12;
      
      // Included progressive drop speed calculation logic
      if(linesCleared%10===0 && level<50) {
        level++; document.getElementById('tetris-lvl').textContent=level;
        dropInterval = Math.max(50, (600 * Math.pow(0.85, level - 1)) / diffMod);
      }
    }
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
  document.getElementById('ctrl-left').onclick=()=>playerMove(-1);
  document.getElementById('ctrl-right').onclick=()=>playerMove(1);
  document.getElementById('ctrl-action').onclick=()=>playerRotate(1);
  document.getElementById('ctrl-action').textContent='ROTATE';

  gTimer=setInterval(()=>{
    time--; document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/60*100}%`;
    if(time<=0) end();
  },1000);

  resetPlayer();

  function loop(now){
    if(tetrisOver)return;
    const dt = now - lastTime; lastTime = now;
    aCtx.clearRect(0,0,400,500); nCtx.clearRect(0,0,80,80);
    
    dropCounter += dt; if(dropCounter > dropInterval) playerDrop();
    
    aCtx.save();
    if(screenShake>0.5) { aCtx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake); screenShake*=0.8; }
    
    // Calculate Ghost Piece position
    let ghost = { matrix: player.matrix, pos: {x: player.pos.x, y: player.pos.y} };
    while(!collide(arena, ghost)) ghost.pos.y++;
    ghost.pos.y--;
    
    // Draw Environment
    aCtx.strokeStyle='rgba(255,255,255,0.05)';
    for(let i=0; i<10; i++) { aCtx.beginPath(); aCtx.moveTo(i*40,0); aCtx.lineTo(i*40,500); aCtx.stroke(); }
    for(let i=0; i<20; i++) { aCtx.beginPath(); aCtx.moveTo(0,i*25); aCtx.lineTo(400,i*25); aCtx.stroke(); }
    
    drawMatrix(ghost.matrix, ghost.pos, aCtx, true);
    drawMatrix(arena, {x:0, y:0}, aCtx);
    drawMatrix(player.matrix, player.pos, aCtx);
    
    // Draw Next Piece preview canvas
    if(nextPiece){
      const offsetX = (4 - nextPiece[0].length) / 2;
      const offsetY = (4 - nextPiece.length) / 2;
      drawMatrix(nextPiece, {x: offsetX, y: offsetY}, nCtx);
    }
    
    // Process Particles
    particles.forEach((p, pi) => {
      p.x += p.vx; p.y += p.vy; p.alpha -= 0.03; if (p.alpha <= 0) { particles.splice(pi, 1); return; }
      aCtx.save(); aCtx.globalAlpha = p.alpha; aCtx.fillStyle = p.color; aCtx.fillRect(p.x, p.y, 4, 4); aCtx.restore();
    });

    aCtx.restore();
    gameLoopId=requestAnimationFrame(loop);
  }
  
  let tetrisOver=false;
  function end(){
    if(tetrisOver)return;tetrisOver=true;
    showResults('tetris',Math.min(1500,score),{'🧱 Base Core Lines Resolved':linesCleared, '🏆 Final Output Score':`${score} PTS`});
  }
  
  gameLoopId=requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════════════════
//  💥 GAME 4: DODGE CORES (STABILIZED SMOOTH MOUSE TRAIL TRACKING)
// ══════════════════════════════════════════════════════════════════════
function startDodge(){
  document.getElementById('g-canvas-holder').style.display='block';
  let score=0, time=30, isGameOver=false, player={x:200,y:250,r:8}, obstacles=[];
  document.getElementById('g-time').textContent=time;

  aCanvas.onmousemove = e => {
    const rect = aCanvas.getBoundingClientRect();
    player.x = e.clientX - rect.left;
    player.y = e.clientY - rect.top;
  };

  gTimer=setInterval(()=>{
    if(isGameOver) return;
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/30*100}%`;
    score+=25;setLive(score);
    if(time<=0) end();
  },1000);

  let obstacleColors = ['#ff6600','#ff2442','#ffd700','#ff0090','#a855f7'];
  let frame = 0;

  function loop(){
    if(isGameOver) return;
    frame++;

    // Solid dark background so nothing blends into page
    aCtx.fillStyle = '#0a0a1a';
    aCtx.fillRect(0,0,400,500);

    // Subtle grid lines for depth
    aCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    aCtx.lineWidth = 1;
    for(let gx=0;gx<=400;gx+=40){ aCtx.beginPath();aCtx.moveTo(gx,0);aCtx.lineTo(gx,500);aCtx.stroke(); }
    for(let gy=0;gy<=500;gy+=40){ aCtx.beginPath();aCtx.moveTo(0,gy);aCtx.lineTo(400,gy);aCtx.stroke(); }

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
    if(Math.random() < .08) {
      const col = obstacleColors[Math.floor(Math.random()*obstacleColors.length)];
      obstacles.push({
        x: Math.random()*380+10, y: -10,
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
      if(Math.sqrt(dx*dx + dy*dy) < o.r + player.r){ isGameOver=true; end(); return; }
      if(o.y > 520) obstacles.splice(i,1);
    }

    gameLoopId = requestAnimationFrame(loop);
  }
  
  function end(){
    aCanvas.onmousemove=null;
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
    if(time<=0) end();
  },1000);

  icons.forEach((icon,idx)=>{
    const card=document.createElement('div');card.className='mem-card';card.dataset.val=icon;card.textContent='?';
    card.onclick=()=>{
      if(flipped.length<2&&!card.classList.contains('flipped')){
        card.classList.add('flipped');card.textContent=icon;flipped.push(card);
        if(flipped.length===2){
          if(flipped[0].dataset.val===flipped[1].dataset.val){score+=75;setLive(score);matched++;flipped=[];if(matched===8)end()}
          else{setTimeout(()=>{flipped[0].classList.remove('flipped');flipped[0].textContent='?';flipped[1].classList.remove('flipped');flipped[1].textContent='?';flipped=[]},700)}
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
    if(input===curAns){score+=50;setLive(score)}gen();
  };
  document.getElementById('math-submit').onclick=check;
  document.getElementById('math-answer').onkeydown=e=>{if(e.code==='Enter')check()};

  let mathEnded=false;
  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/20*100}%`;
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

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/15*100}%`;
    if(time<=0) end();
  },1000);

  let trigger=setTimeout(()=>{if(state==='wait'){state='go';box.style.background='var(--lime)';txt.textContent='CLICK NOW!';startT=performance.now()}},Math.random()*2500+1500);

  box.onclick=()=>{
    if(state==='wait'){clearTimeout(trigger);txt.textContent='TOO FAST! RESETTING...';box.style.background='var(--orange)';state='hold';setTimeout(()=>{if(time>0){state='wait';box.style.background='var(--red)';txt.textContent='WAIT...';trigger=setTimeout(()=>{state='go';box.style.background='var(--lime)';txt.textContent='CLICK NOW!';startT=performance.now()},Math.random()*2000+1000)}},1200)}
    else if(state==='go'){
      let diff=Math.round(performance.now()-startT);
      let earned=Math.max(10,400-diff);score+=earned;setLive(score);
      txt.textContent=`${diff}ms! REBOOTING...`;box.style.background='var(--cyan)';state='hold';
      setTimeout(()=>{if(time>0){state='wait';box.style.background='var(--red)';txt.textContent='WAIT...';trigger=setTimeout(()=>{state='go';box.style.background='var(--lime)';txt.textContent='CLICK NOW!';startT=performance.now()},Math.random()*2000+1000)}},1500);
    }
  };
  function end(){if(reactionEnded)return;reactionEnded=true;clearTimeout(trigger);box.onclick=null;showResults('reaction',Math.min(400,score),{'🏆 Final Sync Score':score})}
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
        const isMe=user&&d.uid===user.uid;const cls=isMe?'me':i===0?'r1':'';
        const row=document.createElement('div');row.className=`lb-row ${cls}`;
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
  document.getElementById('arcade-controls').style.display='flex';
  document.getElementById('ctrl-action').textContent='ACTION';

  const W=400, H=500, PAD_W=10, PAD_H=70, BALL_R=7;
  let userScore=0, cpuScore=0, time=45, isOver=false;
  let playerY=H/2-PAD_H/2, aiY=H/2-PAD_H/2;
  let ballX=W/2, ballY=H/2, ballVX=4*(Math.random()<0.5?1:-1), ballVY=3*(Math.random()<0.5?1:-1);
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

  // Mouse / touch control
  aCanvas.onmousemove=e=>{
    const rect=aCanvas.getBoundingClientRect();
    const scale=H/rect.height;
    playerY=(e.clientY-rect.top)*scale-PAD_H/2;
    playerY=Math.max(0,Math.min(H-PAD_H,playerY));
  };
  aCanvas.ontouchmove=e=>{
    e.preventDefault();
    const rect=aCanvas.getBoundingClientRect();
    const scale=H/rect.height;
    playerY=(e.touches[0].clientY-rect.top)*scale-PAD_H/2;
    playerY=Math.max(0,Math.min(H-PAD_H,playerY));
  };

  // Mobile buttons
  let moveUp=false,moveDown=false;
  document.getElementById('ctrl-left').onmousedown=()=>moveUp=true;
  document.getElementById('ctrl-left').onmouseup=()=>moveUp=false;
  document.getElementById('ctrl-left').ontouchstart=e=>{e.preventDefault();moveUp=true};
  document.getElementById('ctrl-left').ontouchend=()=>moveUp=false;
  document.getElementById('ctrl-right').onmousedown=()=>moveDown=true;
  document.getElementById('ctrl-right').onmouseup=()=>moveDown=false;
  document.getElementById('ctrl-right').ontouchstart=e=>{e.preventDefault();moveDown=true};
  document.getElementById('ctrl-right').ontouchend=()=>moveDown=false;

  // Keyboard
  let keys={};
  window.onkeydown=e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown'].includes(e.code))e.preventDefault()};
  window.onkeyup=e=>{keys[e.code]=false};

  gTimer=setInterval(()=>{
    if(isOver)return;
    time--;document.getElementById('g-time').textContent=Math.ceil(time);
    document.getElementById('prog-fill').style.width=`${time/45*100}%`;
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
    ballX+=ballVX; ballY+=ballVY;

    // Top/bottom wall bounce
    if(ballY-BALL_R<0){ballY=BALL_R;ballVY=Math.abs(ballVY);}
    if(ballY+BALL_R>H){ballY=H-BALL_R;ballVY=-Math.abs(ballVY);}

    // Player paddle (left, x=20..20+PAD_W)
    if(ballX-BALL_R<20+PAD_W && ballX-BALL_R>20 && ballY>playerY && ballY<playerY+PAD_H){
      // Player hit the ball - increase rally count
      rallyCount++;
      ballVX=Math.abs(ballVX)*1.04;
      ballVY=((ballY-(playerY+PAD_H/2))/(PAD_H/2))*6;
      ballX=20+PAD_W+BALL_R;
    }

    // AI paddle (right, x=W-20-PAD_W..W-20)
    if(ballX+BALL_R>W-20-PAD_W && ballX+BALL_R<W-20 && ballY>aiY && ballY<aiY+PAD_H){
      // AI hit the ball - rally continues
      rallyCount++;
      ballVX=-Math.abs(ballVX)*1.02;
      ballVY=((ballY-(aiY+PAD_H/2))/(PAD_H/2))*5;
      ballX=W-20-PAD_W-BALL_R;
    }

    // Ball misses — reset and award points
    if(ballX<0||ballX>W){
      if(ballX < 0) {
        // Ball passed LEFT wall — player missed — CPU scores
        cpuScore++;
        updateScore();
      } else {
        // Ball passed RIGHT wall — CPU missed — player scores
        userScore++;
        updateScore();
      }

      // Reset for next point — always send ball toward whoever just scored
      rallyCount = 0;
      ballX=W/2; ballY=H/2;
      // Send toward the scorer's side to make it fair
      ballVX=4*(ballX>W?-1:1); // toward the winner
      ballVX=4*(Math.random()<0.5?1:-1); // random direction after point
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
  document.getElementById('arcade-controls').style.display='flex';
  document.getElementById('ctrl-action').textContent='⟳ DIR';

  const diffMod = getDifficultyModifier();
  const baseTime = 60;
  const adjustedTime = baseTime / diffMod;

  const W=400,H=500,CELL=20,COLS=W/CELL,ROWS=H/CELL;
  let score=0,time=adjustedTime,isOver=false;
  let dir={x:1,y:0},nextDir={x:1,y:0};
  let snake=[{x:10,y:12},{x:9,y:12},{x:8,y:12}];
  let food=spawnFood(),speed=160 / diffMod,lastMoveTime=0,particles=[];
  let dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}],dirIdx=0; // for action button cycling

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

  // Mobile buttons — left/right to steer, action to cycle direction
  document.getElementById('ctrl-left').onclick=()=>{
    const left={x:dir.y,y:-dir.x};nextDir=left;
  };
  document.getElementById('ctrl-right').onclick=()=>{
    const right={x:-dir.y,y:dir.x};nextDir=right;
  };
  document.getElementById('ctrl-action').onclick=()=>{
    // cycle through cardinal directions
    dirIdx=(dirIdx+1)%4;
    const nd=dirs[dirIdx];
    if(nd.x!==-dir.x||nd.y!==-dir.y)nextDir=nd;
  };

  gTimer=setInterval(()=>{
    if(isOver)return;
    time--;document.getElementById('g-time').textContent=Math.ceil(time);
    document.getElementById('prog-fill').style.width=`${time/adjustedTime*100}%`;
    if(time<=0)end('timeout');
  },1000);

  function end(reason){
    if(isOver)return;isOver=true;
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
      if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS){end('wall');return;}
      // Self collision
      if(snake.some(s=>s.x===head.x&&s.y===head.y)){end('self');return;}

      snake.unshift(head);

      if(head.x===food.x&&head.y===food.y){
        score+=30;setLive(score);
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
  document.getElementById('arcade-controls').style.display='flex';
  document.getElementById('ctrl-action').textContent='TAP / FLAP';
  document.getElementById('ctrl-left').style.display='none';
  document.getElementById('ctrl-right').style.display='none';

  const diffMod = getDifficultyModifier();

  const W=400,H=500,GAP=140,PIPE_W=46,GRAVITY=0.42*diffMod,FLAP=-7.5/diffMod,PIPE_SPEED=2.4*diffMod;
  let score=0,time=0,isOver=false,frame=0;
  let droneY=H/2,droneVY=0;
  let pipes=[],particles=[];
  const DRONE_X=80,DRONE_H=28,DRONE_W=38;

  document.getElementById('g-time').textContent='∞';
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='linear-gradient(90deg,var(--gold),var(--orange))';

  function flap(){if(!isOver){droneVY=FLAP;}}

  aCanvas.onclick=flap;
  document.getElementById('ctrl-action').onclick=flap;
  window.onkeydown=e=>{if(e.code==='Space'){flap();e.preventDefault();}};

  // Touch anywhere on canvas
  aCanvas.ontouchstart=e=>{e.preventDefault();flap();};

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
          drawDrone(droneY,true);end();return;
        }
      }
    }

    // Floor / ceiling
    if(droneY+DRONE_H/2>H||droneY-DRONE_H/2<0){drawDrone(droneY,true);end();return;}

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
//  ⚔️ GAME 11: CYBER ARENA (AVATAR SIMULATOR)
// ════════════════════════════════════════════
function startArena() {
  document.getElementById('g-canvas-holder').style.display = 'block';
  document.getElementById('arcade-controls').style.display = 'flex';
  document.getElementById('ctrl-left').style.display = '';
  document.getElementById('ctrl-right').style.display = '';
  document.getElementById('ctrl-left').textContent = '◀';
  document.getElementById('ctrl-right').textContent = '▶';
  document.getElementById('ctrl-action').textContent = '⚔ SLASH';

  // ── CONSTANTS ──
  const W = 400, H = 500;
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
          popText(bot.x, bot.y - 14, blocked ? `-${dmg} (BLOCKED)` : `-${dmg}`, blocked ? '#00f5ff' : '#ff2442');
          // Combo
          comboCount++;
          comboTimer = 120;
          if (comboCount >= 3) {
            const bonus = comboCount * 5;
            score += bonus;
            popText(bot.x, bot.y - 28, `${comboCount}x COMBO! +${bonus}`, '#ffd700');
          }
          if (bot.hp <= 0 && !bot.dead) {
            bot.dead = true;
            const earned = bot.pts * (1 + (playerLevel - 1) * 0.1);
            score += Math.round(earned);
            setLive(score);
            explode(bot.x, bot.y, bot.color, 18);
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

  // Mobile controls
  document.getElementById('ctrl-left').onmousedown = () => moveLeft = true;
  document.getElementById('ctrl-left').onmouseup = () => moveLeft = false;
  document.getElementById('ctrl-left').ontouchstart = e => { e.preventDefault(); moveLeft = true; };
  document.getElementById('ctrl-left').ontouchend = () => moveLeft = false;
  document.getElementById('ctrl-right').onmousedown = () => moveRight = true;
  document.getElementById('ctrl-right').onmouseup = () => moveRight = false;
  document.getElementById('ctrl-right').ontouchstart = e => { e.preventDefault(); moveRight = true; };
  document.getElementById('ctrl-right').ontouchend = () => moveRight = false;
  document.getElementById('ctrl-action').onclick = () => doSlash();

  // Mouse/touch for aiming
  aCanvas.onmousemove = e => {
    const rect = aCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    // Canvas coords → world coords via camera
    const wx = mx + camX, wy = my + camY;
    player.angle = Math.atan2(wy - player.y, wx - player.x);
  };
  aCanvas.ontouchmove = e => {
    e.preventDefault();
    const rect = aCanvas.getBoundingClientRect();
    const t = e.touches[0];
    const mx = t.clientX - rect.left, my = t.clientY - rect.top;
    const wx = mx + camX, wy = my + camY;
    player.angle = Math.atan2(wy - player.y, wx - player.x);
  };
  // Touch tap = slash, double-tap = deploy special ability (mobile equivalent of KeyE)
  aCanvas.ontouchstart = e => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapTime < 320) { deployAbility(); lastTapTime = 0; }
    else { doSlash(); lastTapTime = now; }
  };

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

    // Controls hint (fades after 5s)
    if (frame < 300) {
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
            explode(node.x, node.y, '#ffd700', 8);
            popText(node.x, node.y - 12, '+50', '#ffd700');
          } else if (node.type === 'DATA') {
            score += 20; setLive(score); gainXP(10);
            explode(node.x, node.y, '#39ff14', 8);
            popText(node.x, node.y - 12, '+20', '#39ff14');
          } else if (node.type === 'HEAL') {
            player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.25);
            document.getElementById('prog-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
            explode(node.x, node.y, '#ff4d6d', 10);
            popText(node.x, node.y - 12, '+HP', '#ff4d6d');
          } else if (node.type === 'HASTE') {
            buffHasteTimer = 300;
            explode(node.x, node.y, '#00f5ff', 10);
            popText(node.x, node.y - 12, 'HASTE!', '#00f5ff');
          } else if (node.type === 'OVERCHARGE') {
            buffOverchargeTimer = 300;
            explode(node.x, node.y, '#ff2442', 10);
            popText(node.x, node.y - 12, 'OVERCHARGE!', '#ff2442');
          } else if (node.type === 'SHIELD') {
            buffShieldTimer = 180;
            explode(node.x, node.y, '#a855f7', 10);
            popText(node.x, node.y - 12, 'SHIELDED!', '#a855f7');
          } else if (node.type === 'CORE') {
            const abil = ABILITY_TYPES[Math.floor(Math.random() * ABILITY_TYPES.length)];
            specialAbilities.push(abil);
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
    }
  }

  // Show controls hint in the game header
  document.getElementById('g-controls').textContent = 'WASD/ARROWS=MOVE · SPACE=SLASH · SHIFT=DASH · E=ABILITY · AIM WITH MOUSE';
  onQuitGame = () => { if(!isOver) endArena(); };
  requestAnimationFrame(loop);
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
 * Swap the simulated block below for any one of the options underneath it.
 */
async function sendFeedback(payload){
  // ── ACTIVE · Firebase Realtime Database ────────────────────────────
  // Lands under the "feedback" node of the same database the game uses,
  // one push-key per report. Read them in the Firebase Console:
  //   Build → Realtime Database → Data → feedback
  if(!db) throw new Error('Database offline');
  return db.ref('feedback').push({
    ...payload,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    handled: false            // flip to true in the console once actioned
  });

  /* ── OPTION A · Formspree (emails you each report) ──────────────────
  const r = await fetch('https://formspree.io/f/YOUR_FORM_ID', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error('Formspree rejected the transmission');
  return r.json();
  */

  /* ── OPTION B · EmailJS (add its CDN <script> to index.html first) ──
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

    if(!name || !email || !pass){ errEl.textContent='Fields cannot remain unassigned.'; return; }
    if(!/^[a-zA-Z0-9_-]{2,20}$/.test(name)){ errEl.textContent='Format error inside username syntax.'; return; }
    if(pass.length < 6){ errEl.textContent='Minimum signature length unfulfilled.'; return; }
    if(!auth || !auth.currentUser || !auth.currentUser.isAnonymous){
      errEl.textContent='No guest session to upgrade.'; return;
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
      errEl.textContent = fErr(e.code);
      saving = false;
    }finally{
      submitEl.disabled = false;
      submitEl.textContent = '🔒 Lock In Account';
    }
  }

  submitEl.onclick = upgrade;
  window.openSaveAccount = openUpgrade;
})();
