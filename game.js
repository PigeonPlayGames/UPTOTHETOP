const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

firebase.initializeApp(firebaseConfig);

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let score = 0;
let highScore = 0;

// 🔹 Check if User is Logged In
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById("player-email").innerText = user.email;

        // Fetch High Score from Firestore
        const userRef = db.collection("users").doc(user.uid);
        userRef.get().then(doc => {
            if (doc.exists) {
                highScore = doc.data().highScore || 0;
                document.getElementById("highScore").innerText = highScore;
            }
        });
    } else {
        alert("You must be logged in to play!");
        window.location.href = "index.html"; // Redirect to login
    }
});

// 🔹 Game Logic (Basic Example)
function startGame() {
    score = 0;
    document.getElementById("score").innerText = score;
    gameLoop();
}

function gameLoop() {
    setTimeout(() => {
        score += Math.floor(Math.random() * 10) + 1; // Increase score randomly
        document.getElementById("score").innerText = score;

        if (score < 100) {
            gameLoop(); // Continue the game
        } else {
            endGame();
        }
    }, 1000);
}

// 🔹 End Game & Save Score
function endGame() {
    alert("Game Over! Your final score: " + score);
    saveHighScore();
}

// 🔹 Save High Score to Firebase
function saveHighScore() {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = db.collection("users").doc(user.uid);
    userRef.get().then(doc => {
        if (!doc.exists || score > (doc.data().highScore || 0)) {
            userRef.set({ highScore: score }, { merge: true }).then(() => {
                document.getElementById("highScore").innerText = score; // Update UI
                alert("New High Score: " + score);
                updateLeaderboard();
            });
        }
    });
}

// 🔹 Return to Homepage
function goHome() {
    window.location.href = "index.html";
}

// 🔹 Update & Display Top 10 Leaderboard
function updateLeaderboard() {
    db.collection("users")
        .orderBy("highScore", "desc")
        .limit(10)
        .get()
        .then((snapshot) => {
            const leaderboardList = document.getElementById("leaderboard-list");
            leaderboardList.innerHTML = "";

            snapshot.forEach((doc) => {
                const userData = doc.data();
                const li = document.createElement("li");
                li.innerText = `${userData.username || "Anonymous"} - ${userData.highScore || 0} points`;
                leaderboardList.appendChild(li);
            });
        })
        .catch((error) => {
            console.error("Error fetching leaderboard:", error);
        });
}

// 🔹 Event Listeners
document.getElementById("startGameBtn").addEventListener("click", startGame);
document.getElementById("homeBtn").addEventListener("click", goHome);
