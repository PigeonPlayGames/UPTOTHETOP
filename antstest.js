// antstest.js

// --- Game State Variables ---
let gameInterval; // Stores the interval ID for the game loop
let isGameRunning = false; // Flag to track if the game is currently running

let totalAntCount = 0; // Total number of ants (Worker + Soldier + Queen)
let workerAntCount = 0; // Number of worker ants
let soldierAntCount = 0; // Number of soldier ants
let queenAnt = null; // The Queen Ant object

let foodCount = 0; // Initial food gathered
const foodPerAnt = 10; // Food required to create a new ant
const maxAnts = 100; // Maximum number of ants allowed in the colony
let populationCap = 10; // Initial population capacity

const ants = []; // Array to hold all ant objects (Workers and Soldiers)
const foodSources = []; // Array to hold all food source objects

// --- Canvas and Context ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- UI Elements ---
const antCountSpan = document.getElementById('antCount');
const workerAntCountSpan = document.getElementById('workerAntCount');
const soldierAntCountSpan = document.getElementById('soldierAntCount');
const queenStatusSpan = document.getElementById('queenStatus');
const foodCountSpan = document.getElementById('foodCount');
const populationCapSpan = document.getElementById('populationCap');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const gameLogDiv = document.getElementById('gameLog');

// --- Game Settings ---
const gameSpeed = 100; // Milliseconds per game tick (lower is faster)
const antSize = 8; // Size of an ant for drawing
const foodSize = 12; // Size of a food source for drawing
const canvasPadding = 20; // Padding from canvas edges for ant movement/food placement
const nestRadius = antSize * 3; // Radius of the nest area

// --- Ant Base Class ---
class Ant {
    constructor(id, x, y, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.type = type; // 'worker', 'soldier', 'queen'
        this.speed = 2; // Default speed
        this.targetX = x;
        this.targetY = y;
        this.state = 'idle'; // 'idle', 'wandering', 'seeking_food', 'returning_food', 'patrolling'
    }

    // Method to set a new random target within canvas bounds
    setRandomTarget() {
        this.targetX = Math.random() * (canvas.width - antSize * 2 - canvasPadding * 2) + antSize + canvasPadding;
        this.targetY = Math.random() * (canvas.height - antSize * 2 - canvasPadding * 2) + antSize + canvasPadding;
    }

    // Method to move the ant towards its target
    move() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.speed) {
            this.x = this.targetX;
            this.y = this.targetY;
            // If arrived at target, set a new one or change state based on current state
            if (this.state === 'wandering' || this.state === 'patrolling' || this.state === 'idle') {
                this.setRandomTarget(); // For wandering/patrolling, keep setting new targets
            }
            // Specific state transitions will be handled in subclasses or main game loop
        } else {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }

    // Method to draw the ant on the canvas (placeholder, overridden by subclasses)
    draw() {
        // This will be overridden by specific ant types
    }
}

