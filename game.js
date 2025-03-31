// 🔹 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// 🔹 Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

// 🔹 Game Variables
let user = null;
let highScore = 0;
let gameRunning = false;
let canvas, ctx;
let player, obstacles = [];
let gravity = 0.5, jumpPower = -10;
let score = 0;
let gameLoop;

// 🔹 Check Auth State
onAuthStateChanged(auth, async (loggedInUser) => {
    if (!loggedInUser) {
        alert("You must be logged in to play!");
        window.location.href = "index.html";
        return;
    }
    user = loggedInUser;
    document.getElementById("player-email").innerText = user.email;
    await loadHighScore();
    loadLeaderboard();
});

// 🔹 Load High Score
async function loadHighScore() {
    if (!user) return;
    const userDoc = await getDoc(doc(db, "scores", user.uid));
    if (userDoc.exists()) {
        highScore = userDoc.data().score;
        document.getElementById("highScore").innerText = highScore;
    }
}

// 🔹 Load Leaderboard
function loadLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");
    leaderboardList.innerHTML = "<li>Loading...</li>";

    const q = query(collection(db, "scores"), orderBy("score", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const listItem = document.createElement("li");
            listItem.innerText = `${data.username} - ${data.score}`;
            leaderboardList.appendChild(listItem);
        });
    });
}

// 🔹 Start Game
document.getElementById("startGameBtn").addEventListener("click", startGame);

function startGame() {
    if (gameRunning) return;

    score = 0;
    obstacles = [];
    gameRunning = true;

    if (canvas) canvas.remove();

    canvas = document.createElement("canvas");
    canvas.id = "gameCanvas";
    canvas.width = 800;
    canvas.height = 500;
    document.getElementById("game-container").appendChild(canvas);
    ctx = canvas.getContext("2d");

    player = { x: 50, y: 350, width: 50, height: 50, velocityY: 0, jumping: false };

    gameLoop = setInterval(updateGame, 20);

    document.addEventListener("keydown", jump);
    canvas.addEventListener("click", jump);
}

// 🔹 Jump Function
function jump(event) {
    if (!gameRunning || player.jumping) return;
    player.velocityY = jumpPower;
    player.jumping = true;
}

// 🔹 Update Game
function updateGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply gravity
    player.velocityY += gravity;
    player.y += player.velocityY;

    if (player.y >= 350) {
        player.y = 350;
        player.jumping = false;
    }

    ctx.fillStyle = "blue";
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Generate obstacles
    if (Math.random() < 0.02) {
        obstacles.push({ x: canvas.width, y: 370, width: 30, height: 30 });
    }

    // Move & draw obstacles
    ctx.fillStyle = "red";
    for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].x -= 5;
        ctx.fillRect(obstacles[i].x, obstacles[i].y, obstacles[i].width, obstacles[i].height);

        // Check collision
        if (detectCollision(player, obstacles[i])) {
            endGame();
            return;
        }
    }

    // Increase score
    score++;
    document.getElementById("score").innerText = score;
}

// 🔹 Detect Collision
function detectCollision(player, obstacle) {
    return (
        player.x < obstacle.x + obstacle.width &&
        player.x + player.width > obstacle.x &&
        player.y < obstacle.y + obstacle.height &&
        player.y + player.height > obstacle.y
    );
}

// 🔹 End Game
function endGame() {
    clearInterval(gameLoop);
    gameRunning = false;
    saveScore();
    alert("Game Over! Score saved.");
}

// 🔹 Save Score
async function saveScore() {
    if (!user) return;

    if (score > highScore) {
        highScore = score;
        document.getElementById("highScore").innerText = highScore;

        await setDoc(doc(db, "scores", user.uid), {
            username: user.email,
            score: highScore
        });

        loadLeaderboard();
    }
}

// 🔹 Home Button
document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "index.html";
});
