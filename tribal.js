// 🔹 Firebase Setup
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import {
    getFirestore, doc, getDoc, setDoc, collection,
    query, orderBy, limit, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// 🔹 Firebase Config
// NOTE: It is recommended to store this in a secure environment variable on a real server,
// but for a client-side game, this is common practice.
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
const functions = getFunctions(app); // Initialized Firebase Functions client

// 🔹 State
let user = null;
let villageData = null;
let villageDataLoaded = false;

// 🔹 Custom Modal UI (replacing alert and confirm)
const showMessage = (title, message) => {
    const modal = document.createElement('div');
    modal.className = 'modal-container';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <p>${message}</p>
            <button class="modal-close-btn">OK</button>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
        modal.remove();
    };

    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
};

const showConfirm = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-container';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-buttons">
                    <button class="modal-confirm-btn">Confirm</button>
                    <button class="modal-cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-confirm-btn').addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });

        modal.querySelector('.modal-cancel-btn').addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });
    });
};

// 🔹 DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    // --- Windmill Animation Logic ---
    const windmillBlades = document.getElementById('windmill-blades');
    const numberOfFrames = 8;
    let currentFrame = 0;
    const animationSpeed = 100;

    function animateWindmill() {
        if (windmillBlades) {
            windmillBlades.src = `windmill_frame_${currentFrame}.png`;
            currentFrame = (currentFrame + 1) % numberOfFrames;
        }
    }
    setInterval(animateWindmill, animationSpeed);
    // --- End Windmill Animation Logic ---

    onAuthStateChanged(auth, async (loggedInUser) => {
        if (!loggedInUser) {
            showMessage("Login Required", "You must be logged in to play!");
            window.location.href = "index.html";
            return;
        }

        user = loggedInUser;
        const villageDocRef = doc(db, "villages", user.uid);

        onSnapshot(villageDocRef, (docSnap) => {
            if (!docSnap.exists()) {
                console.error("Village document does not exist for user:", user.uid);
                return;
            }

            villageData = docSnap.data();

            if (!villageDataLoaded) {
                villageDataLoaded = true;
                startGame(); // Consolidated game initialization
            }

            updateUI();

            if (villageData.lastBattleMessage) {
                showMessage("Battle Report", villageData.lastBattleMessage);
                (async () => {
                    try {
                        await updateDoc(villageDocRef, {
                            lastBattleMessage: null
                        });
                        delete villageData.lastBattleMessage;
                    } catch (error) {
                        console.error("Failed to clear battle message:", error);
                    }
                })();
            }
        }, (error) => {
            console.error("Error listening to village data:", error);
            showMessage("Error", "Failed to load village data in real-time. Please refresh.");
        });

        await calculateOfflineResourcesAndSave();
    });
});

// ⭐ NEW FUNCTION: Consolidates all game initialization logic
function startGame() {
    startGameLoops();
    loadLeaderboard();
    loadWorldMap();
    bindUpgradeButtons();
    bindTrainButtons();
    bindLogout();
}
// ⭐ END NEW FUNCTION ⭐

