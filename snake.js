// --- SETUP ---
// Get all the necessary elements from our HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');

// Get the on-screen buttons for touch controls
const btnUp = document.getElementById('btnUp');
const btnLeft = document.getElementById('btnLeft');
const btnDown = document.getElementById('btnDown');
const btnRight = document.getElementById('btnRight');


// --- GAME CONSTANTS & VARIABLES ---
const GRID_SIZE = 20; // Size of each square in the grid (e.g., snake part, food)
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// The snake is an array of segments, where each segment has an x and y coordinate.
// It starts in the middle of the canvas, 3 segments long.
let snake = [
    { x: 10, y: 10 }, // Head is the first element
    { x: 9, y: 10 },
    { x: 8, y: 10 }
];

// The food's position, initialized as an empty object.
let food = {};

// The snake's direction of movement, represented by a change in x and y.
// Starts moving to the right (dx=1, dy=0).
let dx = 1;
let dy = 0;

// Game score
let score = 0;

// A flag to prevent the snake from reversing on itself in the same game tick.
let changingDirection = false;


// --- MAIN GAME LOOP ---
// This function is the heart of the game. It runs repeatedly to update the game state.
function main() {
    // Check if the game has ended (e.g., snake hit a wall or itself).
    if (didGameEnd()) {
        alert("GAME OVER! Your score: " + score);
        // We could add a "Play Again" feature here, but for now, we'll just stop the loop.
        return;
    }

    // Reset the direction change lock for the new frame
    changingDirection = false;
    
    // Set a timeout to run the next game tick. This controls the game's speed.
    setTimeout(function onTick() {
        clearCanvas();
        drawFood();
        moveSnake();
        drawSnake();

        // Recursively call main() to create the continuous game loop
        main();
    }, 100); // Game speed: 100ms delay = 10 frames per second.
}


// --- CORE GAME FUNCTIONS ---

/**
 * Clears the entire canvas, painting it black for the next frame.
 */
function clearCanvas() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * Draws the entire snake on the canvas by iterating through its segments.
 */
function drawSnake() {
    snake.forEach(drawSnakePart);
}

/**
 * Draws a single segment of the snake's body.
 * @param {object} snakePart - An object with x and y properties for the segment's position.
 */
function drawSnakePart(snakePart) {
    ctx.fillStyle = 'lightgreen'; // Snake color
    ctx.strokeStyle = 'darkgreen'; // Border color
    ctx.fillRect(snakePart.x * GRID_SIZE, snakePart.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    ctx.strokeRect(snakePart.x * GRID_SIZE, snakePart.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
}

/**
 * Updates the snake's position and handles food consumption.
 */
function moveSnake() {
    // Create a new head for the snake based on the current direction.
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    // Add the new head to the beginning of the snake array.
    snake.unshift(head);

    // Check if the snake's head is at the same position as the food.
    const hasEatenFood = snake[0].x === food.x && snake[0].y === food.y;
    if (hasEatenFood) {
        // Increase the score and update the display.
        score += 10;
        scoreElement.textContent = score;
        // Generate a new location for the food.
        generateFood();
    } else {
        // If no food was eaten, remove the last segment of the snake's body to simulate movement.
        snake.pop();
    }
}

/**
 * Draws the food on the canvas.
 */
function drawFood() {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'darkred';
    ctx.fillRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    ctx.strokeRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
}

/**
 * Generates a random position for the food and ensures it's not on the snake.
 */
function generateFood() {
    // Find a random x/y coordinate on the grid.
    food.x = Math.floor(Math.random() * (CANVAS_WIDTH / GRID_SIZE));
    food.y = Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE));
    
    // If the new food location is where the snake currently is, we must generate a new one.
    snake.forEach(function isFoodOnSnake(part) {
        if (part.x === food.x && part.y === food.y) {
            generateFood(); // Recursively call until a valid spot is found.
        }
    });
}

/**
 * Checks for game-ending conditions: collision with walls or with itself.
 * @returns {boolean} - True if the game should end, otherwise false.
 */
function didGameEnd() {
    // Check for collision with itself.
    // We start the loop at 4 because it's impossible for the head to hit the first few segments.
    for (let i = 4; i < snake.length; i++) {
        if (snake[i].x === snake[0].x && snake[i].y === snake[0].y) {
            return true;
        }
    }

    // Check for collision with walls.
    const hitLeftWall = snake[0].x < 0;
    const hitRightWall = snake[0].x >= CANVAS_WIDTH / GRID_SIZE;
    const hitTopWall = snake[0].y < 0;
    const hitBottomWall = snake[0].y >= CANVAS_HEIGHT / GRID_SIZE;

    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
}


// --- USER INPUT HANDLING ---

/**
 * Handles input from both keyboard and on-screen buttons to change the snake's direction.
 * @param {Event} event - The keyboard event or a simulated event from a button click.
 */
function changeDirection(event) {
    // If a direction change has already happened in this tick, do nothing.
    if (changingDirection) return;
    changingDirection = true;

    const keyPressed = event.key;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    // Prevent the snake from reversing on itself.
    // e.g., if moving right, don't allow a move to the left.
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

// Listen for keyboard presses
document.addEventListener('keydown', changeDirection);

// Listen for clicks on the on-screen buttons
// We pass a "fake" event object with the correct 'key' property to reuse our changeDirection function.
btnUp.addEventListener('click', () => changeDirection({ key: 'ArrowUp' }));
btnLeft.addEventListener('click', () => changeDirection({ key: 'ArrowLeft' }));
btnDown.addEventListener('click', () => changeDirection({ key: 'ArrowDown' }));
btnRight.addEventListener('click', () => changeDirection({ key: 'ArrowRight' }));


// --- START THE GAME ---
generateFood(); // Create the first piece of food.
main();         // Start the game loop.
