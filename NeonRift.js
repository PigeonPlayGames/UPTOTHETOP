const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const canvasWrap = document.getElementById("canvasWrap");

const healthFill = document.getElementById("healthFill");
const energyFill = document.getElementById("energyFill");
const healthText = document.getElementById("healthText");
const energyText = document.getElementById("energyText");
const scoreText = document.getElementById("scoreText");
const enemyCountText = document.getElementById("enemyCountText");
const waveTimerText = document.getElementById("waveTimerText");
const stateText = document.getElementById("stateText");
const finalScoreText = document.getElementById("finalScoreText");

const mobileHealthFill = document.getElementById("mobileHealthFill");
const mobileEnergyFill = document.getElementById("mobileEnergyFill");
const mobileScoreText = document.getElementById("mobileScoreText");

const bgMusic = document.getElementById("bgMusic");
const shootSound = document.getElementById("shootSound");

const keys = {};
const mouse = {
  x: 640,
  y: 360,
  down: false
};

const touchState = {
  active: false,
  moveX: 0,
  moveY: 0,
  shoot: false,
  moveTouchId: null,
  aimTouchId: null,
  moveStartX: 0,
  moveStartY: 0,
  aimStartX: 0,
  aimStartY: 0,
  aimStartTime: 0,
  lastTapTime: 0
};

const gamepadState = {
  dashPressed: false,
  slashPressed: false
};

let gameRunning = false;
let animationId = null;
let lastTime = 0;
let spawnTimer = 0;
let difficultyTimer = 0;
let shootCooldown = 0;
let screenShake = 0;
let waveNumber = 1;
let waveAnnouncementTimer = 0;
let bestScore = Number(localStorage.getItem("neonRiftBestScore") || 0);

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const WAVE_DURATION = 20;

const ENEMY_TYPES = {
  chaser: {
    type: "chaser",
    radius: [13, 18],
    speed: [140, 210],
    health: [2, 4],
    hue: [185, 240],
    fireRate: null,
    preferredDistance: 0,
    score: 10,
    contactDamage: 18
  },
  turret: {
    type: "turret",
    radius: [14, 18],
    speed: [70, 115],
    health: [2, 4],
    hue: [300, 340],
    fireRate: [0.7, 1.1],
    preferredDistance: 240,
    score: 14,
    contactDamage: 12
  },
  tank: {
    type: "tank",
    radius: [20, 28],
    speed: [55, 95],
    health: [6, 10],
    hue: [25, 55],
    fireRate: [1.8, 2.5],
    preferredDistance: 0,
    score: 22,
    contactDamage: 28
  }
};

const world = {
  stars: [],
  particles: [],
  bullets: [],
  enemyBullets: [],
  enemies: [],
  slashWaves: []
};

const arena = {
  padding: 36,
  wallDamagePerSecond: 18
};

const player = {
  x: BASE_WIDTH / 2,
  y: BASE_HEIGHT / 2,
  radius: 16,
  vx: 0,
  vy: 0,
  accel: 980,
  maxSpeed: 340,
  friction: 0.9,
  dashSpeed: 820,
  dashTime: 0,
  dashDuration: 0.12,
  dashCooldown: 0,
  dashCooldownMax: 0.55,
  slashCooldown: 0,
  slashCooldownMax: 0.8,
  health: 100,
  maxHealth: 100,
  energy: 100,
  maxEnergy: 100,
  score: 0,
  invuln: 0,
  facing: 0
};

if (bgMusic) {
  bgMusic.addEventListener("canplaythrough", () => {
    console.log("Background music loaded and ready.");
  });

  bgMusic.addEventListener("error", () => {
    console.log("Background music file could not be loaded.");
  });
}

function isTouchLayout() {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
}

function resizeCanvas() {
  if (isTouchLayout()) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  } else {
    canvas.width = BASE_WIDTH;
    canvas.height = BASE_HEIGHT;
  }

  if (!gameRunning) {
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    mouse.x = canvas.width / 2;
    mouse.y = canvas.height / 2;
    render();
  }
}

