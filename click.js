// click.js
// Full medieval rewrite with gold, troops, kingdom names, leaderboard, and public kingdom browser.

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
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- MANDATORY CANVAS CONFIGURATION ---
// These variables are provided by the hosting environment.
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken =
    typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;

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

// --------------------------------------------------
// GLOBAL STATE
// --------------------------------------------------

let db, auth;
let userId = null;

// Local cached stats for the logged-in player
let localPersonalClicks = 0;
let localGold = 0;
let localTroopsTotal = 0;

// Listener unsubscribe functions
let unsubscribeGlobal = null;
let unsubscribePersonal = null;
let unsubscribeKingdoms = null;

setLogLevel("Debug");

// --------------------------------------------------
// DOM REFERENCES
// --------------------------------------------------

const authUi = document.getElementById("authUi");
const gameContent = document.getElementById("gameContent");
const logoutDiv = document.getElementById("logoutDiv");
const authDivider = document.getElementById("authDivider");
const authStatus = document.getElementById("authStatus");
const authError = document.getElementById("authError");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const gameStatus = document.getElementById("status");

const goldDisplay = document.getElementById("goldDisplay");
const troopsDisplay = document.getElementById("troopsDisplay");

const kingdomNameInput = document.getElementById("kingdomNameInput");
const kingdomList = document.getElementById("kingdomList");

// --------------------------------------------------
// UTILITIES
// --------------------------------------------------

function displayAuthError(message, duration = 3000) {
    authError.textContent = message;
    setTimeout(() => {
        authError.textContent = "";
    }, duration);
}

