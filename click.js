import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"; // <-- FIX: Correct import for initializeApp
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    signInWithCustomToken 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    onSnapshot, 
    updateDoc, 
    increment, 
    setDoc, 
    getDoc, 
    collection, 
    setLogLevel, 
    runTransaction,
    query,
    orderBy,
    limit,
    getDocs // Used for reliable leaderboard fetching
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- MANDATORY CANVAS CONFIGURATION ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// TEMPORARY FIX: Hardcoding Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDAlw3jjFay1K_3p8AvqTvx3jeWo9Vgjbs",
    authDomain: "tiny-tribes-19ec8.firebaseapp.com",
    projectId: "tiny-tribes-19ec8",
    storageBucket: "tiny-tribes-19ec8.firebasestorage.app",
    messagingSenderId: "746060276139",
    appId: "1:746060276139:web:46f2b6cd2d7c678f1032ee",
    measurementId: "G-SFV5F5LG1V"
};
// ------------------------------------

let db, auth;
let userId = null;
let localPersonalClicks = 0;

let unsubscribeGlobal = null;
let unsubscribePersonal = null;
// No unsubscribeLeaderboard needed as it uses getDocs (one-time fetch)

setLogLevel('Debug');

// --- DOM References ---
const authUi = document.getElementById('authUi');
const gameContent = document.getElementById('gameContent');
const logoutDiv = document.getElementById('logoutDiv');
const authDivider = document.getElementById('authDivider');
const authStatus = document.getElementById('authStatus'); 
const authError = document.getElementById('authError'); 
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const gameStatus = document.getElementById('status');

// --- Utility Functions ---
function displayAuthError(message, duration = 3000) {
    authError.textContent = message;
    setTimeout(() => {
        authError.textContent = '';
    }, duration);
}

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
        if (!firebaseConfig.projectId) {
            authStatus.textContent = "Firebase configuration is missing or invalid. Cannot initialize.";
            return;
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        if (initialAuthToken) {
            try {
                authStatus.textContent = "Authenticating secure session...";
                await signInWithCustomToken(auth, initialAuthToken);
            } catch (error) {
                console.warn("Custom token sign-in failed, proceeding to manual authentication.", error);
                authStatus.textContent = "Secure session failed. Please sign in or sign up below.";
            }
        } else {
            authStatus.textContent = 'Please sign in or sign up to play.';
        }


        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // USER IS LOGGED IN
                userId = user.uid;
                document.getElementById('userIdDisplay').textContent = userId;
                authStatus.textContent = `Welcome, Player ${user.email ? user.email.split('@')[0] : userId.substring(0, 6)}!`;

                authUi.classList.add('hidden');
                gameContent.classList.remove('hidden');
                logoutDiv.classList.remove('hidden');
                authDivider.classList.remove('hidden');
                
                console.log("Firebase Auth Ready. User ID:", userId);
                setupRealtimeListeners();
                
                // CRUCIAL REORDERING: Initialize state THEN fetch the leaderboard
                await initializeUserAndGlobalState(); 
                await setupLeaderboardFetcher(); 

                document.getElementById('clickButton').disabled = false;
                document.getElementById('attackButton').disabled = false;

            } else {
                // USER IS LOGGED OUT
                
                if (unsubscribeGlobal) {
                    unsubscribeGlobal();
                    unsubscribeGlobal = null;
                }
                if (unsubscribePersonal) {
                    unsubscribePersonal();
                    unsubscribePersonal = null;
                }

                userId = null;
                document.getElementById('userIdDisplay').textContent = 'Signed Out';
                authStatus.textContent = 'Please sign in or sign up to play.';

                authUi.classList.remove('hidden');
                gameContent.classList.add('hidden');
                logoutDiv.classList.add('hidden');
                authDivider.classList.add('hidden');

                document.getElementById('clickButton').disabled = true;
                document.getElementById('attackButton').disabled = true;
                gameStatus.textContent = 'Please log in.';
            }
        });

    } catch (error) {
        gameStatus.textContent = `Error initializing Firebase: ${error.message}`;
        console.error("Firebase Init Error:", error);
    }
}
 
// --- Firestore Paths and Initialization ---
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
 
