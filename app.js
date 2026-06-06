// ════════════════════════════════════════════
//  🔥 FIREBASE — CONFIGURED & ONLINE!
// ════════════════════════════════════════════
const FB = {
  apiKey:            "AIzaSyC1NZy2ZzNLutYAiE_QjPZGH5CymvGCnDs",
  authDomain:        "neal-with-roblox.firebaseapp.com",
  projectId:         "neal-with-roblox",
  storageBucket:     "neal-with-roblox.firebasestorage.app",
  messagingSenderId: "984878364213",
  appId:             "1:984878364213:web:fb1147a1a5ff0b02d2a37c"
};

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
let user=null, curGame=null, curIfGame=null, gTimer=null, dodgeAF=null;

const META={
  click:   {name:'CLICK FRENZY',   emoji:'🖱️',maxPts:500},
  memory:  {name:'MEMORY MATCH',   emoji:'🧠',maxPts:400},
  reaction:{name:'REACTION TIME',  emoji:'⚡',maxPts:300},
  math:    {name:'MATH BLITZ',     emoji:'🔢',maxPts:400},
  dodge:   {name:'DODGE',          emoji:'🚀',maxPts:600},
  tetris:  {name:'CYBERPUNK TETRIS',emoji:'🟧',url:'https://cat9748912-cpu.github.io/Tetris/'},
  invaders:{name:'NEON NEBULA',    emoji:'👾',url:'https://cat9748912-cpu.github.io/Neon-Nebula-Overdrive-edition/'}
};

// ════════════════════════════════════════════
//  🖥️ SCREENS
// ════════════════════════════════════════════
const showScreen=id=>{
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  setTimeout(()=>document.getElementById(id)?.classList.add('active'),40);
};

// ════════════════════════════════════════════
//  🔔 TOAST / CONFETTI
// ════════════════════════════════════════════
let _tt;
const toast=(msg,ms=2500)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),ms)};

const confetti=(n=60)=>{
  const cols=['#00f5ff','#ff0090','#39ff14','#ffd700','#a855f7','#ff6600'];
  for(let i=0;i<n;i++){const el=document.createElement('div');el.className='cft';el.style.cssText=`left:${Math.random()*100}vw;top:-10px;background:${cols[0|Math.random()*cols.length]};animation-delay:${Math.random()*.8}s;animation-duration:${1.5+Math.random()*1.5}s`;document.body.appendChild(el);el.addEventListener('animationend',()=>el.remove())}
};

// ════════════════════════════════════════════
//  ⏳ COUNTDOWN
// ════════════════════════════════════════════
const countdown=cb=>{
  const ov=document.getElementById('cd-ov'),nm=document.getElementById('cd-num');
  ov.classList.add('show');let n=3;
  const tick=()=>{nm.className='';nm.textContent=n>0?n:'GO!';void nm.offsetWidth;nm.className='cd-pop';if(n<=0)setTimeout(()=>{ov.classList.remove('show');cb()},700);else{n--;setTimeout(tick,1000)}};
  tick();
};

// ════════════════════════════════════════════
//  🔐 AUTH
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
  if(!auth){toast('⚠️ Firebase connection issue');return}
  const email=document.getElementById('l-email').value.trim();
  const pass=document.getElementById('l-pass').value;
  if(!email||!pass){setErr('Please fill in all fields.');return}
  try{const c=await auth.signInWithEmailAndPassword(email,pass);await loadUser(c.user.uid)}
  catch(e){setErr(fErr(e.code))}
};

document.getElementById('btn-signup').onclick=async()=>{
  if(!auth){toast('⚠️ Firebase connection issue');return}
  const name=document.getElementById('s-name').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const pass=document.getElementById('s-pass').value;
  if(!name||!email||!pass){setErr('Please fill in all fields.');return}
  if(!/^[a-zA-Z0-9_-]{2,20}$/.test(name)){setErr('Username: 2-20 chars, letters/numbers/_-');return}
  try{
    const c=await auth.createUserWithEmailAndPassword(email,pass);
    await db.collection('players').doc(c.user.uid).set({username:name,totalPoints:0,gamesPlayed:0,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    await loadUser(c.user.uid);
  }catch(e){setErr(fErr(e.code))}
};

['l-pass','s-pass'].forEach(id=>document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById(id==='l-pass'?'btn-login':'btn-signup').click()}));

