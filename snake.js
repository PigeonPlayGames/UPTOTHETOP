// --- SETUP ---
// Get the canvas element from our HTML
const canvas = document.getElementById('gameCanvas');
// Create a 2D drawing context for the canvas
const ctx = canvas.getContext('2d');
// Get the score element
const scoreElement = document.getElementById('score');

// --- GAME CONSTANTS & VARIABLES ---
const GRID_SIZE = 20; // Size of each square in the grid
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// The snake is an array of segments (x, y coordinates)
// It starts in the middle of the canvas
let snake = [
    { x: 10, y: 10 }, // Head
    { x: 9, y: 10 },
    { x: 8, y: 10 }
];

// The food's position
let food = {};

// The snake's direction of movement (delta x, delta y)
// Starts moving to the right
let dx = 1;
let dy = 0;

// Game score
let score = 0;

// A flag to prevent the snake from reversing on itself
let changingDirection = false;

// --- MAIN GAME LOOP ---
function main() {
    // Check if the game is over
    if (didGameEnd()) {
        alert("GAME OVER! Your score: " + score);
        // We could restart the game here, but for now, we'll just stop.
        return;
    }

    changingDirection = false;
    
    setTimeout(function onTick() {
        clearCanvas();
        drawFood();
        moveSnake();
        drawSnake();

        // Call main again to create the loop
        main();
    }, 100); // The game speed (100ms = 10 frames per second)
}

// --- CORE FUNCTIONS ---

// Clears the canvas for the next frame
function clearCanvas() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Draws the snake on the canvas
function drawSnake() {
    snake.forEach(drawSnakePart);
}

// Draws one part of the snake's body
function drawSnakePart(snakePart) {
    ctx.fillStyle = 'lightgreen'; // Snake color
    ctx.strokeStyle = 'darkgreen'; // Border color
    ctx.fillRect(snakePart.x * GRID_SIZE, snakePart.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    ctx.strokeRect(snakePart.x * GRID_SIZE, snakePart.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
}

// Moves the snake by updating its position
function moveSnake() {
    // Create the new head of the snake
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    // Add the new head to the beginning of the snake array
    snake.unshift(head);

    // Check if the snake has eaten the food
    const hasEatenFood = snake[0].x === food.x && snake[0].y === food.y;
    if (hasEatenFood) {
        // Increase score
        score += 10;
        scoreElement.textContent = score;
        // Generate new food location
        generateFood();
    } else {
        // Remove the last part of the snake's body
        snake.pop();
    }
}

// Draws the food on the canvas
function drawFood() {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'darkred';
    ctx.fillRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    ctx.strokeRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
}

// Generates a random position for the food
function generateFood() {
    // Find a random x/y coordinate on the grid
    food.x = Math.floor(Math.random() * (CANVAS_WIDTH / GRID_SIZE));
    food.y = Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE));
    
    // If the new food location is where the snake currently is, generate a new one
    snake.forEach(function isFoodOnSnake(part) {
        if (part.x === food.x && part.y === food.y) {
            generateFood();
        }
    });
}

// Checks for game over conditions
function didGameEnd() {
    // Check for collision with itself
    for (let i = 4; i < snake.length; i++) {
        if (snake[i].x === snake[0].x && snake[i].y === snake[0].y) {
            return true;
        }
    }

    // Check for collision with walls
    const hitLeftWall = snake[0].x < 0;
    const hitRightWall = snake[0].x >= CANVAS_WIDTH / GRID_SIZE;
    const hitTopWall = snake[0].y < 0;
    const hitBottomWall = snake[0].y >= CANVAS_HEIGHT / GRID_SIZE;

    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
}

// --- USER INPUT ---
document.addEventListener('keydown', changeDirection);

function changeDirection(event) {
    if (changingDirection) return;
    changingDirection = true;

    const keyPressed = event.key;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    if (keyPressed === 'ArrowLeft' && !goingRight) {
        dx = -1;
        dy = 0;
    }
    if (keyPressed === 'ArrowUp' && !goingDown) {
        dx = 0;
        dy = -1;
    }
    if (keyPressed === 'ArrowRight' && !goingLeft) {
        dx = 1;
        dy = 0;
    }
    if (keyPressed === 'ArrowDown' && !goingUp) {
        dx = 0;
        dy = 1;
    }
}

// --- START THE GAME ---
generateFood(); // Create the first food item
main(); // Start the game loop
