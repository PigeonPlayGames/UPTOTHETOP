// map.js
// Renders a grid around a chosen coordinate, showing which villages sit
// where, and lets the player send troops as an attack or as support.
// For a small/medium game, pulling the whole `map/` node once and
// filtering client-side (as done here) is fine; if your player base
// grows, switch to per-region nodes (e.g. map/{regionX}_{regionY}/...)
// so clients only ever fetch the area they're looking at.

let mapCenter = { x: 100, y: 100 };
let mapCache = {}; // "x_y" -> { villageId, ownerId, name }
let selectedTile = null;

async function loadMapCache() {
  const snap = await db.ref('map').get();
  mapCache = snap.val() || {};
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function travelTimeSeconds(originX, originY, targetX, targetY, troops) {
  const slowestSpeed = Math.max(...Object.keys(troops).map((id) => UNITS[id].speed));
  const dist = distance(originX, originY, targetX, targetY);
  return Math.round(dist * slowestSpeed * 4); // tuning constant; adjust to taste
}

async function renderMap(villageId) {
  await loadMapCache();
  const gridBox = document.getElementById('map-grid');
  gridBox.innerHTML = '';
  gridBox.style.gridTemplateColumns = `repeat(11, 32px)`;

  const half = 5;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = mapCenter.x + dx;
      const y = mapCenter.y + dy;
      const key = `${x}_${y}`;
      const tile = mapCache[key];

      const cell = document.createElement('div');
      cell.className = 'map-cell' + (tile ? (tile.villageId === villageId ? ' mine' : ' occupied') : '');
      cell.title = tile ? `${tile.name} (${x},${y})` : `${x},${y}`;
      cell.textContent = tile ? '\u2302' : '';
      cell.addEventListener('click', () => selectTile(x, y, tile));
      gridBox.appendChild(cell);
    }
  }

  document.getElementById('map-coords').textContent = `Viewing around (${mapCenter.x}, ${mapCenter.y})`;
}

function selectTile(x, y, tile) {
  selectedTile = { x, y, tile };
  const panel = document.getElementById('map-action-panel');
  if (!tile) {
    panel.innerHTML = `<div class="muted">Empty tile (${x}, ${y}) - nothing to do here.</div>`;
    return;
  }
  panel.innerHTML = `
    <div><strong>${tile.name}</strong> at (${x}, ${y})</div>
    <div class="troop-select" id="send-troop-select"></div>
    <div style="margin-top:8px">
      <button id="send-attack">Send Attack</button>
      <button id="send-support">Send Support</button>
    </div>
  `;
  renderTroopSelector(tile.villageId === currentVillageId);
  document.getElementById('send-attack').addEventListener('click', () => confirmSend('attack'));
  document.getElementById('send-support').addEventListener('click', () => confirmSend('support'));
}

function renderTroopSelector(isOwnVillage) {
  const box = document.getElementById('send-troop-select');
  box.innerHTML = '';
  if (isOwnVillage) {
    box.innerHTML = '<div class="muted">That\'s your own village.</div>';
    return;
  }
  UNIT_ORDER.forEach((id) => {
    const owned = (currentVillage?.troops || {})[id] || 0;
    if (owned <= 0) return;
    const row = document.createElement('div');
    row.innerHTML = `<label>${UNITS[id].name} (have ${owned}): <input type="number" min="0" max="${owned}" value="0" data-unit="${id}" style="width:60px"></label>`;
    box.appendChild(row);
  });
  if (!box.innerHTML) box.innerHTML = '<div class="muted">No troops available to send.</div>';
}

async function confirmSend(type) {
  if (!selectedTile || !selectedTile.tile) return;
  const inputs = document.querySelectorAll('#send-troop-select input[data-unit]');
  const troops = {};
  inputs.forEach((input) => {
    const val = parseInt(input.value, 10) || 0;
    if (val > 0) troops[input.dataset.unit] = val;
  });
  if (Object.keys(troops).length === 0) {
    alert('Select at least one troop.');
    return;
  }

  const village = await syncVillage(currentVillageId);
  for (const [id, count] of Object.entries(troops)) {
    if ((village.troops[id] || 0) < count) {
      alert(`Not enough ${UNITS[id].name}.`);
      return;
    }
  }

  const travelSeconds = travelTimeSeconds(village.x, village.y, selectedTile.x, selectedTile.y, troops);
  const now = Date.now();

  const remainingTroops = { ...village.troops };
  Object.entries(troops).forEach(([id, count]) => { remainingTroops[id] -= count; });

  await db.ref(`villages/${currentVillageId}`).update({ troops: remainingTroops });

  const moveRef = db.ref('movements').push();
  await moveRef.set({
    originVillageId: currentVillageId,
    originOwnerId: auth.currentUser.uid,
    originX: village.x,
    originY: village.y,
    targetVillageId: selectedTile.tile.villageId,
    targetOwnerId: selectedTile.tile.ownerId,
    targetX: selectedTile.x,
    targetY: selectedTile.y,
    type,
    troops,
    startedAt: now,
    arrivesAt: now + travelSeconds * 1000,
    resolved: false,
  });

  alert(`${type === 'attack' ? 'Attack' : 'Support'} sent, arriving in ${formatDuration(travelSeconds * 1000)}.`);
  renderMap(currentVillageId);
  document.getElementById('map-action-panel').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const recenter = document.getElementById('map-recenter');
  if (recenter) {
    recenter.addEventListener('click', () => {
      if (currentVillage) {
        mapCenter = { x: currentVillage.x, y: currentVillage.y };
        renderMap(currentVillageId);
      }
    });
  }
  ['map-up', 'map-down', 'map-left', 'map-right'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (id === 'map-up') mapCenter.y -= 5;
      if (id === 'map-down') mapCenter.y += 5;
      if (id === 'map-left') mapCenter.x -= 5;
      if (id === 'map-right') mapCenter.x += 5;
      renderMap(currentVillageId);
    });
  });
});
