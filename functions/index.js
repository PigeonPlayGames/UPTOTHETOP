const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const express = require('express');
const app = express();
app.use(express.json());

// Add CORS middleware
const cors = require('cors');
// Configure CORS to allow requests from your GitHub Pages domain and localhost
const corsOptions = {
  origin: ['https://uptothe.top'], // Use your live domain here
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
};

// Use CORS middleware for all routes that need it
app.use(cors(corsOptions));


// Middleware to authenticate requests (for use with fetch)
app.use(async (req, res, next) => {
    // Skip authentication for OPTIONS requests
    if (req.method === 'OPTIONS') {
        next();
        return;
    }

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
app.options('/saveVillage', cors(corsOptions)); // Handle OPTIONS for saveVillage
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

app.options('/attack', cors(corsOptions)); // Handle OPTIONS for attack
app.post('/attack', async (req, res) => {
    const attackerId = req.user.uid; // Get attacker ID from authenticated user
    const defenderId = req.body.defenderId;
    // FIX: your village documents (and your frontend) use spear/sword/axe —
    // this used to read spearman/swordsman, which are never sent, so every
    // attack was silently treated as sending 0 troops.
    const troops = req.body.troops || {};
    const spear = Number(troops.spear) || 0;
    const sword = Number(troops.sword) || 0;
    const axe = Number(troops.axe) || 0;

    // Basic validation
    if (!defenderId) {
        return res.status(400).json({ error: 'Missing required attack information.' });
    }

    if (attackerId === defenderId) {
        return res.status(400).json({ error: 'Cannot attack your own village.' });
    }

    if (spear < 0 || sword < 0 || axe < 0) {
        return res.status(400).json({ error: 'Troop counts cannot be negative.' });
    }

    if (spear + sword + axe <= 0) {
        return res.status(400).json({ error: 'You must send at least 1 troop to attack.' });
    }

    const db = admin.firestore();

    try {
        // FIX: everything the response needs (attackerStrength, defenderStrength,
        // the messages, the plunder) is now built inside the transaction and
        // returned from it, so res.json() below reads a value that's actually
        // in scope — previously it referenced attackerStrength/attackerResult
        // from inside the transaction callback, which threw a ReferenceError
        // on every single request.
        const outcome = await db.runTransaction(async (transaction) => {
            const attackerDocRef = db.collection('villages').doc(attackerId);
            const defenderDocRef = db.collection('villages').doc(defenderId);

            const attackerSnap = await transaction.get(attackerDocRef);
            const defenderSnap = await transaction.get(defenderDocRef);

            if (!attackerSnap.exists || !defenderSnap.exists) {
                throw new Error('Attacker or defender village not found.');
            }

            const attackerData = attackerSnap.data();
            const defenderData = defenderSnap.data();

            const attackerTroops = attackerData.troops || { spear: 0, sword: 0, axe: 0 };

            // Check if attacker has enough troops *before* battle
            if (
                (attackerTroops.spear || 0) < spear ||
                (attackerTroops.sword || 0) < sword ||
                (attackerTroops.axe || 0) < axe
            ) {
                throw new Error('Not enough troops in your village to send that many.');
            }

            // Calculate strengths
            const attackerStrength = spear * 1 + sword * 2 + axe * 3;
            const defenderTroops = defenderData.troops || { spear: 0, sword: 0, axe: 0 };
            const defenderSpear = defenderTroops.spear || 0;
            const defenderSword = defenderTroops.sword || 0;
            const defenderAxe = defenderTroops.axe || 0;
            const defenderStrength = defenderSpear * 1 + defenderSword * 2 + defenderAxe * 3;

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

            const defenderCurrentWood = defenderData.wood || 0;
            const defenderCurrentStone = defenderData.stone || 0;
            const defenderCurrentIron = defenderData.iron || 0;

            if (attackerStrength > defenderStrength) {
                // Attacker wins
                let damageToAttackerTroops = defenderStrength;
                const calculateLoss = (sentCount, troopPower) => {
                    const loss = Math.min(sentCount, Math.floor(damageToAttackerTroops / troopPower));
                    damageToAttackerTroops -= loss * troopPower;
                    return loss;
                };

                const attackerLosses = {
                    axe: calculateLoss(axe, 3),
                    sword: calculateLoss(sword, 2),
                    spear: calculateLoss(spear, 1)
                };

                attackerResult.troopsLost = attackerLosses;
                attackerResult.scoreChange = 20;

                const totalRemainingAttackerTroops =
                    (spear - attackerLosses.spear) + (sword - attackerLosses.sword) + (axe - attackerLosses.axe);
                const totalCapacity = totalRemainingAttackerTroops * 30;

                const plundered = { wood: 0, stone: 0, iron: 0 };
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

                attackerResult.message = `🛡️ Battle Report: Victory!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}\n⚔️ Your Losses: Spear: ${attackerLosses.spear}, Sword: ${attackerLosses.sword}, Axe: ${attackerLosses.axe}\n👥 Enemy Troops Defeated: Spear: ${defenderSpear}, Sword: ${defenderSword}, Axe: ${defenderAxe} (All wiped out!)\n🎯 Plundered: Wood: ${Math.round(plundered.wood)}, Stone: ${Math.round(plundered.stone)}, Iron: ${Math.round(plundered.iron)}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and lost the battle! You lost all your troops and some resources.`;
                defenderResult.troopsLost = { spear: defenderSpear, sword: defenderSword, axe: defenderAxe };
                defenderResult.woodLost = plundered.wood;
                defenderResult.stoneLost = plundered.stone;
                defenderResult.ironLost = plundered.iron;

            } else {
                // Attacker loses
                attackerResult.troopsLost = { spear, sword, axe };
                attackerResult.scoreChange = -5;

                attackerResult.message = `🛡️ Battle Report: Defeat!\nYou attacked ${defenderData.username}'s village.\n-------------------------------\n💥 Your Troops Sent: Spear: ${spear}, Sword: ${sword}, Axe: ${axe}\n☠️ All your attacking troops were lost!\n👥 Enemy Troops Remaining: Spear: ${defenderSpear}, Sword: ${defenderSword}, Axe: ${defenderAxe}`;
                defenderResult.message = `Your village was attacked by ${attackerData.username} and defended successfully!`;
                defenderResult.troopsLost = { spear: 0, sword: 0, axe: 0 };
                defenderResult.woodLost = 0;
                defenderResult.stoneLost = 0;
                defenderResult.ironLost = 0;
            }

            transaction.update(attackerDocRef, {
                'troops.spear': (attackerTroops.spear || 0) - attackerResult.troopsLost.spear,
                'troops.sword': (attackerTroops.sword || 0) - attackerResult.troopsLost.sword,
                'troops.axe': (attackerTroops.axe || 0) - attackerResult.troopsLost.axe,
                wood: (attackerData.wood || 0) + attackerResult.woodGained,
                stone: (attackerData.stone || 0) + attackerResult.stoneGained,
                iron: (attackerData.iron || 0) + attackerResult.ironGained,
                score: Math.max(0, (attackerData.score || 0) + attackerResult.scoreChange),
                lastBattleMessage: attackerResult.message
            });

            transaction.update(defenderDocRef, {
                'troops.spear': (defenderTroops.spear || 0) - defenderResult.troopsLost.spear,
                'troops.sword': (defenderTroops.sword || 0) - defenderResult.troopsLost.sword,
                'troops.axe': (defenderTroops.axe || 0) - defenderResult.troopsLost.axe,
                wood: Math.max(0, (defenderData.wood || 0) - defenderResult.woodLost),
                stone: Math.max(0, (defenderData.stone || 0) - defenderResult.stoneLost),
                iron: Math.max(0, (defenderData.iron || 0) - defenderResult.ironLost),
                lastBattleMessage: defenderResult.message
            });

            // This is what fixes the ReferenceError: everything res.json() needs
            // comes back out of the transaction as a plain return value.
            return {
                victory: attackerStrength > defenderStrength,
                message: attackerResult.message,
                plunder: attackerStrength > defenderStrength
                    ? { wood: attackerResult.woodGained, stone: attackerResult.stoneGained, iron: attackerResult.ironGained }
                    : null
            };
        });

        res.json({
            outcome: outcome.victory ? 'Victory!' : 'Defeat!',
            message: outcome.message,
            plunder: outcome.plunder
        });

    } catch (error) {
        console.error("Error processing attack:", error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred during the battle simulation.' });
    }
});

exports.game = onRequest(app); // Export the Express app as an onRequest function