const fErr=c=>({'auth/email-already-in-use':'Email already in use.','auth/wrong-password':'Incorrect password.','auth/user-not-found':'No account found.','auth/weak-password':'Password must be 6+ characters.','auth/invalid-email':'Invalid email.','auth/invalid-credential':'Email or password is incorrect.'}[c]||'Something went wrong. Try again.');

async function loadUser(uid){
  if(!db)return;
  const doc=await db.collection('players').doc(uid).get();
  const data=doc.exists?doc.data():{username:'Player',totalPoints:0,gamesPlayed:0};
  user={uid,...data};
  enterHub();
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
    if(gid==='tetris'||gid==='invaders'){openIframe(gid)}
    else{curGame=gid;document.getElementById('g-title').textContent=META[gid].name;showScreen('game-screen');prepGame(gid)}
  });
});

document.getElementById('btn-quit').onclick=()=>{clearTimers();stopDodge();enterHub()};

// ════════════════════════════════════════════
//  🎮 GAME ENGINE
// ════════════════════════════════════════════
function prepGame(gid){
  document.querySelectorAll('.g-area>div').forEach(d=>d.style.display='none');
  document.getElementById('g-pts').textContent='0';
  document.getElementById('g-time').textContent='—';
  document.getElementById('prog-fill').style.width='100%';
  const c={click:'var(--cyan)',memory:'var(--pink)',reaction:'var(--lime)',math:'var(--gold)',dodge:'var(--purple)'};
  document.getElementById('prog-fill').style.background=c[gid]||'var(--cyan)';
  countdown(()=>({click:startClick,memory:startMemory,reaction:startReaction,math:startMath,dodge:startDodge}[gid]()));
}

function clearTimers(){
  clearInterval(gTimer);
  clearTimeout(window._rt);clearTimeout(window._rt2);
  clearTimeout(window._mt);clearTimeout(window._ct);
}

const setLive=n=>document.getElementById('g-pts').textContent=n;

function showResults(gid,pts,bd){
  clearTimers();stopDodge();
  const m=META[gid],pct=pts/m.maxPts;
  document.getElementById('res-emoji').textContent=pct>.75?'🎉':pct>.45?'😎':'💪';
  document.getElementById('res-gname').textContent=m.name;
  document.getElementById('res-pts').textContent=pts;
  document.getElementById('res-bd').innerHTML=Object.entries(bd).map(([k,v])=>`<div class="res-row"><span>${k}</span><span class="rv">${v}</span></div>`).join('');
  showScreen('results-screen');
  if(pts>80)confetti(pts>300?80:50);
  saveScore(gid,pts);
  document.getElementById('btn-again').onclick=()=>{showScreen('game-screen');prepGame(gid)};
  document.getElementById('btn-hub').onclick=()=>{document.getElementById('h-pts').textContent=`🏆 ${(user?.totalPoints||0).toLocaleString()} PTS`;enterHub()};
}

