// village.js
// Manages a single village: lazy resource production, the build queue,
// and the "Village" tab UI. Resource/queue math is "lazy evaluated" -
// we only compute what happened since `lastUpdated` when someone looks
// at the village (loads it, or a background sync runs). That avoids
// needing a server-side cron job for an MVP, at the cost of trusting the
// client's math - see README for how to harden this with Cloud Functions.

let currentVillageId = null;
let currentVillage = null;
let tickHandle = null;

function productionRates(buildings) {
  return {
    wood: productionPerHour(buildings.timber_camp || 0),
    clay: productionPerHour(buildings.clay_pit || 0),
    iron: productionPerHour(buildings.iron_mine || 0),
  };
}

// Given a village snapshot, returns { resources, buildQueue, buildings, changed }
// reflecting everything that should have happened by `now`.
function resolveVillage(village, now) {
  const elapsedHours = Math.max(0, (now - (village.lastUpdated || now)) / 3600000);
  const rates = productionRates(village.buildings);
  const cap = warehouseCapacity(village.buildings.warehouse || 0);

  const resources = {
    wood: Math.min(cap, (village.resources.wood || 0) + rates.wood * elapsedHours),
    clay: Math.min(cap, (village.resources.clay || 0) + rates.clay * elapsedHours),
    iron: Math.min(cap, (village.resources.iron || 0) + rates.iron * elapsedHours),
  };

  const buildings = { ...village.buildings };
  const remainingQueue = [];
  let changed = false;

  (village.buildQueue || []).forEach((item) => {
    if (item.finishesAt <= now) {
      buildings[item.building] = (buildings[item.building] || 0) + 1;
      changed = true;
    } else {
      remainingQueue.push(item);
    }
  });

  const troops = { ...(village.troops || {}) };
  const remainingTrainQueue = [];
  (village.trainQueue || []).forEach((item) => {
    if (item.finishesAt <= now) {
      troops[item.unit] = (troops[item.unit] || 0) + item.count;
      changed = true;
    } else {
      remainingTrainQueue.push(item);
    }
  });

  return { resources, buildings, buildQueue: remainingQueue, troops, trainQueue: remainingTrainQueue, changed };
}

async function syncVillage(villageId) {
  const snap = await db.ref(`villages/${villageId}`).get();
  const village = snap.val();
  if (!village) return null;

  const now = Date.now();
  const resolved = resolveVillage(village, now);

  await db.ref(`villages/${villageId}`).update({
    resources: resolved.resources,
    buildings: resolved.buildings,
    buildQueue: resolved.buildQueue,
    troops: resolved.troops,
    trainQueue: resolved.trainQueue,
    lastUpdated: now,
  });

  return { ...village, ...resolved, lastUpdated: now };
}

async function queueBuilding(villageId, buildingId) {
  const village = await syncVillage(villageId);
  if (!village) return;

  const currentLevel = village.buildings[buildingId] || 0;
  const targetLevel = currentLevel + 1;
  const cost = buildingCost(buildingId, targetLevel);
  const hqLevel = village.buildings.headquarters || 1;
  const time = buildingTime(buildingId, targetLevel, hqLevel);

  if (village.resources.wood < cost.wood || village.resources.clay < cost.clay || village.resources.iron < cost.iron) {
    alert('Not enough resources.');
    return;
  }
  if ((village.buildQueue || []).length >= 5) {
    alert('Build queue is full (max 5).');
    return;
  }

  const now = Date.now();
  const queue = village.buildQueue || [];
  const startAfter = queue.length ? queue[queue.length - 1].finishesAt : now;
  const item = { building: buildingId, targetLevel, startedAt: startAfter, finishesAt: startAfter + time * 1000 };

  await db.ref(`villages/${villageId}`).update({
    resources: {
      wood: village.resources.wood - cost.wood,
      clay: village.resources.clay - cost.clay,
      iron: village.resources.iron - cost.iron,
    },
    buildQueue: [...queue, item],
  });

  renderVillage(villageId);
}

function fmt(n) {
  return Math.floor(n).toLocaleString();
}

function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

async function renderVillage(villageId) {
  currentVillageId = villageId;
  const village = await syncVillage(villageId);
  if (!village) return;
  currentVillage = village;

  const rates = productionRates(village.buildings);
  const cap = warehouseCapacity(village.buildings.warehouse || 0);
  const popUsed = buildingsPopUsage(village.buildings) + troopsPopUsage(village.troops);
  const popMax = farmCapacity(village.buildings.farm || 0);

  document.getElementById('village-name').textContent = village.name;
  document.getElementById('res-wood').textContent = fmt(village.resources.wood);
  document.getElementById('res-clay').textContent = fmt(village.resources.clay);
  document.getElementById('res-iron').textContent = fmt(village.resources.iron);
  document.getElementById('res-cap').textContent = fmt(cap);
  document.getElementById('res-pop').textContent = `${fmt(popUsed)} / ${fmt(popMax)}`;
  document.getElementById('res-rates').textContent =
    `+${fmt(rates.wood)} wood/h, +${fmt(rates.clay)} clay/h, +${fmt(rates.iron)} iron/h`;

  const buildingsBox = document.getElementById('buildings-list');
  buildingsBox.innerHTML = '';
  BUILDING_ORDER.forEach((id) => {
    const def = BUILDINGS[id];
    const level = village.buildings[id] || 0;
    const cost = buildingCost(id, level + 1);
    const time = buildingTime(id, level + 1, village.buildings.headquarters || 1);
    const affordable = village.resources.wood >= cost.wood && village.resources.clay >= cost.clay && village.resources.iron >= cost.iron;

    const row = document.createElement('div');
    row.className = 'building-row';
    row.innerHTML = `
      <div class="building-info">
        <strong>${def.name}</strong> <span class="level">Lv ${level}</span>
        <div class="muted">${def.desc}</div>
      </div>
      <div class="building-cost">
        ${cost.wood}w / ${cost.clay}c / ${cost.iron}i &middot; ${formatDuration(time * 1000)}
      </div>
      <button ${affordable ? '' : 'disabled'} data-building="${id}">Upgrade</button>
    `;
    row.querySelector('button').addEventListener('click', () => queueBuilding(villageId, id));
    buildingsBox.appendChild(row);
  });

  const queueBox = document.getElementById('build-queue');
  queueBox.innerHTML = '';
  (village.buildQueue || []).forEach((item) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.textContent = `${BUILDINGS[item.building].name} \u2192 Lv ${item.targetLevel} (${formatDuration(item.finishesAt - Date.now())} left)`;
    queueBox.appendChild(div);
  });
  if (!village.buildQueue || village.buildQueue.length === 0) {
    queueBox.innerHTML = '<div class="muted">Queue empty</div>';
  }
}

function startVillageTicker(villageId) {
  if (tickHandle) clearInterval(tickHandle);
  renderVillage(villageId);
  // Cheap client-side countdown tick every second; full re-sync to DB every 15s
  // (or whenever the user takes an action) so multiple tabs/devices stay honest.
  let ticks = 0;
  tickHandle = setInterval(() => {
    ticks += 1;
    if (ticks % 15 === 0) {
      renderVillage(villageId);
    } else if (currentVillage) {
      // Lightweight display-only countdown without a full DB round trip.
      document.querySelectorAll('.queue-item').forEach((el, i) => {
        const item = currentVillage.buildQueue[i];
        if (item) el.textContent = `${BUILDINGS[item.building].name} \u2192 Lv ${item.targetLevel} (${formatDuration(item.finishesAt - Date.now())} left)`;
      });
    }
  }, 1000);
}