function startBackgroundMusic() {
  if (!bgMusic) return;

  bgMusic.pause();
  bgMusic.currentTime = 0;
  bgMusic.loop = true;
  bgMusic.volume = 0.4;

  const playPromise = bgMusic.play();

  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        console.log("Background music started.");
      })
      .catch((error) => {
        console.log("Background music failed to start:", error);
      });
  }
}

function stopBackgroundMusic() {
  if (!bgMusic) return;
  bgMusic.pause();
  bgMusic.currentTime = 0;
}

function playShootSound() {
  if (!shootSound) return;

  const shot = shootSound.cloneNode(true);
  shot.volume = 0.35;
  shot.play().catch((error) => {
    console.log("Shoot sound blocked:", error);
  });
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

function getCurrentWave() {
  return Math.floor(difficultyTimer / WAVE_DURATION) + 1;
}

function saveBestScore() {
  if (player.score > bestScore) {
    bestScore = player.score;
    localStorage.setItem("neonRiftBestScore", String(bestScore));
  }
}

function resetGame() {
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.vx = 0;
  player.vy = 0;
  player.health = 100;
  player.energy = 100;
  player.score = 0;
  player.invuln = 0;
  player.dashTime = 0;
  player.dashCooldown = 0;
  player.slashCooldown = 0;
  player.facing = 0;

  mouse.x = canvas.width / 2;
  mouse.y = canvas.height / 2;

  world.particles = [];
  world.bullets = [];
  world.enemyBullets = [];
  world.enemies = [];
  world.slashWaves = [];
  world.stars = createStars(isTouchLayout() ? 90 : 120);

  spawnTimer = 0;
  difficultyTimer = 0;
  shootCooldown = 0;
  screenShake = 0;
  waveNumber = 1;
  waveAnnouncementTimer = 2.2;

  updateHUD();
}

function createStars(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.4,
    speed: Math.random() * 16 + 8,
    alpha: Math.random() * 0.6 + 0.2
  }));
}

function updateHUD() {
  const healthPercent = Math.max(0, (player.health / player.maxHealth) * 100);
  const energyPercent = Math.max(0, (player.energy / player.maxEnergy) * 100);

  healthFill.style.width = `${healthPercent}%`;
  energyFill.style.width = `${energyPercent}%`;

  if (mobileHealthFill) mobileHealthFill.style.width = `${healthPercent}%`;
  if (mobileEnergyFill) mobileEnergyFill.style.width = `${energyPercent}%`;

  healthText.textContent = Math.ceil(player.health);
  energyText.textContent = Math.ceil(player.energy);
  scoreText.textContent = player.score;
  if (mobileScoreText) mobileScoreText.textContent = player.score;

  enemyCountText.textContent = world.enemies.length;

  const timeToNextWave = Math.max(0, WAVE_DURATION - (difficultyTimer % WAVE_DURATION));
  waveTimerText.textContent = `${timeToNextWave.toFixed(1)}s`;

  let state = `Wave ${waveNumber}`;
  if (!gameRunning) state = "Idle";
  else if (player.dashTime > 0) state = "Dashing";
  else if (player.slashCooldown > player.slashCooldownMax - 0.18) state = "Slashing";

  stateText.textContent = state;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function applyDeadzone(value, zone = 0.18) {
  if (Math.abs(value) < zone) return 0;
  return value;
}

function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function createEnemyByType(typeName, x, y) {
  const def = ENEMY_TYPES[typeName];
  const radius = randRange(def.radius[0], def.radius[1]);
  const waveScale = Math.max(0, waveNumber - 1);
  const maxHealth =
    randInt(def.health[0], def.health[1]) +
    Math.floor(waveScale * (def.type === "tank" ? 0.9 : 0.45));

  return {
    id: `enemy_${Math.random().toString(36).slice(2)}_${performance.now()}`,
    type: def.type,
    x,
    y,
    radius,
    speed: randRange(def.speed[0], def.speed[1]) + waveScale * (def.type === "tank" ? 4 : 8),
    health: maxHealth,
    maxHealth,
    hue: randRange(def.hue[0], def.hue[1]),
    hitFlash: 0,
    fireCooldown: def.fireRate ? randRange(def.fireRate[0], def.fireRate[1]) : 999,
    scoreValue: def.score,
    contactDamage: def.contactDamage,
    preferredDistance: def.preferredDistance || 0
  };
}

function getWaveEnemyType() {
  const roll = Math.random();

  if (waveNumber <= 1) {
    return "chaser";
  }

  if (waveNumber === 2) {
    return roll < 0.75 ? "chaser" : "turret";
  }

  if (waveNumber === 3) {
    if (roll < 0.6) return "chaser";
    if (roll < 0.88) return "turret";
    return "tank";
  }

  if (roll < 0.5) return "chaser";
  if (roll < 0.8) return "turret";
  return "tank";
}

function spawnEnemy(typeName = getWaveEnemyType()) {
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = Math.random() * canvas.width;
    y = -40;
  } else if (edge === 1) {
    x = canvas.width + 40;
    y = Math.random() * canvas.height;
  } else if (edge === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + 40;
  } else {
    x = -40;
    y = Math.random() * canvas.height;
  }

  world.enemies.push(createEnemyByType(typeName, x, y));
}

