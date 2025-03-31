// 🔹 Firebase Configuration
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

let currentUser = null;
let currentScore = 0;
let highScore = 0;

// 🔹 Check if user is logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        document.getElementById("player-email").innerText = user.email;  // Show logged-in email
        loadHighScore();
        loadLeaderboard();
    } else {
        alert("You must be logged in to play!");
        window.location.href = "index.html"; // Redirect to homepage if not logged in
    }
});

// 🔹 Load user's high score
function loadHighScore() {
    if (!currentUser) return;
    
    db.collection("scores").doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                highScore = doc.data().score;
                document.getElementById("highScore").innerText = highScore;
            }
        });
}

// 🔹 Load the top 10 leaderboard scores
function loadLeaderboard() {
    db.collection("scores")
        .orderBy("score", "desc")
        .limit(10)
        .onSnapshot(snapshot => {
            const leaderboardList = document.getElementById("leaderboard-list");
            leaderboardList.innerHTML = "";  // Clear existing list

            snapshot.forEach(doc => {
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
    currentScore = 0;
    updateScore();

    // Game rendering logic
    const canvas = document.createElement("canvas");
    canvas.id = "gameCanvas";
    canvas.width = 800;
    canvas.height = 500;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simulating score increase
    let gameInterval = setInterval(() => {
        currentScore += 10;
        updateScore();

        // Simulate game ending after some time
        if (currentScore >= 500) {
            clearInterval(gameInterval);
            saveScore();
            alert("Game Over! Score saved.");
        }
    }, 1000);
}

// 🔹 Update score display
function updateScore() {
    document.getElementById("score").innerText = currentScore;
}

// 🔹 Save score to Firestore
function saveScore() {
    if (!currentUser) return;

    if (currentScore > highScore) {
        highScore = currentScore;
        document.getElementById("highScore").innerText = highScore;

        db.collection("scores").doc(currentUser.uid).set({
            username: currentUser.email,  // Save email as username
            score: highScore
        }).then(() => {
            loadLeaderboard();  // Refresh leaderboard
        }).catch(error => console.error("Error saving score:", error));
    }
}

// 🔹 Home button event
document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "index.html"; // Go back home
});
