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
  flappy: { name: 'FLAPPY DRONE', emoji: '🚁', maxPts: 1000 }
};

// Difficulty settings
let currentDifficulty = 'normal';

function getDifficultyModifier(){
  return 1.0; // Always normal difficulty since difficulty selector was removed
}

const aCanvas = document.getElementById('arcade-canvas');
const aCtx = aCanvas?.getContext('2d');

const showScreen=id=>{
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  setTimeout(()=>document.getElementById(id)?.classList.add('active'),40);
};

let _tt;
const toast=(msg,ms=2500)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),ms)};

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
  try{
    const c=await auth.createUserWithEmailAndPassword(email,pass);
    await db.ref('players/' + c.user.uid).set({ username: name, totalPoints: 0, gamesPlayed: 0 });
    await loadUser(c.user.uid);
  }catch(e){setErr(fErr(e.code))}
};

const fErr=c=>({'auth/email-already-in-use':'Target email node already claimed.','auth/wrong-password':'Input encryption key mismatch.','auth/user-not-found':'Identity node missing.','auth/weak-password':'Minimum signature length unfulfilled.','auth/invalid-email':'Malformed structural routing email.'}[c]||'Matrix validation anomaly.');

async function loadUser(uid){
  if(!db)return;
  db.ref('players/' + uid).once('value', (snapshot) => {
    const data = snapshot.exists() ? snapshot.val() : { username: 'Player', totalPoints: 0, gamesPlayed: 0 };
    user = { uid, ...data };
    enterHub();
  });
}

if(auth)auth.onAuthStateChanged(async u=>{if(u&&!user)await loadUser(u.uid)});

document.getElementById('btn-logout').onclick=()=>{
  if(auth)auth.signOut();
  user=null;showScreen('auth-screen');toast('👋 Terminal connection closed.');
};

// ════════════════════════════════════════════
//  🏠 CENTRAL HUB CONTROLLER
// ════════════════════════════════════════════
function enterHub(){
  document.getElementById('h-uname').textContent=user.username;
  document.getElementById('h-pts').textContent=`🏆 ${(user.totalPoints||0).toLocaleString()} PTS`;
  showScreen('hub-screen');
  loadLeaderboard();
}

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
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  stopGame();
  const m=META[gid],pct=pts/m.maxPts;
  document.getElementById('res-emoji').textContent=pct>.75?'🎉':'💪';
  document.getElementById('res-gname').textContent=m.name;
  document.getElementById('res-pts').textContent=pts;
  document.getElementById('res-bd').innerHTML=Object.entries(bd).map(([k,v])=>`<div class="res-row"><span>${k}</span><span class="rv">${v}</span></div>`).join('');
  showScreen('results-screen');
  saveScore(gid,pts);
  document.getElementById('btn-again').onclick=()=>{showScreen('game-screen');prepGame(gid)};
  document.getElementById('btn-hub').onclick=()=>{document.getElementById('h-pts').textContent=`🏆 ${(user?.totalPoints||0).toLocaleString()} PTS`;enterHub()};
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
      // Auto-end after 3 seconds
      setTimeout(() => {
        timeWarpActive = false;
        activeAbility = null;
      }, 3000);

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
      const glowColor = plasmaOrbs >= 3 ? '#a855f7' : '#00f5ff';
      aCtx.shadowBlur = plasmaOrbs >= 3 ? 25 : 15; aCtx.shadowColor = glowColor; aCtx.fillStyle = glowColor;
      aCtx.beginPath(); aCtx.moveTo(0, -this.h/2); aCtx.lineTo(-this.w/2, this.h/2); aCtx.lineTo(-this.w/4, this.h/4);
      aCtx.lineTo(this.w/4, this.h/4); aCtx.lineTo(this.w/2, this.h/2); aCtx.closePath(); aCtx.fill();
      aCtx.shadowBlur = 5; aCtx.shadowColor = '#fff'; aCtx.fillStyle = '#fff';
      aCtx.beginPath(); aCtx.moveTo(0, -this.h/3); aCtx.lineTo(-3, 3); aCtx.lineTo(3, 3); aCtx.closePath(); aCtx.fill();
      aCtx.fillStyle = Math.random() > 0.5 ? '#ff0844' : '#ff6600'; aCtx.fillRect(-3, this.h/2 - 2, 6, Math.random()*6+3);
      aCtx.restore();
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
    const warpMult = timeWarpActive ? 0.35 : 1.0;
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
      if (timeWarpTimer > 0) timeWarpTimer--;
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

    // Player dot — bright cyan with glow
    aCtx.save();
    aCtx.shadowBlur = 24; aCtx.shadowColor = '#00f5ff';
    aCtx.beginPath(); aCtx.arc(player.x, player.y, player.r, 0, Math.PI*2);
    aCtx.fillStyle = '#00f5ff'; aCtx.fill();
    aCtx.shadowBlur = 6; aCtx.shadowColor = '#fff';
    aCtx.strokeStyle = '#fff'; aCtx.lineWidth = 2; aCtx.stroke();
    aCtx.restore();

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
    const finalScore = Math.max(0, (userScore - cpuScore) * 50);
    showResults('pong', Math.min(900, Math.max(0, userScore*50)), {'🏓 Your Goals': userScore, '🤖 CPU Goals': cpuScore, '🏆 Final Score': `${finalScore} PTS`});
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

    // Player paddle (cyan)
    aCtx.save();aCtx.shadowBlur=20;aCtx.shadowColor='#00f5ff';
    aCtx.fillStyle='#00f5ff';aCtx.beginPath();
    aCtx.roundRect(20,playerY,PAD_W,PAD_H,4);aCtx.fill();aCtx.restore();

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
    snake.forEach((seg,i)=>{
      const t=1-i/snake.length;
      aCtx.save();
      if(i===0){aCtx.shadowBlur=16;aCtx.shadowColor='#39ff14';}
      aCtx.fillStyle=i===0?'#39ff14':`rgba(57,255,20,${0.2+t*0.7})`;
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
    aCtx.shadowBlur=isDead?0:14;aCtx.shadowColor='#ffd700';
    aCtx.fillStyle=isDead?'#444':'#ffd700';
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

showScreen('auth-screen');