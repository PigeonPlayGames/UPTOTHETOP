// click.js
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    collection,
    query,
    orderBy,
    limit,
    runTransaction,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// ---------------------------------------------------------------------
// 🔧 Firebase Configuration
// ---------------------------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyDAlw3jjFay1K_3p8AvqTvx3jeWo9Vgjbs",
    authDomain: "tiny-tribes-19ec8.firebaseapp.com",
    projectId: "tiny-tribes-19ec8",
    storageBucket: "tiny-tribes-19ec8.firebasestorage.app",
    messagingSenderId: "746060276139",
    appId: "1:746060276139:web:46f2b6cd2d7c678f1032ee",
    measurementId: "G-SFV5F5LG1V"
};

// ---------------------------------------------------------------------
// 🚀 Initialize Firebase
// ---------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userId = null;

// ---------------------------------------------------------------------
// 🧩 Firestore References
// ---------------------------------------------------------------------
function getGlobalDocRef() {
    return doc(db, "artifacts/default-app-id/public/data/game_state/global_game_state");
}

function getPlayerDocRef(uid) {
    return doc(db, "artifacts/default-app-id/leaderboard", uid);
}

// ---------------------------------------------------------------------
// 🧠 UI Elements
// ---------------------------------------------------------------------
const totalClicksEl = document.getElementById("totalClicks");
const personalScoreEl = document.getElementById("personalScore");
const gameStatus = document.getElementById("gameStatus");
const clickBtn = document.getElementById("clickBtn");
const attackBtn = document.getElementById("attackBtn");
const targetUserIdInput = document.getElementById("targetUserId");
const playerIdDisplay = document.getElementById("playerIdDisplay");

// ---------------------------------------------------------------------
// 🔑 Authentication
// ---------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        console.log("Authenticated as:", userId);
        playerIdDisplay.textContent = userId;

        // Ensure user exists in leaderboard
        const playerDocRef = getPlayerDocRef(userId);
        const snap = await getDoc(playerDocRef);
        if (!snap.exists()) {
            await setDoc(playerDocRef, {
                userId,
                clicks: 0,
                lastUpdate: new Date().toISOString()
            });
        }

        // Start realtime updates
        listenToGlobalClicks();
        listenToPersonalScore();
        setupLeaderboardFetcher();

        gameStatus.textContent = "Game is live!";
    } else {
        console.log("Signing in anonymously...");
        await signInAnonymously(auth);
    }
});

// ---------------------------------------------------------------------
// 🔄 Real-time Listeners
// ---------------------------------------------------------------------
function listenToGlobalClicks() {
    onSnapshot(getGlobalDocRef(), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            totalClicksEl.textContent = data.totalClicks || 0;
        }
    });
}

function listenToPersonalScore() {
    onSnapshot(getPlayerDocRef(userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            personalScoreEl.textContent = data.clicks || 0;
        }
    });
}

// ---------------------------------------------------------------------
// 🖱️ Click Button (+1 Click)
// ---------------------------------------------------------------------
clickBtn.addEventListener("click", async () => {
    if (!userId) return;

    const playerDocRef = getPlayerDocRef(userId);
    const globalDocRef = getGlobalDocRef();

    try {
        await runTransaction(db, async (transaction) => {
            const playerSnap = await transaction.get(playerDocRef);
            const playerData = playerSnap.data() || { clicks: 0 };
            const newClicks = (playerData.clicks || 0) + 1;

            transaction.update(playerDocRef, {
                clicks: newClicks,
                lastUpdate: new Date().toISOString()
            });

            transaction.update(globalDocRef, {
                totalClicks: increment(1),
                lastUpdate: new Date().toISOString()
            });
        });

        gameStatus.textContent = "✨ +1 Click!";
    } catch (e) {
        console.error("Error adding click:", e);
    }
});

// ---------------------------------------------------------------------
// ⚔️ Attack Another Player
// ---------------------------------------------------------------------
attackBtn.addEventListener("click", async () => {
    await handleUserAttack();
});

