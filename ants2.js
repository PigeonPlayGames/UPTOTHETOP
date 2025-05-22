const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

// Configuration
const ANT_COUNT = 20;
const ANT_SIZE = 4;
const SPEED = 1.5;
const FOOD_COUNT = 30;
const FOOD_RADIUS = 3;
const NEST_X = canvas.width / 2;
const NEST_Y = canvas.height / 2;

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
    ctx.arc(this.x, this.y, FOOD_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = 'green';
    ctx.fill();
  }
}

// --- Ant Class ---
class Ant {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.direction = Math.random() * 2 * Math.PI;
    this.carryingFood = false;
  }

  move() {
    let target = this.findNearbyFood();

    if (this.carryingFood) {
      // Go back to nest
      this.direction = Math.atan2(NEST_Y - this.y, NEST_X - this.x);
    } else if (target) {
      // Move toward food
      this.direction = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.distanceTo(target) < 5) {
        target.collected = true;
        this.carryingFood = true;
      }
    } else {
      // Wander randomly
      this.direction += (Math.random() - 0.5) * 0.2;
    }

    // Move position
    this.x += Math.cos(this.direction) * SPEED;
    this.y += Math.sin(this.direction) * SPEED;

    // Wrap edges
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;

    // Drop food at nest
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

  draw(time = 0) {
    // Body
    ctx.beginPath();
    ctx.arc(this.x, this.y, ANT_SIZE, 0, 2 * Math.PI);
    ctx.fillStyle = this.carryingFood ? 'orange' : 'black';
    ctx.fill();

    // Legs (wiggling)
    const legLength = 6;
    const legSpread = 6;
    const legWiggle = Math.sin(time / 100 + this.x * 0.01) * 2;

    for (let i = -1; i <= 1; i++) {
      const offset = i * legSpread;
      const angle = this.direction + Math.PI / 2;
      const dx = Math.cos(angle) * offset;
      const dy = Math.sin(angle) * offset;

      const legAngle = angle + legWiggle * 0.1 * i;
      const lx = this.x + dx;
      const ly = this.y + dy;
      const legX = lx + Math.cos(legAngle) * legLength;
      const legY = ly + Math.sin(legAngle) * legLength;

      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(legX, legY);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// --- Setup ---
let ants = [];
for (let i = 0; i < ANT_COUNT; i++) {
  ants.push(new Ant(NEST_X, NEST_Y));
}

let foods = [];
for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(new Food(Math.random() * canvas.width, Math.random() * canvas.height));
}

// --- Animate ---
function animate(time) {
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
    ant.move();
    ant.draw(time);
  }

  requestAnimationFrame(animate);
}

// --- Start Simulation ---
animate();
