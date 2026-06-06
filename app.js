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
//  📦 GLOBAL STATE
// ════════════════════════════════════════════
let user=null, curGame=null, gTimer=null;
const META = { click: { name: 'CLICK FRENZY', emoji: '🖱️', maxPts: 500 } };

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
    await db.ref('players/' + c.user.uid).set({
      username: name,
      totalPoints: 0,
      gamesPlayed: 0
    });
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
//  🏠 HUB
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

document.getElementById('btn-quit').onclick=()=>{clearInterval(gTimer);enterHub()};

// ════════════════════════════════════════════
//  🎮 GAME ENGINE
// ════════════════════════════════════════════
function prepGame(gid){
  document.querySelectorAll('.g-area>div').forEach(d=>d.style.display='none');
  document.getElementById('g-pts').textContent='0';
  document.getElementById('g-time').textContent='—';
  document.getElementById('prog-fill').style.width='100%';
  document.getElementById('prog-fill').style.background='var(--cyan)';
  countdown(()=>startClick());
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  clearInterval(gTimer);
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
      
      const newPoints = (d.totalPoints || 0) + pts;
      const newGamesPlayed = (d.gamesPlayed || 0) + 1;
      const newHighScores = { ...hs, [gid]: Math.max(hs[gid] || 0, pts) };
      
      playerRef.update({
        username: user.username,
        totalPoints: newPoints,
        gamesPlayed: newGamesPlayed,
        highScores: newHighScores
      });
      
      if (user) user.totalPoints = newPoints;
    });
    toast(`✅ +${pts} pts saved!`);
  } catch (e) {
    toast('⚠️ Score not saved');
    console.error(e);
  }
}

// ════════════════════════════════════════════
//  🖱️ GAME: CLICK FRENZY
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
    t--;
    document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/10*100}%`;
    if(t<=0){
      clearInterval(gTimer);btn.disabled=true;btn.onclick=null;
      const pts=Math.min(500,clicks*8);
      setTimeout(()=>showResults('click',pts,{'🖱️ Total Clicks':clicks,'⚡ Pts/click':8,'🏆 Final Score':`${pts} pts`}),400);
    }
  },1000);
}

// ════════════════════════════════════════════
//  🏆 LEADERBOARD LOAD
// ════════════════════════════════════════════
async function loadLeaderboard(){
  const panel=document.getElementById('lb-panel');
  if(!db){panel.innerHTML='<div class="lb-empty">⚠️ Database connecting...</div>';return}
  panel.innerHTML='<div class="lb-empty">Loading...</div>';
  try{
    db.ref('players').orderByChild('totalPoints').limitToLast(20).once('value', (snapshot) => {
      if (!snapshot.exists()) {
        panel.innerHTML = '<div class="lb-empty">No players yet — be first!</div>';
        return;
      }
      
      const players = [];
      snapshot.forEach((child) => {
        players.push({ uid: child.key, ...child.val() });
      });
      
      players.reverse();
      
      const medals = ['🥇', '🥈', '🥉'];
      panel.innerHTML = '<div class="lb-title">🏆 TOP PLAYERS</div>';
      
      players.forEach((d, i) => {
        const isMe = user && d.uid === user.uid;
        const cls = isMe ? 'me' : i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
        const row = document.createElement('div'); 
        row.className = `lb-row ${cls}`;
        row.innerHTML = `<div class="lb-rank">${medals[i] || '#' + (i + 1)}</div><div class="lb-name">${esc(d.username)}${isMe ? ' ← You' : ''}</div><div class="lb-score">${(d.totalPoints || 0).toLocaleString()} PTS</div>`;
        panel.appendChild(row);
      });
    });
  }catch(e){panel.innerHTML='<div class="lb-empty">⚠️ Error loading scores</div>';console.error(e)}
}

const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── BOOT ──
showScreen('auth-screen');
