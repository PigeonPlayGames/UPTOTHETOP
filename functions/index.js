const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const express = require('express');
const app = express();

// Add CORS middleware
const cors = require('cors');
// Configure CORS to allow requests from your GitHub Pages domain and localhost
const corsOptions = {
  origin: ['https://uptothe.top'], // Use your live domain here
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
};

app.use(cors(corsOptions));



// Middleware to authenticate requests (for use with fetch)
app.use(async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        res.status(401).json({ error: 'Unauthorized: No token provided.' });
        return;
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // Attach user info to the request
        next(); // Continue to the next middleware or route handler
    } catch (error) {
        console.error('Error verifying ID token:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }
});

// Route to handle saving village data
app.post('/saveVillage', async (req, res) => {
    const userId = req.user.uid; // Get user ID from authenticated user
    const villageDataToSave = req.body;

    // Basic validation (you might want more comprehensive validation here)
    if (!villageDataToSave) {
        return res.status(400).json({ error: 'Missing village data.' });
    }

    const db = admin.firestore();

    try {
        // Save the village data to Firestore under the authenticated user's ID
        await db.collection('villages').doc(userId).set(villageDataToSave, { merge: true }); // Use merge: true to avoid overwriting the whole document

        res.status(200).json({ success: true, message: 'Village data saved successfully.' });

    } catch (error) {
        console.error('Error saving village data:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred while saving village data.' });
    }
});


