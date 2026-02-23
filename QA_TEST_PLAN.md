# Battleship Game - QA Test Plan

> Structured manual + logic-focused test plan for the browser-based Battleship MVP.

---

## A. Turn / Interaction Safety

| # | Test Name | Steps to Reproduce | Expected Result | Severity |
|---|---|---|---|---|
| A1 | Player cannot attack before Start | Load game. Click any enemy board cell. | Status shows "Start the game first!" No board state changes. | HIGH |
| A2 | Player cannot attack same cell twice | Start game. Click enemy cell (e.g., A1). Click the same cell again. | Status shows "You already targeted that cell." No duplicate log entry. | HIGH |
| A3 | Player cannot attack during AI turn | Start game. Attack enemy cell. Immediately click another enemy cell while "Enemy is thinking..." is shown. | Second click is ignored. No attack resolves until AI finishes. | HIGH |
| A4 | Game ignores clicks after game over | Play until one side wins. Click enemy board cells after game-over overlay appears. | No attacks register. Phase is GAME_OVER so all clicks are ignored. | HIGH |
| A5 | AI does not take extra turns | Play several rounds. Observe that after each AI attack, status returns to "Your turn!" and the player must click to trigger the next cycle. | Exactly one AI move per player move. No double AI attacks. | HIGH |
| A6 | Randomize disabled during gameplay | Start game. Click "Randomize Ships" button. | Button is grayed out and disabled. No status error message needed. | MEDIUM |
| A7 | Start button disabled after game starts | Start game. Observe Start button state. | Start button is disabled and non-interactive during PLAYING phase. | LOW |

## B. AI Validity

| # | Test Name | Steps to Reproduce | Expected Result | Severity |
|---|---|---|---|---|
| B1 | AI never attacks same cell twice | Play a full game. Monitor the move log for duplicate AI attack coordinates. | Every AI attack targets a unique cell. No duplicates in log. | HIGH |
| B2 | AI only attacks in-bounds cells | Play a full game. Check all AI attack coordinates in the log are A1-J10. | All coordinates are valid (rows A-J, columns 1-10). | HIGH |
| B3 | AI target mode doesn't get stuck | Arrange scenario where AI hits a ship near board edge. Let AI continue targeting. | AI successfully completes targeting and either sinks the ship or exhausts candidates and returns to hunt mode. | MEDIUM |
| B4 | AI target memory clears after sinking | Let AI sink one of your ships. Observe next AI move. | AI returns to hunt mode (random targeting) after sinking a ship. No stale candidates from the previous ship. | MEDIUM |
| B5 | AI works after restart | Start game, play a few turns, restart, start new game. | AI makes valid moves in the new game with no errors. | HIGH |

## C. State Reset / Restart

| # | Test Name | Steps to Reproduce | Expected Result | Severity |
|---|---|---|---|---|
| C1 | Restart clears boards | During gameplay, click Restart. | Both boards are empty. Player board has no ships. Enemy board has no hits/misses. | HIGH |
| C2 | Restart clears move log | During gameplay with several moves logged, click Restart. | Move log is empty. Status reads "Setup your game". | HIGH |
| C3 | Restart clears AI timers | During AI "thinking" phase (within 800ms), click Restart. | No ghost AI move fires. New game starts cleanly. | HIGH |
| C4 | Restart clears AI memory | During gameplay where AI is in target mode (has hit a ship), click Restart, start new game. | AI starts in hunt mode. No stale candidate targets from previous game. | HIGH |
| C5 | No duplicate event listeners after restart | Restart 5+ times, then start a new game. Click an enemy cell. | Exactly one attack registers per click. Move log shows one entry. | MEDIUM |
| C6 | Multiple restarts work cleanly | Restart 10 times in a row, then Randomize + Start. Play a full turn. | Game functions normally with no errors or state corruption. | MEDIUM |
| C7 | Restart from game-over overlay | Win or lose a game. Click "Play Again" on overlay. | Overlay closes. Boards reset. Ship bank reappears. Phase is SETUP. | HIGH |
| C8 | Fast restart + start race condition | Start game. During AI turn, click Restart, then quickly Randomize + Start (within 800ms). | No ghost AI move from previous game. New game starts with player's turn. | HIGH |

