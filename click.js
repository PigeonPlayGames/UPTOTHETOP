import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
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
    getDocs, 
    query, 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- MANDATORY CANVAS CONFIGURATION ---
// These variables are provided by the hosting environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// TEMPORARY FIX: Hardcoding Firebase Config to resolve "missing or invalid" error
// The application was failing because __firebase_config was not being read properly.
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

// Global variables to store listener unsubscribe functions
let unsubscribeGlobal = null;
let unsubscribePersonal = null;
let unsubscribeLeaderboard = null; 

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
const leaderboardList = document.getElementById('leaderboardList'); 

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
        
        // Use custom token if provided (Canvas environment), otherwise rely on user interaction
        if (initialAuthToken) {
            try {
                authStatus.textContent = "Authenticating secure session...";
                await signInWithCustomToken(auth, initialAuthToken);
            } catch (error) {
                console.warn("Custom token sign-in failed, proceeding to manual authentication.", error);
                authStatus.textContent = "Secure session failed. Please sign in or sign up below.";
            }
        } else {
             // Fallback for environments without custom token
             authStatus.textContent = 'Please sign in or sign up to play.';
        }


        // The primary listener for authentication state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // USER IS LOGGED IN
                userId = user.uid;
                document.getElementById('userIdDisplay').textContent = userId;
                authStatus.textContent = `Welcome, Player ${user.email ? user.email.split('@')[0] : userId.substring(0, 6)}!`;

                // Show game, hide auth UI
                authUi.classList.add('hidden');
                gameContent.classList.remove('hidden');
                logoutDiv.classList.remove('hidden');
                authDivider.classList.remove('hidden');
                
                console.log("Firebase Auth Ready. User ID:", userId);
                setupRealtimeListeners(); // Attach listeners
                await initializeUserAndGlobalState();
                document.getElementById('clickButton').disabled = false;
                
            } else {
                // USER IS LOGGED OUT
                
                // CRITICAL FIX: Unsubscribe the listeners immediately upon logout
                if (unsubscribeGlobal) {
                    unsubscribeGlobal();
                    unsubscribeGlobal = null;
                    console.log("Unsubscribed from Global Listener.");
                }
                if (unsubscribePersonal) {
                    unsubscribePersonal();
                    unsubscribePersonal = null;
                    console.log("Unsubscribed from Personal Listener.");
                }
                // Removed unsubscribeLeaderboard since it's now a fetch function
                


                userId = null;
                document.getElementById('userIdDisplay').textContent = 'Signed Out';
                authStatus.textContent = 'Please sign in or sign up to play.';

                // Show auth UI, hide game
                authUi.classList.remove('hidden');
                gameContent.classList.add('hidden');
                logoutDiv.classList.add('hidden');
                authDivider.classList.add('hidden');

                // Disable buttons and reset status
                document.getElementById('clickButton').disabled = true;
                gameStatus.textContent = 'Please log in.';
                leaderboardList.innerHTML = `<p class="text-center text-gray-500 p-4">Sign in to see the leaderboard.</p>`; // Clear leaderboard
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

// Removed allUserScoresCollectionGroup - using the new collection path below
const allScoresCollectionPath = `artifacts/${appId}/leaderboard/scores/list`; // NEW: A public collection to store all scores for easy query


async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    const allScoresDocRef = doc(db, allScoresCollectionPath, userId); // Use user ID as the document ID

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
            // Ensure score document exists for the newly authenticated user
            // NOTE: We don't save email here, we update it right after sign up.
            await setDoc(personalDocRef, { clicks: 0, joinedAt: new Date().toISOString() });
            localPersonalClicks = 0;
        } else {
            const data = personalSnap.data();
            localPersonalClicks = data.clicks || 0;
            updatePersonalScoreDisplay(localPersonalClicks);
        }
    });
    
    // 3. Initialize/Update Public Score Index (For Leaderboard Querying)
    // We update this public score index whenever the user signs in to ensure it exists
    await fetchWithExponentialBackoff(async () => {
        const user = auth.currentUser;
        if (user && user.email) {
             await setDoc(allScoresDocRef, { 
                id: userId,
                clicks: localPersonalClicks,
                email: user.email, 
                lastUpdated: new Date().toISOString() 
             }, { merge: true });
        }
    });
    
    // Call the new leaderboard update here
    updateLeaderboard();
}

// --- Leaderboard Logic ---

// NEW: Handles the attack event from a leaderboard button
function handleLeaderboardAttack(event) {
    const targetId = event.currentTarget.dataset.targetId;
    if (targetId) {
        handleUserAttack(targetId);
    }
}

// NEW: Function to fetch, sort, and display the leaderboard
async function updateLeaderboard() {
    if (!db || !userId) {
        leaderboardList.innerHTML = `<p class="text-center text-gray-500 p-4">Sign in to see the leaderboard.</p>`;
        return;
    }

    const leaderboardCollectionRef = collection(db, allScoresCollectionPath);
    
    try {
        // Fetch all documents from the public scores collection
        const querySnapshot = await fetchWithExponentialBackoff(() => getDocs(leaderboardCollectionRef));
        
        let allScores = [];
        querySnapshot.forEach(doc => {
            allScores.push(doc.data());
        });

        // Sort client-side for the top 10
        allScores.sort((a, b) => b.clicks - a.clicks);
        renderLeaderboard(allScores.slice(0, 10));

    } catch (error) {
        console.error("Error fetching leaderboard scores:", error);
        leaderboardList.innerHTML = `<p class="text-center text-red-500 p-4">Error loading leaderboard.</p>`;
    }
}

