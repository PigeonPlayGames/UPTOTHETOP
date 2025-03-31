// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Canvas Setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 400;
canvas.height = 500;

// Game Variables
let player = { x: 180, y: 400, width: 20, height: 20, speed: 5, velocityY: 0, gravity: 0.5, isJumping: false };
let platforms = [{ x: 150, y: 450, width: 100, height: 10 }];
let score = 0;
let highScore = 0;
let gameOver = false;

// Load High Score
auth.onAuthStateChanged((user) => {
    if (user) {
        const userRef = db.collection("users").doc(user.uid);
        userRef.get().then(doc => {
            if (doc.exists) {
                highScore = doc.data().highScore || 0;
                document.getElementById("highScore").innerText = highScore;
            }
        });
    }
});

// Player Movement
document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") player.x -= player.speed;
    if (e.key === "ArrowRight") player.x += player.speed;
    if (e.key === " " && !player.isJumping) {
        player.velocityY = -10;
        player.isJumping = true;
    }
});

// Game Loop
function update() {
    if (gameOver) return;

    // Gravity
    player.velocityY += player.gravity;
    player.y += player.velocityY;

    // Collision with platforms
    platforms.forEach((platform) => {
        if (
            player.y + player.height >= platform.y &&
            player.y + player.height <= platform.y + 10 &&
            player.x + player.width > platform.x &&
            player.x < platform.x + platform.width
        ) {
            player.velocityY = 0;
            player.isJumping = false;
            score++;
            document.getElementById("score").innerText = score;
        }
    });

    // Game Over
    if (player.y > canvas.height) {
        gameOver = true;
        saveHighScore();
    }

    // Draw Everything
    draw();
    requestAnimationFrame(update);
}

// Draw Game
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "blue";
    ctx.fillRect(player.x, player.y, player.width, player.height);

    ctx.fillStyle = "green";
    platforms.forEach((platform) => {
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    });
}

// Save High Score to Firebase
function saveHighScore() {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = db.collection("users").doc(user.uid);
    userRef.get().then(doc => {
        if (!doc.exists || score > (doc.data().highScore || 0)) {
            userRef.set({ highScore: score }, { merge: true });
        }
    });

    alert("Game Over! Your score: " + score);
}

// Reset Game
function resetGame() {
    player.x = 180;
    player.y = 400;
    player.velocityY = 0;
    score = 0;
    document.getElementById("score").innerText = score;
    gameOver = false;
    update();
}

// Logout
function logout() {
    auth.signOut().then(() => {
        window.location.href = "index.html";
    });
}

// Start Game
update();