async function fetchWithExponentialBackoff(fetchFn, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetchFn();
        } catch (error) {
            if (i === maxRetries - 1) {
                console.error(
                    "Max retries reached. Failed to execute Firestore operation.",
                    error
                );
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

function getSafeKingdomNameFromInput() {
    const raw = kingdomNameInput ? kingdomNameInput.value.trim() : "";
    if (!raw) return "Unnamed Kingdom";
    if (raw.length > 50) return raw.slice(0, 50);
    return raw;
}

// --------------------------------------------------
// FIRESTORE PATH HELPERS
// --------------------------------------------------

const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;

const getGlobalDocRef = () => doc(db, globalGameStatePath);

// Personal score/doc (full kingdom state)
const getPlayerDocRef = (targetUserId) =>
    doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`);

const getPersonalDocRef = () => getPlayerDocRef(userId);

// Leaderboard entry for public kingdom browser
const getLeaderboardDocRef = (targetUserId) =>
    doc(db, `artifacts/${appId}/leaderboard/${targetUserId}`);

// --------------------------------------------------
// FIREBASE INIT & AUTH
// --------------------------------------------------

async function initFirebase() {
    try {
        if (!firebaseConfig.projectId) {
            authStatus.textContent =
                "Firebase configuration is missing or invalid. Cannot initialize.";
            return;
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Use custom token if provided (Canvas environment)
        if (initialAuthToken) {
            try {
                authStatus.textContent = "Authenticating secure session...";
                await signInWithCustomToken(auth, initialAuthToken);
            } catch (error) {
                console.warn(
                    "Custom token sign-in failed, proceeding to manual authentication.",
                    error
                );
                authStatus.textContent =
                    "Secure session failed. Please sign in or sign up below.";
            }
        } else {
            authStatus.textContent = "Please sign in or sign up to play.";
        }

        // Main auth state listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // ------------------------
                // USER LOGGED IN
                // ------------------------
                userId = user.uid;
                document.getElementById("userIdDisplay").textContent = userId;
                authStatus.textContent = `Welcome, ${
                    user.email ? user.email.split("@")[0] : "Traveler"
                }! Your kingdom awaits.`;

                authUi.classList.add("hidden");
                gameContent.classList.remove("hidden");
                logoutDiv.classList.remove("hidden");
                authDivider.classList.remove("hidden");

                console.log("Firebase Auth Ready. User ID:", userId);

                setupRealtimeListeners();
                await initializeUserAndGlobalState();

                document.getElementById("clickButton").disabled = false;
                document.getElementById("attackButton").disabled = false;

                setupKingdomsListListener();
            } else {
                // ------------------------
                // USER LOGGED OUT
                // ------------------------

                // Unsubscribe from all listeners
                if (unsubscribeGlobal) {
                    unsubscribeGlobal();
                    unsubscribeGlobal = null;
                }
                if (unsubscribePersonal) {
                    unsubscribePersonal();
                    unsubscribePersonal = null;
                }
                if (unsubscribeKingdoms) {
                    unsubscribeKingdoms();
                    unsubscribeKingdoms = null;
                }

                userId = null;
                localPersonalClicks = 0;
                localGold = 0;
                localTroopsTotal = 0;

                document.getElementById("userIdDisplay").textContent =
                    "Signed Out";
                authStatus.textContent =
                    "Please sign in or sign up to build your kingdom.";

                authUi.classList.remove("hidden");
                gameContent.classList.add("hidden");
                logoutDiv.classList.add("hidden");
                authDivider.classList.add("hidden");

                document.getElementById("clickButton").disabled = true;
                document.getElementById("attackButton").disabled = true;
                gameStatus.textContent = "Please log in.";

                // Reset UI numbers
                updateGlobalScoreDisplay(0);
                updatePersonalScoreDisplay(0);
                updateKingdomStats({ gold: 0, troops: { peasants: 0 } });
                if (kingdomList) kingdomList.innerHTML = "";
                if (kingdomNameInput) kingdomNameInput.value = "";
            }
        });
    } catch (error) {
        gameStatus.textContent = `Error initializing Firebase: ${error.message}`;
        console.error("Firebase Init Error:", error);
    }
}

// --------------------------------------------------
// INITIALIZATION OF GLOBAL + USER STATE
// --------------------------------------------------

async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // 1. Ensure global game state doc exists
    await fetchWithExponentialBackoff(async () => {
        const globalSnap = await getDoc(globalDocRef);
        if (!globalSnap.exists()) {
            console.log("Initializing global game state (first time)...");
            await setDoc(globalDocRef, {
                totalClicks: 0,
                totalGold: 0,
                lastUpdate: new Date().toISOString()
            });
        }
    });

    // 2. Ensure personal kingdom state exists
    await fetchWithExponentialBackoff(async () => {
        const personalSnap = await getDoc(personalDocRef);
        if (!personalSnap.exists()) {
            console.log("Initializing personal kingdom state...");
            const defaultKingdomName = "Unnamed Kingdom";
            await setDoc(personalDocRef, {
                clicks: 0,
                gold: 0,
                troops: {
                    peasants: 0,
                    archers: 0,
                    knights: 0
                },
                kingdomName: defaultKingdomName,
                joinedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });

            localPersonalClicks = 0;
            localGold = 0;
            localTroopsTotal = 0;
            updatePersonalScoreDisplay(0);
            updateKingdomStats({
                gold: 0,
                troops: { peasants: 0, archers: 0, knights: 0 },
                kingdomName: defaultKingdomName
            });
            if (kingdomNameInput) kingdomNameInput.value = defaultKingdomName;
        } else {
            const data = personalSnap.data();
            localPersonalClicks = data.clicks || 0;
            localGold = data.gold || 0;

            const troops = data.troops || {};
            localTroopsTotal =
                (troops.peasants || 0) +
                (troops.archers || 0) +
                (troops.knights || 0);

            updatePersonalScoreDisplay(localPersonalClicks);
            updateKingdomStats(data);

            if (kingdomNameInput) {
                kingdomNameInput.value =
                    data.kingdomName || "Unnamed Kingdom";
            }
        }
    });

    // 3. Make sure leaderboard entry exists / is synced at least once
    await updateLeaderboardFromLocal();
}

// --------------------------------------------------
// REAL-TIME LISTENERS
// --------------------------------------------------

function setupRealtimeListeners() {
    if (!db || !userId) return;

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // Global stats listener
    if (unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = null;
    }
    unsubscribeGlobal = onSnapshot(
        globalDocRef,
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const totalClicks = data.totalClicks || 0;
                updateGlobalScoreDisplay(totalClicks);
                gameStatus.textContent = "The realm is alive!";
            } else {
                updateGlobalScoreDisplay(0);
                gameStatus.textContent =
                    "Waiting for global realm initialization...";
            }
        },
        (error) => {
            console.error("Error listening to global state:", error);
        }
    );

    // Personal stats listener
    if (unsubscribePersonal) {
        unsubscribePersonal();
        unsubscribePersonal = null;
    }
    unsubscribePersonal = onSnapshot(
        personalDocRef,
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                localPersonalClicks = data.clicks || 0;
                localGold = data.gold || 0;

                const troops = data.troops || {};
                localTroopsTotal =
                    (troops.peasants || 0) +
                    (troops.archers || 0) +
                    (troops.knights || 0);

                updatePersonalScoreDisplay(localPersonalClicks);
                updateKingdomStats(data);
            }
        },
        (error) => {
            console.error("Error listening to personal state:", error);
        }
    );
}

// Public kingdoms/leaderboard listener
function setupKingdomsListListener() {
    if (!db) return;

    if (unsubscribeKingdoms) {
        unsubscribeKingdoms();
        unsubscribeKingdoms = null;
    }

    const leaderboardCollection = collection(
        db,
        `artifacts/${appId}/leaderboard`
    );
    const q = query(
        leaderboardCollection,
        orderBy("gold", "desc"),
        limit(20)
    );

    unsubscribeKingdoms = onSnapshot(
        q,
        (snapshot) => {
            if (!kingdomList) return;
            kingdomList.innerHTML = "";

            if (snapshot.empty) {
                const li = document.createElement("li");
                li.className = "text-xs text-gray-500 text-center";
                li.textContent =
                    "No kingdoms have risen yet. Be the first to enter the chronicles!";
                kingdomList.appendChild(li);
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const li = document.createElement("li");
                const isYou = docSnap.id === userId;

                li.innerHTML = `
                    <div class="border rounded-lg p-2 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white/60">
                        <div class="font-semibold text-gray-800">
                            ${data.kingdomName || "Unknown Kingdom"}
                            ${
                                isYou
                                    ? '<span class="text-xs text-emerald-600 ml-1">(You)</span>'
                                    : ""
                            }
                        </div>
                        <div class="text-xs text-gray-600 mt-1 sm:mt-0">
                            💰 ${data.gold || 0} gold &nbsp;|&nbsp; ⚔️ ${
                    data.totalTroops || 0
                } troops
                        </div>
                    </div>
                `;
                kingdomList.appendChild(li);
            });
        },
        (error) => {
            console.error("Error listening to leaderboard:", error);
        }
    );
}

// --------------------------------------------------
// UI UPDATE HELPERS
// --------------------------------------------------

function updateGlobalScoreDisplay(score) {
    document.getElementById("globalScore").textContent =
        score.toLocaleString();
}

function updatePersonalScoreDisplay(score) {
    document.getElementById("personalScore").textContent =
        score.toLocaleString();
}

function updateKingdomStats(data) {
    const gold = data.gold || 0;
    const troops = data.troops || {};

    const peasants = troops.peasants || 0;
    const archers = troops.archers || 0;
    const knights = troops.knights || 0;
    const totalTroops = peasants + archers + knights;

    if (goldDisplay) goldDisplay.textContent = gold.toLocaleString();
    if (troopsDisplay)
        troopsDisplay.textContent = totalTroops.toLocaleString();
}

// --------------------------------------------------
// AUTH HANDLERS
// --------------------------------------------------

function getCredentials() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    authError.textContent = "";
    if (!email || password.length < 6) {
        displayAuthError(
            "Email and a password of at least 6 characters are required."
        );
        return null;
    }
    return { email, password };
}

async function handleSignUp() {
    const creds = getCredentials();
    if (!creds) return;

    if (!auth) {
        displayAuthError("Firebase Authentication is not initialized.");
        return;
    }

    authStatus.textContent = "Creating your new kingdom...";

    try {
        await createUserWithEmailAndPassword(auth, creds.email, creds.password);
        // onAuthStateChanged handles success
    } catch (error) {
        console.error("Sign Up Error:", error.code, error.message);
        if (error.code === "auth/email-already-in-use") {
            displayAuthError("This email is already registered. Try signing in.");
        } else if (error.code === "auth/invalid-email") {
            displayAuthError("Invalid email address format.");
        } else {
            displayAuthError(`Sign Up failed: ${error.message}`);
        }
    }
}

async function handleSignIn() {
    const creds = getCredentials();
    if (!creds) return;

    if (!auth) {
        displayAuthError("Firebase Authentication is not initialized.");
        return;
    }

    authStatus.textContent = "Summoning your kingdom...";

    try {
        await signInWithEmailAndPassword(auth, creds.email, creds.password);
        // onAuthStateChanged handles success
    } catch (error) {
        console.error("Sign In Error:", error.code, error.message);
        if (
            error.code === "auth/wrong-password" ||
            error.code === "auth/user-not-found" ||
            error.code === "auth/invalid-credential"
        ) {
            displayAuthError("Invalid email or password.");
        } else {
            displayAuthError(`Sign In failed: ${error.message}`);
        }
    }
}

async function handleSignOut() {
    if (!auth) return;
    try {
        await signOut(auth);
        authStatus.textContent = "You have left the realm.";
    } catch (error) {
        console.error("Sign Out Error:", error);
        displayAuthError("Sign out failed.");
    }
}

// --------------------------------------------------
// LEADERBOARD SYNC
// --------------------------------------------------

async function updateLeaderboardFromLocal(extraFields = {}) {
    if (!db || !userId) return;

    const leaderboardRef = getLeaderboardDocRef(userId);

    const payload = {
        userId,
        kingdomName: getSafeKingdomNameFromInput(),
        gold: localGold || 0,
        clicks: localPersonalClicks || 0,
        totalTroops: localTroopsTotal || 0,
        lastUpdated: new Date().toISOString(),
        ...extraFields
    };

    await fetchWithExponentialBackoff(() =>
        setDoc(leaderboardRef, payload, { merge: true })
    );
}

// --------------------------------------------------
// GAME LOGIC
// --------------------------------------------------

async function handleUserClick() {
    if (!userId || !db) {
        gameStatus.textContent =
            "Initialization in progress or user not logged in.";
        return;
    }

    const clickAmount = 1;
    const goldGain = 1;

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    // Optimistic update
    localPersonalClicks += clickAmount;
    localGold += goldGain;

    const peasants = Math.floor(localGold / 25); // 1 peasant per 25 gold
    localTroopsTotal = peasants; // for now, only peasants auto-gain

    updatePersonalScoreDisplay(localPersonalClicks);
    updateKingdomStats({
        gold: localGold,
        troops: { peasants, archers: 0, knights: 0 }
    });

    gameStatus.textContent = "Your workers are gathering resources...";

    // 1) Update global stats
    try {
        await fetchWithExponentialBackoff(() =>
            updateDoc(globalDocRef, {
                totalClicks: increment(clickAmount),
                totalGold: increment(goldGain),
                lastUpdate: new Date().toISOString()
            })
        );
    } catch (err) {
        // Revert optimistic changes on failure
        localPersonalClicks -= clickAmount;
        localGold -= goldGain;
        const newPeasants = Math.floor(localGold / 25);
        localTroopsTotal = newPeasants;

        updatePersonalScoreDisplay(localPersonalClicks);
        updateKingdomStats({
            gold: localGold,
            troops: { peasants: newPeasants, archers: 0, knights: 0 }
        });

        gameStatus.textContent =
            "Failed to update global realm stats. Check console.";
        console.error("Global update error:", err);
        return;
    }

    // 2) Update personal kingdom state
    try {
        await fetchWithExponentialBackoff(() =>
            updateDoc(personalDocRef, {
                clicks: localPersonalClicks,
                gold: localGold,
                troops: {
                    peasants,
                    archers: 0,
                    knights: 0
                },
                lastClicked: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            })
        );
        gameStatus.textContent =
            "Your villagers return with gold for your treasury.";
    } catch (err) {
        gameStatus.textContent =
            "Failed to save your kingdom state. Check console.";
        console.error("Personal update error:", err);
    }

    // 3) Sync leaderboard
    try {
        await updateLeaderboardFromLocal();
    } catch (err) {
        console.error("Leaderboard sync error:", err);
    }
}

async function handleUserAttack() {
    if (!userId || !db) {
        gameStatus.textContent =
            "Initialization in progress or user not logged in.";
        return;
    }

    const targetId = document
        .getElementById("targetUserId")
        .value.trim();
    const attackPower = 5;

    if (!targetId || targetId === userId) {
        displayAuthError(
            "Please enter a valid Target Player ID (and not your own!).",
            4000
        );
        return;
    }

    gameStatus.textContent = `Launching a raid on ${targetId}...`;

    const targetDocRef = getPlayerDocRef(targetId);
    const globalDocRef = getGlobalDocRef();

    try {
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);
            const globalSnap = await transaction.get(globalDocRef);

            if (!targetSnap.exists()) {
                throw new Error(
                    "Target kingdom not found or document structure is incorrect."
                );
            }

            const targetData = targetSnap.data();
            const currentClicks = targetData.clicks || 0;
            const currentGold = targetData.gold || 0;

            const newClicks = Math.max(0, currentClicks - attackPower);
            const newGold = Math.max(0, currentGold - attackPower);

            const clicksReduced = currentClicks - newClicks;
            const goldStolen = currentGold - newGold;

            if (clicksReduced === 0 && goldStolen === 0) {
                gameStatus.textContent = `${targetId} has nothing left to raid.`;
                return;
            }

            const newPeasants = Math.floor(newGold / 25);

            // Update target kingdom
            transaction.update(targetDocRef, {
                clicks: newClicks,
                gold: newGold,
                troops: {
                    peasants: newPeasants,
                    archers: (targetData.troops?.archers || 0),
                    knights: (targetData.troops?.knights || 0)
                },
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            // Update global stats (remove what was lost)
            if (!globalSnap.exists()) {
                // Safety net: create if somehow missing
                transaction.set(globalDocRef, {
                    totalClicks: Math.max(0, -clicksReduced),
                    totalGold: Math.max(0, -goldStolen),
                    lastUpdate: new Date().toISOString()
                });
            } else {
                transaction.update(globalDocRef, {
                    totalClicks: increment(-clicksReduced),
                    totalGold: increment(-goldStolen),
                    lastUpdate: new Date().toISOString()
                });
            }

            gameStatus.textContent = `⚔️ Successful raid! You reduced ${targetId}'s deeds by ${clicksReduced} and looted ${goldStolen} gold.`;
        });
    } catch (e) {
        console.error("Attack transaction failed:", e);
        gameStatus.textContent = `Raid failed: ${e.message}`;
    }
}

