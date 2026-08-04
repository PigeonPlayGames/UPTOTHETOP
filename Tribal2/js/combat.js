// combat.js
// Resolves attack/support movements once they arrive, and renders the
// movements + reports list. Resolution happens client-side: whichever
// player's client next loads the game after `arrivesAt` passes will
// resolve it and write the outcome. That's fine for an MVP but is
// trust-the-client by nature - see README for hardening with a Cloud
// Function that resolves on a schedule instead.

function attackPower(troops) {
  return Object.entries(troops || {}).reduce((sum, [id, count]) => sum + count * UNITS[id].attack, 0);
}

function defensePower(troops, wallLevel) {
  const base = Object.entries(troops || {}).reduce((sum, [id, count]) => sum + count * UNITS[id].defense, 0);
  return base * (1 + (wallLevel || 0) * 0.05);
}

function carryCapacity(troops) {
  return Object.entries(troops || {}).reduce((sum, [id, count]) => sum + count * UNITS[id].carry, 0);
}

async function resolveMovement(movementId, movement) {
  const now = Date.now();
  if (movement.type === 'support') {
    // Support just reinforces the target village's garrison. (MVP simplification:
    // supporting troops merge into the defender's troop pool with no separate
    // ownership tracking, so they won't automatically walk home later.)
    const targetRef = db.ref(`villages/${movement.targetVillageId}`);
    const targetSnap = await targetRef.get();
    const target = targetSnap.val();
    if (target) {
      const newTroops = { ...(target.troops || {}) };
      Object.entries(movement.troops).forEach(([id, count]) => { newTroops[id] = (newTroops[id] || 0) + count; });
      await targetRef.update({ troops: newTroops });
    }
    await db.ref(`movements/${movementId}`).update({ resolved: true });
    return;
  }

  // Attack
  const targetRef = db.ref(`villages/${movement.targetVillageId}`);
  const targetSnap = await targetRef.get();
  const target = targetSnap.val();
  if (!target) {
    await db.ref(`movements/${movementId}`).update({ resolved: true });
    return;
  }
  const resolvedTarget = resolveVillage(target, now);

  const atk = attackPower(movement.troops);
  const def = defensePower(resolvedTarget.troops, resolvedTarget.buildings.wall || 0);

  let outcome, attackerSurvivors = {}, defenderSurvivors = {}, loot = { wood: 0, clay: 0, iron: 0 };

  if (atk > def) {
    outcome = 'attacker_win';
    const survivalRate = def / atk; // more defense = more attacker losses, but they still win
    Object.entries(movement.troops).forEach(([id, count]) => {
      attackerSurvivors[id] = Math.round(count * survivalRate);
    });
    defenderSurvivors = {}; // garrison wiped
    const capacity = carryCapacity(attackerSurvivors);
    const available = resolvedTarget.resources.wood + resolvedTarget.resources.clay + resolvedTarget.resources.iron;
    const totalLoot = Math.min(capacity, available);
    const share = totalLoot / 3;
    loot = {
      wood: Math.min(resolvedTarget.resources.wood, share),
      clay: Math.min(resolvedTarget.resources.clay, share),
      iron: Math.min(resolvedTarget.resources.iron, share),
    };
  } else {
    outcome = 'defender_win';
    attackerSurvivors = {}; // attack force wiped
    const lossRate = def > 0 ? Math.min(1, atk / def) : 0;
    Object.entries(resolvedTarget.troops).forEach(([id, count]) => {
      defenderSurvivors[id] = Math.round(count * (1 - lossRate));
    });
  }

  // Update defender village: remaining troops + resources minus loot.
  await targetRef.update({
    troops: defenderSurvivors,
    resources: {
      wood: resolvedTarget.resources.wood - loot.wood,
      clay: resolvedTarget.resources.clay - loot.clay,
      iron: resolvedTarget.resources.iron - loot.iron,
    },
    buildings: resolvedTarget.buildings,
    buildQueue: resolvedTarget.buildQueue,
    trainQueue: resolvedTarget.trainQueue,
    lastUpdated: now,
  });

  // Surviving attackers march home with loot; schedule their return.
  const survivorCount = Object.values(attackerSurvivors).reduce((a, b) => a + b, 0);
  if (survivorCount > 0) {
    const travelSeconds = Math.round((movement.arrivesAt - movement.startedAt) / 1000);
    await db.ref('movements').push().set({
      originVillageId: movement.targetVillageId,
      originOwnerId: movement.targetOwnerId,
      targetVillageId: movement.originVillageId,
      targetOwnerId: movement.originOwnerId,
      type: 'return',
      troops: attackerSurvivors,
      loot,
      startedAt: now,
      arrivesAt: now + travelSeconds * 1000,
      resolved: false,
    });
  }

  const reportId = db.ref('reports').push().key;
  const report = {
    outcome, type: 'attack',
    attackerOwnerId: movement.originOwnerId,
    defenderOwnerId: movement.targetOwnerId,
    originVillageId: movement.originVillageId,
    targetVillageId: movement.targetVillageId,
    troopsSent: movement.troops,
    attackerSurvivors, defenderSurvivors, loot,
    timestamp: now,
  };
  await db.ref(`reports/${movement.originOwnerId}/${reportId}`).set(report);
  await db.ref(`reports/${movement.targetOwnerId}/${reportId}`).set(report);

  await db.ref(`movements/${movementId}`).update({ resolved: true });
}

