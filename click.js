import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
let selectedTargetId = null; 

setLogLevel('Debug');

// --- Helper Functions ---
async function fetchWithExponentialBackoff(fetchFn, maxRetries = 5) {
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

// --- Firebase Setup & Auth ---
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
                    setupMapListener();
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
// Path: artifacts (C) / tiny-tribes-19ec8 (D) / public (C) / data (D) / game_state (C) / global_game_state (D)
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
const getGlobalDocRef = () => doc(db, globalGameStatePath);

// Path for personal troop count (Private Data)
const getPlayerPrivateDataRef = (targetUserId) => doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`); 
const getPersonalDocRef = () => getPlayerPrivateDataRef(userId);

// FIX: Simplified Public Location Path Structure to a top-level collection.
// Path: public_locations (C) / {playerId} (D) - This guarantees a valid 2-segment path.
const getPlayerLocationRef = (targetUserId) => doc(db, "public_locations", targetUserId); 
const getAllLocationsCollection = () => collection(db, "public_locations");


// --- Initialization Logic ---
async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    const locationDocRef = getPlayerLocationRef(userId); 

    // 1. Initialize Global State
    await fetchWithExponentialBackoff(async () => {
        const globalSnap = await getDoc(globalDocRef);
        if (!globalSnap.exists()) {
            console.log("Initializing global game state...");
            await setDoc(globalDocRef, { totalTroops: 0, lastUpdate: new Date().toISOString() }); 
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

    // 3. Initialize or Update Player Location (using the fixed path)
    await fetchWithExponentialBackoff(async () => {
        const locationSnap = await getDoc(locationDocRef);
        if (!locationSnap.exists()) {
            console.log("Setting initial player location...");
            
            const x = Math.floor(Math.random() * 90) + 5; 
            const y = Math.floor(Math.random() * 90) + 5;

            await setDoc(locationDocRef, { 
                x: x, 
                y: y, 
                userId: userId,
                troops: localPersonalTroops 
            });
        }
    });
}

// --- Real-time Listeners and UI Updates ---
function setupRealtimeListeners() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Troops Listener
    onSnapshot(globalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const totalTroops = data.totalTroops || 0; 
            updateGlobalScoreDisplay(totalTroops);
            document.getElementById('status').textContent = 'Game is live!';
        }
    }, (error) => { 
        console.error("Error listening to global state:", error);
        document.getElementById('status').textContent = `Error: ${error.message}`;
    });

    // Personal Troops Listener
    onSnapshot(personalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const troops = data.clicks || 0; 
            localPersonalTroops = troops; 
            updatePersonalScoreDisplay(troops);
            updateLocationTroopCount(troops); // Updates the map token troop count
        }
    }, (error) => { 
        console.error("Error listening to personal state:", error);
    });
}

function updateGlobalScoreDisplay(score) {
    document.getElementById('globalScore').textContent = score.toLocaleString();
}

function updatePersonalScoreDisplay(score) {
    document.getElementById('personalScore').textContent = score.toLocaleString();
}

// --- Map Logic ---
async function updateLocationTroopCount(troops) {
    if (!userId || !db) return;
    const locationDocRef = getPlayerLocationRef(userId); 
    // Use setDoc with merge to only update the 'troops' field without touching x/y
    await setDoc(locationDocRef, { troops: troops }, { merge: true });
}


function setupMapListener() {
    const mapContainer = document.getElementById('gameMap');
    const locationsCollection = getAllLocationsCollection(); 
    
    // Listen to ALL documents in the 'public_locations' collection
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
            
            // Adjust coordinates slightly to center the token based on 50% of its size (20px token = 10px offset)
            token.style.left = `calc(${data.x}% - 10px)`; 
            token.style.top = `calc(${data.y}% - 10px)`;
            
            token.setAttribute('data-user-id', tokenUserId);
            
            const label = document.createElement('span');
            label.className = 'token-label';
            label.textContent = `${data.troops}`;

            token.appendChild(label);
            mapContainer.appendChild(token);

            if (tokenUserId !== userId) {
                token.addEventListener('click', () => handleTokenClick(tokenUserId));
            }
        });
    });
}

function handleTokenClick(targetId) {
    const prevTargetToken = document.querySelector(`.player-token.target`);
    if (prevTargetToken) {
        prevTargetToken.classList.remove('target');
    }
    const newTargetToken = document.querySelector(`.player-token[data-user-id="${targetId}"]`);
    if (newTargetToken) {
        newTargetToken.classList.add('target');
    }

    selectedTargetId = targetId;
    document.getElementById('targetUserId').value = targetId;
    document.getElementById('status').textContent = `Target selected: ${targetId.substring(0, 8)}... Ready to attack!`;
}


// --- Game Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    const clickButton = document.getElementById('clickButton');
    clickButton.addEventListener('click', handleRecruit);
    const attackButton = document.getElementById('attackButton');
    attackButton.addEventListener('click', handleUserAttack);
});

async function handleRecruit() { 
    if (!userId || !db) {
        document.getElementById('status').textContent = 'Initialization in progress...';
        return;
    }
    const troopAmount = 1; 
    
    localPersonalTroops += troopAmount; 
    updatePersonalScoreDisplay(localPersonalTroops); 

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // 1. Update Global State
    await fetchWithExponentialBackoff(() => updateDoc(globalDocRef, {
        totalTroops: increment(troopAmount), 
        lastUpdate: new Date().toISOString()
    })).catch(() => {
        localPersonalTroops -= troopAmount;
        updatePersonalScoreDisplay(localPersonalTroops);
        document.getElementById('status').textContent = 'Failed to update global score. Check console.';
    });

    // 2. Update Personal State
    await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
        clicks: localPersonalTroops, 
        lastClicked: new Date().toISOString()
    })).catch(() => {
        document.getElementById('status').textContent = 'Failed to save personal score. Check console.';
    });
}
 
async function handleUserAttack() {
    const targetId = selectedTargetId || document.getElementById('targetUserId').value.trim();
    if (!targetId || targetId === userId) {
        alert("Please select a target on the map first!");
        return;
    }

    if (!userId || !db) {
        document.getElementById('status').textContent = 'Initialization in progress...';
        return;
    }
    
    const attackPower = 5; 
    
    document.getElementById('status').textContent = `Attacking ${targetId.substring(0, 8)}...`;
    
    const targetDocRef = getPlayerPrivateDataRef(targetId);
    const globalDocRef = getGlobalDocRef();

    try {
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);

            if (!targetSnap.exists()) {
                throw new Error("Target player not found or document structure is incorrect.");
            }

            const targetData = targetSnap.data();
            const currentTroops = targetData.clicks || 0; 
            
            const newTroops = Math.max(0, currentTroops - attackPower);
            const troopsReduced = currentTroops - newTroops; 
            
            if (troopsReduced === 0) {
                document.getElementById('status').textContent = `Target ${targetId.substring(0, 8)}... has 0 troops. Attack failed.`;
                return; 
            }
            
            // 1. Update the target's score (troops)
            transaction.update(targetDocRef, {
                clicks: newTroops, 
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            // 2. Update the global score (troops)
            transaction.update(globalDocRef, {
                totalTroops: increment(-troopsReduced), 
                lastUpdate: new Date().toISOString()
            });

            document.getElementById('status').textContent = `Successfully reduced ${targetId.substring(0, 8)}...'s troops by ${troopsReduced}!`;
        });

    } catch (e) {
        console.error("Attack transaction failed:", e);
        document.getElementById('status').textContent = `Attack failed: ${e.message}`;
    }
}