// --- Worker Ant Class ---
class WorkerAnt extends Ant {
    constructor(id, x, y) {
        super(id, x, y, 'worker');
        this.color = 'brown';
        this.speed = 1.5; // Slightly slower than default for gathering
        this.hasFood = false; // Does the worker ant carry food?
        this.state = 'wandering'; // Workers start by wandering
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, antSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw a small green dot if the ant has food
        if (this.hasFood) {
            ctx.fillStyle = 'green';
            ctx.beginPath();
            ctx.arc(this.x + antSize / 4, this.y - antSize / 4, antSize / 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// --- Soldier Ant Class ---
class SoldierAnt extends Ant {
    constructor(id, x, y) {
        super(id, x, y, 'soldier');
        this.color = 'darkred'; // Distinct color for soldiers
        this.speed = 2.5; // Faster for patrolling/defense
        this.state = 'patrolling'; // Soldiers start by patrolling
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, antSize / 2 + 1, 0, Math.PI * 2); // Slightly larger
        ctx.fill();

        // Add a small "helmet" or mark for soldier
        ctx.fillStyle = 'gray';
        ctx.beginPath();
        ctx.arc(this.x, this.y - antSize / 3, antSize / 3, 0, Math.PI);
        ctx.fill();
    }
}

// --- Queen Ant Class ---
class QueenAnt extends Ant {
    constructor(id, x, y) {
        super(id, x, y, 'queen');
        this.color = 'purple'; // Royal color for the queen
        this.speed = 0; // Queen does not move
        this.x = x; // Queen stays at fixed nest position
        this.y = y; // Queen stays at fixed nest position
        this.reproductionRate = 100; // How many game ticks before next reproduction attempt
        this.reproductionTimer = 0;
    }

    // Queen does not move, so override move method to do nothing
    move() {
        // Queen stays put
    }

    // Method for the Queen to reproduce
    reproduce() {
        this.reproductionTimer++;
        if (this.reproductionTimer >= this.reproductionRate) {
            if (foodCount >= foodPerAnt && totalAntCount < maxAnts) {
                foodCount -= foodPerAnt; // Consume food
                totalAntCount++; // Increment total ant count
                const newAntId = ants.length;
                const spawnX = canvas.width / 2 + (Math.random() - 0.5) * 30;
                const spawnY = canvas.height / 2 + (Math.random() - 0.5) * 30;

                // For now, Queen only produces Worker Ants
                const newAnt = new WorkerAnt(newAntId, spawnX, spawnY);
                newAnt.setRandomTarget();
                ants.push(newAnt);
                workerAntCount++; // Increment worker ant count
                populationCap = Math.min(maxAnts, populationCap + 1); // Increase population cap slightly
                logMessage(`A new Worker Ant (Ant ${newAntId}) was born! Total ants: ${totalAntCount}`);
            }
            this.reproductionTimer = 0; // Reset timer regardless of successful reproduction
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, antSize * 1.5, 0, Math.PI * 2); // Larger size for queen
        ctx.fill();
        ctx.strokeStyle = 'gold'; // Gold outline for queen
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw a small crown or symbol
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.moveTo(this.x - antSize, this.y - antSize * 2);
        ctx.lineTo(this.x + antSize, this.y - antSize * 2);
        ctx.lineTo(this.x + antSize / 2, this.y - antSize * 1.5);
        ctx.lineTo(this.x, this.y - antSize * 2);
        ctx.lineTo(this.x - antSize / 2, this.y - antSize * 1.5);
        ctx.closePath();
        ctx.fill();
    }
}


// --- Food Source Class (unchanged) ---
class FoodSource {
    constructor(id, x, y, amount) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.amount = amount; // How much food is left at this source
        this.color = 'orange';
    }

    // Method to draw the food source
    draw() {
        if (this.amount > 0) {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, foodSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.amount, this.x, this.y);
        }
    }
}

// --- Game Functions ---

// Function to add a message to the game log
function logMessage(message) {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    gameLogDiv.prepend(p); // Add new messages to the top
    if (gameLogDiv.children.length > 20) { // Keep log from getting too long
        gameLogDiv.removeChild(gameLogDiv.lastChild);
    }
}

// Function to update the UI display
function updateUI() {
    totalAntCount = workerAntCount + soldierAntCount + (queenAnt ? 1 : 0);
    antCountSpan.textContent = totalAntCount;
    workerAntCountSpan.textContent = workerAntCount;
    soldierAntCountSpan.textContent = soldierAntCount;
    queenStatusSpan.textContent = queenAnt ? 'Present' : 'Absent';
    foodCountSpan.textContent = foodCount;
    populationCapSpan.textContent = populationCap;
}

// Function to spawn initial ants
function spawnInitialAnts() {
    // Spawn the Queen Ant first
    const queenX = canvas.width / 2;
    const queenY = canvas.height / 2;
    queenAnt = new QueenAnt(0, queenX, queenY);
    logMessage('The Queen Ant has established her nest!');

    // Spawn initial Worker Ants
    for (let i = 0; i < 5; i++) { // Start with 5 worker ants
        const newAnt = new WorkerAnt(ants.length, queenX + (Math.random() - 0.5) * 50, queenY + (Math.random() - 0.5) * 50);
        newAnt.setRandomTarget();
        ants.push(newAnt);
        workerAntCount++;
    }
    logMessage(`A new colony of ${workerAntCount} Worker Ants has been established!`);
    totalAntCount = workerAntCount + soldierAntCount + 1; // Update total count
}

// Function to spawn food sources
function spawnFoodSource(amount = 50) {
    const foodId = foodSources.length;
    const foodX = Math.random() * (canvas.width - foodSize * 2 - canvasPadding * 2) + foodSize + canvasPadding;
    const foodY = Math.random() * (canvas.height - foodSize * 2 - canvasPadding * 2) + foodSize + canvasPadding;
    const newFood = new FoodSource(foodId, foodX, foodY, amount);
    foodSources.push(newFood);
    logMessage(`A new food source (${amount} units) appeared at (${Math.round(foodX)}, ${Math.round(foodY)}).`);
}

// Function to handle ant-food interaction (only for Worker Ants)
function handleAntFoodInteraction() {
    ants.forEach(ant => {
        if (ant.type === 'worker') { // Only worker ants gather food
            // If ant is wandering, check for nearby food sources
            if (ant.state === 'wandering' && !ant.hasFood) {
                let closestFood = null;
                let minDistance = Infinity;

                foodSources.forEach(food => {
                    if (food.amount > 0) {
                        const dx = ant.x - food.x;
                        const dy = ant.y - food.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < minDistance) {
                            minDistance = distance;
                            closestFood = food;
                        }
                    }
                });

                // If food is found within a certain range, set it as target
                if (closestFood && minDistance < 100) { // Ants detect food within 100 pixels
                    ant.state = 'seeking_food';
                    ant.targetX = closestFood.x;
                    ant.targetY = closestFood.y;
                }
            }

            // If ant is seeking food and has reached it
            if (ant.state === 'seeking_food') {
                const dx = ant.x - ant.targetX;
                const dy = ant.y - ant.targetY;
                const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

                if (distanceToTarget < (antSize / 2 + foodSize / 2) && !ant.hasFood) {
                    // Ant has reached food source, pick up food
                    const targetFood = foodSources.find(f => f.x === ant.targetX && f.y === ant.targetY);
                    if (targetFood && targetFood.amount > 0) {
                        targetFood.amount--; // Decrease food at source
                        ant.hasFood = true;
                        ant.state = 'returning_food';
                        // Set target back to nest (Queen's position)
                        ant.targetX = queenAnt.x;
                        ant.targetY = queenAnt.y;
                        logMessage(`Worker Ant ${ant.id} picked up food.`);
                    } else {
                        // Food source depleted or invalid, go back to wandering
                        ant.state = 'wandering';
                        ant.setRandomTarget();
                    }
                }
            }

            // If ant is returning food and has reached the nest
            if (ant.state === 'returning_food') {
                const dx = ant.x - queenAnt.x;
                const dy = ant.y - queenAnt.y;
                const distanceToNest = Math.sqrt(dx * dx + dy * dy);

                if (distanceToNest < nestRadius && ant.hasFood) { // Ant reached the nest area
                    foodCount++; // Add food to colony's total
                    ant.hasFood = false;
                    ant.state = 'wandering'; // Go back to wandering
                    ant.setRandomTarget();
                    logMessage(`Worker Ant ${ant.id} returned food. Colony food: ${foodCount}`);
                }
            }
        }
    });
}