function createBurst(x, y, color, count = 12, strength = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = (Math.random() * 120 + 40) * strength;
    const life = 0.5 + Math.random() * 0.35;

    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: Math.random() * 3 + 1.5,
      color
    });
  }
}

function getMoveInput() {
  let x = 0;
  let y = 0;

  if (keys["w"] || keys["arrowup"]) y -= 1;
  if (keys["s"] || keys["arrowdown"]) y += 1;
  if (keys["a"] || keys["arrowleft"]) x -= 1;
  if (keys["d"] || keys["arrowright"]) x += 1;

  x += touchState.moveX;
  y += touchState.moveY;

  const gamepad = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (gamepad) {
    x += applyDeadzone(gamepad.axes[0] || 0);
    y += applyDeadzone(gamepad.axes[1] || 0);
  }

  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }

  return { x, y };
}

function updateAimFromController() {
  const gamepad = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (!gamepad) return;

  const rx = applyDeadzone(gamepad.axes[2] || 0);
  const ry = applyDeadzone(gamepad.axes[3] || 0);

  if (Math.hypot(rx, ry) > 0.2) {
    mouse.x = player.x + rx * 220;
    mouse.y = player.y + ry * 220;
  }
}

function shoot() {
  if (shootCooldown > 0 || !gameRunning) return;

  const dx = mouse.x - player.x;
  const dy = mouse.y - player.y;
  const len = Math.hypot(dx, dy) || 1;

  const dirX = dx / len;
  const dirY = dy / len;
  const bulletSpeed = 760;

  world.bullets.push({
    x: player.x + dirX * 22,
    y: player.y + dirY * 22,
    vx: dirX * bulletSpeed + player.vx * 0.3,
    vy: dirY * bulletSpeed + player.vy * 0.3,
    radius: 4,
    life: 0.9
  });

  playShootSound();

  shootCooldown = 0.12;
  createBurst(player.x + dirX * 18, player.y + dirY * 18, "38,208,255", 6, 0.5);
}

function dash() {
  if (player.dashCooldown > 0 || player.energy < 22) return;

  const move = getMoveInput();
  let moveX = move.x;
  let moveY = move.y;

  if (moveX === 0 && moveY === 0) {
    moveX = Math.cos(player.facing);
    moveY = Math.sin(player.facing);
  }

  const len = Math.hypot(moveX, moveY) || 1;
  moveX /= len;
  moveY /= len;

  player.vx = moveX * player.dashSpeed;
  player.vy = moveY * player.dashSpeed;
  player.dashTime = player.dashDuration;
  player.dashCooldown = player.dashCooldownMax;
  player.energy -= 22;
  player.invuln = 0.16;

  screenShake = 6;
  createBurst(player.x, player.y, "124,92,255", 20, 1.5);
}

