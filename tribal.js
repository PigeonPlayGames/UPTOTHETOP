// tribal.js - Handles game logic, map visualization, and notifications

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Firebase Config
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

let user = null;
let villageData = { hq: 1, lumber: 1, quarry: 1, iron: 1, wood: 100, stone: 100, ironRes: 100, score: 0 };

onAuthStateChanged(auth, async (loggedInUser) => {
    if (!loggedInUser) {
        alert("You must be logged in to play!");
        window.location.href = "index.html";
        return;
    }
    user = loggedInUser;
    document.getElementById("player-name").innerText = user.email;
    await loadVillageData();
    loadLeaderboard();
    renderMap();
});

async function loadVillageData() {
    const userDoc = await getDoc(doc(db, "villages", user.uid));
    if (userDoc.exists()) {
        villageData = userDoc.data();
    }
    updateUI();
}

function updateUI() {
    document.getElementById("hq-level").innerText = villageData.hq;
    document.getElementById("lumber-level").innerText = villageData.lumber;
    document.getElementById("quarry-level").innerText = villageData.quarry;
    document.getElementById("iron-level").innerText = villageData.iron;
    document.getElementById("wood-count").innerText = villageData.wood;
    document.getElementById("stone-count").innerText = villageData.stone;
    document.getElementById("iron-count").innerText = villageData.ironRes;
    document.getElementById("player-score").innerText = villageData.score;
}

document.querySelectorAll(".upgrade-btn").forEach(button => {
    button.addEventListener("click", (event) => {
        const building = event.target.dataset.building;
        upgradeBuilding(building);
    });
});

function upgradeBuilding(building) {
    if (villageData.wood >= 10 && villageData.stone >= 10 && villageData.ironRes >= 5) {
        villageData.wood -= 10;
        villageData.stone -= 10;
        villageData.ironRes -= 5;
        villageData[building]++;
        villageData.score += 10;
        showNotification(`${building.replace('-', ' ')} upgraded to Level ${villageData[building]}!`);
        updateUI();
        saveVillageData();
    } else {
        showNotification("Not enough resources!");
    }
}

async function saveVillageData() {
    if (!user) return;
    await setDoc(doc(db, "villages", user.uid), villageData);
    loadLeaderboard();
}

function loadLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");
    leaderboardList.innerHTML = "<li>Loading...</li>";
    const q = query(collection(db, "villages"), orderBy("score", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const listItem = document.createElement("li");
            listItem.innerText = `${data.username || "Player"} - ${data.score}`;
            leaderboardList.appendChild(listItem);
        });
    });
}

function renderMap() {
    const mapContainer = document.getElementById("map-container");
    mapContainer.innerHTML = "";
    onSnapshot(collection(db, "villages"), (snapshot) => {
        mapContainer.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const village = document.createElement("div");
            village.classList.add("village-icon");
            village.style.left = `${Math.random() * 90}%`;
            village.style.top = `${Math.random() * 90}%`;
            village.title = `${data.username || "Player"} (Score: ${data.score})`;
            mapContainer.appendChild(village);
        });
    });
}

function showNotification(message) {
    const notification = document.getElementById("notification");
    notification.innerText = message;
    notification.classList.remove("hidden");
    setTimeout(() => notification.classList.add("hidden"), 3000);
}

document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
});
