// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.processAttack = functions.https.onCall(async (data, context) => {
    // 1. Authenticate the user calling the function
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const attackerUid = context.auth.uid;
    const defenderUid = data.defenderId;
    const { spear, sword, axe } = data.sentTroops; // Troops sent by attacker

    if (attackerUid === defenderUid) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot attack your own village.');
    }

    if (spear < 0 || sword < 0 || axe < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Troop counts cannot be negative.');
    }

    if ((spear + sword + axe) <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'You must send at least 1 troop to attack.');
    }

    // Use a transaction to ensure atomicity for both attacker and defender data
    try {
        await db.runTransaction(async (transaction) => {
            const attackerDocRef = db.collection('villages').doc(attackerUid);
            const defenderDocRef = db.collection('villages').doc(defenderUid);

            const attackerSnap = await transaction.get(attackerDocRef);
            const defenderSnap = await transaction.get(defenderDocRef);

            if (!attackerSnap.exists || !defenderSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Attacker or defender village not found.');
            }

            const attackerData = attackerSnap.data();
            const defenderData = defenderSnap.data();

            // Check if attacker has enough troops *before* battle
            if (
                attackerData.troops.spear < spear ||
                attackerData.troops.sword < sword ||
                attackerData.troops.axe < axe
            ) {
                throw new functions.https.HttpsError('failed-precondition', 'Not enough troops in your village to send that many.');
            }

            // Calculate strengths
            const attackerStrength = spear * 1 + sword * 2 + axe * 3;
            const defenderStrength =
                (defenderData.troops?.spear || 0) * 1 +
                (defenderData.troops?.sword || 0) * 2 +
                (defenderData.troops?.axe || 0) * 3;

            // Initialize results
            let attackerResult = {
                message: '',
                scoreChange: 0,
                woodGained: 0,
                stoneGained: 0,
                ironGained: 0,
                troopsLost: { spear: 0, sword: 0, axe: 0 }
            };
            let defenderResult = {
                message: '',
                troopsLost: { spear: 0, sword: 0, axe: 0 },
                woodLost: 0,
                stoneLost: 0,
                ironLost: 0
            };

            // Deep copy defender's current resources for plunder calculation
            let defenderCurrentWood = defenderData.wood || 0;
            let defenderCurrentStone = defenderData.stone || 0;
            let defenderCurrentIron = defenderData.iron || 0;

            if (attackerStrength > defenderStrength) {
                // Attacker wins
                // Calculate attacker losses
                let damageToAttackerTroops = defenderStrength;
                const attackerLosses = { spear: 0, sword: 0, axe: 0 };

                const calculateLoss = (currentCount, troopPower) => {
                    const loss = Math.min(currentCount, Math.floor(damageToAttackerTroops / troopPower));
                    damageToAttackerTroops -= loss * troopPower;
                    return loss;
                };

                attackerLosses.axe = calculateLoss(axe, 3);
                attackerLosses.sword = calculateLoss(sword, 2);
                attackerLosses.spear = calculateLoss(spear, 1);

                attackerResult.troopsLost = attackerLosses;
                attackerResult.scoreChange = 20;

                // Calculate plunder
                const totalRemainingAttackerTroops = (spear - attackerLosses.spear) + (sword - attackerLosses.sword) + (axe - attackerLosses.axe);
                const totalCapacity = totalRemainingAttackerTroops * 30; // Assuming 30 capacity per remaining troop

                let plundered = { wood: 0, stone: 0, iron: 0 };
                let remainingCapacity = totalCapacity;

                const resourcesArray = [
                    { name: 'wood', amount: defenderCurrentWood },
                    { name: 'stone', amount: defenderCurrentStone },
                    { name: 'iron', amount: defenderCurrentIron }
                ];

                for (const res of resourcesArray) {
                    if (remainingCapacity <= 0) break;
                    const takeAmount = Math.min(res.amount, remainingCapacity);
                    plundered[res.name] = takeAmount;
                    remainingCapacity -= takeAmount;
                }

                attackerResult.woodGained = plundered.wood;
                attackerResult.stoneGained = plundered.stone;
                attackerResult.ironGained = plundered.iron;

                attackerResult.message = `🛡️ Battle Report: Victory!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}\n⚔️ Your Losses: Spear: ${attackerLosses.spear}, Sword: ${attackerLosses.sword}, Axe: ${attackerLosses.axe}\n👥 Enemy Troops Defeated: Spear: ${defenderData.troops.spear || 0}, Sword: ${defenderData.troops.sword || 0}, Axe: ${defenderData.troops.axe || 0} (All wiped out!)\n🎯 Plundered: Wood: ${Math.round(plundered.wood)}, Stone: ${Math.round(plundered.stone)}, Iron: ${Math.round(plundered.iron)}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and lost the battle! You lost all your troops and some resources.`;
                defenderResult.troopsLost = { spear: defenderData.troops?.spear || 0, sword: defenderData.troops?.sword || 0, axe: defenderData.troops?.axe || 0 };
                defenderResult.woodLost = plundered.wood;
                defenderResult.stoneLost = plundered.stone;
                defenderResult.ironLost = plundered.iron;

            } else {
                // Attacker loses
                attackerResult.troopsLost = { spear: spear, sword: sword, axe: axe }; // All attacking troops lost
                attackerResult.scoreChange = -5; // Reduce score for defeat

                attackerResult.message = `🛡️ Battle Report: Defeat!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}\n☠️ All your attacking troops were lost!\n👥 Enemy Troops Remaining: Spear: ${defenderData.troops?.spear || 0}, Sword: ${defenderData.troops.sword || 0}, Axe: ${defenderData.troops.axe || 0}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and defended successfully!`;
                // Defender keeps all troops and resources
                defenderResult.troopsLost = { spear: 0, sword: 0, axe: 0 };
                defenderResult.woodLost = 0;
                defenderResult.stoneLost = 0;
                defenderResult.ironLost = 0;
            }

            // Update attacker's data
            transaction.update(attackerDocRef, {
                'troops.spear': attackerData.troops.spear - attackerResult.troopsLost.spear,
                'troops.sword': attackerData.troops.sword - attackerResult.troopsLost.sword,
                'troops.axe': attackerData.troops.axe - attackerResult.troopsLost.axe,
                wood: attackerData.wood + attackerResult.woodGained,
                stone: attackerData.stone + attackerResult.stoneGained,
                iron: attackerData.iron + attackerResult.ironGained,
                score: Math.max(0, attackerData.score + attackerResult.scoreChange),
                lastBattleMessage: attackerResult.message
            });

            // Update defender's data
            transaction.update(defenderDocRef, {
                'troops.spear': (defenderData.troops?.spear || 0) - defenderResult.troopsLost.spear,
                'troops.sword': (defenderData.troops?.sword || 0) - defenderResult.troopsLost.sword,
                'troops.axe': (defenderData.troops?.axe || 0) - defenderResult.troops.axe, // Fix: Use defenderResult.troopsLost.axe here
                wood: Math.max(0, defenderData.wood - defenderResult.woodLost),
                stone: Math.max(0, defenderData.stone - defenderResult.stoneLost),
                iron: Math.max(0, defenderData.iron - defenderResult.ironLost),
                lastBattleMessage: defenderResult.message
            });
        });

        return { success: true, message: "Battle processed successfully." };

    } catch (error) {
        console.error("Error processing attack:", error);
        if (error.code) {
            throw error;
        } else {
            throw new functions.https.HttpsError('internal', 'An unexpected error occurred during the battle simulation.', error.message);
        }
    }
});
