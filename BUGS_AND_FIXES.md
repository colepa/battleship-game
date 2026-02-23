# Battleship Game — Bug Log

> Bugs discovered during QA review, with root causes and fixes applied.

---

## Bug 1: Attack resolution not implemented (CRITICAL)

- **Symptoms**: Clicking an enemy cell after starting the game logs "Attack registered — resolve logic TODO" but nothing actually happens. No hit/miss markers appear, no turn switching, no AI response.
- **Root cause**: `handleEnemyBoardClick()` contained a `TODO` placeholder (line 666–669 in original). The attack was logged but the board state was never updated — no cell was marked HIT or MISS, no sunk/win check ran, and no turn switch occurred.
- **Fix implemented**: Added `resolveAttack()` function that: marks the cell HIT or MISS on the board, checks if a ship was sunk via `checkSunk()`, checks win via `checkWin()`, updates the UI, and triggers the AI turn via `setTimeout`.
- **How I verified the fix**: Played a full game in the browser — clicked enemy cells, saw hit/miss markers appear, observed sunk messages in the log, and the game correctly ended with a win/loss message.

---

## Bug 2: No AI opponent logic (CRITICAL)

- **Symptoms**: After the player attacks, the game sits idle. There is no AI response — the AI never takes a turn.
- **Root cause**: No AI attack function existed anywhere in the codebase. The `currentTurn` state was set to `"player"` but never switched to `"ai"`, and no AI move selection logic was written.
- **Fix implemented**: Added `aiTakeTurn()` with hunt/target mode: in hunt mode the AI picks a random un-attacked cell; after a hit it switches to target mode and enqueues the four orthogonal neighbours via `enqueueAiCandidates()`. The AI fires after a 600ms delay to feel natural. An `aiAttacked` Set prevents duplicate attacks.
- **How I verified the fix**: Played multiple games — AI takes turns after each player move, correctly hits/misses, targets adjacent cells after hits, and the game reaches win/loss naturally.

---

## Bug 3: No sunk detection (HIGH)

- **Symptoms**: When all cells of a ship are hit, there is no "sunk" announcement. The game has no way to know a ship has been destroyed.
- **Root cause**: No sunk-checking function existed. Ship objects have a `sunk: false` property but nothing ever set it to `true`.
- **Fix implemented**: Added `checkSunk(board, ship)` — checks if every cell of the ship is HIT. If so, marks `ship.sunk = true` and returns `true` (exactly once per ship, since it short-circuits if already sunk). Called inside `resolveAttack()` after every hit.
- **How I verified the fix**: Sunk messages appear in the move log and status bar exactly once per ship. Verified by sinking all 5 enemy ships in a game.

---

## Bug 4: No win/loss condition (HIGH)

- **Symptoms**: Even after all ships on one side are sunk, the game continues. No winner is declared, and clicks are still accepted.
- **Root cause**: No win-checking logic existed. The game phase never transitions to `GAME_OVER`.
- **Fix implemented**: Added `checkWin(ships)` — returns `true` when every ship in the fleet is sunk. Called in `resolveAttack()` after each sunk check. On win, sets `gameState.phase = PHASES.GAME_OVER`, displays the winner, and stops further input (existing guards on `phase !== PLAYING` block clicks).
- **How I verified the fix**: Played to completion — win message displays, status text updates, no further clicks are processed. Verified for both player win and AI win scenarios.

---

## Bug 5: `canPlaceShip` crashes on negative coordinates (MEDIUM)

- **Symptoms**: During drag-and-drop placement, dragging a ship near the top-left corner of the board (with a non-zero grab offset) could cause a JavaScript TypeError crash in the console.
- **Root cause**: `getPlacementOrigin()` computes `dropRow - grabOffset` or `dropCol - grabOffset`, which can produce negative values. `canPlaceShip()` only checked `r >= BOARD_SIZE || c >= BOARD_SIZE` (upper bounds) but not `r < 0 || c < 0`. Accessing `board[-1]` returns `undefined`, and then `undefined[col]` throws a TypeError.
- **Fix implemented**: Added `r < 0 || c < 0` to the bounds check in `canPlaceShip()` (line 141).
- **How I verified the fix**: Dragged ships with offset to the top-left corner of the board — no crash, correctly shows invalid placement preview.

---

## Bug 6: Restart does not cancel pending AI timeout (MEDIUM)

- **Symptoms**: If the player presses Restart while "AI is thinking..." (during the 600ms delay), the AI's attack fires *after* the board resets, corrupting the new game state.
- **Root cause**: The AI turn is scheduled via `setTimeout`, but `handleRestart()` → `resetGameState()` never called `clearTimeout()`. The pending callback would fire against a freshly reset `gameState`.
- **Fix implemented**: Added a module-level `aiTimeoutId` variable. `resolveAttack()` stores the timeout ID, and `resetGameState()` calls `clearTimeout(aiTimeoutId)` before resetting state.
- **How I verified the fix**: Started a game, attacked, then immediately clicked Restart during the AI delay — new game starts cleanly with no ghost AI attack.

---

## Bug 7: AI state not cleared on restart (MEDIUM)

- **Symptoms**: After restarting mid-game, the AI's targeting memory (candidate queue, attacked-cells set) could carry over into the next game, causing it to attack cells it "remembered" from the previous game.
- **Root cause**: `createGameState()` did not include AI targeting state (`aiCandidates`, `aiAttacked`). Since the AI was never implemented before, this state didn't exist.
- **Fix implemented**: Added `aiCandidates: []` and `aiAttacked: new Set()` to `createGameState()`. Since `resetGameState()` calls `createGameState()`, all AI memory is wiped on restart.
- **How I verified the fix**: Played a partial game, restarted, played a new game — AI attacks fresh random cells with no carry-over from the previous game.

