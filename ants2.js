const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

const ANT_COUNT = 20;
const FOOD_COUNT = 30;
const ANT_SIZE = 340; // size of sprite frame
const FRAME_COUNT = 4;
const SPRITE_SPEED = 150; // ms per frame
const SPEED = 1.5;

const NEST_X = canvas.width / 2;
const NEST_Y = canvas.height / 2;

// Sprite image
const spriteImage = document.getElementById('antSprite');

// --- Food Class ---
class Food {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.collected = false;
  }

  draw() {
    if (this.collected) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'green';
    ctx.fill();
  }
}

// --- Ant Class with Idle and Sprites ---
class Ant {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.direction = Math.random() * Math.PI * 2;
    this.carryingFood = false;
    this.state = 'walking'; // or 'idle'
    this.spriteFrame = 0;
    this.lastFrameTime = 0;
    this.idleTimer = 0;
    this.maxIdleTime = 0;
  }

  updateState(deltaTime) {
    // Chance to idle
    if (this.state === 'walking' && Math.random() < 0.001) {
      this.state = 'idle';
      this.maxIdleTime = 1000 + Math.random() * 2000;
      this.idleTimer = 0;
    }

    if (this.state === 'idle') {
      this.idleTimer += deltaTime;
      if (this.idleTimer >= this.maxIdleTime) {
        this.state = 'walking';
      }
    }
  }

  move(deltaTime) {
    if (this.state === 'idle') return;

    let target = this.findNearbyFood();

    if (this.carryingFood) {
      this.direction = Math.atan2(NEST_Y - this.y, NEST_X - this.x);
    } else if (target) {
      this.direction = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.distanceTo(target) < 5) {
        target.collected = true;
        this.carryingFood = true;
      }
    } else {
      this.direction += (Math.random() - 0.5) * 0.2;
    }

    this.x += Math.cos(this.direction) * SPEED;
    this.y += Math.sin(this.direction) * SPEED;

    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;

    if (this.carryingFood && this.distanceTo({ x: NEST_X, y: NEST_Y }) < 10) {
      this.carryingFood = false;
    }
  }

  findNearbyFood() {
    for (let food of foods) {
      if (!food.collected && this.distanceTo(food) < 50) {
        return food;
      }
    }
    return null;
  }

  distanceTo(target) {
    const dx = this.x - target.x;
    const dy = this.y - target.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  draw(deltaTime, time) {
    const row = this.carryingFood ? 2 : this.state === 'idle' ? 0 : 1;

    // Update sprite frame based on time
    if (time - this.lastFrameTime > SPRITE_SPEED) {
      this.spriteFrame = (this.spriteFrame + 1) % FRAME_COUNT;
      this.lastFrameTime = time;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.direction);

    ctx.drawImage(
      spriteImage,
      this.spriteFrame * ANT_SIZE,
      row * ANT_SIZE,
      ANT_SIZE,
      ANT_SIZE,
      -ANT_SIZE / 2,
      -ANT_SIZE / 2,
      ANT_SIZE,
      ANT_SIZE
    );

    ctx.restore();
  }
}

// --- Setup ---
let ants = [];
let foods = [];

for (let i = 0; i < ANT_COUNT; i++) {
  ants.push(new Ant(NEST_X, NEST_Y));
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(new Food(Math.random() * canvas.width, Math.random() * canvas.height));
}

// --- Animate ---
let lastTime = performance.now();

function animate(time) {
  const deltaTime = time - lastTime;
  lastTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Nest
  ctx.beginPath();
  ctx.arc(NEST_X, NEST_Y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = 'red';
  ctx.fill();

  // Food
  for (let food of foods) {
    food.draw();
  }

  // Ants
  for (let ant of ants) {
    ant.updateState(deltaTime);
    ant.move(deltaTime);
    ant.draw(deltaTime, time);
  }

  requestAnimationFrame(animate);
}

// Wait for sprite to load before starting
spriteImage.onload = () => {
  animate(performance.now());
};