async function resolveReturn(movementId, movement) {
  const originRef = db.ref(`villages/${movement.targetVillageId}`);
  const snap = await originRef.get();
  const village = snap.val();
  if (village) {
    const newTroops = { ...(village.troops || {}) };
    Object.entries(movement.troops || {}).forEach(([id, count]) => { newTroops[id] = (newTroops[id] || 0) + count; });
    const loot = movement.loot || { wood: 0, clay: 0, iron: 0 };
    const cap = warehouseCapacity(village.buildings.warehouse || 0);
    await originRef.update({
      troops: newTroops,
      resources: {
        wood: Math.min(cap, (village.resources.wood || 0) + loot.wood),
        clay: Math.min(cap, (village.resources.clay || 0) + loot.clay),
        iron: Math.min(cap, (village.resources.iron || 0) + loot.iron),
      },
    });
  }
  await db.ref(`movements/${movementId}`).update({ resolved: true });
}

// Scans all movements for ones involving the current user that have
// arrived and are unresolved, and resolves them.
async function checkMovements(uid) {
  const snap = await db.ref('movements').orderByChild('resolved').equalTo(false).get();
  const all = snap.val() || {};
  const now = Date.now();

  for (const [id, movement] of Object.entries(all)) {
    if (movement.arrivesAt > now) continue;
    const involved = movement.originOwnerId === uid || movement.targetOwnerId === uid;
    if (!involved) continue;
    try {
      if (movement.type === 'return') {
        await resolveReturn(id, movement);
      } else {
        await resolveMovement(id, movement);
      }
    } catch (e) {
      console.error('Failed to resolve movement', id, e);
    }
  }
}

async function renderMovementsAndReports(uid) {
  await checkMovements(uid);

  const movSnap = await db.ref('movements').get();
  const all = movSnap.val() || {};
  const mine = Object.entries(all).filter(([, m]) => !m.resolved && (m.originOwnerId === uid || m.targetOwnerId === uid));

  const movBox = document.getElementById('movements-list');
  movBox.innerHTML = '';
  mine.forEach(([id, m]) => {
    const dir = m.originOwnerId === uid ? 'outgoing' : 'incoming';
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.textContent = `${dir === 'outgoing' ? 'Sent' : 'Incoming'} ${m.type} \u2192 (${m.targetX ?? '?'},${m.targetY ?? '?'}) - arrives in ${formatDuration(m.arrivesAt - Date.now())}`;
    movBox.appendChild(div);
  });
  if (mine.length === 0) movBox.innerHTML = '<div class="muted">No troops on the move.</div>';

  const repSnap = await db.ref(`reports/${uid}`).get();
  const reports = Object.entries(repSnap.val() || {}).sort((a, b) => b[1].timestamp - a[1].timestamp).slice(0, 20);
  const repBox = document.getElementById('reports-list');
  repBox.innerHTML = '';
  reports.forEach(([id, r]) => {
    const won = r.outcome === 'attacker_win';
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.textContent = `${won ? 'Victory' : 'Defeat'} for attacker \u2014 loot: ${Math.floor((r.loot.wood || 0) + (r.loot.clay || 0) + (r.loot.iron || 0))} resources \u2014 ${new Date(r.timestamp).toLocaleString()}`;
    repBox.appendChild(div);
  });
  if (reports.length === 0) repBox.innerHTML = '<div class="muted">No battle reports yet.</div>';
}