function riftSlash() {
  if (!gameRunning || player.slashCooldown > 0 || player.energy < 28) return;

  player.slashCooldown = player.slashCooldownMax;
  player.energy -= 28;
  screenShake = 8;

  world.slashWaves.push({
    x: player.x,
    y: player.y,
    angle: player.facing,
    radius: 26,
    maxRadius: 150,
    width: Math.PI * 0.78,
    speed: 620,
    life: 0.22,
    maxLife: 0.22,
    hitEnemies: new Set()
  });

  createBurst(player.x, player.y, "255,159,67", 18, 1.25);
}

function damagePlayer(amount) {
  if (player.invuln > 0) return;

  player.health -= amount;
  player.invuln = 0.5;
  screenShake = 10;
  createBurst(player.x, player.y, "255,93,122", 16, 1.2);

  if (player.health <= 0) {
    player.health = 0;
    endGame();
  }
}

function endGame() {
  gameRunning = false;
  stopBackgroundMusic();
  saveBestScore();
  finalScoreText.textContent = `Final Score: ${player.score} • Best: ${bestScore}`;
  gameOverOverlay.classList.remove("hidden");
  gameOverOverlay.classList.add("visible");
}

function updatePlayer(dt) {
  const move = getMoveInput();

  if (move.x !== 0 || move.y !== 0) {
    player.vx += move.x * player.accel * dt;
    player.vy += move.y * player.accel * dt;
  }

  if (player.dashTime <= 0) {
    player.vx *= Math.pow(player.friction, dt * 60);
    player.vy *= Math.pow(player.friction, dt * 60);

    const speed = Math.hypot(player.vx, player.vy);
    if (speed > player.maxSpeed) {
      const scale = player.maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
    }
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const minX = arena.padding + player.radius;
  const maxX = canvas.width - arena.padding - player.radius;
  const minY = arena.padding + player.radius;
  const maxY = canvas.height - arena.padding - player.radius;

  if (player.x < minX || player.x > maxX || player.y < minY || player.y > maxY) {
    damagePlayer(arena.wallDamagePerSecond * dt);
  }

  player.x = clamp(player.x, minX, maxX);
  player.y = clamp(player.y, minY, maxY);

  player.facing = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  player.dashTime = Math.max(0, player.dashTime - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.slashCooldown = Math.max(0, player.slashCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  player.energy = Math.min(player.maxEnergy, player.energy + 24 * dt);
}

function updateStars(dt) {
  for (const star of world.stars) {
    star.y += star.speed * dt;
    if (star.y > canvas.height + 4) {
      star.y = -4;
      star.x = Math.random() * canvas.width;
    }
  }
}

function updateBullets(dt) {
  world.bullets = world.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    return (
      bullet.life > 0 &&
      bullet.x > -20 &&
      bullet.x < canvas.width + 20 &&
      bullet.y > -20 &&
      bullet.y < canvas.height + 20
    );
  });

  world.enemyBullets = world.enemyBullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (distance(bullet.x, bullet.y, player.x, player.y) < bullet.radius + player.radius) {
      damagePlayer(14);
      createBurst(bullet.x, bullet.y, "255,93,122", 10, 0.8);
      return false;
    }

    return (
      bullet.life > 0 &&
      bullet.x > -20 &&
      bullet.x < canvas.width + 20 &&
      bullet.y > -20 &&
      bullet.y < canvas.height + 20
    );
  });
}