app.post('/attack', async (req, res) => {
    const attackerId = req.user.uid; // Get attacker ID from authenticated user
    const defenderId = req.body.defenderId;
    const troops = req.body.troops;

    // Basic validation
    if (!defenderId || !troops) {
        return res.status(400).json({ error: 'Missing required attack information.' });
    }

    if (attackerId === defenderId) {
        return res.status(400).json({ error: 'Cannot attack your own village.' });
    }

    if ((troops.spearman || 0) < 0 || (troops.swordsman || 0) < 0 || (troops.axe || 0) < 0) {
        return res.status(400).json({ error: 'Troop counts cannot be negative.' });
    }

    if (((troops.spearman || 0) + (troops.swordsman || 0) + (troops.axe || 0)) <= 0) {
        return res.status(400).json({ error: 'You must send at least 1 troop to attack.' });
    }


    const db = admin.firestore();

    try {
        // Use a transaction to ensure atomicity for both attacker and defender data
        await db.runTransaction(async (transaction) => {
            const attackerDocRef = db.collection('villages').doc(attackerId);
            const defenderDocRef = db.collection('villages').doc(defenderId);

            const attackerSnap = await transaction.get(attackerDocRef);
            const defenderSnap = await transaction.get(defenderDocRef);

            if (!attackerSnap.exists || !defenderSnap.exists) {
                throw new Error('Attacker or defender village not found.'); // Use standard Error in transactions
            }

            const attackerData = attackerSnap.data();
            const defenderData = defenderSnap.data();

             // Check if attacker has enough troops *before* battle
            if (
                (attackerData.troops.spear || 0) < (troops.spearman || 0) ||
                (attackerData.troops.sword || 0) < (troops.swordsman || 0) ||
                (attackerData.troops.axe || 0) < (troops.axe || 0)
            ) {
                throw new Error('Not enough troops in your village to send that many.'); // Use standard Error in transactions
            }


            // Calculate strengths
            const attackerStrength = (troops.spearman || 0) * 1 + (troops.swordsman || 0) * 2 + (troops.axe || 0) * 3;
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

                const calculateLoss = (currentCount, troopPower, sentCount) => {
                     const loss = Math.min(sentCount, Math.floor(damageToAttackerTroops / troopPower));
                    damageToAttackerTroops -= loss * troopPower;
                    return loss;
                };

                attackerLosses.axe = calculateLoss((troops.axe || 0), 3, (troops.axe || 0));
                attackerLosses.sword = calculateLoss((troops.swordsman || 0), 2, (troops.swordsman || 0));
                attackerLosses.spear = calculateLoss((troops.spearman || 0), 1, (troops.spearman || 0));


                attackerResult.troopsLost = attackerLosses;
                attackerResult.scoreChange = 20;

                // Calculate plunder
                const totalRemainingAttackerTroops = ((troops.spearman || 0) - attackerLosses.spear) + ((troops.swordsman || 0) - attackerLosses.sword) + ((troops.axe || 0) - attackerLosses.axe);
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

                 attackerResult.message = `🛡️ Battle Report: Victory!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${troops.spearman || 0}, Sword: ${troops.swordsman || 0}, Axe: ${troops.axe || 0}\n⚔️ Your Losses: Spear: ${attackerLosses.spear}, Sword: ${attackerLosses.sword}, Axe: ${attackerLosses.axe}\n👥 Enemy Troops Defeated: Spear: ${defenderData.troops.spear || 0}, Sword: ${defenderData.troops.sword || 0}, Axe: ${defenderData.troops.axe || 0} (All wiped out!)\n🎯 Plundered: Wood: ${Math.round(plundered.wood)}, Stone: ${Math.round(plundered.stone)}, Iron: ${Math.round(plundered.iron)}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and lost the battle! You lost all your troops and some resources.`;
                defenderResult.troopsLost = { spear: defenderData.troops?.spear || 0, sword: defenderData.troops?.sword || 0, axe: defenderData.troops?.axe || 0 };
                defenderResult.woodLost = plundered.wood;
                defenderResult.stoneLost = plundered.stone;
                defenderResult.ironLost = plundered.iron;


            } else {
                // Attacker loses
                attackerResult.troopsLost = { spear: (troops.spearman || 0), sword: (troops.swordsman || 0), axe: (troops.axe || 0) }; // All attacking troops lost
                attackerResult.scoreChange = -5; // Reduce score for defeat

                attackerResult.message = `🛡️ Battle Report: Defeat!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${troops.spearman || 0}, Sword: ${troops.swordsman || 0}, Axe: ${troops.axe || 0}\n☠️ All your attacking troops were lost!\n👥 Enemy Troops Remaining: Spear: ${defenderData.troops?.spear || 0}, Sword: ${defenderData.troops.sword || 0}, Axe: ${defenderData.troops.axe || 0}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and defended successfully!`;
                // Defender keeps all troops and resources
                 defenderResult.troopsLost = { spear: 0, sword: 0, axe: 0 };
                defenderResult.woodLost = 0;
                defenderResult.stoneLost = 0;
                defenderResult.ironLost = 0;
            }

            // Update attacker's data
            transaction.update(attackerDocRef, {
                'troops.spear': (attackerData.troops.spear || 0) - attackerResult.troopsLost.spear,
                'troops.sword': (attackerData.troops.sword || 0) - attackerResult.troopsLost.sword,
                'troops.axe': (attackerData.troops.axe || 0) - attackerResult.troopsLost.axe,
                wood: (attackerData.wood || 0) + attackerResult.woodGained,
                stone: (attackerData.stone || 0) + attackerResult.stoneGained,
                iron: (attackerData.iron || 0) + attackerResult.ironGained,
                score: Math.max(0, (attackerData.score || 0) + attackerResult.scoreChange),
                lastBattleMessage: attackerResult.message
            });

            // Update defender's data
            transaction.update(defenderDocRef, {
                'troops.spear': (defenderData.troops?.spear || 0) - defenderResult.troopsLost.spear,
                'troops.sword': (defenderData.troops?.sword || 0) - defenderResult.troopsLost.sword,
                'troops.axe': (defenderData.troops?.axe || 0) - defenderResult.troopsLost.axe,
                wood: Math.max(0, (defenderData.wood || 0) - defenderResult.woodLost),
                stone: Math.max(0, (defenderData.stone || 0) - defenderResult.stoneLost),
                iron: Math.max(0, (defenderData.iron || 0) - defenderResult.ironLost),
                 lastBattleMessage: defenderResult.message
            });
        });

         res.json({ outcome: attackerStrength > defenderStrength ? 'Victory!' : 'Defeat!', plunder: attackerStrength > defenderStrength ? { wood: attackerResult.woodGained, stone: attackerResult.stoneGained, iron: attackerResult.ironGained } : null });

    } catch (error) {
        console.error("Error processing attack:", error);
        // Respond with a structured error
        res.status(500).json({ error: error.message || 'An unexpected error occurred during the battle simulation.' });
    }
});

exports.game = onRequest(app); // Export the Express app as an onRequest function
