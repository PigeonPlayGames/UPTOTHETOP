const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

// Config
const ANT_COUNT = 20;
const ANT_SIZE = 4;
const SPEED = 1.5;

// Ant Class
class Ant {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.direction = Math.random() * 2 * Math.PI; // radians
  }

  move() {
    // Random small angle change
    this.direction += (Math.random() - 0.5) * 0.2;

    // Update position
    this.x += Math.cos(this.direction) * SPEED;
    this.y += Math.sin(this.direction) * SPEED;

    // Boundary check: wrap around
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, ANT_SIZE, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();
  }
}

// Create ants
let ants = [];
for (let i = 0; i < ANT_COUNT; i++) {
  ants.push(new Ant(Math.random() * canvas.width, Math.random() * canvas.height));
}

// Animation loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let ant of ants) {
    ant.move();
    ant.draw();
  }

  requestAnimationFrame(animate);
}

// Start simulation
animate();
