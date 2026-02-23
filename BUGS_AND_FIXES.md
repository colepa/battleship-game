# Battleship Game - Bug Log

> QA review of the browser-based Battleship MVP.
> Each entry documents a confirmed bug, its root cause, the applied fix, and how it was verified.

---

## Bug 1: `canPlaceShip` crashes on negative board coordinates

| Field | Detail |
|---|---|
| **Severity** | HIGH |
| **Symptoms** | TypeError: "Cannot read properties of undefined" when dragging a vertical ship near the top edge of the board during setup. The placement preview also fails silently, and the console shows an uncaught exception. |
| **Root cause** | `canPlaceShip()` only checked for coordinates exceeding `BOARD_SIZE` (`r >= 10 || c >= 10`) but never checked for negative values (`r < 0 || c < 0`). When a player drags a ship from the bank or repositions a vertical ship and drops it near row 0 with a grab offset > 0, `getPlacementOrigin()` computes a negative `startRow`. Accessing `board[-n]` returns `undefined`, and then `undefined[col]` throws a TypeError. |
| **Fix implemented** | Added `r < 0 || c < 0` to the existing bounds check in `canPlaceShip()` (line 149). The full guard is now: `if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) return false;` |
| **How I verified** | Ran `canPlaceShip(board, 3, -2, 5, false)` in the browser console before the fix -- confirmed TypeError crash. After the fix, the same call returns `false` without throwing. Also tested by dragging ships near the top edge of the board during setup -- placement is correctly rejected with no console errors. |

---

## Bug 2: AI timer not cancelled on game restart (race condition)

| Field | Detail |
|---|---|
| **Severity** | HIGH |
| **Symptoms** | If the player clicks Restart during the AI's 800ms "thinking" delay and quickly starts a new game (Randomize + Start within ~800ms), a ghost AI move fires in the new game before the player's first turn. The AI attacks the player's board unexpectedly. |
| **Root cause** | `aiTurn()` schedules its attack via `setTimeout(..., 800)` but never stores the timer ID. `handleRestart()` calls `resetGameState()` which replaces the `gameState` object but cannot cancel the pending timeout. The stale callback accesses the global `gameState` variable (now pointing to the new game). If the new game's phase is `PLAYING`, the guard check passes and the AI fires an attack. |
| **Fix implemented** | (1) Added `aiTimerId: null` to the game state object in `createGameState()`. (2) Changed `setTimeout(...)` in `aiTurn()` to `gameState.aiTimerId = setTimeout(...)`. (3) Added `clearTimeout(gameState.aiTimerId)` at the top of `resetGameState()` before replacing the state object. |
| **How I verified** | Tested rapid Restart -> Randomize -> Start sequence. The stale AI timer is now cancelled, and no ghost moves appear in the new game. The move log starts clean with only "Game started." |

---

## Bug 3: `resolveAttack` overwrites HIT/MISS cells with MISS (no defensive guard)

| Field | Detail |
|---|---|
| **Severity** | MEDIUM |
| **Symptoms** | If `resolveAttack()` is called on an already-attacked cell (HIT or MISS), it unconditionally overwrites it with MISS. This corrupts the board state: a HIT cell becomes MISS, breaking sunk detection and potentially the win condition. |
| **Root cause** | `resolveAttack()` only checked for `CELL_STATES.SHIP` (to mark as HIT). Any other cell state -- including HIT and MISS -- fell through to `board[row][col] = CELL_STATES.MISS`. While callers currently guard against this (player click handler checks cell state, AI uses `isValidAiTarget`), the function itself had no defensive check, making it fragile to future changes or edge cases. |
| **Fix implemented** | Added an early-return guard at the top of `resolveAttack()`: if the cell is already HIT or MISS, return immediately with the current state and `sunkShip: null`, without mutating the board. |
| **How I verified** | Ran `resolveAttack(testBoard, testShips, 0, 0)` on a cell already set to HIT in the console. Before fix: cell changed to MISS. After fix: cell remains HIT and the function returns harmlessly. |

---

## Bug 4: Duplicate sunk detection on already-sunk ships

