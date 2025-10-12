import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Added 'query' for map listener, using 'where' to filter, if needed
import { getFirestore, doc, onSnapshot, updateDoc, increment, setDoc, getDoc, collection, setLogLevel, runTransaction, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
const appId = 'tiny-tribes-19ec8'; 
const firebaseConfig = {
    apiKey: "AIzaSyDAlw3jjFay1K_3p8AvqTvx3jeWo9Vgjbs",
    authDomain: "tiny-tribes-19ec8.firebaseapp.com",
    projectId: "tiny-tribes-19ec8",
    storageBucket: "tiny-tribes-19ec8.firebasestorage.app",
    messagingSenderId: "746060276139",
    appId: "1:746060276139:web:46f2b6cd2d7c678f1032ee",
    measurementId: "G-SFV5F5LG1V"
};
// --------------------

let db, auth;
let userId = null;
let localPersonalTroops = 0; // Renamed from clicks
let selectedTargetId = null; // New state variable for map targeting

setLogLevel('Debug');

// --- Helper Functions (renamed clicks to troops) ---
async function fetchWithExponentialBackoff(fetchFn, maxRetries = 5) {
    // ... (same as before) ...
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetchFn();
        } catch (error) {
            if (i === maxRetries - 1) {
                console.error("Max retries reached. Failed to execute Firestore operation.", error);
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- Firebase Setup & Auth (same as before) ---
// ... (initFirebase function) ...

async function initFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        await new Promise(resolve => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                    document.getElementById('userIdDisplay').textContent = userId;
                    console.log("Firebase Auth Ready. User ID:", userId);
                    setupRealtimeListeners();
                    await initializeUserAndGlobalState();
                    setupMapListener(); // NEW: Start listening for all player locations
                    document.getElementById('clickButton').disabled = false;
                    document.getElementById('attackButton').disabled = false;
                    resolve();
                } else {
                    console.log("Signing in Anonymously...");
                    await signInAnonymously(auth);
                }
            });
        });

    } catch (error) {
        document.getElementById('status').textContent = `Error initializing Firebase: ${error.message}`;
        console.error("Firebase Init Error:", error);
    }
}
 
// --- Firestore Paths ---
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
const getGlobalDocRef = () => doc(db, globalGameStatePath);

