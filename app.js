import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child, query, orderByChild, limitToLast, onValue } 
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC1NZy2ZzNLutYAiE_QjPZGH5CymvGCnDs",
  authDomain: "neal-with-roblox.firebaseapp.com",
  databaseURL: "https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "neal-with-roblox",
  storageBucket: "neal-with-roblox.firebasestorage.app",
  messagingSenderId: "984878364213",
  appId: "1:984878364213:web:fb1147a1a5ff0b02d2a37c",
  measurementId: "G-0CXYDZYRS4"
};

// Global state variables
let playerName = "";
let playerScore = 0;
let activeGame = "";
let gameInterval;
let gameTime = 0;
let liveScore = 0;
let db = null;

// Safe Firebase Initialization
try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app, "https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app");
    console.log("Firebase successfully connected.");
} catch (initError) {
    console.error("Firebase failed to initialize:", initError);
    alert("Firebase Initialization Error: " + initError.message);
}

// Dom Elements
const loginScreen = document.getElementById('login-screen');
const hubScreen = document.getElementById('hub-screen');
const gameScreen = document.getElementById('game-screen');
const leaderboardList = document.getElementById('leaderboard-list');
const gameTitle = document.getElementById('game-title');
const gameTimer = document.getElementById('game-timer');
const gameScoreCounter = document.getElementById('game-score-counter');
const backToHubBtn = document.getElementById('back-to-hub');

// ---- Hub Setup & Core Engine ----
document.getElementById('join-btn').addEventListener('click', async () => {
    console.log("Join button clicked!"); // Confirms button is active
    
    const name = document.getElementById('username-input').value.trim();
    if (name.length < 3) return alert("Choose a name with at least 3 letters!");
    playerName = name;

    if (!db) {
        return alert("Database is not connected. Check your internet or browser extensions!");
    }

    try {
        const snapshot = await get(child(ref(db), `players/${playerName}`));
        playerScore = snapshot.exists() ? snapshot.val().score : 0;
        
        if (!snapshot.exists()) {
            await set(ref(db, `players/${playerName}`), { name: playerName, score: 0 });
        }

        document.getElementById('display-name').innerText = playerName;
        document.getElementById('display-score').innerText = playerScore;
        loginScreen.classList.add('hidden');
        hubScreen.classList.remove('hidden');
    } catch(dbError) { 
        console.error("Database read/write failed:", dbError);
        alert(`Database Error: ${dbError.message}\n\nMake sure your Realtime Database 'Rules' are set to true!`); 
    }
});

async function addPoints(points) {
    if (!db) return;
    playerScore += points;
    document.getElementById('display-score').innerText = playerScore;
    try {
        await set(ref(db, `players/${playerName}`), { name: playerName, score: playerScore });
    } catch (e) {
        console.error("Failed to save score:", e);
    }
}

// Added explicit error callback here to prevent script freezing if rules deny access
if (db) {
    const leaderboardQuery = query(ref(db, 'players'), orderByChild('score'), limitToLast(10));
    onValue(leaderboardQuery, (snap) => {
        leaderboardList.innerHTML = "";
        let list = [];
        snap.forEach(c => { list.push(c.val()); });
        list.reverse().forEach((p, idx) => {
            leaderboardList.innerHTML += `<li><span>#${idx+1} ${p.name}</span><span>${p.score} pts</span></li>`;
        });
    }, (error) => {
        console.error("Leaderboard sync failed:", error);
        leaderboardList.innerHTML = `<li>Error loading scores: ${error.message}</li>`;
    });
}

document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        activeGame = card.getAttribute('data-game');
        hubScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        backToHubBtn.classList.add('hidden');
        initGame();
    });
});

backToHubBtn.addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
});

