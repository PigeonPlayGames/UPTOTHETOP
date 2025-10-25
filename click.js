import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut, signInWithCustomToken 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, onSnapshot, updateDoc, increment, 
    setDoc, getDoc, collection, setLogLevel, runTransaction,
    query, orderBy, limit, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIG ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const firebaseConfig = {
    apiKey: "AIzaSyDAlw3jjFay1K_3p8AvqTvx3jeWo9Vgjbs",
    authDomain: "tiny-tribes-19ec8.firebaseapp.com",
    projectId: "tiny-tribes-19ec8",
    storageBucket: "tiny-tribes-19ec8.firebasestorage.app",
    messagingSenderId: "746060276139",
    appId: "1:746060276139:web:46f2b6cd2d7c678f1032ee",
    measurementId: "G-SFV5F5LG1V"
};

let db, auth;
let userId = null;
let localPersonalClicks = 0;
let unsubscribeGlobal = null;
let unsubscribePersonal = null;
setLogLevel('Debug');

// --- DOM ELEMENTS ---
const authUi = document.getElementById('authUi');
const gameContent = document.getElementById('gameContent');
const logoutDiv = document.getElementById('logoutDiv');
const authDivider = document.getElementById('authDivider');
const authStatus = document.getElementById('authStatus'); 
const authError = document.getElementById('authError'); 
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const gameStatus = document.getElementById('status');

// --- HELPERS ---
function displayAuthError(message, duration = 3000) {
    authError.textContent = message;
    setTimeout(() => { authError.textContent = ''; }, duration);
}

async function fetchWithExponentialBackoff(fetchFn, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try { return await fetchFn(); }
        catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- FIREBASE INIT ---
async function initFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            try {
                authStatus.textContent = "Authenticating secure session...";
                await signInWithCustomToken(auth, initialAuthToken);
            } catch (error) {
                console.warn("Custom token sign-in failed:", error);
                authStatus.textContent = "Secure session failed. Please sign in.";
            }
        } else {
            authStatus.textContent = 'Please sign in or sign up to play.';
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('userIdDisplay').textContent = userId;
                authStatus.textContent = `Welcome, ${user.email ? user.email.split('@')[0] : userId.substring(0,6)}!`;

                authUi.classList.add('hidden');
                gameContent.classList.remove('hidden');
                logoutDiv.classList.remove('hidden');
                authDivider.classList.remove('hidden');

                setupRealtimeListeners();
                await initializeUserAndGlobalState();
                await ensureLeaderboardEntry();   // ✅ Create leaderboard doc
                await setupLeaderboardFetcher();

                document.getElementById('clickButton').disabled = false;
                document.getElementById('attackButton').disabled = false;
            } else {
                cleanupOnLogout();
            }
        });
    } catch (error) {
        gameStatus.textContent = `Error initializing Firebase: ${error.message}`;
        console.error("Firebase Init Error:", error);
    }
}

// --- PATH HELPERS ---
const globalGameStatePath = `artifacts/${appId}/public/data/game_state/global_game_state`;
const getGlobalDocRef = () => doc(db, globalGameStatePath);
const getPlayerDocRef = (targetUserId) => doc(db, `artifacts/${appId}/users/${targetUserId}/user_scores/data`);
const getPersonalDocRef = () => getPlayerDocRef(userId);
const getLeaderboardDocRef = (targetUserId) => doc(db, `artifacts/${appId}/leaderboard/${targetUserId}`);

// --- INITIAL STATE ---
async function initializeUserAndGlobalState() {
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    await fetchWithExponentialBackoff(async () => {
        const globalSnap = await getDoc(globalDocRef);
        if (!globalSnap.exists()) {
            await setDoc(globalDocRef, { totalClicks: 0, lastUpdate: new Date().toISOString() });
        }
    });

    await fetchWithExponentialBackoff(async () => {
        const personalSnap = await getDoc(personalDocRef);
        if (!personalSnap.exists()) {
            await setDoc(personalDocRef, { clicks: 0, joinedAt: new Date().toISOString() });
        } else {
            localPersonalClicks = personalSnap.data().clicks || 0;
            updatePersonalScoreDisplay(localPersonalClicks);
        }
    });
}

// --- ENSURE LEADERBOARD ENTRY ---
async function ensureLeaderboardEntry() {
    const leaderboardRef = getLeaderboardDocRef(userId);
    const snap = await getDoc(leaderboardRef);
    if (!snap.exists()) {
        await setDoc(leaderboardRef, { clicks: 0, lastUpdate: new Date().toISOString() });
        console.log("[Leaderboard] Created new entry for", userId);
    }
}

// --- REALTIME LISTENERS ---
function setupRealtimeListeners() {
    if (!db || !userId) return;
    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();

    unsubscribeGlobal = onSnapshot(globalDocRef, (docSnap) => {
        updateGlobalScoreDisplay(docSnap.exists() ? docSnap.data().totalClicks || 0 : 0);
        gameStatus.textContent = 'Game is live!';
    });

    unsubscribePersonal = onSnapshot(personalDocRef, (docSnap) => {
        if (docSnap.exists()) {
            localPersonalClicks = docSnap.data().clicks || 0;
            updatePersonalScoreDisplay(localPersonalClicks);
        }
    });
}