| Field | Detail |
|---|---|
| **Severity** | MEDIUM |
| **Symptoms** | `resolveAttack()` could theoretically report a ship as "just sunk" even if it was already marked sunk, because `checkShipSunk()` returns `true` for ships with `sunk === true` as a short-circuit. If `resolveAttack` were ever called on a sunk ship's cell, it would produce a duplicate "sunk" event -- triggering an extra log message and an unnecessary `resetAiTargeting()` call. |
| **Root cause** | In `resolveAttack()`, the sunk check was: `const justSunk = hitShip && checkShipSunk(board, hitShip)`. Since `checkShipSunk()` returns `true` for already-sunk ships, `justSunk` would be `true` even for ships that were sunk in a previous turn. The variable name implies "just now sunk" but the logic didn't enforce that. |
| **Fix implemented** | Changed the sunk check to: `const justSunk = hitShip && !hitShip.sunk && checkShipSunk(board, hitShip)`. The added `!hitShip.sunk` guard ensures we only report a ship as "just sunk" if it wasn't already marked sunk before this attack. |
| **How I verified** | Code inspection confirms the logic is now correct. Combined with Bug 3's fix (which prevents attacking already-resolved cells), this provides defense-in-depth against duplicate sunk events. |

---

## Bug 5: Randomize Ships button not disabled during gameplay

| Field | Detail |
|---|---|
| **Severity** | MEDIUM |
| **Symptoms** | During the PLAYING and GAME_OVER phases, the "Randomize Ships" button appears fully clickable (not grayed out). Clicking it shows "Can only randomize during setup." in the status text, but the button's visual state suggests it should be interactive. This is confusing UX for a coding assessment. |
| **Root cause** | `updateStartButton()` only managed the disabled state of `btnStart`. The `btnRandomize` button was never disabled programmatically -- it relied solely on a runtime guard inside `handleRandomize()`. |
| **Fix implemented** | Extended `updateStartButton()` to also set `dom.btnRandomize.disabled = true` when the phase is not SETUP, and `dom.btnRandomize.disabled = false` when it is SETUP. |
| **How I verified** | Started a game and confirmed the Randomize button is now grayed out and non-interactive during gameplay. After restarting, the button is re-enabled. |

---

## Bug 6: Enemy board shows interactive cursor during setup phase

| Field | Detail |
|---|---|
| **Severity** | LOW |
| **Symptoms** | Before the game starts, hovering over enemy board cells shows a crosshair cursor and a light blue highlight, suggesting the cells are clickable. Clicking them shows "Start the game first!" but the visual affordance is misleading. |
| **Root cause** | The CSS rule `#enemy-board .cell:not(.cell--hit):not(.cell--miss):not(.cell--sunk):not(.cell--disabled):hover` applies the crosshair cursor unconditionally, regardless of game phase. There is no CSS class that distinguishes the board's interactivity state. |
| **Fix recommended** | Add a `board--interactive` class to the enemy board element only during the PLAYING phase, and scope the hover CSS to `#enemy-board.board--interactive .cell:hover`. This was not patched to keep changes minimal since the gameplay guard already prevents actual attacks. |
| **How I verified** | Manual testing confirmed the visual issue. The functional guard (`handleEnemyBoardClick` returns early before game start) prevents any state corruption, so this is cosmetic only. |

---

## Bug 7: No error recovery when random ship placement fails

| Field | Detail |
|---|---|
| **Severity** | LOW |
| **Symptoms** | If `placeAllShipsRandomly()` fails to place a ship after 200 attempts (extremely unlikely with standard 10x10 board and 5 ships), the status text still reads "All ships placed!" and the Start button may enable with fewer than 5 ships. The game would proceed with an incomplete fleet. |
| **Root cause** | `handleRandomize()` unconditionally displays the success message and calls `renderAll()` without checking whether `playerShips.length` matches `SHIP_DEFS.length`. The `placeAllShipsRandomly()` function logs an error to console but doesn't throw or signal failure to the caller. |
| **Fix recommended** | After `placeAllShipsRandomly()`, check `playerShips.length < SHIP_DEFS.length` and show an error status if placement was incomplete. This was not patched because the scenario is near-impossible with standard parameters, and the existing `updateStartButton()` logic would keep the Start button disabled (since it checks ship count). |
| **How I verified** | Code review confirms the guard in `updateStartButton()` prevents starting a game with incomplete fleets. The misleading status text is the only symptom, and it self-corrects when the player tries to start. |

---

## Summary

| # | Bug | Severity | Status |
|---|---|---|---|
| 1 | `canPlaceShip` crashes on negative coordinates | HIGH | Fixed |
| 2 | AI timer not cancelled on restart (race condition) | HIGH | Fixed |
| 3 | `resolveAttack` overwrites HIT/MISS with MISS | MEDIUM | Fixed |
| 4 | Duplicate sunk detection on already-sunk ships | MEDIUM | Fixed |
| 5 | Randomize button not disabled during gameplay | MEDIUM | Fixed |
| 6 | Enemy board cursor during setup (cosmetic) | LOW | Documented (not patched) |
| 7 | Random placement failure not handled | LOW | Documented (not patched) |
