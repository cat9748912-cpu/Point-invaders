// ══════════════════════════════════════════════════════════════════════
//  🔥 FIREBASE SETUP — REALTIME DATABASE SYNCED
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

let auth = null, db = null;
try { 
  firebase.initializeApp(FB); 
  auth = firebase.auth(); 
  db = firebase.database(); 
} catch(e) { 
  console.warn('Firebase initialization error:', e.message); 
}

// ════════════════════════════════════════════
//  🌌 PARTICLE BACKGROUND
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
//  📦 GLOBAL STATE & CONFIG
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
//  🔐 AUTHENTICATION HANDLERS
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
  if(!auth){toast('⚠️ Firebase not configured');return}
  const email=document.getElementById('l-email').value.trim();
  const pass=document.getElementById('l-pass').value;
  if(!email||!pass){setErr('Please fill in all fields.');return}
  try{const c=await auth.signInWithEmailAndPassword(email,pass);await loadUser(c.user.uid)}
  catch(e){setErr(fErr(e.code))}
};

document.getElementById('btn-signup').onclick=async()=>{
  if(!auth||!db){toast('⚠️ Firebase not configured');return}
  const name=document.getElementById('s-name').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const pass=document.getElementById('s-pass').value;
  if(!name||!email||!pass){setErr('Please fill in all fields.');return}
  if(!/^[a-zA-Z0-9_-]{2,20}$/.test(name)){setErr('Username: 2-20 chars, letters/numbers/_-');return}
  try{
    const c=await auth.createUserWithEmailAndPassword(email,pass);
    await db.ref('players/' + c.user.uid).set({ username: name, totalPoints: 0, gamesPlayed: 0 });
    await loadUser(c.user.uid);
  }catch(e){setErr(fErr(e.code))}
};

const fErr=c=>({'auth/email-already-in-use':'Email already in use.','auth/wrong-password':'Incorrect password.','auth/user-not-found':'No account found.','auth/weak-password':'Password must be 6+ characters.','auth/invalid-email':'Invalid email.','auth/invalid-credential':'Email or password is incorrect.'}[c]||'Something went wrong. Try again.');

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
  user=null;showScreen('auth-screen');toast('👋 See you next time!');
};

// ════════════════════════════════════════════
//  🏠 HUB SYSTEM
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
  if(aCanvas) { aCanvas.onmousemove = null; }
  enterHub();
};

// ════════════════════════════════════════════
//  🎮 CORE INITIALIZATION SWITCH
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
    toast(`✅ +${pts} pts synced!`);
  } catch (e) { console.error("Database Save failure:", e) }
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
      setTimeout(()=>showResults('click',pts,{'🖱️ Total Clicks':clicks,'🏆 Final Score':`${pts} pts`}),400);
    }
  },1000);
}

