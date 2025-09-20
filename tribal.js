// 🔹 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js"; // Import Timestamp for type checking
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
let villageDataLoaded = false; // Flag to indicate if initial data is loaded and processed by onSnapshot

// 🔹 DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    // --- Windmill Animation Logic (New) ---
    const windmillBlades = document.getElementById('windmill-blades');
    const numberOfFrames = 8; // You have 8 images (0 to 7)
    let currentFrame = 0;
    const animationSpeed = 100; // Milliseconds per frame (adjust for faster/slower spin)

    function animateWindmill() {
        if (windmillBlades) { // Ensure the element exists before trying to update its src
            windmillBlades.src = `windmill_frame_${currentFrame}.png`;
            currentFrame = (currentFrame + 1) % numberOfFrames; // Cycle through frames 0-7
        }
    }

    // Start the windmill animation as soon as the DOM is ready
    setInterval(animateWindmill, animationSpeed);
    // --- End Windmill Animation Logic ---


    onAuthStateChanged(auth, async (loggedInUser) => {
        if (!loggedInUser) {
            alert("You must be logged in to play!");
            window.location.href = "index.html";
            return;
        }

        user = loggedInUser;

        // 🔹 Set up the Real-time listener FIRST.
        // This listener will be the authoritative source for UI updates.
        const villageDocRef = doc(db, "villages", user.uid);
        onSnapshot(villageDocRef, (docSnap) => {
            if (!docSnap.exists()) {
                console.error("Village document does not exist for user:", user.uid);
                // If it doesn't exist, it means calculateOfflineResourcesAndSave (which creates it) hasn't finished yet,
                // or there's a serious data problem. We can't proceed without initial data.
                return;
            }

            // Always update local villageData with the freshest data from Firestore
            villageData = docSnap.data();

            // Set villageDataLoaded to true once we receive the first valid snapshot.
            // This ensures all other game loops and functions can safely use villageData.
            if (!villageDataLoaded) {
                villageDataLoaded = true;
                // Start game loops and other components only once initial data is loaded
                startGameLoops();
                loadLeaderboard();
                loadWorldMap();
                bindUpgradeButtons();
                bindTrainButtons();
                bindLogout();
            }

            updateUI(); // Update UI whenever Firestore data changes

            // Handle battle messages
            if (villageData.lastBattleMessage) {
                alert(villageData.lastBattleMessage);

                // Clear from Firestore and locally after showing
                (async () => {
                    try {
                        await updateDoc(villageDocRef, {
                            lastBattleMessage: null
                        });
                        delete villageData.lastBattleMessage; // Clear locally too
                    } catch (error) {
                        console.error("Failed to clear battle message:", error);
                    }
                })();
            }
        }, (error) => {
            console.error("Error listening to village data:", error);
            alert("Failed to load village data in real-time. Please refresh.");
        });

        // Immediately trigger the load and calculation of offline resources.
        // This function will also perform the initial save to Firestore.
        // The onSnapshot listener (set up above) will then pick up this updated data.
        await calculateOfflineResourcesAndSave();
    });
});

// 🔹 Function to calculate offline resources and save the updated state
async function calculateOfflineResourcesAndSave() {
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);

    let dataForFirestore = {}; // This will be the data we send to Firestore

    if (snapshot.exists()) {
        const currentDataInFirestore = snapshot.data();

        // --- FIX: Handle lastLogin type (number or Timestamp) ---
        let lastLoginMillis;
        if (typeof currentDataInFirestore.lastLogin === 'number') {
            lastLoginMillis = currentDataInFirestore.lastLogin;
        } else if (currentDataInFirestore.lastLogin instanceof Timestamp) { // Check if it's a Firestore Timestamp object
            lastLoginMillis = currentDataInFirestore.lastLogin.toMillis();
        } else {
            // Fallback for missing or unexpected lastLogin types
            console.warn("lastLogin field missing or invalid type, defaulting to Date.now().", currentDataInFirestore.lastLogin);
            lastLoginMillis = Date.now();
        }
        // --- END FIX ---

        const currentTimeMillis = Date.now();
        const timeElapsedSeconds = Math.floor((currentTimeMillis - lastLoginMillis) / 1000);

        // Create a working copy of the data from Firestore for calculations
        // Ensure all required fields exist (even if document exists from older version)
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

        // Calculate offline resources if time has passed
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
                alert(`My Lord Welcome back! While you were away, your village generated:\nWood: ${Math.round(generatedWood)}\nStone: ${Math.round(generatedStone)}\nIron: ${Math.round(generatedIron)}`);
            }
        }
        
        // Prepare this working data for saving to Firestore
        dataForFirestore = {
            ...workingVillageData,
            lastLogin: serverTimestamp() // Always update lastLogin to serverTimestamp for the next calculation
        };

    } else {
        // First time user setup - create initial village data
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
            lastLogin: serverTimestamp() // Set initial lastLogin to serverTimestamp
        };
    }

    // Ensure lastBattleMessage is handled consistently (null vs undefined for Firestore)
    if (dataForFirestore.lastBattleMessage === undefined) {
        delete dataForFirestore.lastBattleMessage;
    } else if (dataForFirestore.lastBattleMessage === null) {
        // Keep null if explicitly set to null, Firestore accepts null
    }

    // Perform the save to Firestore. This will trigger the onSnapshot listener.
    try {
        await setDoc(ref, dataForFirestore, { merge: true });
        console.log("Village data (including offline gains) saved to Firestore.");
    } catch (err) {
        console.error("Failed to save initial/offline village data:", err);
        alert("Error saving your village data.");
    }
    // No direct updateUI() or setting villageDataLoaded here; onSnapshot handles it.
}


