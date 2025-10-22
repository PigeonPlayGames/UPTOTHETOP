import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, increment, setDoc, getDoc, collection, setLogLevel, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
// These global variables are provided by the canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'click-game-default';

// FIX: Hardcode the firebaseConfig using details from your previous posts
// This bypasses potential issues with the __firebase_config environment variable not being available.
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
// Utility for retrying fetch operations with exponential backoff
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
        // Line 44 check simplified and adapted after hardcoding the config
        if (!firebaseConfig.projectId) { 
            document.getElementById('status').textContent = "Error: Firebase configuration missing.";
            throw new Error("Firebase configuration object is empty.");
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        document.getElementById('status').textContent = 'Checking login status...';

        await new Promise(resolve => {
            // This listener checks if a user is already signed in (via the homepage).
            onAuthStateChanged(auth, async (user) => {
                const clickButton = document.getElementById('clickButton');
                const attackButton = document.getElementById('attackButton');
                const userIdDisplay = document.getElementById('userIdDisplay');

                if (user) {
                    // ✅ User is authenticated via Email/Password login
                    userId = user.uid;
                    userIdDisplay.textContent = userId;
                    document.getElementById('status').textContent = 'Logged In! Game is live.';
                    console.log("Firebase Auth Ready. User ID:", userId);
                    
                    setupRealtimeListeners();
                    await initializeUserAndGlobalState();
                    
                    clickButton.disabled = false;
                    attackButton.disabled = false;
                } else {
                    // ❌ User is NOT logged in. Disable game and prompt login.
                    userId = null;
                    userIdDisplay.textContent = 'Please log in on the main page to play.';
                    document.getElementById('status').textContent = 'Login Required: Please log in to play the game.';
                    
                    clickButton.disabled = true;
                    attackButton.disabled = true;
                    updatePersonalScoreDisplay(0); 
                }
                resolve(); // Resolve regardless of login status to continue script execution
            });
        });

    } catch (error) {
        document.getElementById('status').textContent = `Error initializing Firebase: ${error.message}`;
        console.error("Firebase Init Error:", error);
    }
}
 
// --- Firestore Paths and Initialization ---
// Global state is public
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
 
const getGlobalDocRef = () => doc(db, globalGameStatePath);

// Personal state is private, keyed by the authenticated userId
// This path structure is necessary for the security rules
const getPlayerDocRef = (targetUserId) => doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`); 

const getPersonalDocRef = () => getPlayerDocRef(userId);


async function initializeUserAndGlobalState() {
    if (!db || !userId) return; // Must be logged in
    
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
            console.log("Initializing personal state for new user...");
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
    if (!db || !userId) return; // Must be logged in

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Clicks Listener
    onSnapshot(globalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const totalClicks = data.totalClicks || 0;
            updateGlobalScoreDisplay(totalClicks);
        } else {
            updateGlobalScoreDisplay(0);
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
        document.getElementById('status').textContent = 'Login is required to click!';
        return;
    }
    const clickAmount = 1;
    
    // Optimistic UI update
    localPersonalClicks += clickAmount;
    updatePersonalScoreDisplay(localPersonalClicks);

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    try {
        // Use a batch or transaction for atomicity is ideal, but for simple increment, this sequence works.
        // 1. Update Global State
        await fetchWithExponentialBackoff(() => updateDoc(globalDocRef, {
            totalClicks: increment(clickAmount),
            lastUpdate: new Date().toISOString()
        }));

        // 2. Update Personal State
        // Use increment() here to prevent race conditions if the player clicks rapidly,
        // rather than using the potentially stale 'localPersonalClicks' value.
        await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
            clicks: increment(clickAmount),
            lastClicked: new Date().toISOString()
        }));

    } catch(e) {
        // Revert local UI on failure
        localPersonalClicks -= clickAmount;
        updatePersonalScoreDisplay(localPersonalClicks);
        document.getElementById('status').textContent = 'Click failed: Check console.';
        console.error("Click operation failed:", e);
    }
}
 
async function handleUserAttack() {
    if (!userId || !db) {
        document.getElementById('status').textContent = 'Login is required to attack!';
        return;
    }
    
    const targetId = document.getElementById('targetUserId').value.trim();
    const attackPower = 5; 
    
    if (!targetId || targetId === userId) {
        // Replace alert() with a modal or status message
        document.getElementById('status').textContent = 'Please enter a valid Target Player ID (and not your own!).';
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
            
            // Ensure score doesn't go below zero
            const newClicks = Math.max(0, currentClicks - attackPower);
            const clicksReduced = currentClicks - newClicks; 
            
            if (clicksReduced === 0) {
                // Return gracefully without error if attack has no effect
                document.getElementById('status').textContent = `${targetId} already has 0 clicks. Attack failed.`;
                return; 
            }
            
            // 1. Update the target's score
            transaction.update(targetDocRef, {
                clicks: newClicks,
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            // 2. Update the global score (reduce by the actual reduction amount)
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