async function saveScore(gid,pts){
  if(!db||!user)return;
  try{
    await db.runTransaction(async tx=>{
      const ref=db.collection('players').doc(user.uid);
      const doc=await tx.get(ref);
      const d=doc.exists?doc.data():{totalPoints:0,gamesPlayed:0,highScores:{}};
      const hs=d.highScores||{};
      tx.set(ref,{username:user.username,totalPoints:(d.totalPoints||0)+pts,gamesPlayed:(d.gamesPlayed||0)+1,highScores:{...hs,[gid]:Math.max(hs[gid]||0,pts)},lastPlayed:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    if(user)user.totalPoints=(user.totalPoints||0)+pts;
    toast(`✅ +${pts} pts saved!`);
  }catch(e){toast('⚠️ Score not saved');console.error(e)}
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
//  🧠 GAME 2: MEMORY MATCH
// ════════════════════════════════════════════
function startMemory(){
  document.getElementById('g-memory').style.display='block';
  const emojis=['🎮','🚀','⚡','🌈','🎸','🦊','💎','🔥'];
  const deck=[...emojis,...emojis].sort(()=>Math.random()-.5);
  let flipped=[],matched=0,moves=0,canFlip=true,t=60;
  document.getElementById('g-time').textContent='60';
  const grid=document.getElementById('mem-grid');
  grid.innerHTML='';
  deck.forEach(em=>{
    const c=document.createElement('div');c.className='mem-card';c.dataset.em=em;
    c.innerHTML=`<span class="mem-front">${em}</span><span class="mem-back">❓</span>`;
    c.addEventListener('click',()=>{
      if(!canFlip||c.classList.contains('match')||c.classList.contains('flip')||flipped.length>=2)return;
      c.classList.add('flip');flipped.push(c);moves++;
      if(flipped.length===2){
        canFlip=false;
        if(flipped[0].dataset.em===flipped[1].dataset.em){
          flipped.forEach(x=>x.classList.add('match'));matched++;flipped=[];canFlip=true;
          const p=Math.max(0,matched*40-Math.max(0,moves-matched*2)*8+t*2);setLive(p);
          if(matched===8){clearInterval(gTimer);setTimeout(()=>showResults('memory',Math.min(400,p),{'🃏 Pairs':matched+'/8','🔄 Moves':moves,'⏱️ Time Left':t+'s','🏆 Score':p+' pts'}),500)}
        }else setTimeout(()=>{flipped.forEach(x=>x.classList.remove('flip'));flipped=[];canFlip=true},800);
      }
    });
    grid.appendChild(c);
  });
  gTimer=setInterval(()=>{
    t--;document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/60*100}%`;
    if(t<=0){
      clearInterval(gTimer);
      const p=Math.max(0,matched*40-Math.max(0,moves-matched*2)*8);
      setTimeout(()=>showResults('memory',p,{'🃏 Pairs':matched+'/8','🔄 Moves':moves,'🏆 Score':p+' pts'}),300);
    }
  },1000);
}

// ════════════════════════════════════════════
//  ⚡ GAME 3: REACTION TIME
// ════════════════════════════════════════════
function rxScore(arr){
  const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
  if(avg<170)return 300;if(avg<250)return 260;if(avg<370)return 210;
  if(avg<550)return 160;if(avg<800)return 110;return 70;
}

function startReaction(){
  document.getElementById('g-reaction').style.display='flex';
  document.getElementById('prog-fill').style.width='0%';
  document.getElementById('g-time').textContent='—';
  const ROUNDS=5;let round=0,times=[],state='idle',flashStart=0;
  const dotsEl=document.getElementById('react-dots');
  dotsEl.innerHTML=Array.from({length:ROUNDS},(_,i)=>`<div class="rdot" id="rdot${i}"></div>`).join('');
  document.getElementById('r-best').textContent='—';document.getElementById('r-avg').textContent='—';
  const zone=document.getElementById('react-zone'),text=document.getElementById('react-text');
  zone.className='';

  const updStats=arr=>{
    if(!arr.length)return;
    const best=Math.min(...arr),avg=Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
    document.getElementById('r-best').textContent=best;document.getElementById('r-avg').textContent=avg;
    setLive(rxScore(arr));
  };
  const mark=i=>{const d=document.getElementById(`rdot${i}`);if(d)d.classList.add('done')};

  const next=()=>{
    if(round>=ROUNDS){
      const sc=rxScore(times),avg=Math.round(times.reduce((a,b)=>a+b,0)/times.length),best=Math.min(...times);
      showResults('reaction',sc,{'⚡ Best Reaction':best+'ms','📊 Average':avg+'ms','🎯 Rounds':ROUNDS,'🏆 Score':sc+' pts'});
      return;
    }
    state='wait';zone.className='wait';text.textContent='⏳ WAIT FOR GREEN...';
    window._rt=setTimeout(()=>{
      state='go';flashStart=Date.now();zone.className='go';text.textContent='🟢 CLICK NOW!';
      window._rt2=setTimeout(()=>{if(state==='go'){times.push(2000);updStats(times);mark(round);round++;setTimeout(next,600)}},2000);
    },1500+Math.random()*3000);
  };

  zone.addEventListener('click',()=>{
    if(state==='wait'){clearTimeout(window._rt);zone.className='early';text.textContent='❌ TOO EARLY!';times.push(1800);updStats(times);mark(round);round++;setTimeout(next,1000)}
    else if(state==='go'){clearTimeout(window._rt2);const ms=Date.now()-flashStart;times.push(ms);state='done';text.textContent=`✅ ${ms}ms!`;zone.className='';updStats(times);mark(round);round++;setTimeout(next,800)}
  });
  setTimeout(next,600);
}

// ════════════════════════════════════════════
//  🔢 GAME 4: MATH BLITZ
// ════════════════════════════════════════════
function genEq(){
  const ops=['+','-','×'],op=ops[0|Math.random()*ops.length];
  let a,b,ans;
  if(op==='+'){a=0|(Math.random()*50+1);b=0|(Math.random()*50+1);ans=a+b}
  else if(op==='-'){a=0|(Math.random()*50+20);b=0|(Math.random()*a+1);ans=a-b}
  else{a=0|(Math.random()*12+1);b=0|(Math.random()*12+1);ans=a*b}
  return{q:`${a} ${op} ${b}`,a:ans};
}

function startMath(){
  document.getElementById('g-math').style.display='flex';
  const TOTAL=10,DUR=30;let q=0,correct=0,streak=0,score=0,t=DUR;
  document.getElementById('g-time').textContent=DUR;
  document.getElementById('math-streak').textContent='0';

  const nextQ=()=>{
    if(q>=TOTAL){clearInterval(gTimer);showResults('math',Math.min(400,score),{'✅ Correct':correct+'/10','🔥 Best Streak':streak,'⏱️ Time Left':t+'s','🏆 Score':Math.min(400,score)+' pts'});return}
    const eq=genEq();
    document.getElementById('math-qn').textContent=q+1;
    document.getElementById('math-q').textContent=`${eq.q} = ?`;
    const wrongs=new Set();
    while(wrongs.size<3){const w=eq.a+(Math.random()<.5?1:-1)*(0|Math.random()*15+1);if(w!==eq.a&&w>=0)wrongs.add(w)}
    const opts=[...wrongs,eq.a].sort(()=>Math.random()-.5);
    const el=document.getElementById('math-opts');el.innerHTML='';
    opts.forEach(opt=>{
      const btn=document.createElement('button');btn.className='math-opt';btn.textContent=opt;
      btn.addEventListener('click',()=>{
        el.querySelectorAll('.math-opt').forEach(b=>b.disabled=true);
        if(opt===eq.a){btn.classList.add('correct');correct++;streak++;score+=20+(streak>2?streak*4:0);toast(`✅ ${streak>1?'🔥 x'+streak+'!':'Correct!'}`)}
        else{btn.classList.add('wrong');el.querySelectorAll('.math-opt').forEach(b=>{if(+b.textContent===eq.a)b.classList.add('correct')});streak=0;toast('❌ Wrong!')}
        document.getElementById('math-streak').textContent=streak;setLive(Math.min(400,score));q++;setTimeout(nextQ,750);
      });
      el.appendChild(btn);
    });
  };

  gTimer=setInterval(()=>{
    t--;document.getElementById('g-time').textContent=t;
    document.getElementById('prog-fill').style.width=`${t/DUR*100}%`;
    if(t<=0){clearInterval(gTimer);showResults('math',Math.min(400,score),{'✅ Correct':correct+'/10','🔥 Best Streak':streak,'⏱️ Time Left':'0s','🏆 Score':Math.min(400,score)+' pts'})}
  },1000);
  nextQ();
}

// ════════════════════════════════════════════
//  🚀 GAME 5: DODGE
// ════════════════════════════════════════════
function stopDodge(){if(dodgeAF){cancelAnimationFrame(dodgeAF);dodgeAF=null}}

function startDodge(){
  document.getElementById('g-dodge').style.display='flex';
  document.getElementById('g-time').textContent='30';
  const canvas=document.getElementById('dodge-canvas');
  const ctx=canvas.getContext('2d');
  const maxW=Math.min(580,window.innerWidth-40);
  canvas.width=maxW;canvas.height=Math.round(maxW*.55);
  const W=canvas.width,H=canvas.height;

  const ship={x:W/2,y:H-36,w:32,h:32,tx:W/2};
  let lives=3,score=0,dodged=0,elapsed=0,obs=[],lastSpawn=0,flashing=false;

  const updLives=()=>{document.getElementById('dodge-lives').innerHTML=Array.from({length:3},(_,i)=>`<div class="dlive${i>=lives?' lost':''}">🚀</div>`).join('')};
  updLives();

  canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();ship.tx=e.clientX-r.left});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();ship.tx=e.touches[0].clientX-r.left},{passive:false});

  gTimer=setInterval(()=>{
    elapsed++;const s=Math.max(0,30-elapsed);
    document.getElementById('g-time').textContent=s;
    document.getElementById('prog-fill').style.width=`${s/30*100}%`;
    if(s<=0){clearInterval(gTimer);stopDodge();const p=Math.min(600,score+dodged*5);setTimeout(()=>showResults('dodge',p,{'⏱️ Survived':elapsed+'s','✅ Dodged':dodged,'⭐ Score':score,'🏆 Final':p+' pts'}),300)}
  },1000);

  const cols=['#00f5ff','#ff0090','#a855f7','#ffd700','#39ff14','#ff6600'];
  let last=performance.now();

  function loop(now){
    const dt=Math.min(32,now-last);last=now;
    lastSpawn+=dt;
    const si=Math.max(380,1000-elapsed*14);
    if(lastSpawn>=si){obs.push({x:Math.random()*(W-30),y:-20,w:20+Math.random()*45,h:14+Math.random()*14,spd:1.8+elapsed*.07+Math.random()*1.2,col:cols[0|Math.random()*cols.length]});lastSpawn=0}

    ship.x+=(ship.tx-ship.x)*.16;
    ship.x=Math.max(ship.w/2,Math.min(W-ship.w/2,ship.x));
    obs.forEach(o=>o.y+=o.spd*dt/16);
    const before=obs.length;
    obs=obs.filter(o=>o.y<H+20);
    dodged+=before-obs.length;
    score=elapsed*10+dodged*5;setLive(Math.min(600,score));

    if(!flashing){
      for(const o of obs){
        if(ship.x-ship.w/2<o.x+o.w&&ship.x+ship.w/2>o.x&&ship.y-ship.h/2<o.y+o.h&&ship.y+ship.h/2>o.y){
          lives--;updLives();obs=obs.filter(x=>x!==o);
          toast(lives>0?`💥 -1 Life! ${lives} left`:'💥 Game over!');
          flashing=true;setTimeout(()=>flashing=false,1200);
          if(lives<=0){clearInterval(gTimer);stopDodge();const p=Math.min(600,score);setTimeout(()=>showResults('dodge',p,{'⏱️ Survived':elapsed+'s','✅ Dodged':dodged,'⭐ Score':score,'🏆 Final':p+' pts'}),400);return}
          break;
        }
      }
    }

    // Draw
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
    for(let gx=0;gx<W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    obs.forEach(o=>{
      ctx.shadowBlur=8;ctx.shadowColor=o.col;
      ctx.fillStyle=o.col+'44';ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeStyle=o.col;ctx.lineWidth=1.5;ctx.strokeRect(o.x,o.y,o.w,o.h);
      ctx.shadowBlur=0;
    });

    const alpha=flashing?(Math.floor(now/100)%2===0?.25:1):1;
    ctx.globalAlpha=alpha;
    ctx.shadowBlur=flashing?0:14;ctx.shadowColor='#00f5ff';
    ctx.fillStyle='#00f5ff';
    ctx.beginPath();ctx.moveTo(ship.x,ship.y-ship.h/2);ctx.lineTo(ship.x-ship.w/2,ship.y+ship.h/2);ctx.lineTo(ship.x,ship.y+ship.h/4);ctx.lineTo(ship.x+ship.w/2,ship.y+ship.h/2);ctx.closePath();ctx.fill();

    // Engine glow
    ctx.fillStyle='#ff6600';
    ctx.beginPath();ctx.ellipse(ship.x,ship.y+ship.h/2+4,5,8+Math.random()*4,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.shadowBlur=0;

    if(dodgeAF!==null)dodgeAF=requestAnimationFrame(loop);
  }
  dodgeAF=requestAnimationFrame(loop);
}

// ════════════════════════════════════════════
//  👾 IFRAME GAMES
// ════════════════════════════════════════════
function openIframe(gid){
  curIfGame=gid;
  document.getElementById('iframe-title').textContent=META[gid].name;
  document.getElementById('game-iframe').src=META[gid].url;
  document.getElementById('iframe-score-in').value='';
  document.getElementById('iframe-ov').classList.add('show');
}

document.getElementById('btn-iframe-back').onclick=()=>{
  document.getElementById('iframe-ov').classList.remove('show');
  document.getElementById('game-iframe').src='';
  curIfGame=null;
};

document.getElementById('btn-iframe-submit').onclick=async()=>{
  if(!user){toast('⚠️ Not logged in');return}
  const raw=document.getElementById('iframe-score-in').value.trim();
  if(!raw||isNaN(raw)||+raw<0){toast('⚠️ Enter your final score first');return}
  const gameScore=parseInt(raw,10);
  const pts=Math.min(500,Math.max(10,Math.floor(gameScore/100)));
  const gid=curIfGame;
  document.getElementById('iframe-ov').classList.remove('show');
  document.getElementById('game-iframe').src='';curIfGame=null;

  document.getElementById('res-emoji').textContent=pts>250?'🎉':pts>100?'😎':'💪';
  document.getElementById('res-gname').textContent=META[gid].name;
  document.getElementById('res-pts').textContent=pts;
  document.getElementById('res-bd').innerHTML=`
    <div class="res-row"><span>🎮 Game Score</span><span class="rv">${gameScore.toLocaleString()}</span></div>
    <div class="res-row"><span>⭐ Conversion</span><span class="rv">÷ 100</span></div>
    <div class="res-row"><span>🏆 Hub Points</span><span class="rv">${pts} pts</span></div>
  `;
  showScreen('results-screen');
  if(pts>50)confetti(40);
  saveScore(gid,pts);
  document.getElementById('btn-again').onclick=()=>openIframe(gid);
  document.getElementById('btn-hub').onclick=()=>{document.getElementById('h-pts').textContent=`🏆 ${(user?.totalPoints||0).toLocaleString()} PTS`;enterHub()};
};

// ════════════════════════════════════════════
//  🏆 LEADERBOARD
// ════════════════════════════════════════════
async function loadLeaderboard(){
  const panel=document.getElementById('lb-panel');
  if(!db){panel.innerHTML='<div class="lb-empty">⚠️ Database connecting...</div>';return}
  panel.innerHTML='<div class="lb-empty">Loading...</div>';
  try{
    const snap=await db.collection('players').orderBy('totalPoints','desc').limit(20).get();
    if(snap.empty){panel.innerHTML='<div class="lb-empty">No players yet — be first!</div>';return}
    const medals=['🥇','🥈','🥉'];
    panel.innerHTML='<div class="lb-title">🏆 TOP PLAYERS</div>';
    snap.docs.forEach((doc,i)=>{
      const d=doc.data(),isMe=user&&doc.id===user.uid;
      const cls=isMe?'me':i===0?'r1':i===1?'r2':i===2?'r3':'';
      const row=document.createElement('div');row.className=`lb-row ${cls}`;
      row.innerHTML=`<div class="lb-rank">${medals[i]||'#'+(i+1)}</div><div class="lb-name">${esc(d.username)}${isMe?' ← You':''}</div><div class="lb-score">${(d.totalPoints||0).toLocaleString()} PTS</div>`;
      panel.appendChild(row);
    });
  }catch(e){panel.innerHTML='<div class="lb-empty">⚠️ Error loading scores</div>';console.error(e)}
}

const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── BOOT ──
showScreen('auth-screen');
