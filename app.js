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

// Explicit global initialization variables to eliminate Console ReferenceErrors
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
const META = { 
  click: { name: 'CLICK FRENZY', emoji: '🖱️', maxPts: 500 },
  nebula: { name: 'NEON NEBULA', emoji: '🚀', maxPts: 1000 },
  tetris: { name: 'CYBERPUNK TETRIS', emoji: '🧱', maxPts: 1200 },
  dodge: { name: 'DODGE CORES', emoji: '💥', maxPts: 800 },
  memory: { name: 'MEMORY MATCH', emoji: '🧠', maxPts: 600 },
  math: { name: 'MATH BLITZ', emoji: '🔢', maxPts: 750 },
  reaction: { name: 'REACTION TIME', emoji: '⚡', maxPts: 400 }
};

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
  clearInterval(gTimer);
  cancelAnimationFrame(gameLoopId);
  window.onkeydown = window.onkeyup = null;
  if(aCanvas) { aCanvas.onmousemove = null; }
  enterHub();
};

// ════════════════════════════════════════════
//  🎮 ROUTING & SCHEDULING INTERFACE
// ════════════════════════════════════════════
function prepGame(gid){
  document.getElementById('g-click').style.display='none';
  document.getElementById('g-canvas-holder').style.display='none';
  document.getElementById('g-memory').style.display='none';
  document.getElementById('g-math').style.display='none';
  document.getElementById('g-reaction').style.display='none';
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
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  clearInterval(gTimer);
  cancelAnimationFrame(gameLoopId);
  window.onkeydown = window.onkeyup = null;
  if(aCanvas) { aCanvas.onmousemove = null; }
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
  let clicks=0,t=10;
  document.getElementById('click-count').textContent='0';
  document.getElementById('g-time').textContent='10';
  const btn=document.getElementById('click-btn');
  btn.disabled=false;
  btn.onclick=()=>{clicks++;document.getElementById('click-count').textContent=clicks;setLive(Math.min(500,clicks*8))};
  gTimer=setInterval(()=>{
    t--;document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/10*100}%`;
    if(t<=0){
      clearInterval(gTimer);btn.disabled=true;btn.onclick=null;
      const pts=Math.min(500,clicks*8);
      setTimeout(()=>showResults('click',pts,{'🖱️ Structural Actions':clicks,'🏆 Final Score':`${pts} PTS`}),400);
    }
  },1000);
}

// ══════════════════════════════════════════════════════════════════════
//  🚀 GAME 2: HIGH QUALITY NEON NEBULA (PRO VECTOR ENGINE INTEGRATED)
// ══════════════════════════════════════════════════════════════════════
function startNebula(){
  document.getElementById('g-canvas-holder').style.display='block';
  
  // Game Setup & Scoped Variables adapted perfectly for the 400x500 viewport
  let score = 0, gameTime = 30, shield = 100, screenShake = 0;
  let projectiles = [], enemies = [], powerups = [], particles = [], floatingTexts = [], backgroundStars = [];
  let enemySpawnTimer = 0, enemySpawnInterval = 1000, lastTime = performance.now();
  
  document.getElementById('g-time').textContent = gameTime;
  document.getElementById('prog-fill').style.width = '100%';
  document.getElementById('prog-fill').style.background = 'linear-gradient(90deg, #ff0844, #ff4e50)';

  // Build Parallax Starfield Matrix
  for (let i = 0; i < 30; i++) backgroundStars.push({ x: Math.random() * 400, y: Math.random() * 500, size: 1, speed: 0.5, alpha: 0.4 });
  for (let i = 0; i < 15; i++) backgroundStars.push({ x: Math.random() * 400, y: Math.random() * 500, size: 1.6, speed: 1.4, alpha: 0.8 });

  // Input Mapping Systems
  let keys = {}, moveLeft = false, moveRight = false;
  window.onkeydown = e => { if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) e.preventDefault(); keys[e.code] = true; };
  window.onkeyup = e => { if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) e.preventDefault(); keys[e.code] = false; };

  document.getElementById('ctrl-left').onmousedown = () => moveLeft = true; document.getElementById('ctrl-left').onmouseup = () => moveLeft = false;
  document.getElementById('ctrl-right').onmousedown = () => moveRight = true; document.getElementById('ctrl-right').onmouseup = () => moveRight = false;
  document.getElementById('ctrl-action').onclick = () => player.shoot();

  // Engine Objects & Geometry Synthesizers
  const player = {
    x: 183, y: 430, w: 34, h: 26, vx: 0, friction: 0.85, accel: 1.2, cooldown: 0, angle: 0, weaponLevel: 1,
    update(dt) {
      if (keys['ArrowLeft'] || keys['KeyA'] || moveLeft) this.vx -= this.accel;
      if (keys['ArrowRight'] || keys['KeyD'] || moveRight) this.vx += this.accel;
      this.vx *= this.friction; this.x += this.vx;
      this.angle = this.vx * 0.05; // Banking physics lean factor
      if (this.x < 5) { this.x = 5; this.vx = 0; }
      if (this.x > 400 - this.w - 5) { this.x = 400 - this.w - 5; this.vx = 0; }
      if (this.cooldown > 0) this.cooldown -= dt;
      if (keys['Space'] && this.cooldown <= 0) { this.shoot(); this.cooldown = 150; }
    },
    shoot() {
      if (this.weaponLevel === 1) {
        projectiles.push({ x: this.x + this.w / 2, y: this.y, vx: 0, vy: -10 });
      } else if (this.weaponLevel === 2) {
        projectiles.push({ x: this.x + 6, y: this.y + 5, vx: -1.5, vy: -10 });
        projectiles.push({ x: this.x + this.w - 6, y: this.y + 5, vx: 1.5, vy: -10 });
      } else {
        projectiles.push({ x: this.x + 5, y: this.y + 5, vx: -2, vy: -10 });
        projectiles.push({ x: this.x + this.w / 2, y: this.y, vx: 0, vy: -12 });
        projectiles.push({ x: this.x + this.w - 5, y: this.y + 5, vx: 2, vy: -10 });
      }
    },
    draw() {
      aCtx.save(); aCtx.translate(this.x + this.w / 2, this.y + this.h / 2); aCtx.rotate(this.angle);
      aCtx.shadowBlur = 15; aCtx.shadowColor = '#00f5ff'; aCtx.fillStyle = '#00f5ff';
      aCtx.beginPath(); aCtx.moveTo(0, -this.h / 2); aCtx.lineTo(-this.w / 2, this.h / 2); aCtx.lineTo(-this.w / 4, this.h / 4);
      aCtx.lineTo(this.w / 4, this.h / 4); aCtx.lineTo(this.w / 2, this.h / 2); aCtx.closePath(); aCtx.fill();
      aCtx.shadowBlur = 5; aCtx.shadowColor = '#fff'; aCtx.fillStyle = '#fff';
      aCtx.beginPath(); aCtx.moveTo(0, -this.h / 3); aCtx.lineTo(-3, 3); aCtx.lineTo(3, 3); aCtx.closePath(); aCtx.fill();
      aCtx.fillStyle = Math.random() > 0.5 ? '#ff0844' : '#ff6600'; aCtx.fillRect(-3, this.h / 2 - 2, 6, Math.random() * 6 + 3);
      aCtx.restore();
    }
  };

  class Enemy {
    constructor(type) {
      this.type = type; this.x = Math.random() * 350 + 10; this.y = -30; this.offset = Math.random() * 100;
      if (type === 'SCOUT') { this.w = 20; this.h = 20; this.speed = 3.5; this.hp = 1; this.color = '#ff0090'; this.pts = 15; }
      else if (type === 'BOMBER') { this.w = 36; this.h = 28; this.speed = 1.2; this.hp = 3; this.color = '#ff6600'; this.pts = 40; }
      else { this.w = 26; this.h = 22; this.speed = 2.2; this.hp = 2; this.color = '#a855f7'; this.pts = 25; }
    }
    update() {
      this.y += this.speed;
      if (this.type === 'FIGHTER') this.x += Math.sin(this.y * 0.03 + this.offset) * 1.5;
    }
    draw() {
      aCtx.save(); aCtx.shadowBlur = 12; aCtx.shadowColor = this.color; aCtx.fillStyle = this.color;
      aCtx.beginPath();
      if (this.type === 'BOMBER') {
        aCtx.moveTo(this.x + this.w / 2, this.y + this.h); aCtx.lineTo(this.x, this.y + this.h * 0.4);
        aCtx.lineTo(this.x + this.w * 0.2, this.y); aCtx.lineTo(this.x + this.w * 0.8, this.y); aCtx.lineTo(this.x + this.w, this.y + this.h * 0.4);
      } else {
        aCtx.moveTo(this.x + this.w / 2, this.y + this.h); aCtx.lineTo(this.x, this.y); aCtx.lineTo(this.x + this.w, this.y);
      }
      aCtx.closePath(); aCtx.fill(); aCtx.restore();
    }
  }

  function explode(x, y, color, qty = 10) {
    for (let i = 0; i < qty; i++) {
      let ang = Math.random() * Math.PI * 2, v = Math.random() * 4 + 1;
      particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, alpha: 1, decay: Math.random() * 0.03 + 0.02, color });
    }
  }
  function popText(x, y, txt, color) { floatingTexts.push({ x, y, txt, color, alpha: 1 }); }
  const collide = (r1, r2) => r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;

  // Global Pipeline System Loops
  gTimer = setInterval(() => {
    gameTime--; document.getElementById('g-time').textContent = gameTime;
    if (gameTime <= 0) end();
  }, 1000);

  function pipeline(now) {
    let dt = now - lastTime; lastTime = now;
    aCtx.clearRect(0, 0, 400, 500);

    // Screen Shake Offset Mapping Matrix
    aCtx.save(); if (screenShake > 0.5) { aCtx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake); screenShake *= 0.88; }

    // Parallax Render Block
    backgroundStars.forEach(s => { s.y += s.speed; if (s.y > 500) s.y = 0; aCtx.fillStyle = `rgba(255,255,255,${s.alpha})`; aCtx.fillRect(s.x, s.y, s.size, s.size); });

    player.update(dt); player.draw();

    // Spawning Vectors
    enemySpawnTimer += dt;
    if (enemySpawnTimer >= enemySpawnInterval) {
      let r = Math.random(), type = 'SCOUT';
      if (score > 150 && r > 0.75) type = 'BOMBER'; else if (score > 60 && r > 0.4) type = 'FIGHTER';
      enemies.push(new Enemy(type)); enemySpawnTimer = 0;
      enemySpawnInterval = Math.max(300, 1100 - score * 0.5);
    }

    // Laser Tracking Pass
    projectiles.forEach((p, pi) => {
      p.x += p.vx; p.y += p.vy;
      aCtx.save(); aCtx.shadowBlur = 10; aCtx.shadowColor = '#00f5ff'; aCtx.fillStyle = '#00f5ff';
      aCtx.fillRect(p.x - 1.5, p.y, 3, 10); aCtx.restore();
      if (p.y < -10) projectiles.splice(pi, 1);
    });

    // Crystal Matrix Processing Pass
    powerups.forEach((pu, pui) => {
      pu.y += 1.8; pu.pulse += 0.1;
      aCtx.save(); aCtx.shadowBlur = 10; aCtx.shadowColor = '#39ff14'; aCtx.fillStyle = '#39ff14';
      aCtx.translate(pu.x, pu.y); aCtx.rotate(pu.pulse * 0.2); aCtx.fillRect(-6, -6, 12, 12); aCtx.restore();
      if (collide({ x: player.x, y: player.y, w: player.w, h: player.h }, { x: pu.x - 6, y: pu.y - 6, w: 12, h: 12 })) {
        player.weaponLevel = Math.min(3, player.weaponLevel + 1);
        popText(player.x, player.y - 10, 'PLASMA UPGRADE!', '#39ff14'); explode(pu.x, pu.y, '#39ff14', 15);
        powerups.splice(pui, 1);
      } else if (pu.y > 520) powerups.splice(pui, 1);
    });

    // Grid Alien Collision Engine Trace
    enemies.forEach((e, ei) => {
      e.update(); e.draw();
      if (e.y > 510) { enemies.splice(ei, 1); shield -= 15; screenShake = 10; document.getElementById('prog-fill').style.width = `${Math.max(0, shield)}%`; if (shield <= 0) end(); return; }
      
      // Structural Ship Hull Clash
      if (collide({ x: player.x, y: player.y, w: player.w, h: player.h }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        explode(e.x + e.w / 2, e.y + e.h / 2, e.color, 20); enemies.splice(ei, 1);
        shield -= 25; screenShake = 18; document.getElementById('prog-fill').style.width = `${Math.max(0, shield)}%`; if (shield <= 0) end(); return;
      }

      // Laser Collision Intersection Matrix
      projectiles.forEach((p, pi) => {
        if (collide({ x: p.x - 1.5, y: p.y, w: 3, h: 10 }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
          projectiles.splice(pi, 1); e.hp--; explode(p.x, p.y, '#00f5ff', 3);
          if (e.hp <= 0) {
            explode(e.x + e.w / 2, e.y + e.h / 2, e.color, 15); popText(e.x, e.y, `+${e.pts}`, e.color);
            if (Math.random() < 0.14) powerups.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, pulse: 0 });
            score += e.pts; setLive(score); enemies.splice(ei, 1);
          }
        }
      });
    });

    // Particle FX Bloom Pass
    particles.forEach((p, pi) => {
      p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
      if (p.alpha <= 0) { particles.splice(pi, 1); return; }
      aCtx.save(); aCtx.globalAlpha = p.alpha; aCtx.fillStyle = p.color; aCtx.fillRect(p.x, p.y, 2, 2); aCtx.restore();
    });

    // Burst Float Text Pass
    floatingTexts.forEach((ft, fti) => {
      ft.y -= 0.8; ft.alpha -= 0.02;
      if (ft.alpha <= 0) { floatingTexts.splice(fti, 1); return; }
      aCtx.save(); aCtx.globalAlpha = ft.alpha; aCtx.font = 'bold 11px Orbitron'; aCtx.fillStyle = ft.color; aCtx.fillText(ft.txt, ft.x, ft.y); aCtx.restore();
    });

    aCtx.restore();
    gameLoopId = requestAnimationFrame(pipeline);
  }

  function end() {
    clearInterval(gTimer); cancelAnimationFrame(gameLoopId); window.onkeydown = window.onkeyup = null;
    const finalPts = Math.min(1000, score);
    showResults('nebula', finalPts, { '👾 Alien Matrices Purged': score / 25, '🛡️ Shield Grid Status': `${Math.max(0, shield)}%`, '🏆 Final Earnings': `${finalPts} PTS` });
  }

  gameLoopId = requestAnimationFrame(pipeline);
}

// ════════════════════════════════════════════
//  🧱 GAME 3: CYBERPUNK TETRIS
// ════════════════════════════════════════════
function startTetris(){
  document.getElementById('g-canvas-holder').style.display='block';
  let score=0, time=45, grid=Array.from({length:20},()=>Array(10).fill(0)), currentPiece=null, currentX=3, currentY=0, dropTimer=0;
  document.getElementById('g-time').textContent=time;
  
  const PIECES=[[[1,1,1,1]],[[1,1,1],[0,1,0]],[[1,1],[1,1]],[[1,1,0],[0,1,1]]];
  const COLORS=['#a855f7','#ff6600','#00f5ff','#39ff14'];let pIdx=0;

  function spawn(){pIdx=Math.floor(Math.random()*PIECES.length);currentPiece=PIECES[pIdx];currentX=3;currentY=0}
  spawn();

  window.onkeydown=e=>{
    if(e.code==='ArrowLeft') move(-1);if(e.code==='ArrowRight') move(1);
    if(e.code==='ArrowDown') drop();if(e.code==='Space'||e.code==='ArrowUp') rotate();
  };
  document.getElementById('ctrl-left').onclick=()=>move(-1);
  document.getElementById('ctrl-right').onclick=()=>move(1);
  document.getElementById('ctrl-action').onclick=()=>rotate();

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/45*100}%`;
    if(time<=0) end();
  },1000);

  function checkCol(px,py,p){
    for(let r=0;r<p.length;r++)for(let c=0;c<p[r].length;c++)if(p[r][c]){
      let nx=px+c, ny=py+r;if(nx<0||nx>=10||ny>=20||(ny>=0&&grid[ny][nx]))return true;
    } return false;
  }
  function merge(){currentPiece.forEach((r,ri)=>{r.forEach((v,ci)=>{if(v&&currentY+ri>=0)grid[currentY+ri][currentX+ci]=COLORS[pIdx]})})}
  function clearLines(){let c=0;grid.forEach((r,ri)=>{if(r.every(v=>v!==0)){grid.splice(ri,1);grid.unshift(Array(10).fill(0));c++}});if(c>0){score+=c*150;setLive(score)}}
  function move(dir){currentX+=dir;if(checkCol(currentX,currentY,currentPiece))currentX-=dir}
  function drop(){currentY++;if(checkCol(currentX,currentY,currentPiece)){currentY--;merge();clearLines();spawn();if(checkCol(currentX,currentY,currentPiece))end()}}
  function rotate(){let r=currentPiece[0].map((_,i)=>currentPiece.map(row=>row[i]).reverse());if(!checkCol(currentX,currentY,r))currentPiece=r}

  function loop(){
    aCtx.clearRect(0,0,400,500);dropTimer++;if(dropTimer%22===0)drop();
    grid.forEach((r,ri)=>{r.forEach((v,ci)=>{if(v){aCtx.fillStyle=v;aCtx.fillRect(ci*40,ri*25,38,23)}})});
    if(currentPiece){aCtx.fillStyle=COLORS[pIdx];currentPiece.forEach((r,ri)=>{r.forEach((v,ci)=>{if(v){aCtx.fillRect((currentX+ci)*40,(currentY+ri)*25,38,23)}})})}
    gameLoopId=requestAnimationFrame(loop);
  }
  function end(){clearInterval(gTimer);cancelAnimationFrame(gameLoopId);window.onkeydown=null;showResults('tetris',Math.min(1200,score),{'🧱 Data Lines Dropped':score/150,'🏆 Final Score':`${score} PTS`})}
  loop();
}

