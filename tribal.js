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
        bindTrainButtons(); // ✅ Fixed troop button binding
        bindLogout();
    });
});

// 🔹 Load or Create Village
async function loadVillageData() {
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
        villageData = snapshot.data();

        // ✅ Ensure all required fields exist (even if document exists)
        villageData.buildings = villageData.buildings || { hq: 1, lumber: 1, quarry: 1, iron: 1 };
        villageData.troops = villageData.troops || { spear: 0, sword: 0, axe: 0 };
        villageData.wood = villageData.wood ?? 100;
        villageData.stone = villageData.stone ?? 100;
        villageData.iron = villageData.iron ?? 100;
        villageData.score = villageData.score ?? 0;
        villageData.x = villageData.x ?? Math.floor(Math.random() * 3000);
        villageData.y = villageData.y ?? Math.floor(Math.random() * 3000);

        // ✅ Save any missing data back to Firestore
        await saveVillageData();

    } else {
        // First time user setup
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

    document.getElementById("wood-count").innerText = villageData.wood ?? 0;
    document.getElementById("stone-count").innerText = villageData.stone ?? 0;
    document.getElementById("iron-count").innerText = villageData.iron ?? 0;
    document.getElementById("player-score").innerText = villageData.score ?? 0;

    document.getElementById("hq-level").innerText = villageData.buildings.hq;
    document.getElementById("lumber-level").innerText = villageData.buildings.lumber;
    document.getElementById("quarry-level").innerText = villageData.buildings.quarry;
    document.getElementById("iron-level").innerText = villageData.buildings.iron;

    document.getElementById("spear-count").textContent = villageData.troops.spear;
    document.getElementById("sword-count").textContent = villageData.troops.sword;
    document.getElementById("axe-count").textContent = villageData.troops.axe;

    document.querySelectorAll(".building").forEach(buildingElement => {
        const type = buildingElement.querySelector(".upgrade-btn").getAttribute("data-building");
        const level = villageData.buildings[type];
        const cost = level * 50;
        buildingElement.querySelector(".upgrade-cost").innerText =
            `Upgrade Cost: Wood: ${cost}, Stone: ${cost}, Iron: ${cost}`;
    });
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

// 🔹 Train Troop Buttons (✅ fixed to use .train-btn and data-type)
function bindTrainButtons() {
    document.querySelectorAll(".train-btn").forEach(button => {
        const type = button.getAttribute("data-type");
        if (type) {
            button.addEventListener("click", () => {
                recruitTroop(type);
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
    const costs = {
        spear: { wood: 100 },
        sword: { iron: 100 },
        axe:   { stone: 100 }
    };

    const cost = costs[type];

    // Check if resources are sufficient
    const hasEnough = Object.entries(cost).every(([resource, amount]) => {
        return villageData[resource] >= amount;
    });

    if (!hasEnough) {
        alert(`Not enough resources to train a ${type}.`);
        return;
    }

    // Deduct the resources
    Object.entries(cost).forEach(([resource, amount]) => {
        villageData[resource] -= amount;
    });

    villageData.troops[type] = (villageData.troops[type] || 0) + 1;
    villageData.score += 5;
    saveVillageData();
    updateUI();
    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
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

    try {
        const snapshot = await getDocs(collection(db, "villages"));

        snapshot.forEach(docSnap => {
            const v = docSnap.data();
            if (!v.x || !v.y) return;

            const el = document.createElement("div");
            el.className = "village-tile";
            if (v.userId === user.uid) {
                el.classList.add("your-village");
            }

            el.style.left = `${v.x}px`;
            el.style.top = `${v.y}px`;
            el.setAttribute("data-username", v.username || "Unknown");
            el.setAttribute("data-score", v.score ?? 0);

            el.addEventListener("click", async () => {
                if (v.userId === user.uid) {
                    alert("This is your own village.");
                    return;
                }

                const confirmAttack = confirm(`Attack ${v.username}'s village?`);
                if (!confirmAttack) return;

                const spear = parseInt(prompt("Send how many Spear Fighters?"), 10) || 0;
                const sword = parseInt(prompt("Send how many Swordsmen?"), 10) || 0;
                const axe = parseInt(prompt("Send how many Axemen?"), 10) || 0;

                const totalSent = spear + sword + axe;
                if (totalSent <= 0) return alert("You must send at least 1 troop.");

                if (
                    spear > villageData.troops.spear ||
                    sword > villageData.troops.sword ||
                    axe > villageData.troops.axe
                ) {
                    return alert("Not enough troops.");
                }

                const attackerStrength = spear * 1 + sword * 2 + axe * 3;
                const defenderStrength =
                    (v.troops?.spear || 0) * 1 +
                    (v.troops?.sword || 0) * 2 +
                    (v.troops?.axe || 0) * 3;

                let resultMessage = "";
                let remainingSpear = spear;
                let remainingSword = sword;
                let remainingAxe = axe;

                if (attackerStrength > defenderStrength) {
                    resultMessage = "You won the battle!";

                    // Deduct only surviving troops based on defender's strength
                    let damage = defenderStrength;
                    const reduce = (count, power) => {
                        const loss = Math.min(count, Math.floor(damage / power));
                        damage -= loss * power;
                        return count - loss;
                    };

                    remainingSpear = reduce(remainingSpear, 1);
                    remainingSword = reduce(remainingSword, 2);
                    remainingAxe = reduce(remainingAxe, 3);

                    villageData.troops.spear -= (spear - remainingSpear);
                    villageData.troops.sword -= (sword - remainingSword);
                    villageData.troops.axe   -= (axe - remainingAxe);

                    // Gain resources
                    villageData.wood += Math.floor((v.wood || 0) * 0.1);
                    villageData.stone += Math.floor((v.stone || 0) * 0.1);
                    villageData.iron += Math.floor((v.iron || 0) * 0.1);
                    villageData.score += 20;

                    await updateDoc(doc(db, "villages", v.userId), {
                        "troops.spear": 0,
                        "troops.sword": 0,
                        "troops.axe": 0
                    });


                } else {
                    resultMessage = "You lost the battle!";

                    // Attacker loses all troops
                    villageData.troops.spear -= spear;
                    villageData.troops.sword -= sword;
                    villageData.troops.axe   -= axe;

                    villageData.score = Math.max(0, villageData.score - 5);
                }

                await saveVillageData();
                updateUI();
                alert(resultMessage);
            });

            world.appendChild(el);
        });

        centerOnPlayer(wrapper, world, villageData.x, villageData.y);
        initPanZoom(wrapper, world);
    } catch (err) {
        console.error("Error loading world map:", err);
        alert("Failed to load world map.");
    }
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