const getGlobalDocRef = () => doc(db, globalGameStatePath);
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

    // 2. Initialize Personal State (CRUCIAL for ensuring user score document exists)
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
    if (!db || !userId) return;

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Clicks Listener
    unsubscribeGlobal = onSnapshot(globalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const totalClicks = data.totalClicks || 0;
            updateGlobalScoreDisplay(totalClicks);
            gameStatus.textContent = 'Game is live!';
        } else {
            updateGlobalScoreDisplay(0);
            gameStatus.textContent = 'Waiting for global state initialization...';
        }
    }, (error) => {
        console.error("Error listening to global state:", error);
    });

    // Personal Clicks Listener
    unsubscribePersonal = onSnapshot(personalDocRef, (docSnap) => {
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

// --- LEADERBOARD LOGIC START (FIXED FETCHING) ---

// Uses getDocs and Promise.all to reliably fetch scores from nested documents.
async function setupLeaderboardFetcher() {
    if (!db) return;
    
    // Set loading status immediately
    const leaderboardDiv = document.getElementById('leaderboard');
    if (leaderboardDiv) {
        leaderboardDiv.innerHTML = '<p class="text-center text-gray-500" id="leaderboard-status">Fetching scores...</p>';
    }

    const userScoresCollectionPath = `artifacts/${appId}/users`;
    const usersRef = collection(db, userScoresCollectionPath);
    
    try {
        // 1. Get ALL user documents (parent IDs) - Requires the new 'allow list' security rule
        const querySnapshot = await getDocs(usersRef);
        
        console.log(`[Leaderboard] Found ${querySnapshot.docs.length} user documents.`); // Logging for verification
        
        const leaderboardDataPromises = [];
        
        // 2. For each user ID, asynchronously fetch the nested 'data' sub-document
        querySnapshot.forEach((userDoc) => {
            const userId = userDoc.id; 
            const dataDocRef = getPlayerDocRef(userId); 
            
            leaderboardDataPromises.push(getDoc(dataDocRef).then((dataSnap) => {
                if (dataSnap.exists()) {
                    const data = dataSnap.data();
                    const clicks = data.clicks || 0;
                    if (clicks > 0) {
                        console.log(`[Leaderboard] Found score for ${userId.substring(0,6)}: ${clicks}`); // Logging
                        return { userId, clicks };
                    }
                }
                return null;
            }).catch(error => {
                console.error("Error fetching leaderboard player data for", userId, ":", error);
                return null;
            }));
        });
        
        // 3. Wait for all individual score fetches to complete
        const results = await Promise.all(leaderboardDataPromises);
        const leaderboardData = results.filter(item => item !== null && item.clicks > 0);

        // 4. Sort client-side (DESCENDING) and display
        leaderboardData.sort((a, b) => b.clicks - a.clicks);
                    
        updateLeaderboardDisplay(leaderboardData.slice(0, 10)); 

    } catch (error) {
        console.error("[Leaderboard] Major Error Fetching User List:", error);
        if (leaderboardDiv) {
            leaderboardDiv.innerHTML = '<p class="text-center text-red-500">Error loading leaderboard. Check console and security rules (allow list).</p>';
        }
    }
}

function updateLeaderboardDisplay(data) {
    const leaderboardDiv = document.getElementById('leaderboard');
    if (!leaderboardDiv) {
        console.error("Leaderboard div not found. Cannot update display.");
        return; 
    }
    
    leaderboardDiv.innerHTML = ''; // Clear previous entries

    if (data.length === 0) {
        leaderboardDiv.innerHTML = '<p class="text-center text-gray-500">No scores yet! Be the first to click.</p>';
        return;
    }

    const list = document.createElement('ol');
    list.className = 'space-y-2'; 
    
    data.forEach((entry, index) => {
        const listItem = document.createElement('li');
        const rank = index + 1;
        
        // Tailwind classes for visual ranking
        let rankClass = 'text-gray-700 font-medium';
        if (rank === 1) rankClass = 'text-yellow-600 font-extrabold text-lg';
        else if (rank === 2) rankClass = 'text-gray-500 font-bold';
        else if (rank === 3) rankClass = 'text-yellow-800 font-bold';

        const isSelf = entry.userId === userId;
        const selfClass = isSelf ? 'bg-indigo-100 border-indigo-500 border-2 shadow-lg' : 'bg-white border border-gray-200';
        
        listItem.className = `flex justify-between items-center p-3 rounded-lg transition duration-150 ${selfClass}`;
        
        // Use the first 6 chars of the UserID as a name
        const playerName = entry.userId.substring(0, 6);
        const displayName = isSelf ? `You (${playerName})` : `Player ${playerName}`;

        listItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="${rankClass} w-6 text-center">${rank}.</span>
                <span class="font-medium text-gray-800">${displayName}</span>
            </div>
            <span class="text-xl font-mono text-indigo-600">${entry.clicks.toLocaleString()}</span>
        `;
        list.appendChild(listItem);
    });

    leaderboardDiv.appendChild(list);
}
// --- LEADERBOARD LOGIC END ---

function updateGlobalScoreDisplay(score) {
    document.getElementById('globalScore').textContent = score.toLocaleString();
}

function updatePersonalScoreDisplay(score) {
    document.getElementById('personalScore').textContent = score.toLocaleString();
}

// --- Authentication Handlers ---
function getCredentials() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    authError.textContent = ''; // Clear previous errors
    if (!email || password.length < 6) {
        displayAuthError('Email and a password of at least 6 characters are required.');
        return null;
    }
    return { email, password };
}

async function handleSignUp() {
    const creds = getCredentials();
    if (!creds) return;
    
    if (!auth) {
        displayAuthError('Firebase Authentication is not initialized.');
        return;
    }

    authStatus.textContent = 'Creating account...';

    try {
        await createUserWithEmailAndPassword(auth, creds.email, creds.password);
        // onAuthStateChanged handles success
    } catch (error) {
        console.error("Sign Up Error:", error.code, error.message);
        if (error.code === 'auth/email-already-in-use') {
            displayAuthError('This email is already registered. Try signing in.');
        } else if (error.code === 'auth/invalid-email') {
            displayAuthError('Invalid email address format.');
        } else {
            displayAuthError(`Sign Up failed: ${error.message}`);
        }
    }
}

async function handleSignIn() {
    const creds = getCredentials();
    if (!creds) return;
    
    if (!auth) {
        displayAuthError('Firebase Authentication is not initialized.');
        return;
    }

    authStatus.textContent = 'Signing in...';

    try {
        await signInWithEmailAndPassword(auth, creds.email, creds.password);
        // onAuthStateChanged handles success
    } catch (error) {
        console.error("Sign In Error:", error.code, error.message);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            displayAuthError('Invalid email or password.');
        } else {
            displayAuthError(`Sign In failed: ${error.message}`);
        }
    }
}

async function handleSignOut() {
    if (!auth) return;
    try {
        await signOut(auth);
        authStatus.textContent = 'You have been successfully signed out.';
    } catch (error) {
        console.error("Sign Out Error:", error);
        displayAuthError('Sign out failed.');
    }
}


// --- Game Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    
    // Auth Button Listeners
    document.getElementById('signUpButton').addEventListener('click', handleSignUp);
    document.getElementById('signInButton').addEventListener('click', handleSignIn);
    document.getElementById('signOutButton').addEventListener('click', handleSignOut);
    
    // Game Button Listeners (Existing)
    const clickButton = document.getElementById('clickButton');
    clickButton.addEventListener('click', handleUserClick);
    const attackButton = document.getElementById('attackButton');
    attackButton.addEventListener('click', handleUserAttack);
});

async function handleUserClick() {
    if (!userId || !db) {
        gameStatus.textContent = 'Initialization in progress or user not logged in.';
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
        gameStatus.textContent = 'Failed to update global score. Check console.';
    });

    // 2. Update Personal State
    await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
        clicks: localPersonalClicks,
        lastClicked: new Date().toISOString()
    })).catch(() => {
        gameStatus.textContent = 'Failed to save personal score. Check console.';
    });
    
    // 3. Refresh Leaderboard after a successful click
    await setupLeaderboardFetcher(); 
}
 
async function handleUserAttack() {
    if (!userId || !db) {
        gameStatus.textContent = 'Initialization in progress or user not logged in.';
        return;
    }
    
    const targetId = document.getElementById('targetUserId').value.trim();
    const attackPower = 5; 
    
    if (!targetId || targetId === userId) {
        displayAuthError("Please enter a valid Target Player ID (and not your own!).", 4000);
        return;
    }

    gameStatus.textContent = `Attacking ${targetId}...`;
    
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
                gameStatus.textContent = `${targetId} already has 0 clicks. Attack failed.`;
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

            gameStatus.textContent = `⚔️ Successful attack! Reduced ${targetId}'s score by ${clicksReduced} clicks.`;
        });
        
        // Refresh leaderboard after a successful attack
        await setupLeaderboardFetcher();

    } catch (e) {
        console.error("Attack transaction failed:", e);
        gameStatus.textContent = `Attack failed: ${e.message}`;
    }
}
