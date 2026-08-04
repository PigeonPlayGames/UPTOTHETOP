// game-data.js
// Central definitions for buildings, units, and the formulas that drive
// costs, build times, and production. Nothing in here talks to Firebase —
// it's pure game design data so it's easy to tune without touching logic.

const BUILDINGS = {
  headquarters: { name: 'Headquarters', baseCost: { wood: 90,  clay: 80,  iron: 70  }, baseTime: 60,  desc: 'Speeds up all construction.' },
  warehouse:    { name: 'Warehouse',    baseCost: { wood: 60,  clay: 50,  iron: 40  }, baseTime: 40,  desc: 'Increases resource storage capacity.' },
  farm:         { name: 'Farm',         baseCost: { wood: 45,  clay: 40,  iron: 30  }, baseTime: 40,  desc: 'Increases population capacity.' },
  timber_camp:  { name: 'Timber Camp',  baseCost: { wood: 50,  clay: 60,  iron: 40  }, baseTime: 35,  desc: 'Produces wood.' },
  clay_pit:     { name: 'Clay Pit',     baseCost: { wood: 65,  clay: 50,  iron: 40  }, baseTime: 35,  desc: 'Produces clay.' },
  iron_mine:    { name: 'Iron Mine',    baseCost: { wood: 75,  clay: 65,  iron: 70  }, baseTime: 35,  desc: 'Produces iron.' },
  barracks:     { name: 'Barracks',     baseCost: { wood: 200, clay: 170, iron: 90  }, baseTime: 90,  desc: 'Trains infantry troops.' },
  wall:         { name: 'Wall',         baseCost: { wood: 50,  clay: 100, iron: 20  }, baseTime: 50,  desc: 'Boosts village defense.' },
};

const BUILDING_ORDER = ['headquarters', 'warehouse', 'farm', 'timber_camp', 'clay_pit', 'iron_mine', 'barracks', 'wall'];

const UNITS = {
  spearman:  { name: 'Spearman',  cost: { wood: 50,  clay: 30,  iron: 10  }, pop: 1, trainTime: 40,  attack: 10,  defense: 15,  speed: 18, carry: 25  },
  swordsman: { name: 'Swordsman', cost: { wood: 30,  clay: 30,  iron: 70  }, pop: 1, trainTime: 55,  attack: 25,  defense: 30,  speed: 22, carry: 15  },
  archer:    { name: 'Archer',    cost: { wood: 40,  clay: 30,  iron: 40  }, pop: 1, trainTime: 50,  attack: 20,  defense: 15,  speed: 20, carry: 20  },
  scout:     { name: 'Scout',     cost: { wood: 50,  clay: 50,  iron: 20  }, pop: 1, trainTime: 45,  attack: 0,   defense: 2,   speed: 9,  carry: 0   },
  cavalry:   { name: 'Cavalry',   cost: { wood: 125, clay: 100, iron: 250 }, pop: 4, trainTime: 120, attack: 55,  defense: 25,  speed: 10, carry: 60  },
};

const UNIT_ORDER = ['spearman', 'swordsman', 'archer', 'scout', 'cavalry'];

// Requires a Barracks of at least this level to train the unit.
const UNIT_REQUIRES = {
  spearman: 1, swordsman: 1, archer: 3, scout: 1, cavalry: 5,
};

const STARTING_BUILDINGS = {
  headquarters: 1, warehouse: 1, farm: 1, timber_camp: 1, clay_pit: 1, iron_mine: 1, barracks: 0, wall: 0,
};

const STARTING_RESOURCES = { wood: 500, clay: 500, iron: 500 };

const MAP_SIZE = 200; // coordinates run 0..MAP_SIZE-1 on each axis

// Cost of a building scales geometrically with level (classic Tribal Wars curve).
function buildingCost(buildingId, targetLevel) {
  const base = BUILDINGS[buildingId].baseCost;
  const factor = Math.pow(1.26, targetLevel - 1);
  return {
    wood: Math.round(base.wood * factor),
    clay: Math.round(base.clay * factor),
    iron: Math.round(base.iron * factor),
  };
}

function buildingTime(buildingId, targetLevel, hqLevel) {
  const base = BUILDINGS[buildingId].baseTime;
  const growth = Math.pow(1.2, targetLevel - 1);
  const speedup = 1 + (hqLevel - 1) * 0.06; // higher HQ = faster builds
  return Math.round((base * growth) / speedup);
}

// Resource production per hour for a given building level (0 = no production).
function productionPerHour(level) {
  if (level <= 0) return 0;
  return Math.round(30 * Math.pow(1.163, level - 1));
}

function warehouseCapacity(level) {
  return Math.round(1000 * Math.pow(1.2, Math.max(level - 1, 0)));
}

function farmCapacity(level) {
  return Math.round(240 * Math.pow(1.17, Math.max(level - 1, 0)));
}

function unitCost(unitId, count) {
  const base = UNITS[unitId].cost;
  return { wood: base.wood * count, clay: base.clay * count, iron: base.iron * count };
}

function unitTrainTime(unitId, count, barracksLevel) {
  const speedup = 1 + Math.max(barracksLevel - 1, 0) * 0.05;
  return Math.round((UNITS[unitId].trainTime * count) / speedup);
}

// Population currently used by buildings (flat cost per level, simple model).
function buildingsPopUsage(buildings) {
  return Object.values(buildings).reduce((sum, lvl) => sum + lvl, 0);
}

function troopsPopUsage(troops) {
  return Object.entries(troops || {}).reduce((sum, [id, count]) => sum + (UNITS[id]?.pop || 0) * count, 0);
}

if (typeof module !== 'undefined') {
  module.exports = {
    BUILDINGS, BUILDING_ORDER, UNITS, UNIT_ORDER, UNIT_REQUIRES,
    STARTING_BUILDINGS, STARTING_RESOURCES, MAP_SIZE,
    buildingCost, buildingTime, productionPerHour, warehouseCapacity, farmCapacity,
    unitCost, unitTrainTime, buildingsPopUsage, troopsPopUsage,
  };
}
