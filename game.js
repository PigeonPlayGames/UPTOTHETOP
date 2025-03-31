// 🔹 Import Firebase Modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } 
  from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// 🔹 Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

// 🔹 Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentScore = 0;
let highScore = 0;
let gameRunning = false;
let gameInterval = null;
let canvas, ctx;

// 🔹 Check if user is logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById("player-email").innerText = user.email;
        loadHighScore();
        loadLeaderboard();
    } else {
        alert("You must be logged in to play!");
        window.location.href = "index.html";
    }
});

// 🔹 Load user's high score
async function loadHighScore() {
    if (!currentUser) return;
    
    const userDoc = await getDoc(doc(db, "scores", currentUser.uid));
    if (userDoc.exists()) {
        highScore = userDoc.data().score;
        document.getElementById("highScore").innerText = highScore;
    }
}

// 🔹 Load the top 10 leaderboard scores
function loadLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");
    leaderboardList.innerHTML = "";  

    const q = query(collection(db, "scores"), orderBy("score", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = ""; 
        snapshot.forEach((doc) => {
            const data = doc.data();
            const listItem = document.createElement("li");
            listItem.innerText = `${data.username} - ${data.score}`;
            leaderboardList.appendChild(listItem);
        });
    });
}

// 🔹 Start game and scoring
document.getElementById("startGameBtn").addEventListener("click", startGame);

function startGame() {
    if (gameRunning) return; // Prevent multiple games

    currentScore = 0;
    updateScore();
    gameRunning = true;

    // Remove existing canvas if it exists
    if (canvas) {
        canvas.remove();
    }

    // Create game canvas
    canvas = document.createElement("canvas");
    canvas.id = "gameCanvas";
    canvas.width = 800;
    canvas.height = 500;
    document.getElementById("game-container").appendChild(canvas);

    ctx = canvas.getContext("2d");

    // Game loop
    gameInterval = setInterval(() => {
        currentScore += 10;
        updateScore();

        // Clear screen and draw moving box
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "red";
        ctx.fillRect(currentScore % canvas.width, 200, 50, 50);

        if (currentScore >= 500) {
            endGame();
        }
    }, 1000);
}

// 🔹 Update score display
function updateScore() {
    document.getElementById("score").innerText = currentScore;
}

// 🔹 Save score and end game
function endGame() {
    clearInterval(gameInterval);
    gameRunning = false;
    saveScore();
    alert("Game Over! Score saved.");
}

// 🔹 Save score to Firestore
async function saveScore() {
    if (!currentUser) return;

    if (currentScore > highScore) {
        highScore = currentScore;
        document.getElementById("highScore").innerText = highScore;

        await setDoc(doc(db, "scores", currentUser.uid), {
            username: currentUser.email,
            score: highScore
        });

        loadLeaderboard();  // Refresh leaderboard
    }
}

// 🔹 Home button event
document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "index.html";
});
