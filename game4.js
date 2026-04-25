const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

/* =========================
   RESPONSIVE CANVAS
========================= */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* =========================
   PLAYER OBJECT
========================= */
let player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  size: 30,
  speed: 5
};

/* =========================
   INPUT STATE
========================= */
let input = {
  x: 0,
  y: 0
};

/* =========================
   POINTER (MOUSE + TOUCH)
========================= */
let isPointerDown = false;

canvas.addEventListener("pointerdown", (e) => {
  isPointerDown = true;
});

canvas.addEventListener("pointermove", (e) => {
  if (isPointerDown) {
    player.x = e.clientX;
    player.y = e.clientY;
  }
});

canvas.addEventListener("pointerup", () => {
  isPointerDown = false;
});

/* =========================
   SWIPE DETECTION
========================= */
let startX = 0;
let startY = 0;

canvas.addEventListener("touchstart", (e) => {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
});

canvas.addEventListener("touchend", (e) => {
  let endX = e.changedTouches[0].clientX;
  let endY = e.changedTouches[0].clientY;

  let dx = endX - startX;
  let dy = endY - startY;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 50) input.x = 1;
    else if (dx < -50) input.x = -1;
  } else {
    if (dy > 50) input.y = 1;
    else if (dy < -50) input.y = -1;
  }
});

/* =========================
   KEYBOARD SUPPORT
========================= */
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") input.x = -1;
  if (e.key === "ArrowRight") input.x = 1;
  if (e.key === "ArrowUp") input.y = -1;
  if (e.key === "ArrowDown") input.y = 1;
});

window.addEventListener("keyup", () => {
  input.x = 0;
  input.y = 0;
});

/* =========================
   GAMEPAD SUPPORT 🎮
========================= */
let gamepadIndex = null;

window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
  console.log("Controller connected");
});

function handleGamepad() {
  if (gamepadIndex !== null) {
    const gp = navigator.getGamepads()[gamepadIndex];

    if (gp) {
      input.x = gp.axes[0];
      input.y = gp.axes[1];

      if (gp.buttons[0].pressed) {
        console.log("A button pressed");
      }
    }
  }
}

/* =========================
   GAME LOOP
========================= */
function update() {
  handleGamepad();

  player.x += input.x * player.speed;
  player.y += input.y * player.speed;

  // keep inside screen
  player.x = Math.max(0, Math.min(canvas.width, player.x));
  player.y = Math.max(0, Math.min(canvas.height, player.y));
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // player
  ctx.fillStyle = "cyan";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
  ctx.fill();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