// --------------------------------------------------
// KINGDOM NAME HANDLER
// --------------------------------------------------

async function handleSaveKingdomName() {
    if (!userId || !db) {
        gameStatus.textContent =
            "You must be logged in to name your kingdom.";
        return;
    }

    const newName = getSafeKingdomNameFromInput();
    const personalDocRef = getPersonalDocRef();

    try {
        await fetchWithExponentialBackoff(() =>
            updateDoc(personalDocRef, {
                kingdomName: newName,
                lastUpdated: new Date().toISOString()
            })
        );
        await updateLeaderboardFromLocal({ kingdomName: newName });
        gameStatus.textContent = `Your realm shall henceforth be known as "${newName}".`;
    } catch (err) {
        console.error("Failed to save kingdom name:", err);
        gameStatus.textContent =
            "Failed to save kingdom name. Check console.";
    }
}

// --------------------------------------------------
// DOMContentLoaded – BOOTSTRAP
// --------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    initFirebase();

    // Auth buttons
    document
        .getElementById("signUpButton")
        .addEventListener("click", handleSignUp);
    document
        .getElementById("signInButton")
        .addEventListener("click", handleSignIn);
    document
        .getElementById("signOutButton")
        .addEventListener("click", handleSignOut);

    // Game buttons
    const clickButton = document.getElementById("clickButton");
    clickButton.addEventListener("click", handleUserClick);

    const attackButton = document.getElementById("attackButton");
    attackButton.addEventListener("click", handleUserAttack);

    const saveKingdomNameButton = document.getElementById(
        "saveKingdomNameButton"
    );
    if (saveKingdomNameButton) {
        saveKingdomNameButton.addEventListener(
            "click",
            handleSaveKingdomName
        );
    }
});
