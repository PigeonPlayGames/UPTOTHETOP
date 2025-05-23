// troops.js
export function initTroops(db, user, villageData, saveVillageData, updateUI) {
    document.getElementById("recruit-btn").addEventListener("click", () => {
        if (!villageData) return;

        const cost = 100;
        if (villageData.wood >= cost && villageData.iron >= cost) {
            villageData.wood -= cost;
            villageData.iron -= cost;
            villageData.troops = (villageData.troops || 0) + 1;
            saveVillageData();
            updateUI();
            alert("Troop recruited!");
        } else {
            alert("Not enough resources to recruit a troop.");
        }
    });
}
