const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const healthFill = document.getElementById("healthFill");
const energyFill = document.getElementById("energyFill");
const healthText = document.getElementById("healthText");
const energyText = document.getElementById("energyText");
const scoreText = document.getElementById("scoreText");
const enemyCountText = document.getElementById("enemyCountText");
const waveTimerText = document.getElementById("waveTimerText");
const stateText = document.getElementById("stateText");
const finalScoreText = document.getElementById("finalScoreText");

const keys = {};
const mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  down: false
};

let gameRunning = false;
let animationId = null;
let lastTime = 0;
let spawnTimer = 0;
let difficultyTimer = 0;
let shootCooldown = 0;
let screenShake = 0;

const world = {
  stars: [],
  particles: [],
  bullets: [],
  enemies: []
};

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
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
  health: 100,
  maxHealth: 100,
  energy: 100,
  maxEnergy: 100,
  score: 0,
  invuln: 0,
  facing: 0
};

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
  player.facing = 0;

  world.particles = [];
  world.bullets = [];
  world.enemies = [];
  world.stars = createStars(120);

  spawnTimer = 0;
  difficultyTimer = 0;
  shootCooldown = 0;
  screenShake = 0;

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

  healthText.textContent = Math.ceil(player.health);
  energyText.textContent = Math.ceil(player.energy);
  scoreText.textContent = player.score;
  enemyCountText.textContent = world.enemies.length;
  waveTimerText.textContent = difficultyTimer.toFixed(1);
  stateText.textContent =
    player.dashTime > 0 ? "Dashing" : gameRunning ? "Combat" : "Idle";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function spawnEnemy() {
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

  const speedBoost = Math.min(160, difficultyTimer * 4);

  world.enemies.push({
    x,
    y,
    radius: 14 + Math.random() * 8,
    speed: 95 + Math.random() * 45 + speedBoost,
    health: 2 + Math.floor(difficultyTimer / 12),
    hue: 180 + Math.random() * 120,
    hitFlash: 0
  });
}

function createBurst(x, y, color, count = 12, strength = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = (Math.random() * 120 + 40) * strength;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.35,
      maxLife: 0.5 + Math.random() * 0.35,
      size: Math.random() * 3 + 1.5,
      color
    });
  }
}

function shoot() {
  if (shootCooldown > 0) return;
  if (!gameRunning) return;

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

  shootCooldown = 0.12;
  createBurst(player.x + dirX * 18, player.y + dirY * 18, "38,208,255", 6, 0.5);
}

function dash() {
  if (player.dashCooldown > 0) return;
  if (player.energy < 22) return;

  let moveX = 0;
  let moveY = 0;

  if (keys["w"] || keys["arrowup"]) moveY -= 1;
  if (keys["s"] || keys["arrowdown"]) moveY += 1;
  if (keys["a"] || keys["arrowleft"]) moveX -= 1;
  if (keys["d"] || keys["arrowright"]) moveX += 1;

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
  finalScoreText.textContent = `Final Score: ${player.score}`;
  gameOverOverlay.classList.remove("hidden");
  gameOverOverlay.classList.add("visible");
}

function updatePlayer(dt) {
  let inputX = 0;
  let inputY = 0;

  if (keys["w"] || keys["arrowup"]) inputY -= 1;
  if (keys["s"] || keys["arrowdown"]) inputY += 1;
  if (keys["a"] || keys["arrowleft"]) inputX -= 1;
  if (keys["d"] || keys["arrowright"]) inputX += 1;

  const inputLen = Math.hypot(inputX, inputY);
  if (inputLen > 0) {
    inputX /= inputLen;
    inputY /= inputLen;
    player.vx += inputX * player.accel * dt;
    player.vy += inputY * player.accel * dt;
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

  player.x = clamp(player.x, player.radius, canvas.width - player.radius);
  player.y = clamp(player.y, player.radius, canvas.height - player.radius);

  player.facing = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  player.dashTime = Math.max(0, player.dashTime - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
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
}

function updateEnemies(dt) {
  for (const enemy of world.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.hypot(dx, dy) || 1;

    enemy.x += (dx / len) * enemy.speed * dt;
    enemy.y += (dy / len) * enemy.speed * dt;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    const hitDist = enemy.radius + player.radius;
    if (distance(enemy.x, enemy.y, player.x, player.y) < hitDist) {
      damagePlayer(16 * dt * 6);
    }
  }
}

function handleCollisions() {
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = world.enemies[i];

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
          player.score += 10;
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
        player.score += 15;
        player.energy = Math.min(player.maxEnergy, player.energy + 8);
      }
    }
  }
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

function updateGame(dt) {
  if (!gameRunning) return;

  difficultyTimer += dt;
  spawnTimer += dt;
  shootCooldown = Math.max(0, shootCooldown - dt);
  screenShake = Math.max(0, screenShake - dt * 25);

  const spawnRate = Math.max(0.25, 1.2 - difficultyTimer * 0.015);

  if (spawnTimer >= spawnRate) {
    spawnTimer = 0;
    spawnEnemy();

    if (difficultyTimer > 20 && Math.random() < 0.4) {
      spawnEnemy();
    }
  }

  if (mouse.down) {
    shoot();
  }

  updateStars(dt);
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
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
  ctx.arc(canvas.width * 0.5, canvas.height * 0.5, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(38,208,255,0.05)";
  ctx.arc(canvas.width * 0.55, canvas.height * 0.48, 140, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;

  const spacing = 48;
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

    ctx.beginPath();
    ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : `hsl(${enemy.hue}, 90%, 60%)`;
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(10,16,34,0.85)";
    ctx.arc(0, 0, enemy.radius * 0.36, 0, Math.PI * 2);
    ctx.fill();

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
  drawParticles();
  drawBullets();
  drawEnemies();
  drawPlayer();

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

  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  mouse.x = (event.clientX - rect.left) * scaleX;
  mouse.y = (event.clientY - rect.top) * scaleY;
});

canvas.addEventListener("mousedown", () => {
  mouse.down = true;
});

window.addEventListener("mouseup", () => {
  mouse.down = false;
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys[key] = true;

  if (key === "shift") {
    dash();
  }

  if (key === "r") {
    startGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

resetGame();
render();
