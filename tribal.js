// 🔹 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
let villageData = {
    username: "Unknown Player",
    wood: 100,
    stone: 100,
    iron: 100,
    score: 0,
    buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 }
};

// 🔹 Check Auth State
onAuthStateChanged(auth, async (loggedInUser) => {
    if (!loggedInUser) {
        alert("You must be logged in to play!");
        window.location.href = "index.html";
        return;
    }
    user = loggedInUser;
    villageData.username = user.email.split("@")[0];
    await loadVillageData();
    loadLeaderboard();
    loadWorldMap();
});

// 🔹 Load Village Data
async function loadVillageData() {
    if (!user) return;
    const userDoc = await getDoc(doc(db, "villages", user.uid));
    if (userDoc.exists()) {
        villageData = userDoc.data();
    }
    updateUI();
}

// 🔹 Save Village Data
async function saveVillageData() {
    if (!user) return;
    villageData.username = user.email.split("@")[0];
    await setDoc(doc(db, "villages", user.uid), villageData);
    loadLeaderboard();
}

// 🔹 Upgrade Buildings
document.querySelectorAll(".upgrade-btn").forEach(button => {
    button.addEventListener("click", () => {
        const building = button.getAttribute("data-building");
        upgradeBuilding(building);
    });
});

function upgradeBuilding(building) {
    const cost = villageData.buildings[building] * 50;
    if (villageData.wood >= cost && villageData.stone >= cost && villageData.iron >= cost) {
        villageData.wood -= cost;
        villageData.stone -= cost;
        villageData.iron -= cost;
        villageData.buildings[building]++;
        villageData.score += 10;
        saveVillageData();
        updateUI();
    } else {
        alert("Not enough resources!");
    }
}

// 🔹 Generate Resources Over Time
setInterval(() => {
    villageData.wood += villageData.buildings.lumber * 5;
    villageData.stone += villageData.buildings.quarry * 5;
    villageData.iron += villageData.buildings.iron * 5;
    saveVillageData();
    updateUI();
}, 5000);

// 🔹 Update UI
function updateUI() {
    const scrollY = window.scrollY;
    document.getElementById("wood-count").innerText = villageData.wood;
    document.getElementById("stone-count").innerText = villageData.stone;
    document.getElementById("iron-count").innerText = villageData.iron;
    document.getElementById("player-score").innerText = villageData.score;
    document.getElementById("hq-level").innerText = villageData.buildings.hq;
    document.getElementById("lumber-level").innerText = villageData.buildings.lumber;
    document.getElementById("quarry-level").innerText = villageData.buildings.quarry;
    document.getElementById("iron-level").innerText = villageData.buildings.iron;

    // 🔹 Update Upgrade Costs in UI
    document.getElementById("hq-cost").innerText = villageData.buildings.hq * 50;
    document.getElementById("lumber-cost").innerText = villageData.buildings.lumber * 50;
    document.getElementById("quarry-cost").innerText = villageData.buildings.quarry * 50;
    document.getElementById("iron-cost").innerText = villageData.buildings.iron * 50;

    window.scrollTo(0, scrollY);
}

// 🔹 Load Leaderboard
function loadLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");
    leaderboardList.innerHTML = "<li>Loading...</li>";
    const q = query(collection(db, "villages"), orderBy("score", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const listItem = document.createElement("li");
            listItem.innerText = `${data.username || "Unknown"} - ${data.score}`;
            leaderboardList.appendChild(listItem);
        });
    });
}

// 🔹 Load World Map with Zoom Feature
async function loadWorldMap() {
    const mapContainer = document.getElementById("map-container");
    if (!mapContainer) return;
    mapContainer.innerHTML = "<p>Loading map...</p>";
    const querySnapshot = await getDocs(collection(db, "villages"));
    mapContainer.innerHTML = "";
    
    querySnapshot.forEach(doc => {
        const village = doc.data();
        const villageElement = document.createElement("div");
        villageElement.classList.add("village-marker");
        villageElement.style.left = `${Math.random() * 100}%`;
        villageElement.style.top = `${Math.random() * 100}%`;
        villageElement.innerText = village.username;
        villageElement.addEventListener("click", () => {
            alert(`${village.username}'s Village\nLevel: ${village.buildings.hq}\nScore: ${village.score}`);
        });
        mapContainer.appendChild(villageElement);
    });

    let scale = 1;
    
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");

    if (zoomInBtn && zoomOutBtn) {
        zoomInBtn.addEventListener("click", () => {
            scale += 0.1;
            mapContainer.style.transform = `scale(${scale})`;
        });
        zoomOutBtn.addEventListener("click", () => {
            scale = Math.max(0.5, scale - 0.1);
            mapContainer.style.transform = `scale(${scale})`;
        });
    }
}

// 🔹 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
    await saveVillageData();
    auth.signOut().then(() => {
        window.location.href = "index.html";
    }).catch(error => console.error("Logout Error:", error));
});
