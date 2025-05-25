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

// 🔹 State
let user = null;
let villageData = null;
let villageDataLoaded = false;

// 🔹 DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (loggedInUser) => {
        if (!loggedInUser) {
            alert("You must be logged in to play!");
            window.location.href = "index.html";
            return;
        }

        user = loggedInUser;
        await loadVillageData();
        startGameLoops();
        loadLeaderboard();
        loadWorldMap();
        bindUpgradeButtons();
        bindRecruitButtons();
        bindLogout();
    });
});

// 🔹 Load or Create Village
async function loadVillageData() {
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
        villageData = snapshot.data();
        villageData.buildings = villageData.buildings || { hq: 1, lumber: 1, quarry: 1, iron: 1 };
        villageData.troops = villageData.troops || { spear: 0, sword: 0, axe: 0 };
    } else {
        villageData = {
            username: user.email.split("@")[0],
            userId: user.uid,
            wood: 100,
            stone: 100,
            iron: 100,
            score: 0,
            x: Math.floor(Math.random() * 3000),
            y: Math.floor(Math.random() * 3000),
            buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 },
            troops: { spear: 0, sword: 0, axe: 0 }
        };
        await saveVillageData();
    }

    villageDataLoaded = true;
    updateUI();
}

// 🔹 Save Village
async function saveVillageData() {
    if (!user || !villageDataLoaded) return;
    try {
        await setDoc(doc(db, "villages", user.uid), villageData);
    } catch (err) {
        console.error("Save failed:", err);
        alert("Error saving your village.");
    }
}

// 🔹 UI Update
function updateUI() {
    if (!villageData) return;

    const scrollY = window.scrollY;

    document.getElementById("wood-count").innerText = villageData.wood ?? 0;
    document.getElementById("stone-count").innerText = villageData.stone ?? 0;
    document.getElementById("iron-count").innerText = villageData.iron ?? 0;
    document.getElementById("player-score").innerText = villageData.score ?? 0;

    document.getElementById("hq-level").innerText = villageData.buildings?.hq ?? 1;
    document.getElementById("lumber-level").innerText = villageData.buildings?.lumber ?? 1;
    document.getElementById("quarry-level").innerText = villageData.buildings?.quarry ?? 1;
    document.getElementById("iron-level").innerText = villageData.buildings?.iron ?? 1;

    document.getElementById("spear-count").textContent = villageData.troops?.spear ?? 0;
    document.getElementById("sword-count").textContent = villageData.troops?.sword ?? 0;
    document.getElementById("axe-count").textContent = villageData.troops?.axe ?? 0;

    document.querySelectorAll(".building").forEach(buildingElement => {
        const type = buildingElement.querySelector(".upgrade-btn").getAttribute("data-building");
        const level = villageData.buildings?.[type] ?? 1;
        const cost = level * 50;
        buildingElement.querySelector(".upgrade-cost").innerText =
            `Upgrade Cost: Wood: ${cost}, Stone: ${cost}, Iron: ${cost}`;
    });

    window.scrollTo(0, scrollY);
}

// 🔹 Upgrade Buttons
function bindUpgradeButtons() {
    document.querySelectorAll(".upgrade-btn").forEach(button => {
        const building = button.getAttribute("data-building");
        if (building) {
            button.addEventListener("click", () => {
                upgradeBuilding(building);
            });
        }
    });
}

// 🔹 Recruit Buttons
function bindRecruitButtons() {
    document.querySelectorAll(".recruit-btn").forEach(button => {
        const troop = button.getAttribute("data-troop");
        if (troop) {
            button.addEventListener("click", () => {
                recruitTroop(troop);
            });
        }
    });
}

// 🔹 Upgrade Logic
function upgradeBuilding(building) {
    if (!villageDataLoaded) return;

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

// 🔹 Recruit Logic
function recruitTroop(type) {
    const cost = 100;

    if (villageData.wood >= cost && villageData.iron >= cost) {
        villageData.wood -= cost;
        villageData.iron -= cost;
        villageData.troops[type] = (villageData.troops[type] || 0) + 1;
        villageData.score += 5;
        saveVillageData();
        updateUI();
        alert(`${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
    } else {
        alert("Not enough resources to recruit a troop.");
    }
}

// 🔹 Resource Loop
function startGameLoops() {
    setInterval(() => {
        if (!villageDataLoaded) return;
        villageData.wood += villageData.buildings.lumber * 5;
        villageData.stone += villageData.buildings.quarry * 5;
        villageData.iron += villageData.buildings.iron * 5;
        saveVillageData();
        updateUI();
    }, 5000);
}

// 🔹 Leaderboard
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

// 🔹 World Map
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
        el.style.left = `${v.x}px`;
        el.style.top = `${v.y}px`;
        el.setAttribute("data-username", v.username || "Unknown");
        el.setAttribute("data-score", v.score ?? 0);
        el.addEventListener("click", () => {
            alert(`${v.username}'s Village\nHQ Lv ${v.buildings?.hq ?? 1}\nScore ${v.score ?? 0}`);
        });
        world.appendChild(el);
    });

    centerOnPlayer(wrapper, world, villageData.x, villageData.y);
    initPanZoom(wrapper, world);
}

function centerOnPlayer(wrapper, world, x, y) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const offsetX = wrapperRect.width / 2 - x;
    const offsetY = wrapperRect.height / 2 - y;
    world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(1)`;
    world.dataset.initialX = offsetX;
    world.dataset.initialY = offsetY;
}

function initPanZoom(viewport, content) {
    let scale = 1;
    let originX = parseFloat(content.dataset.initialX) || 0;
    let originY = parseFloat(content.dataset.initialY) || 0;
    let startX = 0, startY = 0;
    let panning = false;

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

    let lastTouchDistance = null;
    viewport.addEventListener("touchmove", (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (lastTouchDistance !== null) {
                const delta = distance - lastTouchDistance;
                const newScale = Math.min(Math.max(0.5, scale + delta * 0.005), 2.5);
                scale = newScale;
                setTransform();
            }
            lastTouchDistance = distance;
        }
    }, { passive: false });

    viewport.addEventListener("touchend", () => {
        lastTouchDistance = null;
    });

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

    setTransform();
}

// 🔹 Logout
function bindLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await saveVillageData();
                await auth.signOut();
                window.location.href = "index.html";
            } catch (err) {
                console.error("Logout Error:", err);
                alert("Failed to logout. Try again.");
            }
        });
    }
}