---

## Bug 8: `placeAllShipsRandomly` silently produces incomplete fleets (LOW)

- **Symptoms**: In rare cases (statistically unlikely on a 10x10 board but theoretically possible), if random placement fails after 200 attempts for a single ship, that ship is silently skipped. The game starts with fewer than 5 ships, making it impossible to lose (or win if it's the enemy fleet).
- **Root cause**: The original loop logged `console.error` but continued, returning a partial ship array. No retry of the entire board was attempted.
- **Fix implemented**: Wrapped the placement loop in an outer retry loop (up to 10 full-board retries). If any single ship fails to place, the board is cleared and all ships are re-attempted from scratch. Returns `[]` only as an absolute fallback.
- **How I verified the fix**: Clicked "Randomize" 50+ times rapidly — all placements succeeded with exactly 5 ships each time.

---

## Bug 9: No turn-lock prevents player clicks during AI delay (LOW)

- **Symptoms**: Player can theoretically click enemy cells during the 600ms AI thinking delay, potentially taking multiple turns before the AI responds.
- **Root cause**: After the player's attack, `resolveAttack()` sets `currentTurn = "ai"` and schedules the AI via `setTimeout`. However, the existing guard `if (gameState.currentTurn !== "player") return;` in `handleEnemyBoardClick` already blocks this. No additional fix needed — just verified correctness.
- **Fix implemented**: No code change needed. Verified that the existing `currentTurn` guard on line 668 (original) correctly rejects clicks when it's the AI's turn.
- **How I verified the fix**: Rapidly clicked enemy cells during AI thinking — only the first click registers; subsequent clicks are silently ignored.

---

## Bug 10: Event listeners not duplicated on restart (VERIFIED OK)

- **Symptoms**: N/A — this was a suspected issue that turned out to be correctly handled.
- **Root cause**: `init()` attaches button listeners once. `renderAll()` rebuilds board DOM via `innerHTML = ""` which destroys old elements (and their listeners) before creating new ones. No accumulation occurs.
- **Fix implemented**: None needed — architecture is correct.
- **How I verified the fix**: Restarted 10+ times, monitored event listener count via DevTools — stable count each time.

---

# QA Test Plan

| # | Test Name | Steps | Expected Result | Severity |
|---|-----------|-------|-----------------|----------|
| 1 | Pre-start click blocked | Click enemy cell before pressing Start | Status shows "Start the game first!" | High |
| 2 | Duplicate attack prevented | Click same enemy cell twice | Second click shows "You already targeted that cell." | High |
| 3 | Click during AI turn blocked | Attack, then rapidly click another cell during AI delay | Second click ignored (currentTurn is "ai") | High |
| 4 | Click after game over blocked | Win/lose, then click enemy cell | Click ignored (phase is gameover) | High |
| 5 | AI never attacks same cell | Play full game, check AI log | No duplicate AI coordinates in move log | High |
| 6 | AI stays in bounds | Play full game | All AI attacks are within (0-9, 0-9) | Medium |
| 7 | AI target mode works | Let AI hit a ship cell | AI next attacks should be adjacent to the hit | Medium |
| 8 | Sunk detection fires once | Sink a ship | "sunk the X!" appears exactly once in log | High |
| 9 | Win triggers correctly | Sink all 5 enemy ships | Status shows "Player wins!", phase is gameover | High |
| 10 | Loss triggers correctly | Let AI sink all 5 player ships | Status shows "AI wins!", phase is gameover | High |
| 11 | Restart clears everything | Mid-game, press Restart | Boards clear, ships gone, log empty, status resets | High |
| 12 | Restart clears AI timer | Attack then immediately Restart | No ghost AI attack on new board | Medium |
| 13 | Restart clears AI memory | Partial game, Restart, new game | AI doesn't repeat old-game attacks | Medium |
| 14 | Multiple restarts stable | Restart 5+ times, start new game each time | Each game works correctly | Medium |
| 15 | Randomize placement valid | Click Randomize 20 times | Always 5 ships, no overlaps, no out-of-bounds | Medium |
| 16 | Ship placement no overlap | Place ships via drag, verify board | Ship cells match board state exactly | Medium |
| 17 | Negative coord drag safe | Drag ship with offset past top-left edge | No crash, shows invalid preview | Medium |
| 18 | Start button state | Before/after placing all ships | Disabled until all 5 placed, disabled after Start | Low |
| 19 | Move log accuracy | Play several moves | Log entries match actual attacks and results | Low |
| 20 | Status text consistency | Through full game lifecycle | Status updates correctly at each phase | Low |

---

# Final Regression Checklist

After applying all patches, re-test the following:

- [ ] Randomize ships -> Start -> full game to win
- [ ] Randomize ships -> Start -> full game to loss
- [ ] Mid-game Restart -> new game plays correctly
- [ ] Restart during AI thinking -> no ghost attacks
- [ ] Rapid-click enemy board during AI turn -> only one attack registers
- [ ] Click enemy board before Start -> blocked with message
- [ ] Click enemy board after game over -> blocked
- [ ] Drag ship to top-left corner with offset -> no crash
- [ ] Randomize 20+ times -> all placements valid
- [ ] 5 consecutive Restart cycles -> stable behavior
- [ ] AI sinks a ship -> "sunk" message appears once
- [ ] All ships sunk -> correct winner announced
- [ ] Move log entries match board state