function initGame() {
    document.querySelectorAll('.sub-arena').forEach(el => el.classList.add('hidden'));
    gameScoreCounter.classList.add('hidden');
    clearInterval(gameInterval);

    if (activeGame === "click-frenzy") startClickFrenzy();
    else if (activeGame === "memory-match") startMemoryMatch();
    else if (activeGame === "reaction-time") startReactionTime();
    else if (activeGame === "math-blitz") startMathBlitz();
    else if (activeGame === "dodge") startDodge();
}

function finishGame(pointsEarned) {
    clearInterval(gameInterval);
    backToHubBtn.classList.remove('hidden');
    alert(`Game complete! Stitched together +${pointsEarned} points.`);
    addPoints(pointsEarned);
}

// ---- Game 1: Click Frenzy ----
const frenzyBtn = document.getElementById('frenzy-btn');
function startClickFrenzy() {
    gameTitle.innerText = "Click Frenzy";
    document.getElementById('arena-click-frenzy').classList.remove('hidden');
    gameScoreCounter.classList.remove('hidden');
    liveScore = 0;
    gameTime = 10;
    gameTimer.innerText = `Time: ${gameTime}s`;
    gameScoreCounter.innerText = `Clicks: ${liveScore}`;

    frenzyBtn.onclick = () => {
        liveScore++;
        gameScoreCounter.innerText = `Clicks: ${liveScore}`;
    };

    gameInterval = setInterval(() => {
        gameTime--;
        gameTimer.innerText = `Time: ${gameTime}s`;
        if(gameTime <= 0) {
            frenzyBtn.onclick = null;
            finishGame(liveScore * 2); 
        }
    }, 1000);
}

// ---- Game 2: Memory Match ----
const memGrid = document.getElementById('memory-grid');
function startMemoryMatch() {
    gameTitle.innerText = "Memory Match";
    document.getElementById('arena-memory-match').classList.remove('hidden');
    memGrid.innerHTML = "";
    gameTime = 30;
    gameTimer.innerText = `Time: ${gameTime}s`;

    const symbols = ['🍎','🍌','🍇','🍉','🍓','🍒','🍍','🥝','🍎','🍌','🍇','🍉','🍓','🍒','🍍','🥝'].sort(() => Math.random() - 0.5);
    let choices = [];
    let matchesFound = 0;

    symbols.forEach((sym, i) => {
        const card = document.createElement('div');
        card.classList.add('memory-card');
        card.dataset.index = i;
        card.innerText = sym;
        memGrid.appendChild(card);

        card.onclick = () => {
            if (card.classList.contains('flipped') || card.classList.contains('matched') || choices.length >= 2) return;
            card.classList.add('flipped');
            choices.push(card);

            if (choices.length === 2) {
                if (choices[0].innerText === choices[1].innerText) {
                    choices.forEach(c => c.classList.add('matched'));
                    choices = [];
                    matchesFound++;
                    if (matchesFound === 8) finishGame(50 + gameTime);
                } else {
                    setTimeout(() => {
                        choices.forEach(c => c.classList.remove('flipped'));
                        choices = [];
                    }, 800);
                }
            }
        };
    });

    gameInterval = setInterval(() => {
        gameTime--;
        gameTimer.innerText = `Time: ${gameTime}s`;
        if (gameTime <= 0) {
            document.querySelectorAll('.memory-card').forEach(c => c.onclick = null);
            finishGame(matchesFound * 5);
        }
    }, 1000);
}

