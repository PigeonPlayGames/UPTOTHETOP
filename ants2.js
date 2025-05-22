const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

function init() {
  ctx.fillStyle = "#000000";
  ctx.fillText("Ant simulation starts here...", 300, 300);
}

window.onload = init;
