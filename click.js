import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, increment, setDoc, getDoc, collection, setLogLevel, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
const appId = 'tiny-tribes-19ec8'; 
const initialAuthToken = null; 

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
let localPersonalClicks = 0; 

setLogLevel('Debug');

// --- Utility Functions ---
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
        if (!firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_PROJECT_ID") {
            throw new Error("Configuration is still using placeholder values. Please replace them with your actual Firebase config.");
        }

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
 
// --- Firestore Paths and Initialization ---
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
 
const getGlobalDocRef = () => doc(db, globalGameStatePath);
const getPersonalCollectionRef = () => collection(db, `artifacts/${appId}/users/${userId}/user_scores`);
 
// Document reference for ANY player's personal score (used for reading own score and targeting attacks)
const getPlayerDocRef = (targetUserId) => doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`); 

const getPersonalDocRef = () => getPlayerDocRef(userId);


async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // 1. Initialize Global State
    await fetchWithExponentialBackoff(async () => {
        const globalSnap = await getDoc(globalDocRef);
        if (!globalSnap.exists()) {
            console.log("Initializing global game state...");
            await setDoc(globalDocRef, { totalClicks: 0, lastUpdate: new Date().toISOString() });
        }
    });

    // 2. Initialize Personal State
    await fetchWithExponentialBackoff(async () => {
        const personalSnap = await getDoc(personalDocRef);
        if (!personalSnap.exists()) {
            console.log("Initializing personal state...");
            await setDoc(personalDocRef, { clicks: 0, joinedAt: new Date().toISOString() });
            localPersonalClicks = 0;
        } else {
            const data = personalSnap.data();
            localPersonalClicks = data.clicks || 0;
            updatePersonalScoreDisplay(localPersonalClicks);
        }
    });
}

// --- Real-time Listeners and UI Updates ---
function setupRealtimeListeners() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Clicks Listener
    onSnapshot(globalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const totalClicks = data.totalClicks || 0;
            updateGlobalScoreDisplay(totalClicks);
            document.getElementById('status').textContent = 'Game is live!';
        } else {
            updateGlobalScoreDisplay(0);
            document.getElementById('status').textContent = 'Waiting for global state initialization...';
        }
    }, (error) => {
        console.error("Error listening to global state:", error);
        document.getElementById('status').textContent = `Error: ${error.message}`;
    });

    // Personal Clicks Listener
    onSnapshot(personalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const clicks = data.clicks || 0;
            localPersonalClicks = clicks; 
            updatePersonalScoreDisplay(clicks);
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

// --- Game Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    const clickButton = document.getElementById('clickButton');
    clickButton.addEventListener('click', handleUserClick);
    const attackButton = document.getElementById('attackButton');
    attackButton.addEventListener('click', handleUserAttack);
});

async function handleUserClick() {
    if (!userId || !db) {
        document.getElementById('status').textContent = 'Initialization in progress...';
        return;
    }
    const clickAmount = 1;
    
    // Optimistic UI update
    localPersonalClicks += clickAmount;
    updatePersonalScoreDisplay(localPersonalClicks);

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // 1. Update Global State
    await fetchWithExponentialBackoff(() => updateDoc(globalDocRef, {
        totalClicks: increment(clickAmount),
        lastUpdate: new Date().toISOString()
    })).catch(() => {
        // Revert local UI on failure
        localPersonalClicks -= clickAmount;
        updatePersonalScoreDisplay(localPersonalClicks);
        document.getElementById('status').textContent = 'Failed to update global score. Check console.';
    });

    // 2. Update Personal State
    await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
        clicks: localPersonalClicks,
        lastClicked: new Date().toISOString()
    })).catch(() => {
        document.getElementById('status').textContent = 'Failed to save personal score. Check console.';
    });
}
 
async function handleUserAttack() {
    if (!userId || !db) {
        document.getElementById('status').textContent = 'Initialization in progress...';
        return;
    }
    
    const targetId = document.getElementById('targetUserId').value.trim();
    const attackPower = 5; 
    
    if (!targetId || targetId === userId) {
        alert("Please enter a valid Target Player ID (and not your own!).");
        return;
    }

    document.getElementById('status').textContent = `Attacking ${targetId}...`;
    
    const targetDocRef = getPlayerDocRef(targetId);
    const globalDocRef = getGlobalDocRef();

    try {
        // Use a Firestore Transaction for Atomic Attack
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);

            if (!targetSnap.exists()) {
                throw new Error("Target player not found or document structure is incorrect.");
            }

            const targetData = targetSnap.data();
            const currentClicks = targetData.clicks || 0;
            
            const newClicks = Math.max(0, currentClicks - attackPower);
            const clicksReduced = currentClicks - newClicks; 
            
            if (clicksReduced === 0) {
                document.getElementById('status').textContent = `${targetId} already has 0 clicks. Attack failed.`;
                return; 
            }
            
            // 1. Update the target's score
            transaction.update(targetDocRef, {
                clicks: newClicks,
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            // 2. Update the global score
            transaction.update(globalDocRef, {
                totalClicks: increment(-clicksReduced),
                lastUpdate: new Date().toISOString()
            });

            document.getElementById('status').textContent = `Successfully reduced ${targetId}'s score by ${clicksReduced}.`;
        });

    } catch (e) {
        console.error("Attack transaction failed:", e);
        document.getElementById('status').textContent = `Attack failed: ${e.message}`;
    }
}