async function handleUserAttack(targetId = null) {
    if (!userId || !db) {
        gameStatus.textContent = 'Initialization in progress or user not logged in.';
        return;
    }

    targetId = targetId || document.getElementById('targetUserId').value.trim();
    const attackPower = 5;

    if (!targetId || targetId === userId) {
        gameStatus.textContent = "Please enter a valid Target Player ID (and not your own!).";
        return;
    }

    gameStatus.textContent = `Attacking ${targetId}...`;

    const targetDocRef = getPlayerDocRef(targetId);
    const globalDocRef = getGlobalDocRef();

    try {
        await runTransaction(db, async (transaction) => {
            const targetSnap = await transaction.get(targetDocRef);
            if (!targetSnap.exists()) {
                throw new Error("Target player not found.");
            }

            const targetData = targetSnap.data();
            const currentClicks = targetData.clicks || 0;
            const newClicks = Math.max(0, currentClicks - attackPower);
            const clicksReduced = currentClicks - newClicks;

            if (clicksReduced === 0) {
                gameStatus.textContent = `${targetId} already has 0 clicks. Attack failed.`;
                return;
            }

            transaction.update(targetDocRef, {
                clicks: newClicks,
                lastAttackedBy: userId,
                lastAttackedTime: new Date().toISOString()
            });

            transaction.update(globalDocRef, {
                totalClicks: increment(-clicksReduced),
                lastUpdate: new Date().toISOString()
            });

            gameStatus.textContent = `⚔️ Successful attack! Reduced ${targetId}'s score by ${clicksReduced} clicks.`;
        });

        await setupLeaderboardFetcher();

    } catch (e) {
        console.error("Attack transaction failed:", e);
        gameStatus.textContent = `Attack failed: ${e.message}`;
    }
}

// ---------------------------------------------------------------------
// 🏆 Leaderboard (Realtime)
// ---------------------------------------------------------------------
async function setupLeaderboardFetcher() {
    const leaderboardRef = collection(db, "artifacts/default-app-id/leaderboard");
    const leaderboardQuery = query(leaderboardRef, orderBy("clicks", "desc"), limit(10));

    onSnapshot(leaderboardQuery, (snapshot) => {
        const leaderboardData = snapshot.docs.map(doc => doc.data());
        updateLeaderboardDisplay(leaderboardData);
    });
}

// ---------------------------------------------------------------------
// 🧾 Render Leaderboard with Attack Buttons
// ---------------------------------------------------------------------
function updateLeaderboardDisplay(data) {
    const leaderboardDiv = document.getElementById('leaderboard');
    if (!leaderboardDiv) return;

    leaderboardDiv.innerHTML = '';

    if (data.length === 0) {
        leaderboardDiv.innerHTML = '<p class="text-center text-gray-500">No scores yet! Be the first to click.</p>';
        return;
    }

    const list = document.createElement('ol');
    list.className = 'space-y-3';

    data.forEach((entry, index) => {
        const rank = index + 1;
        const isSelf = entry.userId === userId;

        let rankClass = 'text-gray-700 font-medium';
        if (rank === 1) rankClass = 'text-yellow-600 font-extrabold text-lg';
        else if (rank === 2) rankClass = 'text-gray-500 font-bold';
        else if (rank === 3) rankClass = 'text-yellow-800 font-bold';

        const selfClass = isSelf ? 'bg-indigo-100 border-indigo-500 border-2 shadow-lg' : 'bg-white border border-gray-200';

        const listItem = document.createElement('li');
        listItem.className = `flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-3 rounded-lg ${selfClass}`;

        const shortId = entry.userId.substring(0, 6);
        const displayName = isSelf ? `You (${shortId})` : `Player ${shortId}`;
        const clicks = entry.clicks?.toLocaleString() ?? 0;

        const attackBtn = !isSelf
            ? `<button 
                  class="ml-3 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm attack-btn"
                  data-target="${entry.userId}">
                  ⚔️ Attack
               </button>`
            : '';

        listItem.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 w-full">
                <span class="${rankClass} w-8 text-center">${rank}.</span>
                <div class="flex flex-col">
                    <span class="font-medium text-gray-800">${displayName}</span>
                    <span class="text-xs text-gray-500 select-all">${entry.userId}</span>
                </div>
            </div>
            <div class="flex items-center space-x-2">
                <span class="text-xl font-mono text-indigo-600">${clicks}</span>
                ${attackBtn}
            </div>
        `;

        list.appendChild(listItem);
    });

    leaderboardDiv.appendChild(list);

    // 🎯 Add attack functionality to leaderboard buttons
    document.querySelectorAll('.attack-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            if (!targetId) return;
            document.getElementById('targetUserId').value = targetId; // Autofill
            await handleUserAttack(targetId);
        });
    });
}
