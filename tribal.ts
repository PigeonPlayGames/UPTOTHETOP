// 🔹 Firebase Setup
import { initializeApp, FirebaseApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, Auth, User } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { updateDoc, serverTimestamp, Timestamp, setDoc, doc, getFirestore, getDoc, collection, query, orderBy, limit, onSnapshot, getDocs, Firestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable, Functions } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";

// 🔹 Interfaces for type-safe data structures
interface Buildings {
    hq: number;
    lumber: number;
    quarry: number;
    iron: number;
}

interface Troops {
    spear: number;
    sword: number;
    axe: number;
}

interface VillageData {
    username: string;
    userId: string;
    wood: number;
    stone: number;
    iron: number;
    score: number;
    x: number;
    y: number;
    buildings: Buildings;
    troops: Troops;
    lastLogin: Timestamp | number;
    lastBattleMessage?: string | null;
}

interface Costs {
    [key: string]: { wood?: number; stone?: number; iron?: number };
}

// 🔹 Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const functions: Functions = getFunctions(app);

// 🔹 State
let user: User | null = null;
let villageData: VillageData | null = null;
let villageDataLoaded: boolean = false;

// 🔹 DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    // --- Windmill Animation Logic ---
    const windmillBlades = document.getElementById('windmill-blades') as HTMLImageElement | null;
    const numberOfFrames: number = 8;
    let currentFrame: number = 0;
    const animationSpeed: number = 100;

    function animateWindmill(): void {
        if (windmillBlades) {
            windmillBlades.src = `windmill_frame_${currentFrame}.png`;
            currentFrame = (currentFrame + 1) % numberOfFrames;
        }
    }
    setInterval(animateWindmill, animationSpeed);
    // --- End Windmill Animation Logic ---

    onAuthStateChanged(auth, async (loggedInUser: User | null) => {
        if (!loggedInUser) {
            alert("You must be logged in to play!");
            window.location.href = "index.html";
            return;
        }

        user = loggedInUser;
        const villageDocRef = doc(db, "villages", user.uid);

        onSnapshot(villageDocRef, (docSnap) => {
            if (!docSnap.exists()) {
                console.error("Village document does not exist for user:", user?.uid);
                return;
            }

            villageData = docSnap.data() as VillageData;

            if (!villageDataLoaded) {
                villageDataLoaded = true;
                startGameLoops();
                loadLeaderboard();
                loadWorldMap();
                bindUpgradeButtons();
                bindTrainButtons();
                bindLogout();
            }

            updateUI();

            if (villageData?.lastBattleMessage) {
                alert(villageData.lastBattleMessage);
                (async () => {
                    try {
                        await updateDoc(villageDocRef, {
                            lastBattleMessage: null
                        });
                        if (villageData) {
                            delete villageData.lastBattleMessage;
                        }
                    } catch (error) {
                        console.error("Failed to clear battle message:", error);
                    }
                })();
            }
        }, (error) => {
            console.error("Error listening to village data:", error);
            alert("Failed to load village data in real-time. Please refresh.");
        });

        await calculateOfflineResourcesAndSave();
    });
});

// 🔹 Function to calculate offline resources and save the updated state
async function calculateOfflineResourcesAndSave(): Promise<void> {
    if (!user) return;
    const ref = doc(db, "villages", user.uid);
    const snapshot = await getDoc(ref);
    let dataForFirestore: Partial<VillageData>;

    if (snapshot.exists()) {
        const currentDataInFirestore = snapshot.data() as VillageData;
        let lastLoginMillis: number;

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
        let workingVillageData: Partial<VillageData> = { ...currentDataInFirestore };

        if (timeElapsedSeconds > 0) {
            const woodPerSecond = ((workingVillageData.buildings?.lumber ?? 1) * 5) / 5;
            const stonePerSecond = ((workingVillageData.buildings?.quarry ?? 1) * 5) / 5;
            const ironPerSecond = ((workingVillageData.buildings?.iron ?? 1) * 5) / 5;

            workingVillageData.wood = (workingVillageData.wood ?? 100) + (woodPerSecond * timeElapsedSeconds);
            workingVillageData.stone = (workingVillageData.stone ?? 100) + (stonePerSecond * timeElapsedSeconds);
            workingVillageData.iron = (workingVillageData.iron ?? 100) + (ironPerSecond * timeElapsedSeconds);

            if (woodPerSecond > 0 || stonePerSecond > 0 || ironPerSecond > 0) {
                alert(`My Lord Welcome back! While you were away, your village generated:\nWood: ${Math.round(woodPerSecond * timeElapsedSeconds)}\nStone: ${Math.round(stonePerSecond * timeElapsedSeconds)}\nIron: ${Math.round(ironPerSecond * timeElapsedSeconds)}`);
            }
        }
        
        dataForFirestore = {
            ...workingVillageData,
            lastLogin: serverTimestamp() as Timestamp
        };
    } else {
        dataForFirestore = {
            username: user.email?.split("@")[0] ?? 'Unknown',
            userId: user.uid,
            wood: 100,
            stone: 100,
            iron: 100,
            score: 0,
            x: Math.floor(Math.random() * 3000),
            y: Math.floor(Math.random() * 3000),
            buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 },
            troops: { spear: 0, sword: 0, axe: 0 },
            lastLogin: serverTimestamp() as Timestamp
        };
    }

    try {
        await setDoc(ref, dataForFirestore, { merge: true });
        console.log("Village data (including offline gains) saved to Firestore.");
    } catch (err) {
        console.error("Failed to save initial/offline village data:", err);
        alert("Error saving your village data.");
    }
}