function updateEnemies(dt) {
  for (const enemy of world.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.fireCooldown -= dt;

    if (enemy.type === "chaser") {
      enemy.x += nx * enemy.speed * dt;
      enemy.y += ny * enemy.speed * dt;
    }

    if (enemy.type === "turret") {
      const desired = enemy.preferredDistance || 240;

      if (len > desired + 28) {
        enemy.x += nx * enemy.speed * dt;
        enemy.y += ny * enemy.speed * dt;
      } else if (len < desired - 28) {
        enemy.x -= nx * enemy.speed * dt;
        enemy.y -= ny * enemy.speed * dt;
      } else {
        const strafeAngle = Math.atan2(dy, dx) + Math.PI / 2;
        enemy.x += Math.cos(strafeAngle) * enemy.speed * 0.55 * dt;
        enemy.y += Math.sin(strafeAngle) * enemy.speed * 0.55 * dt;
      }

      if (enemy.fireCooldown <= 0) {
        enemy.fireCooldown = randRange(0.65, 1.05);

        const aim = angleTo(enemy.x, enemy.y, player.x, player.y);
        const speed = 290 + Math.min(120, waveNumber * 14);

        world.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(aim) * speed,
          vy: Math.sin(aim) * speed,
          radius: 5,
          life: 3
        });
      }
    }

    if (enemy.type === "tank") {
      enemy.x += nx * enemy.speed * dt;
      enemy.y += ny * enemy.speed * dt;

      if (enemy.fireCooldown <= 0 && len > 160) {
        enemy.fireCooldown = randRange(1.8, 2.5);

        const aim = angleTo(enemy.x, enemy.y, player.x, player.y);
        const speed = 220 + waveNumber * 8;

        world.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(aim) * speed,
          vy: Math.sin(aim) * speed,
          radius: 7,
          life: 3.2
        });
      }
    }

    const hitDist = enemy.radius + player.radius;
    if (distance(enemy.x, enemy.y, player.x, player.y) < hitDist) {
      damagePlayer(enemy.contactDamage * dt * 5.2);
    }
  }
}

function handleCollisions() {
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = world.enemies[i];
    if (!enemy) continue;

    for (let j = world.bullets.length - 1; j >= 0; j -= 1) {
      const bullet = world.bullets[j];
      if (distance(enemy.x, enemy.y, bullet.x, bullet.y) < enemy.radius + bullet.radius) {
        enemy.health -= 1;
        enemy.hitFlash = 0.08;
        world.bullets.splice(j, 1);
        createBurst(bullet.x, bullet.y, "255,159,67", 7, 0.7);

        if (enemy.health <= 0) {
          createBurst(enemy.x, enemy.y, `${enemy.hue},90,255`, 18, 1.4);
          world.enemies.splice(i, 1);
          player.score += enemy.scoreValue || 10;
          break;
        }
      }
    }

    if (player.dashTime > 0 && i < world.enemies.length) {
      const currentEnemy = world.enemies[i];
      if (
        currentEnemy &&
        distance(currentEnemy.x, currentEnemy.y, player.x, player.y) <
          currentEnemy.radius + player.radius + 4
      ) {
        createBurst(currentEnemy.x, currentEnemy.y, "38,208,255", 18, 1.2);
        world.enemies.splice(i, 1);
        player.score += (currentEnemy.scoreValue || 10) + 5;
        player.energy = Math.min(player.maxEnergy, player.energy + 8);
      }
    }
  }

  for (const slash of world.slashWaves) {
    for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = world.enemies[i];
      if (!enemy) continue;
      if (slash.hitEnemies.has(enemy.id)) continue;

      const dx = enemy.x - slash.x;
      const dy = enemy.y - slash.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let diff = ang - slash.angle;

      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      if (dist < slash.radius + enemy.radius && Math.abs(diff) < slash.width / 2) {
        slash.hitEnemies.add(enemy.id);

        enemy.health -= 3;
        enemy.hitFlash = 0.12;
        enemy.x += Math.cos(ang) * 18;
        enemy.y += Math.sin(ang) * 18;

        if (enemy.health <= 0) {
          createBurst(enemy.x, enemy.y, `${enemy.hue},90,255`, 22, 1.5);
          world.enemies.splice(i, 1);
          player.score += (enemy.scoreValue || 10) + 8;
          player.energy = Math.min(player.maxEnergy, player.energy + 6);
        }
      }
    }
  }
}

function updateSlashWaves(dt) {
  world.slashWaves = world.slashWaves.filter((slash) => {
    slash.radius += slash.speed * dt;
    slash.life -= dt;
    return slash.life > 0 && slash.radius < slash.maxRadius;
  });
}

