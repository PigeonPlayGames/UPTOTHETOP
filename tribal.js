import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, update, onValue } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBtkOSmD4meTdLdWbOfW53rM75lnYreSZo",
    authDomain: "up-to-battle.firebaseapp.com",
    projectId: "up-to-battle",
    storageBucket: "up-to-battle.appspot.com",
    messagingSenderId: "328069667156",
    appId: "1:328069667156:web:5f36cb5ee1a898b17310c1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const userId = "player1"; // Replace with authentication logic

const resourceElements = {
  wood: document.getElementById("wood-count"),
  stone: document.getElementById("stone-count"),
  iron: document.getElementById("iron-count"),
  score: document.getElementById("player-score"),
};

const buildings = {
  hq: document.getElementById("hq-level"),
  lumber: document.getElementById("lumber-level"),
  quarry: document.getElementById("quarry-level"),
  iron: document.getElementById("iron-level"),
};

function initializePlayer() {
  const userRef = ref(db, `players/${userId}`);
  get(userRef).then((snapshot) => {
    if (!snapshot.exists()) {
      set(userRef, {
        resources: { wood: 100, stone: 100, iron: 100 },
        buildings: { hq: 1, lumber: 1, quarry: 1, iron: 1 },
        score: 0
      });
    }
  });
}

function loadGameData() {
  const userRef = ref(db, `players/${userId}`);
  onValue(userRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      resourceElements.wood.textContent = data.resources.wood;
      resourceElements.stone.textContent = data.resources.stone;
      resourceElements.iron.textContent = data.resources.iron;
      resourceElements.score.textContent = data.score;
      buildings.hq.textContent = data.buildings.hq;
      buildings.lumber.textContent = data.buildings.lumber;
      buildings.quarry.textContent = data.buildings.quarry;
      buildings.iron.textContent = data.buildings.iron;
    }
  });
}

function upgradeBuilding(building) {
  const userRef = ref(db, `players/${userId}`);
  get(userRef).then((snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const cost = 20 * data.buildings[building];
      if (data.resources.wood >= cost && data.resources.stone >= cost) {
        const updates = {
          [`players/${userId}/resources/wood`]: data.resources.wood - cost,
          [`players/${userId}/resources/stone`]: data.resources.stone - cost,
          [`players/${userId}/buildings/${building}`]: data.buildings[building] + 1,
          [`players/${userId}/score`]: data.score + 10,
        };
        update(ref(db), updates);
      } else {
        alert("Not enough resources!");
      }
    }
  });
}

document.querySelectorAll(".upgrade-btn").forEach((button) => {
  button.addEventListener("click", (event) => {
    const building = event.target.dataset.building;
    console.log("Upgrade clicked:", building);
    upgradeBuilding(building);
  });
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  alert("Logged out!"); // Replace with authentication logout logic
});

initializePlayer();
loadGameData();
