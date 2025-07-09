// 🔹 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import {
    getFirestore, doc, getDoc, setDoc, collection,
    query, orderBy, limit, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// 🔹 Firebase Config (as before)
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
let villageDataLoaded = false; // Flag to indicate if initial data is loaded and processed

// 🔹 DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (loggedInUser) => {
        if (!loggedInUser) {
            alert("You must be logged in to play!");
            window.location.href = "index.html";
            return;
        }

        user = loggedInUser;

        // 🔹 Set up the Real-time listener FIRST.
        // This listener will handle the initial UI population AND subsequent updates.
        // It will fire immediately with the current data in Firestore.
        onSnapshot(doc(db, "villages", user.uid), (docSnap) => {
            if (!docSnap.exists()) {
                console.error("Village document does not exist for user:", user.uid);
                // Handle case where document might be deleted or not yet created (though loadVillageData handles create)
                return;
            }

            const updatedData = docSnap.data();

            // Only update local villageData if it's the initial load (villageDataLoaded is false)
            // OR if the incoming data is newer (e.g., from another source, like battle)
            // This prevents the flicker by ensuring we get the authoritative data from Firestore.
            if (!villageDataLoaded || updatedData.lastLogin && villageData.lastLogin && updatedData.lastLogin.toMillis() > villageData.lastLogin.toMillis()) {
                 villageData = { ...villageData, ...updatedData };
            } else if (!villageDataLoaded) { // First time loading, regardless of timestamp comparison
                villageData = { ...villageData, ...updatedData };
            }


            // Set this flag AFTER the initial data has been processed by the snapshot.
            // This ensures subsequent save calls won't hit the warning.
            villageDataLoaded = true;
            
            updateUI(); // Always update UI when snapshot provides new data

            // Handle battle messages
            if (villageData.lastBattleMessage) {
                alert(villageData.lastBattleMessage);

                // Clear from Firestore and locally after showing
                (async () => {
                    try {
                        await updateDoc(doc(db, "villages", user.uid), {
                            lastBattleMessage: null
                        });
                        delete villageData.lastBattleMessage; // Clear locally too
                    } catch (error) {
                        console.error("Failed to clear battle message:", error);
                    }
                })();
            }
        });

        // Now, load village data. This will fetch data, calculate offline gains,
        // and save it. The onSnapshot listener (set up above) will then pick up
        // these changes and update the UI.
        await loadVillageData();


        // ✅ These must be outside the snapshot listener and after village data is loaded
        // These will now start *after* the initial snapshot has loaded and updateUI has run once.
        startGameLoops();
        loadLeaderboard();
        loadWorldMap();
        bindUpgradeButtons();
        bindTrainButtons();
        bindLogout();
    });
});

// 🔹 Load or Create Village
async function loadVillageData() {
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);

    let dataToSave = {}; // Prepare data for the initial save

    if (snapshot.exists()) {
        const currentData = snapshot.data();

        // Convert Firestore Timestamp to milliseconds for calculation
        // Ensure lastLogin exists, if not, treat as current time
        const lastLoginMillis = currentData.lastLogin ? currentData.lastLogin.toMillis() : Date.now();
        const currentTimeMillis = Date.now();
        const timeElapsedSeconds = Math.floor((currentTimeMillis - lastLoginMillis) / 1000);

        // Populate villageData locally (don't overwrite completely, merge relevant parts)
        // Ensure all required fields exist (even if document exists from older version)
        villageData = {
            username: currentData.username || user.email.split("@")[0],
            userId: currentData.userId || user.uid,
            wood: currentData.wood ?? 100,
            stone: currentData.stone ?? 100,
            iron: currentData.iron ?? 100,
            score: currentData.score ?? 0,
            x: currentData.x ?? Math.floor(Math.random() * 3000),
            y: currentData.y ?? Math.floor(Math.random() * 3000),
            buildings: currentData.buildings || { hq: 1, lumber: 1, quarry: 1, iron: 1 },
            troops: currentData.troops || { spear: 0, sword: 0, axe: 0 },
            lastBattleMessage: currentData.lastBattleMessage || null
        };


        // Calculate offline resources if time has passed
        if (timeElapsedSeconds > 0) {
            const woodPerSecond = (villageData.buildings.lumber * 5) / 5;
            const stonePerSecond = (villageData.buildings.quarry * 5) / 5;
            const ironPerSecond = (villageData.buildings.iron * 5) / 5;

            const generatedWood = woodPerSecond * timeElapsedSeconds;
            const generatedStone = stonePerSecond * timeElapsedSeconds;
            const generatedIron = ironPerSecond * timeElapsedSeconds;

            villageData.wood += generatedWood;
            villageData.stone += generatedStone;
            villageData.iron += generatedIron;

            if (generatedWood > 0 || generatedStone > 0 || generatedIron > 0) {
                alert(`Welcome back! While you were away, your village generated:\nWood: ${Math.round(generatedWood)}\nStone: ${Math.round(generatedStone)}\nIron: ${Math.round(generatedIron)}`);
            }
        }
        
        // Prepare data for saving, ensuring lastLogin is updated to serverTimestamp
        dataToSave = {
            ...villageData,
            lastLogin: serverTimestamp() // Use serverTimestamp for accuracy
        };

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
        
        // Prepare data for saving, ensuring lastLogin is updated to serverTimestamp
        dataToSave = {
            ...villageData,
            lastLogin: serverTimestamp() // Use serverTimestamp for new users
        };
    }

    // Perform the initial save with the calculated offline gains and updated lastLogin.
    // The onSnapshot listener (set up in onAuthStateChanged) will then pick up
    // these changes and update the UI.
    try {
        // Ensure lastBattleMessage is handled consistently (null vs undefined for Firestore)
        if (dataToSave.lastBattleMessage === undefined) {
            delete dataToSave.lastBattleMessage;
        } else if (dataToSave.lastBattleMessage === null) {
            // Keep null if explicitly set to null, Firestore accepts null
        }

        await setDoc(doc(db, "villages", user.uid), dataToSave, { merge: true });
    } catch (err) {
        console.error("Initial village data save failed:", err);
        alert("Error initializing your village data.");
    }

    // The 'villageDataLoaded' flag will now be set by the onSnapshot listener itself,
    // once it successfully receives the initial data from Firestore.
    // This ensures villageDataLoaded is true ONLY when villageData is truly synchronized from Firestore.
    // updateUI(); // <-- REMOVE THIS LINE (No direct UI update here, let onSnapshot handle it)
}