// Path for personal troop count (used for reading own score and targeting attacks)
const getPlayerPrivateDataRef = (targetUserId) => doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`); 
const getPersonalDocRef = () => getPlayerPrivateDataRef(userId);

// NEW: Path for public map location data
const getPlayerLocationRef = (targetUserId) => doc(db, `artifacts/${appId}/public/locations/player_${targetUserId}`);
const getAllLocationsCollection = () => collection(db, `artifacts/${appId}/public/locations`);


// --- Initialization Logic (Updated to handle map location) ---
async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    const locationDocRef = getPlayerLocationRef(userId);

    // 1. Initialize Global State
    await fetchWithExponentialBackoff(async () => {
        const globalSnap = await getDoc(globalDocRef);
        if (!globalSnap.exists()) {
            console.log("Initializing global game state...");
            await setDoc(globalDocRef, { totalTroops: 0, lastUpdate: new Date().toISOString() }); // Renamed field
        }
    });

    // 2. Initialize Personal Troop State
    await fetchWithExponentialBackoff(async () => {
        const personalSnap = await getDoc(personalDocRef);
        if (!personalSnap.exists()) {
            console.log("Initializing personal state...");
            await setDoc(personalDocRef, { clicks: 0, joinedAt: new Date().toISOString() });
            localPersonalTroops = 0;
        } else {
            const data = personalSnap.data();
            localPersonalTroops = data.clicks || 0;
            updatePersonalScoreDisplay(localPersonalTroops);
        }
    });

    // 3. NEW: Initialize or Update Player Location (random on first load)
    await fetchWithExponentialBackoff(async () => {
        const locationSnap = await getDoc(locationDocRef);
        if (!locationSnap.exists()) {
            console.log("Setting initial player location...");
            
            // Random position between 0 and 90 (to keep token visible)
            const x = Math.floor(Math.random() * 90) + 5; 
            const y = Math.floor(Math.random() * 90) + 5;

            await setDoc(locationDocRef, { 
                x: x, 
                y: y, 
                userId: userId,
                // We'll also store the troop count here for easy map rendering
                troops: localPersonalTroops 
            });
        }
    });
}

// --- Real-time Listeners and UI Updates (Renamed fields) ---
function setupRealtimeListeners() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Troops Listener
    onSnapshot(globalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const totalTroops = data.totalTroops || 0; // Renamed field
            updateGlobalScoreDisplay(totalTroops);
            document.getElementById('status').textContent = 'Game is live!';
        } // ... (rest is same)
    }, (error) => { /* ... */ });

    // Personal Troops Listener
    onSnapshot(personalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const troops = data.clicks || 0; // Still using 'clicks' in DB for simplicity
            localPersonalTroops = troops; 
            updatePersonalScoreDisplay(troops);
            // Also update the player's public troop count for the map listener
            updateLocationTroopCount(troops); 
        } // ... (rest is same)
    }, (error) => { /* ... */ });
}

function updateGlobalScoreDisplay(score) {
    document.getElementById('globalScore').textContent = score.toLocaleString();
}

function updatePersonalScoreDisplay(score) {
    document.getElementById('personalScore').textContent = score.toLocaleString();
}

// --- NEW Map Logic ---

// Helper to update the troop count in the public location document
async function updateLocationTroopCount(troops) {
    if (!userId || !db) return;
    const locationDocRef = getPlayerLocationRef(userId);
    // Use setDoc with merge to only update the 'troops' field without touching x/y
    await setDoc(locationDocRef, { troops: troops }, { merge: true });
}


function setupMapListener() {
    const mapContainer = document.getElementById('gameMap');
    const locationsCollection = getAllLocationsCollection();
    
    // Listen to ALL documents in the 'locations' collection
    onSnapshot(locationsCollection, (querySnapshot) => {
        mapContainer.innerHTML = ''; // Clear existing tokens

        if (querySnapshot.empty) {
            mapContainer.innerHTML = '<div id="mapStatus" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white font-bold text-lg">Waiting for players...</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const tokenUserId = data.userId;
            
            if (!data.x || !data.y) return;

            const token = document.createElement('div');
            token.className = `player-token ${tokenUserId === userId ? 'self' : ''} ${tokenUserId === selectedTargetId ? 'target' : ''}`;
            token.style.left = `${data.x}%`;
            token.style.top = `${data.y}%`;
            token.setAttribute('data-user-id', tokenUserId);
            
            // Add label showing troop count
            const label = document.createElement('span');
            label.className = 'token-label';
            label.textContent = `${data.troops}`;

            token.appendChild(label);
            mapContainer.appendChild(token);

            // Attach click handler for attack targeting
            if (tokenUserId !== userId) {
                token.addEventListener('click', () => handleTokenClick(tokenUserId));
            }
        });
    });
}

// Function run when an enemy token is clicked
function handleTokenClick(targetId) {
    // 1. Deselect previous target and select new target
    const prevTargetToken = document.querySelector(`.player-token.target`);
    if (prevTargetToken) {
        prevTargetToken.classList.remove('target');
    }
    const newTargetToken = document.querySelector(`.player-token[data-user-id="${targetId}"]`);
    if (newTargetToken) {
        newTargetToken.classList.add('target');
    }

    // 2. Set the target ID for the attack function
    selectedTargetId = targetId;
    document.getElementById('targetUserId').value = targetId;
    document.getElementById('status').textContent = `Target selected: ${targetId.substring(0, 8)}... Ready to attack!`;
}


// --- Game Logic (Renamed clicks/clickAmount to troops/troopAmount) ---

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    const clickButton = document.getElementById('clickButton');
    clickButton.addEventListener('click', handleRecruit); // Renamed handler
    const attackButton = document.getElementById('attackButton');
    attackButton.addEventListener('click', handleUserAttack);
});

async function handleRecruit() { // Renamed from handleUserClick
    if (!userId || !db) {
        document.getElementById('status').textContent = 'Initialization in progress...';
        return;
    }
    const troopAmount = 1; // Renamed
    
    // Optimistic UI update
    localPersonalTroops += troopAmount; // Renamed
    updatePersonalScoreDisplay(localPersonalTroops); // Renamed

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // 1. Update Global State (using 'totalTroops' field)
    await fetchWithExponentialBackoff(() => updateDoc(globalDocRef, {
        totalTroops: increment(troopAmount), // Renamed field
        lastUpdate: new Date().toISOString()
    })).catch(() => {
        localPersonalTroops -= troopAmount;
        updatePersonalScoreDisplay(localPersonalTroops);
        document.getElementById('status').textContent = 'Failed to update global score. Check console.';
    });

    // 2. Update Personal State (still using 'clicks' field in DB for backward compatibility)
    await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
        clicks: localPersonalTroops, // Renamed variable
        lastClicked: new Date().toISOString()
    })).catch(() => {
        document.getElementById('status').textContent = 'Failed to save personal score. Check console.';
    });
}
 
async function handleUserAttack() {
    // Ensure a target is selected
    const targetId = selectedTargetId || document.getElementById('targetUserId').value.trim();
    if (!targetId || targetId === userId) {
        alert("Please select a target on the map first!");
        return;
    }

    if (!userId || !db) { /* ... */ return; }
    
    const attackPower = 5; 
    
    document.getElementById('status').textContent = `Attacking ${targetId.substring(0, 8)}...`;
    
    const targetDocRef = getPlayerPrivateDataRef(targetId); // Target's private data
    const globalDocRef = getGlobalDocRef();

    try {
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);

            if (!targetSnap.exists()) {
                throw new Error("Target player not found or document structure is incorrect.");
            }

            const targetData = targetSnap.data();
            const currentTroops = targetData.clicks || 0; // Renamed variable
            
            const newTroops = Math.max(0, currentTroops - attackPower);
            const troopsReduced = currentTroops - newTroops; 
            
            if (troopsReduced === 0) {
                document.getElementById('status').textContent = `Target ${targetId.substring(0, 8)}... has 0 troops. Attack failed.`;
                return; 
            }
            
            // 1. Update the target's score (troops)
            transaction.update(targetDocRef, {
                clicks: newTroops, // Renamed variable
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            // 2. Update the global score (troops)
            transaction.update(globalDocRef, {
                totalTroops: increment(-troopsReduced), // Renamed field
                lastUpdate: new Date().toISOString()
            });

            document.getElementById('status').textContent = `Successfully reduced ${targetId.substring(0, 8)}...'s troops by ${troopsReduced}!`;
        });

    } catch (e) {
        console.error("Attack transaction failed:", e);
        document.getElementById('status').textContent = `Attack failed: ${e.message}`;
    }
}
