// troops.js
// Troop training UI. Relies on syncVillage()/resolveVillage() from
// village.js for the actual production/queue math.

async function queueTraining(villageId, unitId, count) {
  if (!count || count < 1) return;
  const village = await syncVillage(villageId);
  if (!village) return;

  const barracksLevel = village.buildings.barracks || 0;
  if (barracksLevel < (UNIT_REQUIRES[unitId] || 1)) {
    alert(`Requires Barracks level ${UNIT_REQUIRES[unitId]}.`);
    return;
  }

  const cost = unitCost(unitId, count);
  const popUsed = buildingsPopUsage(village.buildings) + troopsPopUsage(village.troops);
  const popMax = farmCapacity(village.buildings.farm || 0);
  const popNeeded = (UNITS[unitId].pop || 1) * count;

  if (village.resources.wood < cost.wood || village.resources.clay < cost.clay || village.resources.iron < cost.iron) {
    alert('Not enough resources.');
    return;
  }
  if (popUsed + popNeeded > popMax) {
    alert('Not enough population capacity. Upgrade your Farm.');
    return;
  }

  const time = unitTrainTime(unitId, count, barracksLevel);
  const now = Date.now();
  const queue = village.trainQueue || [];
  const startAfter = queue.length ? queue[queue.length - 1].finishesAt : now;
  const item = { unit: unitId, count, startedAt: startAfter, finishesAt: startAfter + time * 1000 };

  await db.ref(`villages/${villageId}`).update({
    resources: {
      wood: village.resources.wood - cost.wood,
      clay: village.resources.clay - cost.clay,
      iron: village.resources.iron - cost.iron,
    },
    trainQueue: [...queue, item],
  });

  renderTroops(villageId);
}

async function renderTroops(villageId) {
  const village = await syncVillage(villageId);
  if (!village) return;

  const barracksLevel = village.buildings.barracks || 0;
  const box = document.getElementById('troops-list');
  box.innerHTML = '';

  if (barracksLevel < 1) {
    box.innerHTML = '<div class="muted">Build a Barracks to train troops.</div>';
  }

  UNIT_ORDER.forEach((id) => {
    const def = UNITS[id];
    const locked = barracksLevel < (UNIT_REQUIRES[id] || 1);
    const owned = (village.troops || {})[id] || 0;

    const row = document.createElement('div');
    row.className = 'building-row';
    row.innerHTML = `
      <div class="building-info">
        <strong>${def.name}</strong> <span class="level">Owned: ${owned}</span>
        <div class="muted">Atk ${def.attack} / Def ${def.defense} / Speed ${def.speed} / Carries ${def.carry}</div>
        <div class="muted">${def.cost.wood}w / ${def.cost.clay}c / ${def.cost.iron}i, ${def.pop} pop each</div>
      </div>
      <input type="number" min="1" value="1" style="width:60px" class="train-count" ${locked ? 'disabled' : ''}>
      <button ${locked ? 'disabled' : ''} data-unit="${id}">${locked ? `Needs Barracks ${UNIT_REQUIRES[id]}` : 'Train'}</button>
    `;
    const input = row.querySelector('.train-count');
    row.querySelector('button').addEventListener('click', () => {
      queueTraining(villageId, id, parseInt(input.value, 10));
    });
    box.appendChild(row);
  });

  const queueBox = document.getElementById('train-queue');
  queueBox.innerHTML = '';
  (village.trainQueue || []).forEach((item) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.textContent = `${item.count}x ${UNITS[item.unit].name} (${formatDuration(item.finishesAt - Date.now())} left)`;
    queueBox.appendChild(div);
  });
  if (!village.trainQueue || village.trainQueue.length === 0) {
    queueBox.innerHTML = '<div class="muted">No troops in training</div>';
  }
}