// 🔹 Save Village
async function saveVillageData() {
    // This check is now less critical for the initial load, as villageDataLoaded is set by onSnapshot.
    // It still serves to prevent calls if user/data isn't fully ready later.
    if (!user || !villageDataLoaded) {
        console.warn("Attempted to save village data before user or data loaded.");
        return;
    }

    // Always update lastLogin timestamp to serverTimestamp when saving
    villageData.lastLogin = serverTimestamp(); // Update local object first

    // Deep copy to ensure no undefined fields are present for Firestore write
    const dataToSave = JSON.parse(JSON.stringify(villageData));
    
    // Explicitly handle lastBattleMessage to be null if undefined, as Firestore doesn't like undefined
    if (dataToSave.lastBattleMessage === undefined) {
        delete dataToSave.lastBattleMessage; // Remove the field if it's undefined
    }

    try {
        await setDoc(doc(db, "villages", user.uid), dataToSave, { merge: true });
    } catch (err) {
        console.error("Save failed:", err);
        alert("Error saving your village.");
    }
}

// 🔹 UI Update
function updateUI() {
    if (!villageData) return;

    // Use Math.floor for resources as they are integers
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
        saveVillageData(); // Save changes
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
        axe: { stone: 100 }
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
    // villageData.score += 5;
    saveVillageData(); // Save changes
    updateUI();
    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
}


