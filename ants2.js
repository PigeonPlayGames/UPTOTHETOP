const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

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
      // Head toward nest
      this.direction = Math.atan2(NEST_Y - this.y, NEST_X - this.x);
    } else if (target) {
      // Head toward food
      this.direction = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.distanceTo(target) < 5) {
        target.collected = true;
        this.carryingFood = true;
      }
    } else {
      // Wander
      this.direction += (Math.random() - 0.5) * 0.2;
    }

    // Move
    this.x += Math.cos(this.direction) * SPEED;
    this.y += Math.sin(this.direction) * SPEED;

    // Wrap around
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;

    // If reached nest with food, drop it
    if (this.carryingFood && this.distanceTo({x: NEST_X, y: NEST_Y}) < 10) {
      this.carryingFood = false;
      // You could trigger reproduction here later!
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

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, ANT_SIZE, 0, 2 * Math.PI);
    ctx.fillStyle = this.carryingFood ? 'orange' : 'black';
    ctx.fill();
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

// --- Animation ---
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw nest
  ctx.beginPath();
  ctx.arc(NEST_X, NEST_Y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = 'red';
  ctx.fill();

  // Update and draw food
  for (let food of foods) {
    food.draw();
  }

  // Update and draw ants
  for (let ant of ants) {
    ant.move();
    ant.draw();
  }

  requestAnimationFrame(animate);
}

animate();