// --- LEADERBOARD FETCH (Flat Collection) ---
async function setupLeaderboardFetcher() {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = `<p class="text-gray-500 text-center">Loading leaderboard...</p>`;

    try {
        const leaderboardRef = collection(db, `artifacts/${appId}/leaderboard`);
        const q = query(leaderboardRef, orderBy('clicks', 'desc'), limit(10));
        const snapshot = await getDocs(q);

        const leaderboardData = [];
        snapshot.forEach((docSnap) => {
            leaderboardData.push({ userId: docSnap.id, ...docSnap.data() });
        });

        updateLeaderboardDisplay(leaderboardData);
    } catch (err) {
        console.error("[Leaderboard] Error:", err);
        leaderboardDiv.innerHTML = `<p class="text-red-500 text-center">Failed to load leaderboard</p>`;
    }
}

// --- UI RENDERING ---
function updateLeaderboardDisplay(data) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';

    if (!data.length) {
        leaderboardDiv.innerHTML = '<p class="text-center text-gray-500">No scores yet. Be the first!</p>';
        return;
    }

    const list = document.createElement('ol');
    list.className = 'space-y-2';
    data.forEach((entry, i) => {
        const rank = i + 1;
        const isSelf = entry.userId === userId;
        const row = document.createElement('li');
        row.className = `flex justify-between p-3 rounded-lg border ${isSelf ? 'bg-yellow-100 border-yellow-400 font-bold' : 'bg-white border-gray-200'}`;
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <span>${rank}.</span>
                <span>${isSelf ? 'You' : entry.userId.substring(0,6)}</span>
            </div>
            <span class="font-mono">${entry.clicks}</span>`;
        list.appendChild(row);
    });
    leaderboardDiv.appendChild(list);
}

function updateGlobalScoreDisplay(score) {
    document.getElementById('globalScore').textContent = score.toLocaleString();
}
function updatePersonalScoreDisplay(score) {
    document.getElementById('personalScore').textContent = score.toLocaleString();
}

// --- AUTH HANDLERS ---
function cleanupOnLogout() {
    if (unsubscribeGlobal) unsubscribeGlobal();
    if (unsubscribePersonal) unsubscribePersonal();
    userId = null;
    document.getElementById('userIdDisplay').textContent = 'Signed Out';
    authUi.classList.remove('hidden');
    gameContent.classList.add('hidden');
    logoutDiv.classList.add('hidden');
    authDivider.classList.add('hidden');
    document.getElementById('clickButton').disabled = true;
    document.getElementById('attackButton').disabled = true;
    gameStatus.textContent = 'Please log in.';
}

function getCredentials() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || password.length < 6) {
        displayAuthError('Email and password (6+ chars) required.');
        return null;
    }
    return { email, password };
}

async function handleSignUp() {
    const creds = getCredentials();
    if (!creds) return;
    try {
        await createUserWithEmailAndPassword(auth, creds.email, creds.password);
    } catch (error) {
        displayAuthError(error.message);
    }
}
async function handleSignIn() {
    const creds = getCredentials();
    if (!creds) return;
    try {
        await signInWithEmailAndPassword(auth, creds.email, creds.password);
    } catch (error) {
        displayAuthError(error.message);
    }
}
async function handleSignOut() {
    try {
        await signOut(auth);
        authStatus.textContent = 'Signed out.';
    } catch (e) {
        displayAuthError('Sign out failed.');
    }
}

// --- GAME LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    document.getElementById('signUpButton').addEventListener('click', handleSignUp);
    document.getElementById('signInButton').addEventListener('click', handleSignIn);
    document.getElementById('signOutButton').addEventListener('click', handleSignOut);
    document.getElementById('clickButton').addEventListener('click', handleUserClick);
    document.getElementById('attackButton').addEventListener('click', handleUserAttack);
});

async function handleUserClick() {
    if (!userId || !db) return;
    const clickAmount = 1;
    localPersonalClicks += clickAmount;
    updatePersonalScoreDisplay(localPersonalClicks);

    const globalDocRef = getGlobalDocRef();
    const personalDocRef = getPersonalDocRef();
    const leaderboardRef = getLeaderboardDocRef(userId);

    await fetchWithExponentialBackoff(() => updateDoc(globalDocRef, {
        totalClicks: increment(clickAmount),
        lastUpdate: new Date().toISOString()
    }));

    await fetchWithExponentialBackoff(() => updateDoc(personalDocRef, {
        clicks: localPersonalClicks,
        lastClicked: new Date().toISOString()
    }));

    await fetchWithExponentialBackoff(() => setDoc(leaderboardRef, {
        clicks: localPersonalClicks,
        lastUpdate: new Date().toISOString()
    }, { merge: true }));

    await setupLeaderboardFetcher();
}

async function handleUserAttack() {
    if (!userId || !db) return;
    const targetId = document.getElementById('targetUserId').value.trim();
    const attackPower = 5;
    if (!targetId || targetId === userId) {
        displayAuthError("Invalid target ID.");
        return;
    }

    const targetDocRef = getPlayerDocRef(targetId);
    const leaderboardTargetRef = getLeaderboardDocRef(targetId);
    const globalDocRef = getGlobalDocRef();

    await runTransaction(db, async (tx) => {
        const targetSnap = await tx.get(targetDocRef);
        if (!targetSnap.exists()) throw new Error("Target not found.");

        const targetClicks = targetSnap.data().clicks || 0;
        const newClicks = Math.max(0, targetClicks - attackPower);
        const reduced = targetClicks - newClicks;

        tx.update(targetDocRef, { clicks: newClicks });
        tx.update(globalDocRef, { totalClicks: increment(-reduced) });
        tx.set(leaderboardTargetRef, { clicks: newClicks, lastUpdate: new Date().toISOString() }, { merge: true });
    });

    gameStatus.textContent = `⚔️ Attacked ${targetId.substring(0,6)} (-${attackPower})`;
    await setupLeaderboardFetcher();
}