// 🔹 Resource Loop (updates UI and local data, but saves only on user actions or logout)
function startGameLoops() {
    setInterval(() => {
        if (!villageDataLoaded) return; // Only run if initial data is loaded
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

    world.innerHTML = ""; // Clear existing map tiles

    try {
        const snapshot = await getDocs(collection(db, "villages"));

        snapshot.forEach(docSnap => {
            const v = docSnap.data();
            v.id = docSnap.id; // Get the document ID for updating

            if (!v.x || !v.y) return; // Skip if coordinates are missing

            const el = document.createElement("div");
            el.className = "village-tile";
            if (v.userId === user.uid) {
                el.classList.add("your-village");
                el.setAttribute("title", "Your Village"); // Add tooltip for own village
            }

            el.style.left = `${v.x}px`;
            el.style.top = `${v.y}px`;
            el.setAttribute("data-username", v.username || "Unknown");
            el.setAttribute("data-score", v.score ?? 0);

            el.addEventListener("click", async () => {
                if (v.userId === user.uid) {
                    alert("This is your own village. You cannot attack yourself!");
                    return;
                }

                const confirmAttack = confirm(`Attack ${v.username}'s village (Score: ${v.score})?`);
                if (!confirmAttack) return;

                const spear = parseInt(prompt("Send how many Spear Fighters (1 power)?"), 10) || 0;
                const sword = parseInt(prompt("Send how many Swordsmen (2 power)?"), 10) || 0;
                const axe = parseInt(prompt("Send how many Axemen (3 power)?"), 10) || 0;
                const totalSent = spear + sword + axe;

                if (totalSent <= 0) return alert("You must send at least 1 troop to attack.");

                if (
                    spear > villageData.troops.spear ||
                    sword > villageData.troops.sword ||
                    axe > villageData.troops.axe
                ) {
                    return alert("Not enough troops in your village to send that many.");
                }

                const attackerStrength = spear * 1 + sword * 2 + axe * 3;
                const defenderSpear = v.troops?.spear || 0;
                const defenderSword = v.troops?.sword || 0;
                const defenderAxe = v.troops?.axe || 0;
                const defenderStrength = defenderSpear * 1 + defenderSword * 2 + defenderAxe * 3;

                let remainingSpear = spear;
                let remainingSword = sword;
                let remainingAxe = axe;

                if (attackerStrength > defenderStrength) {
                    // 🎉 Victory
                    const initialDefenderSpear = v.troops?.spear || 0;
                    const initialDefenderSword = v.troops?.sword || 0;
                    const initialDefenderAxe = v.troops?.axe || 0;

                    let damageToAttackerTroops = defenderStrength; // Total power to be absorbed by attacker's troops
                    const attackerLosses = { spear: 0, sword: 0, axe: 0 };

                    const calculateLoss = (currentCount, troopPower) => {
                        const loss = Math.min(currentCount, Math.floor(damageToAttackerTroops / troopPower));
                        damageToAttackerTroops -= loss * troopPower;
                        return loss;
                    };

                    attackerLosses.axe = calculateLoss(axe, 3);
                    attackerLosses.sword = calculateLoss(sword, 2);
                    attackerLosses.spear = calculateLoss(spear, 1);


                    // Update attacker's troops
                    villageData.troops.spear -= attackerLosses.spear;
                    villageData.troops.sword -= attackerLosses.sword;
                    villageData.troops.axe -= attackerLosses.axe;

                    // Defender's resources (scouted values)
                    const scouted = {
                        wood: v.wood || 0,
                        stone: v.stone || 0,
                        iron: v.iron || 0
                    };

                    const totalRemainingAttackerTroops = (spear - attackerLosses.spear) + (sword - attackerLosses.sword) + (axe - attackerLosses.axe);
                    const totalCapacity = totalRemainingAttackerTroops * 30; // Each troop carries 30 units of resources

                    const plundered = { wood: 0, stone: 0, iron: 0 };
                    let remainingCapacity = totalCapacity;

                    const resourcesArray = [
                        { name: 'wood', amount: scouted.wood },
                        { name: 'stone', amount: scouted.stone },
                        { name: 'iron', amount: scouted.iron }
                    ];

                    for (const res of resourcesArray) {
                        if (remainingCapacity <= 0) break;
                        const takeAmount = Math.min(res.amount, remainingCapacity);
                        plundered[res.name] = takeAmount;
                        remainingCapacity -= takeAmount;
                    }

                    // Add plunder to attacker's village
                    villageData.wood += plundered.wood;
                    villageData.stone += plundered.stone;
                    villageData.iron += plundered.iron;
                    villageData.score += 20;

                    const report = `
🛡️ Battle Report: Victory!
You attacked ${v.username}'s village.
-------------------------------
💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}
⚔️ Your Losses: Spear: ${attackerLosses.spear}, Sword: ${attackerLosses.sword}, Axe: ${attackerLosses.axe}
👥 Enemy Troops Defeated: Spear: ${initialDefenderSpear}, Sword: ${initialDefenderSword}, Axe: ${initialDefenderAxe} (All wiped out!)
🎯 Plundered: Wood: ${Math.round(plundered.wood)}, Stone: ${Math.round(plundered.stone)}, Iron: ${Math.round(plundered.iron)}
`;
                    alert(report);

                    // --- SECURITY WARNING: This direct write to DEFENDER's data is insecure ---
                    // This will likely be blocked by the new security rules.
                    // A Firebase Cloud Function is required for secure cross-user updates.
                    await updateDoc(doc(db, "villages", v.id), {
                        "troops.spear": 0,
                        "troops.sword": 0,
                        "troops.axe": 0,
                        wood: Math.max(0, scouted.wood - plundered.wood),
                        stone: Math.max(0, scouted.stone - plundered.stone),
                        iron: Math.max(0, scouted.iron - plundered.iron),
                        lastBattleMessage: `Your village was attacked by ${villageData.username} and lost the battle! You lost all your troops and some resources.`
                    });

                } else {
                    // ❌ Defeat
                    villageData.troops.spear -= spear;
                    villageData.troops.sword -= sword;
                    villageData.troops.axe -= axe;
                    villageData.score = Math.max(0, villageData.score - 5);

                    const report = `
🛡️ Battle Report: Defeat!
You attacked ${v.username}'s village.
-------------------------------
💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}
☠️ All your attacking troops were lost!
👥 Enemy Troops Remaining: Spear: ${defenderSpear}, Sword: ${defenderSword}, Axe: ${defenderAxe}
`;
                    alert(report);

                    // --- SECURITY WARNING: This direct write to DEFENDER's data is insecure ---
                    // This will likely be blocked by the new security rules.
                    // A Firebase Cloud Function is required for secure cross-user updates.
                    await updateDoc(doc(db, "villages", v.id), {
                        lastBattleMessage: `Your village was attacked by ${villageData.username} and defended successfully!`
                    });
                }

                await saveVillageData(); // Save attacker's updated data
                updateUI();
                loadWorldMap();
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
                alert("Failed to logout. Please try again.");
            }
        });
    }
}
