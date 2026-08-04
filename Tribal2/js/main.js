// main.js
// Boots the game screen: guards the route behind auth, wires up tab
// switching, and starts the village ticker + movement checker.

let myVillageId = null;

let activeTab = 'village';
let mapRetries = 0;

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  if (tabName === 'troops') renderTroops(myVillageId);
  if (tabName === 'map') {
    if (!currentVillage) {
      mapRetries += 1;
      if (mapRetries > 10) {
        console.error('Village never finished loading; map cannot open.');
        return;
      }
      setTimeout(() => { if (activeTab === 'map') switchTab('map'); }, 200);
      return;
    }
    mapRetries = 0;
    mapCenter = { x: currentVillage.x, y: currentVillage.y };
    renderMap(myVillageId);
  }
  if (tabName === 'reports') renderMovementsAndReports(auth.currentUser.uid);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => handleLogout().then(() => window.location.href = 'index.html'));

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('current-username').textContent = user.email;

    const userSnap = await db.ref(`users/${user.uid}`).get();
    const userData = userSnap.val();
    if (!userData || !userData.villageIds) {
      document.querySelector('main').innerHTML = `
        <div class="panel">
          <h3>No village found</h3>
          <p>Your account is logged in correctly (UID: ${user.uid}), but there's no
          village data saved for it in the database yet.</p>
          <p>Raw data found at <code>users/${user.uid}</code>:</p>
          <pre style="white-space:pre-wrap;background:#faf8f2;padding:10px;border-radius:4px;">${JSON.stringify(userData, null, 2) || 'null (nothing there at all)'}</pre>
        </div>`;
      return;
    }
    myVillageId = Object.keys(userData.villageIds)[0];

    startVillageTicker(myVillageId);
    renderMovementsAndReports(user.uid);

    // Periodically check for movements that have arrived even while the
    // player is sitting on another tab.
    setInterval(() => checkMovements(user.uid), 10000);
  });
});
