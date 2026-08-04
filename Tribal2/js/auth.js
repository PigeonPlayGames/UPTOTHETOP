// auth.js
// Handles signup/login/logout and creates a starting village the first
// time a user registers. Runs on index.html (the login screen).

function randomEmptyCoord() {
  // Simple random placement. For a real game you'd want to query `map/`
  // for occupied tiles and retry on collision, or maintain a pre-seeded
  // list of free spawn tiles - left as a follow-up once you have traffic.
  return {
    x: Math.floor(Math.random() * MAP_SIZE),
    y: Math.floor(Math.random() * MAP_SIZE),
  };
}

async function createStartingVillage(uid, username) {
  const { x, y } = randomEmptyCoord();
  const villageRef = db.ref('villages').push();
  const villageId = villageRef.key;

  const village = {
    ownerId: uid,
    ownerName: username,
    name: `${username}'s Village`,
    x, y,
    resources: { wood: STARTING_RESOURCES.wood, clay: STARTING_RESOURCES.clay, iron: STARTING_RESOURCES.iron },
    lastUpdated: firebase.database.ServerValue.TIMESTAMP,
    buildings: STARTING_BUILDINGS,
    buildQueue: [],
    troops: {},
    trainQueue: [],
  };

  await villageRef.set(village);
  await db.ref(`map/${x}_${y}`).set({ villageId, ownerId: uid, name: village.name });
  await db.ref(`users/${uid}`).set({
    username,
    villageIds: { [villageId]: true },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });

  // Read back what we just wrote to make sure it actually landed (catches
  // silent rules/permission issues that a resolved promise can mask).
  const check = await db.ref(`villages/${villageId}/resources`).get();
  if (!check.exists()) {
    throw new Error('Village was not saved. Check your Realtime Database rules are published.');
  }

  return villageId;
}

let signupInProgress = false;

async function handleSignup(email, password, username) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await createStartingVillage(cred.user.uid, username);
  return cred.user;
}

async function handleLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

function handleLogout() {
  return auth.signOut();
}

// Wire up the login page forms if present.
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const errorBox = document.getElementById('auth-error');

  const showError = (err) => {
    if (errorBox) errorBox.textContent = err.message || String(err);
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await handleLogin(loginForm.email.value.trim(), loginForm.password.value);
        window.location.href = 'game.html';
      } catch (err) { showError(err); }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      signupInProgress = true;
      try {
        const username = signupForm.username.value.trim();
        if (username.length < 3) throw new Error('Username must be at least 3 characters.');
        await handleSignup(signupForm.email.value.trim(), signupForm.password.value, username);
        window.location.href = 'game.html';
      } catch (err) { showError(err); }
      finally { signupInProgress = false; }
    });
  }

  // If already logged in and sitting on the login page, jump straight to the game.
  // Skipped while a signup is actively writing the new village, so we never
  // navigate away mid-write (Firebase reports "logged in" the instant the
  // account is created, well before createStartingVillage finishes).
  auth.onAuthStateChanged((user) => {
    if (user && loginForm && !signupInProgress) window.location.href = 'game.html';
  });
});