// NEW: Function to render the top players
function renderLeaderboard(players) {
    leaderboardList.innerHTML = ''; // Clear the list
    players.forEach((player, index) => {
        // Player name: Use the first part of the email if available, otherwise use a shortened ID
        const displayName = player.email.includes('@') ? player.email.split('@')[0] : player.id.substring(0, 8);
        const isSelf = player.id === userId;
        
        const html = `
            <div class="flex justify-between items-center p-2 rounded-lg ${isSelf ? 'bg-yellow-100 font-bold' : 'bg-white hover:bg-gray-100 transition duration-100'}">
                <span class="w-1/12 text-center text-lg">${index + 1}.</span>
                <span class="w-5/12 truncate text-sm">
                    ${displayName} ${isSelf ? '(You)' : ''}
                </span>
                <span class="w-3/12 text-right font-mono text-base text-indigo-600">
                    ${player.clicks.toLocaleString()}
                </span>
                <span class="w-3/12 flex justify-center">
                    ${isSelf 
                        ? '<span class="text-xs text-gray-500">N/A</span>' 
                        : `<button class="attack-btn bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-1 px-3 rounded-full shadow-sm" data-target-id="${player.id}">Attack!</button>`
                    }
                </span>
            </div>
        `;
        leaderboardList.insertAdjacentHTML('beforeend', html);
    });

    // Attach click listeners to all new attack buttons
    document.querySelectorAll('.attack-btn').forEach(button => {
        button.addEventListener('click', handleLeaderboardAttack);
    });

    if (players.length === 0) {
        leaderboardList.innerHTML = `<p class="text-center text-gray-500 p-4">No players on the leaderboard yet. Be the first!</p>`;
    }
}


// --- Real-time Listeners and UI Updates ---
function setupRealtimeListeners() {
    if (!db || !userId) return;

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    
    // Global Clicks Listener - Store the unsubscribe function
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

    // Personal Clicks Listener - Store the unsubscribe function
    unsubscribePersonal = onSnapshot(personalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const clicks = data.clicks || 0;
            localPersonalClicks = clicks; 
            updatePersonalScoreDisplay(clicks);
            
            // NEW: Trigger leaderboard update when personal score changes
            updateLeaderboard(); 
        }
    }, (error) => {
        console.error("Error listening to personal state:", error);
    });
    
    // The leaderboard listener is now handled by updateLeaderboard()
}

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
        const userCredential = await createUserWithEmailAndPassword(auth, creds.email, creds.password);
        const userUid = userCredential.user.uid;
        
        // 1. Update Personal Score Document with email
        const personalDocRef = getPlayerDocRef(userUid);
        await setDoc(personalDocRef, { email: creds.email }, { merge: true });
        
        // 2. Initialize Public Leaderboard Index Entry
        const allScoresDocRef = doc(db, allScoresCollectionPath, userUid);
        await setDoc(allScoresDocRef, { 
            id: userUid, 
            clicks: 0, 
            email: creds.email, 
            lastUpdated: new Date().toISOString() 
        }, { merge: true });

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
        // Initialization logic in onAuthStateChanged will update the public index
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
    const allScoresDocRef = doc(db, allScoresCollectionPath, userId); // Public score document

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

    // 3. Update Public Score Index
    await fetchWithExponentialBackoff(() => updateDoc(allScoresDocRef, {
        clicks: localPersonalClicks,
        lastUpdated: new Date().toISOString()
    })).catch((error) => {
        console.error("Failed to update public score index:", error);
    });

    // Leaderboard update is triggered by the onSnapshot listener for personal score
}
 
// UPDATED: Now takes targetId directly
async function handleUserAttack(targetId) {
    if (!userId || !db) {
        gameStatus.textContent = 'Initialization in progress or user not logged in.';
        return;
    }
    
    const attackPower = 5; 
    
    if (!targetId || targetId === userId) {
        displayAuthError("You cannot attack yourself!", 4000);
        return;
    }

    gameStatus.textContent = `Attacking ${targetId.substring(0, 6)}...`;
    
    const targetDocRef = getPlayerDocRef(targetId);
    const globalDocRef = getGlobalDocRef();
    const targetPublicDocRef = doc(db, allScoresCollectionPath, targetId); // Target Public Score Document

    try {
        // Use a Firestore Transaction for Atomic Attack
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);
            const targetPublicSnap = await transaction.get(targetPublicDocRef);

            if (!targetSnap.exists() || !targetPublicSnap.exists()) {
                throw new Error("Target player not found or document structure is incorrect.");
            }

            const targetData = targetSnap.data();
            const currentClicks = targetData.clicks || 0;
            
            const newClicks = Math.max(0, currentClicks - attackPower);
            const clicksReduced = currentClicks - newClicks; 
            
            if (clicksReduced === 0) {
                gameStatus.textContent = `${targetId.substring(0, 6)} already has 0 clicks. Attack failed.`;
                return; 
            }
            
            // 1. Update the target's personal score (private collection)
            transaction.update(targetDocRef, {
                clicks: newClicks,
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });
            
            // 2. Update the target's public score (leaderboard index)
            transaction.update(targetPublicDocRef, {
                 clicks: newClicks,
                 lastUpdated: new Date().toISOString()
            });

            // 3. Update the global score
            transaction.update(globalDocRef, {
                totalClicks: increment(-clicksReduced),
                lastUpdate: new Date().toISOString()
            });

            gameStatus.textContent = `⚔️ Successful attack! Reduced ${targetId.substring(0, 6)}'s score by ${clicksReduced} clicks.`;
        });
        
        // Trigger a leaderboard refresh after the transaction completes
        updateLeaderboard();

    } catch (e) {
        console.error("Attack transaction failed:", e);
        gameStatus.textContent = `Attack failed: ${e.message}`;
    }
}