function updateParticles(dt) {
  world.particles = world.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.96, dt * 60);
    p.vy *= Math.pow(0.96, dt * 60);
    p.life -= dt;
    return p.life > 0;
  });
}

function updateGamepadInputs() {
  const gamepad = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (!gamepad) return;

  updateAimFromController();

  const shootPressed =
    (gamepad.buttons[7] && gamepad.buttons[7].pressed) ||
    (gamepad.buttons[5] && gamepad.buttons[5].pressed);
  if (shootPressed) shoot();

  const dashPressed = gamepad.buttons[0] && gamepad.buttons[0].pressed;
  if (dashPressed && !gamepadState.dashPressed) dash();
  gamepadState.dashPressed = !!dashPressed;

  const slashPressed = gamepad.buttons[2] && gamepad.buttons[2].pressed;
  if (slashPressed && !gamepadState.slashPressed) riftSlash();
  gamepadState.slashPressed = !!slashPressed;
}

function updateGame(dt) {
  if (!gameRunning) return;

  difficultyTimer += dt;
  spawnTimer += dt;
  shootCooldown = Math.max(0, shootCooldown - dt);
  screenShake = Math.max(0, screenShake - dt * 25);
  waveAnnouncementTimer = Math.max(0, waveAnnouncementTimer - dt);

  const newWave = getCurrentWave();
  if (newWave !== waveNumber) {
    waveNumber = newWave;
    waveAnnouncementTimer = 2.4;
    screenShake = 8;
    createBurst(player.x, player.y, "38,208,255", 18, 1.2);
  }

  updateGamepadInputs();

  const spawnRate = Math.max(0.22, 1.15 - waveNumber * 0.08 - difficultyTimer * 0.006);

  if (spawnTimer >= spawnRate) {
    spawnTimer = 0;
    spawnEnemy();

    if (waveNumber >= 2 && Math.random() < 0.25 + waveNumber * 0.03) {
      spawnEnemy();
    }

    if (waveNumber >= 4 && Math.random() < 0.18) {
      spawnEnemy("tank");
    }
  }

  if (mouse.down || touchState.shoot) {
    shoot();
  }

  updateStars(dt);
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateSlashWaves(dt);
  handleCollisions();
  updateParticles(dt);
  updateHUD();
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.5,
    80,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.7
  );
  gradient.addColorStop(0, "rgba(23,30,74,0.9)");
  gradient.addColorStop(0.5, "rgba(10,14,34,0.96)");
  gradient.addColorStop(1, "rgba(4,7,20,1)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const star of world.stars) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(220,230,255,${star.alpha})`;
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  const pulse = 0.5 + Math.sin(performance.now() * 0.002) * 0.08;

  ctx.beginPath();
  ctx.fillStyle = `rgba(124,92,255,${0.08 * pulse})`;
  ctx.arc(
    canvas.width * 0.5,
    canvas.height * 0.5,
    Math.min(canvas.width, canvas.height) * 0.3,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(38,208,255,0.05)";
  ctx.arc(
    canvas.width * 0.55,
    canvas.height * 0.48,
    Math.min(canvas.width, canvas.height) * 0.2,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;

  const spacing = Math.max(42, Math.min(58, canvas.width / 24));
  for (let x = 0; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawArenaBounds() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 3;
  ctx.strokeRect(
    arena.padding,
    arena.padding,
    canvas.width - arena.padding * 2,
    canvas.height - arena.padding * 2
  );
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.facing);

  if (player.invuln > 0) {
    ctx.globalAlpha = 0.7 + Math.sin(performance.now() * 0.03) * 0.3;
  }

  ctx.beginPath();
  ctx.fillStyle = "rgba(38,208,255,0.18)";
  ctx.arc(0, 0, player.radius + 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#7c5cff";
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, -11);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-12, 11);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#26d0ff";
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();

  if (player.dashTime > 0) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,159,67,0.9)";
    ctx.lineWidth = 3;
    ctx.arc(0, 0, player.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEnemies() {
  for (const enemy of world.enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    ctx.beginPath();
    ctx.fillStyle = `hsla(${enemy.hue}, 90%, 60%, 0.18)`;
    ctx.arc(0, 0, enemy.radius + 10, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.type === "chaser") {
      ctx.beginPath();
      ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : `hsl(${enemy.hue}, 90%, 60%)`;
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "rgba(10,16,34,0.85)";
      ctx.arc(0, 0, enemy.radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }

    if (enemy.type === "turret") {
      ctx.rotate(performance.now() * 0.0015);
      ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : `hsl(${enemy.hue}, 90%, 62%)`;
      ctx.fillRect(-enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2);

      ctx.fillStyle = "rgba(10,16,34,0.85)";
      ctx.fillRect(
        -enemy.radius * 0.28,
        -enemy.radius * 0.28,
        enemy.radius * 0.56,
        enemy.radius * 0.56
      );
    }

    if (enemy.type === "tank") {
      ctx.beginPath();
      ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : `hsl(${enemy.hue}, 92%, 58%)`;
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.arc(0, 0, enemy.radius - 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(10,16,34,0.85)";
      ctx.arc(0, 0, enemy.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    const hpRatio = Math.max(0, enemy.health / enemy.maxHealth);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(-enemy.radius, -enemy.radius - 12, enemy.radius * 2, 4);

    ctx.fillStyle =
      enemy.type === "tank"
        ? "#ff9f43"
        : enemy.type === "turret"
        ? "#ff5dca"
        : "#26d0ff";

    ctx.fillRect(-enemy.radius, -enemy.radius - 12, enemy.radius * 2 * hpRatio, 4);

    ctx.restore();
  }
}

function drawBullets() {
  for (const bullet of world.bullets) {
    ctx.beginPath();
    ctx.fillStyle = "#ff9f43";
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(255,159,67,0.25)";
    ctx.arc(bullet.x, bullet.y, bullet.radius + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const bullet of world.enemyBullets) {
    ctx.beginPath();
    ctx.fillStyle = "#ff5d7a";
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(255,93,122,0.24)";
    ctx.arc(bullet.x, bullet.y, bullet.radius + 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSlashWaves() {
  for (const slash of world.slashWaves) {
    const alpha = slash.life / slash.maxLife;

    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.rotate(slash.angle);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(38,208,255,${alpha * 0.85})`;
    ctx.lineWidth = 14;
    ctx.arc(0, 0, slash.radius, -slash.width / 2, slash.width / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,159,67,${alpha * 0.55})`;
    ctx.lineWidth = 5;
    ctx.arc(0, 0, slash.radius - 8, -slash.width / 2, slash.width / 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawParticles() {
  for (const p of world.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.color},${alpha})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaveAnnouncement() {
  if (waveAnnouncementTimer <= 0) return;

  const fadeIn = Math.min(1, (2.4 - waveAnnouncementTimer) / 0.25);
  const fadeOut = Math.min(1, waveAnnouncementTimer / 0.45);
  const alpha = Math.min(fadeIn, fadeOut);
  const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.04;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `800 ${Math.floor(Math.min(canvas.width, canvas.height) * 0.06 * pulse)}px Inter, Arial, sans-serif`;
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha)})`;
  ctx.shadowBlur = 30;
  ctx.shadowColor = "rgba(38,208,255,0.5)";
  ctx.fillText(`WAVE ${waveNumber}`, canvas.width / 2, canvas.height * 0.2);

  ctx.font = `600 ${Math.floor(Math.min(canvas.width, canvas.height) * 0.022)}px Inter, Arial, sans-serif`;
  ctx.fillStyle = `rgba(157,234,255,${Math.min(0.9, alpha)})`;
  ctx.fillText("Hostile signal spike detected", canvas.width / 2, canvas.height * 0.26);

  ctx.restore();
}

function render() {
  ctx.save();

  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );
  }

  drawBackground();
  drawGrid();
  drawArenaBounds();
  drawParticles();
  drawSlashWaves();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawWaveAnnouncement();

  ctx.restore();
}

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;

  updateGame(dt);
  render();

  animationId = requestAnimationFrame(loop);
}

function startGame() {
  resetGame();
  gameRunning = true;
  overlay.classList.remove("visible");
  overlay.classList.add("hidden");
  gameOverOverlay.classList.remove("visible");
  gameOverOverlay.classList.add("hidden");
  lastTime = performance.now();

  startBackgroundMusic();

  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function handleTouchStart(touch) {
  const rect = canvas.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const point = getCanvasPoint(touch.clientX, touch.clientY);

  if (touch.clientX < midX && touchState.moveTouchId === null) {
    touchState.moveTouchId = touch.identifier;
    touchState.moveStartX = point.x;
    touchState.moveStartY = point.y;
    touchState.moveX = 0;
    touchState.moveY = 0;
    return;
  }

  if (touch.clientX >= midX && touchState.aimTouchId === null) {
    const now = performance.now();
    if (now - touchState.lastTapTime < 260) {
      riftSlash();
      touchState.lastTapTime = 0;
    } else {
      touchState.lastTapTime = now;
    }

    touchState.aimTouchId = touch.identifier;
    touchState.aimStartX = point.x;
    touchState.aimStartY = point.y;
    touchState.aimStartTime = now;
    touchState.shoot = true;
    mouse.x = point.x;
    mouse.y = point.y;
  }
}

function handleTouchMove(touch) {
  const point = getCanvasPoint(touch.clientX, touch.clientY);

  if (touch.identifier === touchState.moveTouchId) {
    const dx = point.x - touchState.moveStartX;
    const dy = point.y - touchState.moveStartY;
    const max = 90;

    let moveX = dx / max;
    let moveY = dy / max;
    const len = Math.hypot(moveX, moveY);

    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    touchState.moveX = moveX;
    touchState.moveY = moveY;
  }

  if (touch.identifier === touchState.aimTouchId) {
    mouse.x = point.x;
    mouse.y = point.y;
  }
}

function handleTouchEnd(touch) {
  const point = getCanvasPoint(touch.clientX, touch.clientY);

  if (touch.identifier === touchState.moveTouchId) {
    touchState.moveTouchId = null;
    touchState.moveX = 0;
    touchState.moveY = 0;
  }

  if (touch.identifier === touchState.aimTouchId) {
    const dx = point.x - touchState.aimStartX;
    const dy = point.y - touchState.aimStartY;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - touchState.aimStartTime;

    if (dist > 90 && elapsed < 260) {
      mouse.x = point.x;
      mouse.y = point.y;
      dash();
    }

    touchState.aimTouchId = null;
    touchState.shoot = false;
  }
}

// Mouse
canvas.addEventListener("mousemove", (event) => {
  const point = getCanvasPoint(event.clientX, event.clientY);
  mouse.x = point.x;
  mouse.y = point.y;
});

canvas.addEventListener("mousedown", () => {
  mouse.down = true;
});

window.addEventListener("mouseup", () => {
  mouse.down = false;
});

// Keyboard
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys[key] = true;

  if (key === "shift") dash();
  if (key === " ") {
    event.preventDefault();
    riftSlash();
  }
  if (key === "r") startGame();
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

// Touch
canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!isTouchLayout()) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handleTouchStart(touch);
    }
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!isTouchLayout()) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handleTouchMove(touch);
    }
  },
  { passive: false }
);

canvas.addEventListener(
  "touchend",
  (e) => {
    if (!isTouchLayout()) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handleTouchEnd(touch);
    }
  },
  { passive: false }
);

canvas.addEventListener(
  "touchcancel",
  (e) => {
    if (!isTouchLayout()) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handleTouchEnd(touch);
    }
  },
  { passive: false }
);

// Buttons
startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

startButton.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    startGame();
  },
  { passive: false }
);

restartButton.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    startGame();
  },
  { passive: false }
);

// Resize/orientation
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
  setTimeout(resizeCanvas, 150);
});

resizeCanvas();
resetGame();
render();