// ════════════════════════════════════════════
//  🚀 GAME 2: NEON NEBULA (OVERDRIVE ENGINE)
// ════════════════════════════════════════════
function startNebula(){
  document.getElementById('g-canvas-holder').style.display='block';
  let score=0, time=30, shipX=180, bullets=[], enemies=[], enemyTimer=0;
  document.getElementById('g-time').textContent=time;
  
  let moveLeft=false, moveRight=false;
  window.onkeydown=e=>{if(e.code==='ArrowLeft')moveLeft=true;if(e.code==='ArrowRight')moveRight=true;if(e.code==='Space'||e.code==='ArrowUp')bullets.push({x:shipX+17,y:460})};
  window.onkeyup=e=>{if(e.code==='ArrowLeft')moveLeft=false;if(e.code==='ArrowRight')moveRight=false};
  
  document.getElementById('ctrl-left').onmousedown=()=>moveLeft=true;document.getElementById('ctrl-left').onmouseup=()=>moveLeft=false;
  document.getElementById('ctrl-right').onmousedown=()=>moveRight=true;document.getElementById('ctrl-right').onmouseup=()=>moveRight=false;
  document.getElementById('ctrl-action').onclick=()=>bullets.push({x:shipX+17,y:460});

  gTimer=setInterval(()=>{
    time--;document.getElementById('g-time').textContent=time;
    document.getElementById('prog-fill').style.width=`${time/30*100}%`;
    if(time<=0) end();
  },1000);

  function loop(){
    aCtx.clearRect(0,0,400,500);
    if(moveLeft) shipX=Math.max(0, shipX-6);
    if(moveRight) shipX=Math.min(360, shipX+6);
    aCtx.fillStyle='#00f5ff';aCtx.fillRect(shipX,470,40,15);aCtx.fillRect(shipX+15,460,10,10);
    
    bullets.forEach((b,bi)=>{b.y-=8;aCtx.fillStyle='#ff0090';aCtx.fillRect(b.x,b.y,5,10);if(b.y<0)bullets.splice(bi,1)});
    enemyTimer++;if(enemyTimer%25===0){enemies.push({x:Math.random()*360,y:-20,w:30,h:20,s:Math.random()*1.5+2})}
    enemies.forEach((e,ei)=>{
      e.y+=e.s;aCtx.fillStyle='#39ff14';aCtx.fillRect(e.x,e.y,e.w,e.h);
      bullets.forEach((b,bi)=>{
        if(b.x>e.x&&b.x<e.x+e.w&&b.y>e.y&&b.y<e.y+e.h){score+=25;setLive(score);enemies.splice(ei,1);bullets.splice(bi,1)}
      });
      if(e.y>500) enemies.splice(ei,1);
    });
    gameLoopId=requestAnimationFrame(loop);
  }
  function end(){
    clearInterval(gTimer);cancelAnimationFrame(gameLoopId);window.onkeydown=window.onkeyup=null;
    const finalPts=Math.min(1000, score);
    showResults('nebula', finalPts, {'👾 Overdrive Cores Wiped':score/25, '🏆 Final Score':`${finalPts} pts`});
  }
  loop();
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
  function end(){clearInterval(gTimer);cancelAnimationFrame(gameLoopId);window.onkeydown=null;showResults('tetris',Math.min(1200,score),{'🧱 Data Lines Dropped':score/150,'🏆 Final Score':`${score} pts`})}
  loop();
}

// ════════════════════════════════════════════
//  💥 GAME 4: DODGE CORES (SMOOTH MOUSE ENGINE)
// ════════════════════════════════════════════
function startDodge(){
  document.getElementById('g-canvas-holder').style.display='block';
  let score=0, time=30, isGameOver=false, player={x:200,y:250,r:8}, obstacles=[];
  document.getElementById('g-time').textContent=time;

  // Track Mouse Movement Position Coordinates Smoothly
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
    
    // Render Player Dot Core
    aCtx.beginPath();aCtx.arc(player.x,player.y,player.r,0,Math.PI*2);
    aCtx.fillStyle='var(--cyan)';aCtx.fill();
    aCtx.strokeStyle='#fff';aCtx.stroke();

    // Spawn Obstacles
    if(Math.random()<.08) {
      obstacles.push({
        x:Math.random()*400,y:0,
        vx:(Math.random()-0.5)*4,vy:Math.random()*3+3,
        r:Math.random()*6+6
      });
    }

    // Process and Matrix Render Obstacles
    for(let i=obstacles.length-1; i>=0; i--){
      let o = obstacles[i];
      o.x += o.vx; o.y += o.vy;
      
      aCtx.beginPath();aCtx.arc(o.x,o.y,o.r,0,Math.PI*2);
      aCtx.fillStyle='var(--orange)';aCtx.fill();
      
      // Calculate Circle Matrix Collision Intersection
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
    showResults('dodge',Math.min(800,score),{'⏱️ Time Alive':score/25,'🏆 Score':`${score} pts`});
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
  function end(){clearInterval(gTimer);showResults('memory',Math.min(600,score),{'🧩 Node Pairs Matched':matched,'🏆 Score':`${score} pts`})}
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
    if(time<=0){document.getElementById('math-answer').onkeydown=null;showResults('math',Math.min(750,score),{'🔢 Solutions Found':score/50,'🏆 Score':`${score} pts`})}
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
  function end(){clearTimeout(trigger);box.onclick=null;showResults('reaction',Math.min(400,score),{'🏆 Final Points Accumulated':score})}
}

// ════════════════════════════════════════════
//  🏆 LEADERBOARD DISPLAY GENERATOR
// ════════════════════════════════════════════
async function loadLeaderboard(){
  const panel=document.getElementById('lb-panel');if(!db){panel.innerHTML='<div class="lb-empty">⚠️ Connecting Database...</div>';return}
  try{
    db.ref('players').orderByChild('totalPoints').limitToLast(20).once('value', (snapshot) => {
      if(!snapshot.exists()){panel.innerHTML='<div class="lb-empty">No scores yet — be first!</div>';return}
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