## D. Placement Correctness

| # | Test Name | Steps to Reproduce | Expected Result | Severity |
|---|---|---|---|---|
| D1 | Ships never overlap (randomize) | Click Randomize 20+ times. Visually inspect player board each time. | No overlapping ship cells. Each randomization produces valid non-overlapping placement. | HIGH |
| D2 | Ships never go out of bounds | Click Randomize 20+ times. Check that all ships fit within 10x10 grid. | No ship extends beyond the board edges. | HIGH |
| D3 | Drag placement validates bounds | Drag a ship from the bank and try to place it extending beyond the right/bottom edge. | Placement is rejected. Status shows "Invalid placement". Ship returns to bank. | HIGH |
| D4 | Drag placement validates negative bounds | Drag a vertical ship (grab at offset > 0) and drop it near the top row. | Placement is rejected gracefully (no crash). Preview shows red highlight. | HIGH |
| D5 | Ship bank grays out placed ships | Place all ships via drag-and-drop. | Each placed ship's bank entry is grayed out with dashed borders. | LOW |
| D6 | Rotate ship during setup | Place a ship via drag. Click on the placed ship. | Ship rotates 90 degrees if space permits. Status shows "Ship rotated!" or "Cannot rotate". | MEDIUM |
| D7 | Player and enemy ships match board state | Start game. In console, verify `gameState.playerShips` cells match `playerBoard` SHIP cells. Same for enemy. | Every ship cell coordinate corresponds to a SHIP cell on the board. No orphaned cells. | HIGH |
| D8 | Re-randomizing clears previous placement | Place some ships via drag, then click Randomize. | All previous manual placements are cleared. New random placement replaces them entirely. | MEDIUM |

## E. Win / Sunk Correctness

| # | Test Name | Steps to Reproduce | Expected Result | Severity |
|---|---|---|---|---|
| E1 | Sunk detection fires exactly once | Sink an enemy ship. Observe log and status. | Exactly one "sunk a ship!" message in the log. Status updates once. | HIGH |
| E2 | Sunk ships show distinct styling | Sink an enemy ship. Observe the board cells. | Sunk ship cells change from red (hit) to dark red (sunk) with inner border. | MEDIUM |
| E3 | Win condition triggers when all ships sunk | Sink all 5 enemy ships. | Game-over overlay appears with "Victory!" message. Phase changes to GAME_OVER. | HIGH |
| E4 | Win condition does not trigger early | Sink 4 of 5 enemy ships. | Game continues normally. No premature game-over. | HIGH |
| E5 | No AI move after player wins | Sink the last enemy ship. | Game ends immediately. AI does not take a turn after player's winning move. | HIGH |
| E6 | Loss condition triggers correctly | Let AI sink all your ships. | Game-over overlay appears with "Defeat" message. Phase changes to GAME_OVER. | HIGH |
| E7 | Final move updates UI before game-over | Make the winning attack. | The attacked cell shows HIT/sunk styling. Board re-renders before overlay appears. | MEDIUM |
| E8 | No further input after game over | After game over, try clicking enemy cells, Randomize, Start. | All interactions are blocked. Only Restart and Play Again work. | HIGH |

---

## Regression Checklist (after patching)

After applying the 5 bug fixes, re-test these specific scenarios to ensure no regressions:

1. [ ] Drag-and-drop ship placement still works (ships can be placed, moved, rotated)
2. [ ] Randomize button places all 5 ships correctly
3. [ ] Start Game transitions to PLAYING phase
4. [ ] Player attacks resolve correctly (hit/miss/sunk)
5. [ ] AI attacks resolve correctly with proper turn switching
6. [ ] Sunk detection and win/loss conditions work
7. [ ] Restart from any game state returns to clean SETUP
8. [ ] Multiple restarts don't cause state corruption
9. [ ] Game-over overlay appears and "Play Again" works
10. [ ] Move log accurately tracks all moves
