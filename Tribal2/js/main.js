// main.js
// Boots the game screen: guards the route behind auth, wires up tab
// switching, and starts the village ticker + movement checker.

let myVillageId = null;

function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  if (tabName === 'troops') renderTroops(myVillageId);
  if (tabName === 'map') {
    if (!currentVillage) { setTimeout(() => switchTab('map'), 200); return; }
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
      console.error('No village found for this user.');
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