// ══════════════════════════════════════════════════════════════════════
//  💥 GAME 4: DODGE CORES (STABILIZED SMOOTH MOUSE TRAIL TRACKING)
// ══════════════════════════════════════════════════════════════════════
function startDodge(){
  document.getElementById('g-canvas-holder').style.display='block';
  let score=0, time=30, isGameOver=false, player={x:200,y:250,r:8}, obstacles=[];
  document.getElementById('g-time').textContent=time;

  // Render a smooth neon tracking handler directly inside canvas bounding constraints
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

  function loop(){
    if(isGameOver) return;
    aCtx.clearRect(0,0,400,500);
    
    // Smooth Glowing Core Renderer
    aCtx.save(); aCtx.beginPath();aCtx.arc(player.x,player.y,player.r,0,Math.PI*2);
    aCtx.shadowBlur=15; aCtx.shadowColor='var(--cyan)'; aCtx.fillStyle='var(--cyan)';aCtx.fill();
    aCtx.strokeStyle='#fff';aCtx.stroke(); aCtx.restore();

    // Spawn Matrix Bouncers
    if(Math.random()<.08) {
      obstacles.push({
        x:Math.random()*400,y:0,
        vx:(Math.random()-0.5)*4,vy:Math.random()*3+3,
        r:Math.random()*6+6
      });
    }

    // Process & Render Obstacles
    for(let i=obstacles.length-1; i>=0; i--){
      let o = obstacles[i];
      o.x += o.vx; o.y += o.vy;
      
      aCtx.beginPath();aCtx.arc(o.x,o.y,o.r,0,Math.PI*2);
      aCtx.fillStyle='var(--orange)';aCtx.fill();
      
      // Calculate Vector Intersect Radius for Collisions
      let dx = o.x - player.x, dy = o.y - player.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      if(dist < o.r + player.r){ isGameOver=true; end(); return; }
      if(o.y>520) obstacles.splice(i,1);
    }
    gameLoopId=requestAnimationFrame(loop);
  }
  
  function end(){
    if(!isGameOver) isGameOver=true;
    clearInterval(gTimer);cancelAnimationFrame(gameLoopId);
    aCanvas.onmousemove=null;
    showResults('dodge',Math.min(800,score),{'⏱️ Operational Lifespan':score/25,'🏆 Score Accumulation':`${score} PTS`});
  }
  loop();
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
  function end(){clearInterval(gTimer);showResults('memory',Math.min(600,score),{'🧩 Clusters Unified':matched,'🏆 Score Accumulation':`${score} PTS`})}
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

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/20*100}%`;
    if(time<=0){document.getElementById('math-answer').onkeydown=null;showResults('math',Math.min(750,score),{'🔢 Nodes Resolved':score/50,'🏆 Score Accumulation':`${score} PTS`})}
  },1000);
}

// ════════════════════════════════════════════
//  ⚡ GAME 7: REACTION TIME
// ════════════════════════════════════════════
function startReaction(){
  const box=document.getElementById('g-reaction');box.style.display='flex';box.style.background='var(--red)';
  const txt=document.getElementById('reaction-text');txt.textContent='WAIT FOR GREEN...';
  let state='wait', startT=0, time=15, score=0;
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
  function end(){clearTimeout(trigger);box.onclick=null;showResults('reaction',Math.min(400,score),{'🏆 Final Sync Score':score})}
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

showScreen('auth-screen');