// ---- Game 3: Reaction Time ----
const reactBox = document.getElementById('reaction-box');
function startReactionTime() {
    gameTitle.innerText = "Reaction Time";
    document.getElementById('arena-reaction-time').classList.remove('hidden');
    gameTimer.innerText = "Test: Ready";
    reactBox.className = "reaction-wait";
    reactBox.innerText = "Click to Start";

    let state = "idle"; 
    let startTime, timeoutId;

    reactBox.onclick = () => {
        if (state === "idle") {
            reactBox.className = "reaction-hold";
            reactBox.innerText = "Wait for GREEN...";
            state = "waiting";
            timeoutId = setTimeout(() => {
                reactBox.className = "reaction-go";
                reactBox.innerText = "CLICK NOW!";
                state = "go";
                startTime = performance.now();
            }, 2000 + Math.random() * 3000);
        } else if (state === "waiting") {
            clearTimeout(timeoutId);
            reactBox.className = "reaction-wait";
            reactBox.innerText = "Too early! Click to retry.";
            state = "idle";
        } else if (state === "go") {
            const ms = Math.round(performance.now() - startTime);
            reactBox.className = "reaction-wait";
            reactBox.innerText = `${ms}ms! Click to register score.`;
            state = "done";
            let points = ms < 250 ? 50 : (ms < 400 ? 30 : 10);
            finishGame(points);
        }
    };
}

// ---- Game 4: Math Blitz ----
const mathQ = document.getElementById('math-question');
const mathAns = document.getElementById('math-answer');
function startMathBlitz() {
    gameTitle.innerText = "Math Blitz";
    document.getElementById('arena-math-blitz').classList.remove('hidden');
    gameScoreCounter.classList.remove('hidden');
    liveScore = 0; gameTime = 15;
    gameTimer.innerText = `Time: ${gameTime}s`;
    gameScoreCounter.innerText = `Score: ${liveScore}`;
    mathAns.value = "";
    mathAns.disabled = false;
    mathAns.focus();

    let curA, curB, curAns;
    function nextQuestion() {
        curA = Math.floor(Math.random() * 12) + 2;
        curB = Math.floor(Math.random() * 12) + 2;
        const op = Math.random() > 0.5 ? '+' : '-';
        curAns = op === '+' ? curA + curB : curA - curB;
        mathQ.innerText = `${curA} ${op} ${curB} = ?`;
    }

    mathAns.oninput = () => {
        if (parseInt(mathAns.value) === curAns) {
            liveScore += 10;
            gameScoreCounter.innerText = `Score: ${liveScore}`;
            mathAns.value = "";
            nextQuestion();
        }
    };

    nextQuestion();
    gameInterval = setInterval(() => {
        gameTime--;
        gameTimer.innerText = `Time: ${gameTime}s`;
        if (gameTime <= 0) {
            mathAns.disabled = true;
            mathAns.oninput = null;
            finishGame(liveScore);
        }
    }, 1000);
}

// ---- Game 5: Dodge Engine ----
const canvas = document.getElementById('dodge-canvas');
const ctx = canvas.getContext('2d');
function startDodge() {
    gameTitle.innerText = "Dodge Falling Blocks";
    document.getElementById('arena-dodge').classList.remove('hidden');
    gameTime = 15;
    gameTimer.innerText = `Survive: ${gameTime}s`;

    let playerX = canvas.width / 2;
    let obstacles = [];
    let isRunning = true;
    let spawnTimer = 0;

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        playerX = e.clientX - rect.left;
    };

    gameInterval = setInterval(() => {
        gameTime--;
        gameTimer.innerText = `Survive: ${gameTime}s`;
        if (gameTime <= 0) {
            isRunning = false;
            finishGame(40);
        }
    }, 1000);

    function loop() {
        if (!isRunning) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#4f46e5";
        ctx.beginPath();
        ctx.arc(playerX, canvas.height - 30, 15, 0, Math.PI * 2);
        ctx.fill();

        spawnTimer++;
        if (spawnTimer % 8 === 0) {
            obstacles.push({ x: Math.random() * canvas.width, y: 0, speed: 4 + Math.random() * 4, r: 8 });
        }

        ctx.fillStyle = "#ef4444";
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let o = obstacles[i];
            o.y += o.speed;
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            ctx.fill();

            let dist = Math.hypot(o.x - playerX, o.y - (canvas.height - 30));
            if (dist < o.r + 15) {
                isRunning = false;
                finishGame(5); 
                return;
            }
            if (o.y > canvas.height) obstacles.splice(i, 1);
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}