// 🔹 Function to calculate offline resources and save the updated state
async function calculateOfflineResourcesAndSave() {
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);
    let dataForFirestore = {};

    if (snapshot.exists()) {
        const currentDataInFirestore = snapshot.data();
        let lastLoginMillis;
        if (typeof currentDataInFirestore.lastLogin === 'number') {
            lastLoginMillis = currentDataInFirestore.lastLogin;
        } else if (currentDataInFirestore.lastLogin instanceof Timestamp) {
            lastLoginMillis = currentDataInFirestore.lastLogin.toMillis();
        } else {
            console.warn("lastLogin field missing or invalid type, defaulting to Date.now().", currentDataInFirestore.lastLogin);
            lastLoginMillis = Date.now();
        }

        const currentTimeMillis = Date.now();
        const timeElapsedSeconds = Math.floor((currentTimeMillis - lastLoginMillis) / 1000);
        let workingVillageData = {
            username: currentDataInFirestore.username || user.email.split("@")[0],
            userId: currentDataInFirestore.userId || user.uid,
            wood: currentDataInFirestore.wood ?? 100,
            stone: currentDataInFirestore.stone ?? 100,
            iron: currentDataInFirestore.iron ?? 100,
            score: currentDataInFirestore.score ?? 0,
            x: currentDataInFirestore.x ?? Math.floor(Math.random() * 3000),
            y: currentDataInFirestore.y ?? Math.floor(Math.random() * 3000),
            buildings: currentDataInFirestore.buildings || { hq: 1, lumber: 1, quarry: 1, iron: 1 },
            troops: currentDataInFirestore.troops || { spear: 0, sword: 0, axe: 0 },
            lastBattleMessage: currentDataInFirestore.lastBattleMessage || null
        };

        if (timeElapsedSeconds > 0) {
            const woodPerSecond = (workingVillageData.buildings.lumber * 5) / 5;
            const stonePerSecond = (workingVillageData.buildings.quarry * 5) / 5;
            const ironPerSecond = (workingVillageData.buildings.iron * 5) / 5;

            const generatedWood = woodPerSecond * timeElapsedSeconds;
            const generatedStone = stonePerSecond * timeElapsedSeconds;
            const generatedIron = ironPerSecond * timeElapsedSeconds;

            workingVillageData.wood += generatedWood;
            workingVillageData.stone += generatedStone;
            workingVillageData.iron += generatedIron;

            if (generatedWood > 0 || generatedStone > 0 || generatedIron > 0) {
                showMessage("Welcome back!", `My Lord, while you were away, your village generated:\nWood: ${Math.round(generatedWood)}\nStone: ${Math.round(generatedStone)}\nIron: ${Math.round(generatedIron)}`);
            }
        }

        dataForFirestore = {
            ...workingVillageData,
            lastLogin: serverTimestamp()
        };
    } else {
        dataForFirestore = {
            username: user.email.split("@")[0],
            userId: user.uid,
            wood: 100,
            stone: 100,
            iron: 100,
            score: 0,
            x: Math.floor(Math.random() * 3000),
            y: Math.floor(Math.random() * 3000),
            buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 },
            troops: { spear: 0, sword: 0, axe: 0 },
            lastLogin: serverTimestamp()
        };
    }

    if (dataForFirestore.lastBattleMessage === undefined) {
        delete dataForFirestore.lastBattleMessage;
    } else if (dataForFirestore.lastBattleMessage === null) {
        // Keep null if explicitly set to null
    }

    try {
        await setDoc(ref, dataForFirestore, { merge: true });
        console.log("Village data (including offline gains) saved to Firestore.");
    } catch (err) {
        console.error("Failed to save initial/offline village data:", err);
        showMessage("Error", "Error saving your village data.");
    }
}


// 🔹 Save Village (for general game actions like upgrades, training, etc.)
async function saveVillageData() {
    if (!user || !villageDataLoaded) {
        console.warn("Attempted to save village data before user or data loaded.");
        return;
    }

    villageData.lastLogin = serverTimestamp();
    const dataToSave = JSON.parse(JSON.stringify(villageData));

    if (dataToSave.lastBattleMessage === undefined) {
        delete dataToSave.lastBattleMessage;
    }

    try {
        await setDoc(doc(db, "villages", user.uid), dataToSave, { merge: true });
        console.log("Village data saved due to user action.");
    } catch (err) {
        console.error("Save failed:", err);
        showMessage("Error", "Error saving your village.");
    }
}