// 🔹 Save Village (for general game actions like upgrades, training, etc.)
async function saveVillageData(): Promise<void> {
    if (!user || !villageDataLoaded || !villageData) return;

    villageData.lastLogin = serverTimestamp() as Timestamp;
    const dataToSave: VillageData = JSON.parse(JSON.stringify(villageData));
    
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
function updateUI(): void {
    if (!villageData) return;

    (document.getElementById("wood-count") as HTMLElement).innerText = Math.floor(villageData.wood ?? 0).toString();
    (document.getElementById("stone-count") as HTMLElement).innerText = Math.floor(villageData.stone ?? 0).toString();
    (document.getElementById("iron-count") as HTMLElement).innerText = Math.floor(villageData.iron ?? 0).toString();
    (document.getElementById("player-score") as HTMLElement).innerText = (villageData.score ?? 0).toString();

    (document.getElementById("hq-level") as HTMLElement).innerText = (villageData.buildings.hq).toString();
    (document.getElementById("lumber-level") as HTMLElement).innerText = (villageData.buildings.lumber).toString();
    (document.getElementById("quarry-level") as HTMLElement).innerText = (villageData.buildings.quarry).toString();
    (document.getElementById("iron-level") as HTMLElement).innerText = (villageData.buildings.iron).toString();

    (document.getElementById("spear-count") as HTMLElement).textContent = (villageData.troops.spear).toString();
    (document.getElementById("sword-count") as HTMLElement).textContent = (villageData.troops.sword).toString();
    (document.getElementById("axe-count") as HTMLElement).textContent = (villageData.troops.axe).toString();

    document.querySelectorAll(".building-overlay").forEach(buildingElement => {
        const type = (buildingElement.querySelector(".upgrade-btn") as HTMLElement).getAttribute("data-building");
        if (type && villageData) {
            const level = villageData.buildings[type as keyof Buildings];
            const cost = level * 50;
            (buildingElement.querySelector(".upgrade-cost") as HTMLElement).innerText =
                `Upgrade Cost: Wood: ${cost}, Stone: ${cost}, Iron: ${cost}`;
        }
    });
}

// 🔹 Upgrade Buttons
function bindUpgradeButtons(): void {
    document.querySelectorAll(".upgrade-btn").forEach(button => {
        const building = (button as HTMLElement).getAttribute("data-building");
        if (building) {
            button.addEventListener("click", () => {
                upgradeBuilding(building);
            });
        }
    });
}

// 🔹 Train Troop Buttons
function bindTrainButtons(): void {
    document.querySelectorAll(".train-btn").forEach(button => {
        const type = (button as HTMLElement).getAttribute("data-type");
        if (type) {
            button.addEventListener("click", () => {
                recruitTroop(type);
            });
        }
    });
}

// 🔹 Upgrade Logic
function upgradeBuilding(building: string): void {
    if (!villageDataLoaded || !villageData) return;

    const level = villageData.buildings[building as keyof Buildings];
    const cost = level * 50;

    if (villageData.wood >= cost && villageData.stone >= cost && villageData.iron >= cost) {
        villageData.wood -= cost;
        villageData.stone -= cost;
        villageData.iron -= cost;
        villageData.buildings[building as keyof Buildings]++;
        villageData.score += 10;
        saveVillageData();
    } else {
        alert("Not enough resources!");
    }
}

// 🔹 Recruit Logic
function recruitTroop(type: string): void {
    if (!villageDataLoaded || !villageData) return;
    const costs: Costs = {
        spear: { wood: 100 },
        sword: { iron: 100 },
        axe: { stone: 100 }
    };

    const cost = costs[type];

    if (!cost || !Object.entries(cost).every(([resource, amount]) => (villageData as any)[resource] >= amount!)) {
        alert(`Not enough resources to train a ${type}.`);
        return;
    }

    Object.entries(cost).forEach(([resource, amount]) => {
        (villageData as any)[resource] -= amount;
    });

    villageData.troops[type as keyof Troops] = (villageData.troops[type as keyof Troops] || 0) + 1;
    saveVillageData();
    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} recruited!`);
}

// 🔹 Resource Loop
function startGameLoops(): void {
    setInterval(() => {
        if (!villageDataLoaded || !villageData) return;
        villageData.wood += villageData.buildings.lumber * 5;
        villageData.stone += villageData.buildings.quarry * 5;
        villageData.iron += villageData.buildings.iron * 5;
        updateUI();
    }, 5000);
}

// 🔹 Leaderboard
function loadLeaderboard(): void {
    const leaderboardList = document.getElementById("leaderboard-list");
    if (!leaderboardList) return;
    leaderboardList.innerHTML = "<li>Loading...</li>";

    const q = query(collection(db, "villages"), orderBy("score", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        if (!leaderboardList) return;
        leaderboardList.innerHTML = "";
        if (snapshot.empty) {
            leaderboardList.innerHTML = "<li>No players yet!</li>";
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data() as VillageData;
            const li = document.createElement("li");
            li.innerText = `${data.username || "Unknown"} - ${data.score}`;
            leaderboardList.appendChild(li);
        });
    });
}

// 🔹 World Map
async function loadWorldMap(): Promise<void> {
    const wrapper = document.getElementById("map-wrapper") as HTMLElement;
    const world = document.getElementById("map-world") as HTMLElement;
    if (!wrapper || !world || !villageData) return;

    world.innerHTML = "";

    try {
        const snapshot = await getDocs(collection(db, "villages"));
        snapshot.forEach(docSnap => {
            const v = docSnap.data() as VillageData & { id: string };
            v.id = docSnap.id;
            if (!v.x || !v.y) return;
            const el = document.createElement("div");
            el.className = "village-tile";
            if (v.userId === user?.uid) {
                el.classList.add("your-village");
                el.setAttribute("title", "Your Village");
            }

            el.style.left = `${v.x}px`;
            el.style.top = `${v.y}px`;
            el.setAttribute("data-username", v.username || "Unknown");
            el.setAttribute("data-score", (v.score ?? 0).toString());

            el.addEventListener("click", async () => {
                if (v.userId === user?.uid) {
                    alert("This is your own village. You cannot attack yourself!");
                    return;
                }
                const confirmAttack = confirm(`Attack ${v.username}'s village (Score: ${v.score})?`);
                if (!confirmAttack) return;
                const spear = parseInt(prompt("Send how many Spear Fighters (1 power)?") || '0', 10) || 0;
                const sword = parseInt(prompt("Send how many Swordsmen (2 power)?") || '0', 10) || 0;
                const axe = parseInt(prompt("Send how many Axemen (3 power)?") || '0', 10) || 0;
                const totalSent = spear + sword + axe;

                if (totalSent <= 0) return alert("You must send at least 1 troop to attack.");
                if (spear > villageData!.troops.spear || sword > villageData!.troops.sword || axe > villageData!.troops.axe) {
                    return alert("Not enough troops in your village to send that many.");
                }

                try {
                    const processAttackCallable = httpsCallable(functions, 'processAttack');
                    const result = await processAttackCallable({
                        defenderId: v.id,
                        sentTroops: { spear, sword, axe }
                    });
                    alert(result.data.message);
                    loadWorldMap();
                } catch (error) {
                    console.error("Error during attack:", error);
                    alert(`Attack failed: ${(error as any).message}`);
                }
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

function centerOnPlayer(wrapper: HTMLElement, world: HTMLElement, x: number, y: number): void {
    const wrapperRect = wrapper.getBoundingClientRect();
    const offsetX = wrapperRect.width / 2 - x;
    const offsetY = wrapperRect.height / 2 - y;
    world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(1)`;
    world.dataset.initialX = offsetX.toString();
    world.dataset.initialY = offsetY.toString();
}

function initPanZoom(viewport: HTMLElement, content: HTMLElement): void {
    let scale: number = 1;
    let originX: number = parseFloat(content.dataset.initialX || '0') || 0;
    let originY: number = parseFloat(content.dataset.initialY || '0') || 0;
    let startX: number = 0, startY: number = 0;
    let panning: boolean = false;

    const setTransform = (): void =>
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

    let lastTouchDistance: number | null = null;
    viewport.addEventListener("touchmove", (e: TouchEvent) => {
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

    const pointerDown = (e: MouseEvent | TouchEvent) => {
        panning = true;
        const clientX = (e as MouseEvent).clientX ?? (e as TouchEvent).touches[0].clientX;
        const clientY = (e as MouseEvent).clientY ?? (e as TouchEvent).touches[0].clientY;
        startX = clientX - originX;
        startY = clientY - originY;
    };

    const pointerMove = (e: MouseEvent | TouchEvent) => {
        if (!panning) return;
        if (e.cancelable) e.preventDefault();
        const clientX = (e as MouseEvent).clientX ?? (e as TouchEvent).touches[0].clientX;
        const clientY = (e as MouseEvent).clientY ?? (e as TouchEvent).touches[0].clientY;
        originX = clientX - startX;
        originY = clientY - startY;
        setTransform();
    };

    const pointerUp = () => (panning = false);

    viewport.addEventListener("mousedown", pointerDown);
    window.addEventListener("mousemove", pointerMove);
    window.addEventListener("mouseup", pointerUp);
    viewport.addEventListener("touchstart", pointerDown as EventListener, { passive: false });
    window.addEventListener("touchmove", pointerMove as EventListener, { passive: false });
    window.addEventListener("touchend", pointerUp);

    setTransform();
}

// 🔹 Logout
function bindLogout(): void {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await saveVillageData();
                await auth.signOut();
                window.location.href = "index.html";
            } catch (err) {
                console.error("Logout Error:", err);
                alert("Failed to logout. Please try again.");
            }
        });
    }
}