// Main game update loop
function gameLoop() {
    if (!isGameRunning) return; // Stop if game is paused

    // Update ant positions and states
    ants.forEach(ant => ant.move());

    // Queen's actions
    if (queenAnt) {
        queenAnt.reproduce();
    }

    // Handle interactions (food gathering)
    handleAntFoodInteraction();

    // Redraw everything
    drawGame();

    // Update UI
    updateUI();
}

// Function to draw all game elements
function drawGame() {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw food sources
    foodSources.forEach(food => food.draw());

    // Draw ants
    ants.forEach(ant => ant.draw());

    // Draw the Queen Ant
    if (queenAnt) {
        queenAnt.draw();
    }

    // Draw the "nest" area (a simple circle in the center)
    ctx.fillStyle = 'rgba(100, 70, 0, 0.5)'; // Semi-transparent brown
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, nestRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 70, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// --- Event Listeners ---
startButton.addEventListener('click', () => {
    if (!isGameRunning) {
        isGameRunning = true;
        logMessage('Simulation started!');
        // Ensure initial ants are spawned only once at the very beginning
        if (ants.length === 0 && !queenAnt) { // Check if no ants and no queen
            spawnInitialAnts();
            spawnFoodSource(100); // Initial large food source
            spawnFoodSource(75);  // Another initial food source
        }
        gameInterval = setInterval(gameLoop, gameSpeed);
        startButton.disabled = true;
        pauseButton.disabled = false;
    }
});

pauseButton.addEventListener('click', () => {
    if (isGameRunning) {
        isGameRunning = false;
        clearInterval(gameInterval);
        logMessage('Simulation paused.');
        startButton.disabled = false;
        pauseButton.disabled = true;
    }
});

// --- Initialization ---
// Set initial canvas size based on its container, and resize on window resize
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = Math.min(canvas.offsetWidth * 0.75, 600); // Maintain aspect ratio, max height 600px
    drawGame(); // Redraw content after resize
}

window.addEventListener('resize', resizeCanvas);
window.onload = function() {
    resizeCanvas(); // Set initial size on load
    updateUI(); // Update UI with initial values
    logMessage('Game loaded. Press "Start Simulation" to begin!');
    pauseButton.disabled = true; // Pause button disabled until game starts
};
