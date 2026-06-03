// Import Firebase core and Realtime Database modules from the CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child, query, orderByChild, limitToLast, onValue } 
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your exact Firebase configuration
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

const db = getDatabase(app, "https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app");
const db = getDatabase(app);

// Global Variables
let playerName = "";
let playerScore = 0;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const hubScreen = document.getElementById('hub-screen');
const gameScreen = document.getElementById('game-screen');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const displayName = document.getElementById('display-name');
const displayScore = document.getElementById('display-score');
const leaderboardList = document.getElementById('leaderboard-list');

// ---- User Login & Database Logic ----

joinBtn.addEventListener('click', async () => {
    const name = usernameInput.value.trim();
    if (name.length < 3) return alert("Name must be at least 3 characters!");
    
    playerName = name;
    
    // Check if user exists in the Realtime Database
    const dbRef = ref(db);
    try {
        const snapshot = await get(child(dbRef, `players/${playerName}`));
        if (snapshot.exists()) {
            playerScore = snapshot.val().score;
        } else {
            // New player registration
            await set(ref(db, `players/${playerName}`), { name: playerName, score: 0 });
            playerScore = 0;
        }

        // Update UI
        displayName.innerText = playerName;
        displayScore.innerText = playerScore;
        
        loginScreen.classList.add('hidden');
        hubScreen.classList.remove('hidden');
    } catch (error) {
        console.error("Database connection failed:", error);
        alert("Could not connect to the database. Make sure your database rules allow read/writes!");
    }
});

// Update score in Realtime Database
async function updateScore(pointsToAdd) {
    playerScore += pointsToAdd;
    displayScore.innerText = playerScore;
    
    await set(ref(db, `players/${playerName}`), { name: playerName, score: playerScore });
}

// Listen to Leaderboard in Realtime (Top 10)
const leaderboardRef = query(ref(db, 'players'), orderByChild('score'), limitToLast(10));
onValue(leaderboardRef, (snapshot) => {
    leaderboardList.innerHTML = "";
    const playersArray = [];
    
    snapshot.forEach((childSnapshot) => {
        playersArray.push(childSnapshot.val());
    });
    
    // Firebase orders ascending by default, so reverse it to get highest scores first
    playersArray.reverse();
    
    let rank = 1;
    playersArray.forEach((player) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${rank} ${player.name}</span> <span>${player.score} pts</span>`;
        leaderboardList.appendChild(li);
        rank++;
    });
});

// ---- Mini-Game Logic (Speed Catcher) ----

const playBtn = document.getElementById('play-speed-catcher');
const backBtn = document.getElementById('back-to-hub');
const gameArea = document.getElementById('game-area');
const target = document.getElementById('target');
const timeLeftDisplay = document.getElementById('time-left');

let gameTimer;
let currentPoints = 0;

playBtn.addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    backBtn.classList.add('hidden');
    startGame();
});

backBtn.addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
});

function startGame() {
    currentPoints = 0;
    let timeLeft = 10; // 10 second game
    timeLeftDisplay.innerText = timeLeft;
    target.classList.remove('hidden');
    moveTarget();

    gameTimer = setInterval(() => {
        timeLeft--;
        timeLeftDisplay.innerText = timeLeft;
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

target.addEventListener('click', () => {
    currentPoints += 5; // 5 points per click
    moveTarget();
});

function moveTarget() {
    const maxX = gameArea.clientWidth - 50;
    const maxY = gameArea.clientHeight - 50;
    const randomX = Math.floor(Math.random() * maxX);
    const randomY = Math.floor(Math.random() * maxY);
    
    target.style.left = randomX + 'px';
    target.style.top = randomY + 'px';
}

function endGame() {
    clearInterval(gameTimer);
    target.classList.add('hidden');
    backBtn.classList.remove('hidden');
    
    alert(`Time's up! You caught enough dots to earn ${currentPoints} points!`);
    updateScore(currentPoints);
}