// 🔹 Save Village (for general game actions like upgrades, training, etc.)
async function saveVillageData() {
    if (!user || !villageDataLoaded) {
        // This warning should now only appear if saveVillageData is called before
        // onSnapshot has fully initialized villageData and set villageDataLoaded.
        console.warn("Attempted to save village data before user or data loaded.");
        return;
    }

    // Always update lastLogin timestamp to serverTimestamp when saving
    // The villageData object is already updated locally by ongoing game actions
    villageData.lastLogin = serverTimestamp(); 

    // Deep copy to ensure no undefined fields are present for Firestore write
    const dataToSave = JSON.parse(JSON.stringify(villageData));
    
    // Explicitly handle lastBattleMessage to be null if undefined
    if (dataToSave.lastBattleMessage === undefined) {
        delete dataToSave.lastBattleMessage;
    }

    try {
        await setDoc(doc(db, "villages", user.uid), dataToSave, { merge: true });
        console.log("Village data saved due to user action.");
    } catch (err) {
        console.error("Save failed:", err);
        alert("Error saving your village.");
    }
}

// 🔹 UI Update
// (No changes needed, as it correctly reads from the global villageData)
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

    // This querySelectorAll(".building") might not find elements if they're not directly
    // marked with the class "building" or if the "building-overlay" elements are dynamic.
    // Based on your HTML, it seems you use "building-overlay" as the container.
    // You might want to adjust this to: document.querySelectorAll(".building-overlay")
    // or ensure your building elements also have a "building" class.
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

    if (!Object.entries(cost).every(([resource, amount]) => villageData[resource] >= amount)) {
        alert(`Not enough resources to train a ${type}.`);
        return;
    }

    Object.entries(cost).forEach(([resource, amount]) => {
        villageData[resource] -= amount;
    });

    villageData.troops[type] = (villageData.troops[type] || 0) + 1;
    saveVillageData();
    updateUI();
    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
}

// 🔹 Resource Loop
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
                    const initialDefenderSpear = v.troops?.spear || 0;
                    const initialDefenderSword = v.troops?.sword || 0;
                    const initialDefenderAxe = v.troops?.axe || 0;

                    let damageToAttackerTroops = defenderStrength;
                    const attackerLosses = { spear: 0, sword: 0, axe: 0 };

                    const calculateLoss = (currentCount, troopPower) => {
                        const loss = Math.min(currentCount, Math.floor(damageToAttackerTroops / troopPower));
                        damageToAttackerTroops -= loss * troopPower;
                        return loss;
                    };

                    attackerLosses.axe = calculateLoss(axe, 3);
                    attackerLosses.sword = calculateLoss(sword, 2);
                    attackerLosses.spear = calculateLoss(spear, 1);

                    villageData.troops.spear -= attackerLosses.spear;
                    villageData.troops.sword -= attackerLosses.sword;
                    villageData.troops.axe -= attackerLosses.axe;

                    const scouted = {
                        wood: v.wood || 0,
                        stone: v.stone || 0,
                        iron: v.iron || 0
                    };

                    const totalRemainingAttackerTroops = (spear - attackerLosses.spear) + (sword - attackerLosses.sword) + (axe - attackerLosses.axe);
                    const totalCapacity = totalRemainingAttackerTroops * 30;

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