// 🔹 UI Update
function updateUI() {
    if (!villageData) return;

    document.getElementById("wood-count").innerText = Math.floor(villageData.wood ?? 0);
    document.getElementById("stone-count").innerText = Math.floor(villageData.stone ?? 0);
    document.getElementById("iron-count").innerText = Math.floor(villageData.iron ?? 0);
    document.getElementById("player-score").innerText = villageData.score ?? 0;

    document.getElementById("hq-level").innerText = villageData.buildings.hq;
    document.getElementById("lumber-level").innerText = villageData.buildings.lumber;
    document.getElementById("quarry-level").innerText = villageData.buildings.quarry;
    document.getElementById("iron-level").innerText = villageData.buildings.iron;

    document.getElementById("spear-count").textContent = villageData.troops.spear;
    document.getElementById("sword-count").textContent = villageData.troops.sword;
    document.getElementById("axe-count").textContent = villageData.troops.axe;

    document.querySelectorAll(".building-overlay").forEach(buildingElement => {
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

// 🔹 Train Troop Buttons
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
        showMessage("Upgrade Failed", "Not enough resources!");
    }
}

// 🔹 Recruit Logic
function recruitTroop(type) {
    const costs = {
        spear: { wood: 100 },
        sword: { iron: 100 },
        axe: { stone: 100 }
    };

    const cost = costs[type];

    if (!Object.entries(cost).every(([resource, amount]) => villageData[resource] >= amount)) {
        showMessage("Recruit Failed", `Not enough resources to train a ${type}.`);
        return;
    }

    Object.entries(cost).forEach(([resource, amount]) => {
        villageData[resource] -= amount;
    });

    villageData.troops[type] = (villageData.troops[type] || 0) + 1;
    saveVillageData();
    updateUI();
    showMessage("Recruited", `${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
}

// 🔹 Resource Loop
function startGameLoops() {
    setInterval(() => {
        if (!villageDataLoaded) return;
        villageData.wood += villageData.buildings.lumber * 5;
        villageData.stone += villageData.buildings.quarry * 5;
        villageData.iron += villageData.buildings.iron * 5;
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
        if (snapshot.empty) {
            leaderboardList.innerHTML = "<li>No players yet!</li>";
            return;
        }
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
            v.id = docSnap.id;

            if (!v.x || !v.y) return;

            const el = document.createElement("div");
            el.className = "village-tile";
            if (v.userId === user.uid) {
                el.classList.add("your-village");
                el.setAttribute("title", "Your Village");
            }

            el.style.left = `${v.x}px`;
            el.style.top = `${v.y}px`;
            el.setAttribute("data-username", v.username || "Unknown");
            el.setAttribute("data-score", v.score ?? 0);

            el.addEventListener("click", async () => {
                if (v.userId === user.uid) {
                    showMessage("Action Denied", "This is your own village. You cannot attack yourself!");
                    return;
                }

                const confirmed = await showConfirm(
                    "Confirm Attack",
                    `Attack ${v.username}'s village (Score: ${v.score})?`
                );
                if (!confirmed) return;

                const sentTroops = {
                    spear: parseInt(prompt("Send how many Spear Fighters (1 power)?"), 10) || 0,
                    sword: parseInt(prompt("Send how many Swordsmen (2 power)?"), 10) || 0,
                    axe: parseInt(prompt("Send how many Axemen (3 power)?"), 10) || 0,
                };
                const totalSent = sentTroops.spear + sentTroops.sword + sentTroops.axe;

                if (totalSent <= 0) return showMessage("Invalid Action", "You must send at least 1 troop to attack.");

                if (
                    sentTroops.spear > villageData.troops.spear ||
                    sentTroops.sword > villageData.troops.sword ||
                    sentTroops.axe > villageData.troops.axe
                ) {
                    return showMessage("Invalid Troops", "Not enough troops in your village to send that many.");
                }

                // Call the new, secure attack function
                await attackPlayer(v.id, sentTroops);
            });
            world.appendChild(el);
        });
        centerOnPlayer(wrapper, world, villageData.x, villageData.y);
        initPanZoom(wrapper, world);
    } catch (err) {
        console.error("Error loading world map:", err);
        showMessage("Error", "Failed to load world map.");
    }
}

// 🔹 NEW: Function to call the Cloud Function to process an attack
async function attackPlayer(defenderId, sentTroops) {
    // ⚠️ TODO: You must implement the 'attackPlayer' Cloud Function on your backend
    // This frontend code will not work without it.
    try {
        const attackFunction = httpsCallable(functions, 'processAttack');
        const result = await attackFunction({
            defenderId: defenderId,
            sentTroops: sentTroops
        });
        showMessage("Battle Report", result.data.message);
        loadWorldMap(); // Reload map to show updated data
    } catch (error) {
        console.error("Error during attack:", error);
        showMessage("Attack Failed", error.message);
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
        } else if (e.touches.length === 1 && panning) {
            const touch = e.touches[0];
            originX = touch.clientX - startX;
            originY = touch.clientY - startY;
            setTransform();
        }
    }, { passive: false });

    viewport.addEventListener("touchend", () => {
        lastTouchDistance = null;
        panning = false;
    });

    const pointerDown = e => {
        panning = true;
        const clientX = e.clientX ?? e.touches[0].clientX;
        const clientY = e.clientY ?? e.touches[0].clientY;
        startX = clientX - originX;
        startY = clientY - originY;
    };
    const pointerMove = e => {
        if (!panning) return;
        if (e.cancelable) e.preventDefault();
        const clientX = e.clientX ?? e.touches[0].clientX;
        const clientY = e.clientY ?? e.touches[0].clientY;
        originX = clientX - startX;
        originY = clientY - startY;
        setTransform();
    };
    const pointerUp = () => (panning = false);

    viewport.addEventListener("mousedown", pointerDown);
    window.addEventListener("mousemove", pointerMove);
    window.addEventListener("mouseup", pointerUp);
    viewport.addEventListener("touchstart", pointerDown, { passive: false });
    window.addEventListener("touchmove", pointerMove, { passive: false });
    window.addEventListener("touchend", pointerUp);

    setTransform();
}

// 🔹 Logout
function bindLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await saveVillageData(); // Ensure data is saved before logging out
                await auth.signOut();
                window.location.href = "index.html"; // Redirect to login page
            } catch (err) {
                console.error("Logout Error:", err);
                showMessage("Logout Failed", "Failed to logout. Please try again.");
            }
        });
    }
}
