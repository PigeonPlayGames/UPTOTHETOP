// 🔹 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, collection,
    query, orderBy, limit, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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

// 🔹 Game State
let user = null;
let villageData = {
    username: "Unknown Player",
    userId: null, // 🔸 ensure this is always included
    wood: 100,
    stone: 100,
    iron: 100,
    score: 0,
    x: Math.floor(Math.random() * 3000),
    y: Math.floor(Math.random() * 3000),
    buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 }
};

// 🔹 Auth Check
onAuthStateChanged(auth, async (loggedInUser) => {
    if (!loggedInUser) {
        alert("You must be logged in to play!");
        window.location.href = "index.html";
        return;
    }
    user = loggedInUser;
    villageData.username = user.email.split("@")[0];
    villageData.userId = user.uid;
    await loadVillageData();
    loadLeaderboard();
    loadWorldMap();
});

// 🔹 Load Village Data
async function loadVillageData() {
    if (!user) return;
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
        villageData = snapshot.data();
    } else {
        villageData.x = Math.floor(Math.random() * 3000);
        villageData.y = Math.floor(Math.random() * 3000);
        villageData.userId = user.uid; // 🔸 ensure correct ownership
        await saveVillageData();
    }

    updateUI();
}

// 🔹 Save Village Data
async function saveVillageData() {
    if (!user) return;
    villageData.username = user.email.split("@")[0];
    villageData.userId = user.uid; // 🔸 REQUIRED to pass Firestore rules
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
    const level = villageData.buildings[building];
    const cost = level * 50;

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

// 🔹 Auto Resource Generation
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

    document.querySelectorAll(".building").forEach(buildingElement => {
        const type = buildingElement.querySelector(".upgrade-btn").getAttribute("data-building");
        const cost = villageData.buildings[type] * 50;
        buildingElement.querySelector(".upgrade-cost").innerText =
            `Upgrade Cost: Wood: ${cost}, Stone: ${cost}, Iron: ${cost}`;
    });

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
            const li = document.createElement("li");
            li.innerText = `${data.username || "Unknown"} - ${data.score}`;
            leaderboardList.appendChild(li);
        });
    });
}

// 🔹 Load World Map
async function loadWorldMap() {
    const wrapper = document.getElementById("map-wrapper");
    const world = document.getElementById("map-world");
    if (!wrapper || !world) return;

    world.innerHTML = "";

    const snapshot = await getDocs(collection(db, "villages"));
    snapshot.forEach(doc => {
        const v = doc.data();
        const el = document.createElement("div");
        el.className = "village-tile";
        el.style.left = (v.x || 0) + "px";
        el.style.top = (v.y || 0) + "px";
        el.setAttribute("data-username", v.username || "Unknown");
        el.setAttribute("data-score", v.score ?? 0);
        el.addEventListener("click", () => {
            alert(`${v.username}'s Village\nHQ Lv ${v.buildings?.hq ?? 1}\nScore ${v.score ?? 0}`);
        });
        world.appendChild(el);
    });

    initPanZoom(wrapper, world);
}

// 🔹 Pan and Zoom Utility
function initPanZoom(viewport, content) {
    let scale = 1, startX = 0, startY = 0, originX = 0, originY = 0, panning = false;
    const setTransform = () =>
        content.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;

    viewport.addEventListener("wheel", e => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(0.5, scale + delta), 2.5);
        const rect = viewport.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left - originX) / scale;
        const offsetY = (e.clientY - rect.top - originY) / scale;
        originX -= offsetX * (newScale - scale);
        originY -= offsetY * (newScale - scale);
        scale = newScale;
        setTransform();
    }, { passive: false });

    const pointerDown = e => {
        panning = true;
        startX = (e.clientX ?? e.touches[0].clientX) - originX;
        startY = (e.clientY ?? e.touches[0].clientY) - originY;
    };
    const pointerMove = e => {
        if (!panning) return;
        originX = (e.clientX ?? e.touches[0].clientX) - startX;
        originY = (e.clientY ?? e.touches[0].clientY) - startY;
        setTransform();
    };
    const pointerUp = () => (panning = false);

    viewport.addEventListener("mousedown", pointerDown);
    viewport.addEventListener("touchstart", pointerDown);
    window.addEventListener("mousemove", pointerMove);
    window.addEventListener("touchmove", pointerMove, { passive: false });
    window.addEventListener("mouseup", pointerUp);
    window.addEventListener("touchend", pointerUp);
}

// 🔹 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
    await saveVillageData();
    auth.signOut().then(() => {
        window.location.href = "index.html";
    }).catch(err => console.error("Logout Error:", err));
});
