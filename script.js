// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 10;

const SHIP_LENGTHS = [5, 4, 3, 3, 2];

/** Ship definitions with names for the ship bank UI */
const SHIP_DEFS = [
  { id: 0, name: "Carrier", length: 5 },
  { id: 1, name: "Battleship", length: 4 },
  { id: 2, name: "Cruiser", length: 3 },
  { id: 3, name: "Submarine", length: 3 },
  { id: 4, name: "Destroyer", length: 2 },
];

/** Enum-like cell states stored on each board position */
const CELL_STATES = Object.freeze({
  EMPTY: "empty",
  SHIP: "ship",
  HIT: "hit",
  MISS: "miss",
});

/** Game phase constants */
const PHASES = Object.freeze({
  SETUP: "setup",
  PLAYING: "playing",
  GAME_OVER: "gameover",
});

// =============================================================================
// DOM REFERENCES
// =============================================================================

const dom = {
  playerBoard: document.getElementById("player-board"),
  enemyBoard: document.getElementById("enemy-board"),
  statusText: document.getElementById("status-text"),
  moveLog: document.getElementById("move-log"),
  shipBank: document.getElementById("ship-bank"),
  btnRandomize: document.getElementById("btn-randomize"),
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
};

/** Tracks state during an active drag-and-drop operation */
let dragState = {
  active: false,
  shipId: null,
  shipLength: 0,
  grabOffset: 0,
  isHorizontal: true,
  sourceShip: null,
};

// =============================================================================
// GAME STATE
// =============================================================================

/**
 * Creates a fresh 2D board array filled with CELL_STATES.EMPTY.
 * @param {number} size - Width/height of the square board.
 * @returns {string[][]}
 */
function createEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => CELL_STATES.EMPTY)
  );
}

/**
 * Builds the initial game state object.
 * All gameplay-related data lives here so the rest of the code stays pure.
 * @returns {object}
 */
function createGameState() {
  return {
    phase: PHASES.SETUP,
    currentTurn: "player", // "player" | "ai"
    isGameStarted: false,

    playerBoard: createEmptyBoard(BOARD_SIZE),
    enemyBoard: createEmptyBoard(BOARD_SIZE),

    // Ship arrays will hold objects like { length, cells: [{row, col}, ...], sunk: false }
    playerShips: [],
    enemyShips: [],

    moveLog: [],

    // AI targeting state (hunt/target mode)
    aiCandidates: [],   // queued cells to try after a hit
    aiAttacked: new Set(), // tracks "row,col" strings already attacked
  };
}

/** The single source of truth for the current game. */
let gameState = createGameState();

/** Tracks pending AI turn timeout so it can be cancelled on restart. */
let aiTimeoutId = null;

/**
 * Resets the game state back to initial values and re-renders everything.
 */
function resetGameState() {
  // Cancel any pending AI turn
  if (aiTimeoutId !== null) {
    clearTimeout(aiTimeoutId);
    aiTimeoutId = null;
  }
  gameState = createGameState();
  renderAll();
  updateStatus("Setup your game");
  clearMoveLog();
}

// =============================================================================
// SHIP PLACEMENT
// =============================================================================

/**
 * Checks whether a ship of the given length can be placed at (startRow, startCol)
 * with the specified orientation without going out of bounds or overlapping.
 *
 * @param {string[][]} board       - 2D board array.
 * @param {number}     length      - Ship length.
 * @param {number}     startRow    - Starting row index.
 * @param {number}     startCol    - Starting column index.
 * @param {boolean}    isHorizontal - true = extends to the right, false = extends downward.
 * @returns {boolean}
 */
function canPlaceShip(board, length, startRow, startCol, isHorizontal) {
  for (let i = 0; i < length; i++) {
    const r = isHorizontal ? startRow : startRow + i;
    const c = isHorizontal ? startCol + i : startCol;

    // Out of bounds
    if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) return false;

    // Overlaps an existing ship
    if (board[r][c] !== CELL_STATES.EMPTY) return false;
  }
  return true;
}

/**
 * Places a ship on the board and returns a ship descriptor object.
 * Assumes the placement has already been validated with canPlaceShip().
 *
 * @param {string[][]} board        - 2D board array (mutated in place).
 * @param {number}     length       - Ship length.
 * @param {number}     startRow     - Starting row index.
 * @param {number}     startCol     - Starting column index.
 * @param {boolean}    isHorizontal - Orientation.
 * @returns {{ length: number, cells: {row: number, col: number}[], sunk: boolean }}
 */
function placeShip(board, length, startRow, startCol, isHorizontal) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    const r = isHorizontal ? startRow : startRow + i;
    const c = isHorizontal ? startCol + i : startCol;
    board[r][c] = CELL_STATES.SHIP;
    cells.push({ row: r, col: c });
  }
  return { length, cells, sunk: false, isHorizontal };
}

/**
 * Attempts to randomly place all ships defined in SHIP_LENGTHS onto the board.
 * Retries random positions until every ship fits without overlap.
 *
 * @param {string[][]} board - 2D board array (mutated in place).
 * @returns {{ length: number, cells: {row: number, col: number}[], sunk: false }[]}
 */
function placeAllShipsRandomly(board) {
  const maxBoardRetries = 10;

  for (let retry = 0; retry < maxBoardRetries; retry++) {
    // Clear board for each full retry
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[r][c] = CELL_STATES.EMPTY;
      }
    }

    const ships = [];
    let allPlaced = true;

    for (let i = 0; i < SHIP_DEFS.length; i++) {
      const shipLength = SHIP_DEFS[i].length;
      let placed = false;
      let attempts = 0;
      const maxAttempts = 200;

      while (!placed && attempts < maxAttempts) {
        attempts++;
        const isHorizontal = Math.random() < 0.5;
        const startRow = Math.floor(Math.random() * BOARD_SIZE);
        const startCol = Math.floor(Math.random() * BOARD_SIZE);

        if (canPlaceShip(board, shipLength, startRow, startCol, isHorizontal)) {
          const ship = placeShip(board, shipLength, startRow, startCol, isHorizontal);
          ship.id = i;
          ships.push(ship);
          placed = true;
        }
      }

      if (!placed) {
        allPlaced = false;
        break; // restart entire board
      }
    }

    if (allPlaced) {
      return ships;
    }
  }

  // Fallback: should never reach here on a 10x10 board
  console.error("Failed to place all ships after multiple board retries.");
  return [];
}

/**
 * Removes a ship's cells from the board, setting them back to EMPTY.
 * @param {string[][]} board - 2D board array (mutated in place).
 * @param {{ cells: {row: number, col: number}[] }} ship - Ship to remove.
 */
function removeShipFromBoard(board, ship) {
  for (const { row, col } of ship.cells) {
    board[row][col] = CELL_STATES.EMPTY;
  }
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * Renders a 10x10 grid of cells into the given board element.
 *
 * @param {HTMLElement} boardEl   - The container element for the board.
 * @param {string[][]}  boardData - 2D array of CELL_STATES values.
 * @param {object}      options
 * @param {boolean}     options.hideShips - If true, SHIP cells render as EMPTY (for enemy board).
 * @param {function}    [options.onCellClick] - Optional click handler receiving (row, col).
 */
function renderBoard(boardEl, boardData, options = {}) {
  const { hideShips = false, onCellClick = null } = options;

  // Clear previous content
  boardEl.innerHTML = "";

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.row = row;
      cell.dataset.col = col;

      const state = boardData[row][col];

      // Map cell state to CSS class
      switch (state) {
        case CELL_STATES.SHIP:
          if (!hideShips) cell.classList.add("cell--ship");
          break;
        case CELL_STATES.HIT:
          cell.classList.add("cell--hit");
          break;
        case CELL_STATES.MISS:
          cell.classList.add("cell--miss");
          break;
        // EMPTY — no extra class needed
      }

      // Attach click listener if provided
      if (onCellClick) {
        cell.addEventListener("click", () => onCellClick(row, col));
      }

      boardEl.appendChild(cell);
    }
  }
}

/**
 * Re-renders both boards and refreshes the move log.
 */
function renderAll() {
  // Player board: show ships
  renderBoard(dom.playerBoard, gameState.playerBoard, {
    hideShips: false,
    onCellClick: handlePlayerBoardClick,
  });

  // Enemy board: hide ships, allow attacks
  renderBoard(dom.enemyBoard, gameState.enemyBoard, {
    hideShips: true,
    onCellClick: handleEnemyBoardClick,
  });

  // Make placed ship cells draggable during setup
  if (gameState.phase === PHASES.SETUP) {
    dom.playerBoard.querySelectorAll(".cell--ship").forEach((cell) => {
      cell.draggable = true;
    });
  }

  renderShipBank();
  updateStartButton();
}

/**
 * Updates the status text displayed in the header.
 * @param {string} message
 */
function updateStatus(message) {
  dom.statusText.textContent = message;
}

// =============================================================================
// MOVE LOG
// =============================================================================

/**
 * Appends a message to the on-screen move log and the state array.
 * @param {string} message
 */
function addLogEntry(message) {
  gameState.moveLog.push(message);
  const li = document.createElement("li");
  li.textContent = message;
  dom.moveLog.prepend(li); // newest first
}

/** Clears the move log UI and state array. */
function clearMoveLog() {
  gameState.moveLog = [];
  dom.moveLog.innerHTML = "";
}

// =============================================================================
// SHIP BANK & DRAG-AND-DROP
// =============================================================================

/** Renders the ship bank UI, graying out ships that have been placed. */
function renderShipBank() {
  dom.shipBank.innerHTML = "";

  // Hide the bank entirely once the game has started
  const container = dom.shipBank.closest(".ship-bank-container");
  if (container) {
    container.style.display = gameState.phase === PHASES.SETUP ? "" : "none";
  }

  for (let i = 0; i < SHIP_DEFS.length; i++) {
    const def = SHIP_DEFS[i];
    const isPlaced = gameState.playerShips.some((s) => s.id === i);

    const shipEl = document.createElement("div");
    shipEl.classList.add("ship-bank__ship");
    if (isPlaced) shipEl.classList.add("ship-bank__ship--placed");
    shipEl.draggable = !isPlaced && gameState.phase === PHASES.SETUP;
    shipEl.dataset.shipId = i;

    const label = document.createElement("span");
    label.classList.add("ship-bank__label");
    label.textContent = def.name;
    shipEl.appendChild(label);

    const cellsContainer = document.createElement("div");
    cellsContainer.classList.add("ship-bank__cells");
    for (let j = 0; j < def.length; j++) {
      const cell = document.createElement("div");
      cell.classList.add("ship-bank__cell");
      if (isPlaced) cell.classList.add("ship-bank__cell--empty");
      cell.dataset.offset = j;
      cellsContainer.appendChild(cell);
    }
    shipEl.appendChild(cellsContainer);

    dom.shipBank.appendChild(shipEl);
  }
}

/**
 * Computes the top-left origin cell for a ship placement,
 * accounting for the grab offset within the ship piece.
 */
function getPlacementOrigin(dropRow, dropCol) {
  if (dragState.isHorizontal) {
    return { row: dropRow, col: dropCol - dragState.grabOffset };
  }
  return { row: dropRow - dragState.grabOffset, col: dropCol };
}

/** Clears all preview highlights from the player board. */
function clearPlacementPreview() {
  dom.playerBoard.querySelectorAll(".cell").forEach((cell) => {
    cell.classList.remove("cell--preview-valid", "cell--preview-invalid");
  });
}

/**
 * Shows a placement preview on the player board for the currently dragged ship.
 * Highlights green if valid, red if invalid.
 */
function showPlacementPreview(dropRow, dropCol) {
  clearPlacementPreview();
  if (!dragState.active) return;

  const origin = getPlacementOrigin(dropRow, dropCol);
  const valid = canPlaceShip(
    gameState.playerBoard,
    dragState.shipLength,
    origin.row,
    origin.col,
    dragState.isHorizontal
  );

  const cssClass = valid ? "cell--preview-valid" : "cell--preview-invalid";

  for (let i = 0; i < dragState.shipLength; i++) {
    const r = dragState.isHorizontal ? origin.row : origin.row + i;
    const c = dragState.isHorizontal ? origin.col + i : origin.col;
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      const cellEl = dom.playerBoard.querySelector(
        `.cell[data-row="${r}"][data-col="${c}"]`
      );
      if (cellEl) cellEl.classList.add(cssClass);
    }
  }
}

/** Handles dropping a dragged ship onto the player board. Returns true on success. */
function handleShipDrop(dropRow, dropCol) {
  if (!dragState.active) return false;
  clearPlacementPreview();

  const origin = getPlacementOrigin(dropRow, dropCol);

  if (
    !canPlaceShip(
      gameState.playerBoard,
      dragState.shipLength,
      origin.row,
      origin.col,
      dragState.isHorizontal
    )
  ) {
    updateStatus("Invalid placement \u2014 try another position.");
    return false;
  }

  const ship = placeShip(
    gameState.playerBoard,
    dragState.shipLength,
    origin.row,
    origin.col,
    dragState.isHorizontal
  );
  ship.id = dragState.shipId;
  gameState.playerShips.push(ship);

  const remaining = SHIP_DEFS.length - gameState.playerShips.length;
  if (remaining > 0) {
    updateStatus(`Ship placed! ${remaining} remaining. Drag another or click Randomize.`);
  } else {
    updateStatus("All ships placed! Press Start Game to begin.");
  }

  dragState.active = false;
  dragState.sourceShip = null;
  renderAll();
  return true;
}

/**
 * Attempts to rotate a placed ship on the player board (toggle orientation).
 * @param {number} shipIndex - Index into gameState.playerShips.
 */
function handleRotateShip(shipIndex) {
  const ship = gameState.playerShips[shipIndex];
  if (!ship) return;

  const { cells, length, isHorizontal, id } = ship;
  const startRow = cells[0].row;
  const startCol = cells[0].col;
  const newHorizontal = !isHorizontal;

  // Remove current placement so it doesn't block the rotation check
  removeShipFromBoard(gameState.playerBoard, ship);

  if (canPlaceShip(gameState.playerBoard, length, startRow, startCol, newHorizontal)) {
    const rotated = placeShip(gameState.playerBoard, length, startRow, startCol, newHorizontal);
    rotated.id = id;
    gameState.playerShips[shipIndex] = rotated;
    updateStatus("Ship rotated!");
  } else {
    // Can't rotate \u2014 restore original placement
    const restored = placeShip(gameState.playerBoard, length, startRow, startCol, isHorizontal);
    restored.id = id;
    gameState.playerShips[shipIndex] = restored;
    updateStatus("Cannot rotate \u2014 not enough space.");
  }

  renderAll();
}

/** Enables or disables the Start Game button based on fleet completeness. */
function updateStartButton() {
  if (gameState.phase !== PHASES.SETUP) {
    dom.btnStart.disabled = true;
    return;
  }
  dom.btnStart.disabled = gameState.playerShips.length < SHIP_DEFS.length;
}

/** Sets up drag-and-drop event listeners (called once during init). */
function initDragAndDrop() {
  // Ship bank: dragstart
  dom.shipBank.addEventListener("dragstart", (e) => {
    const shipEl = e.target.closest(".ship-bank__ship");
    if (!shipEl || shipEl.classList.contains("ship-bank__ship--placed")) {
      e.preventDefault();
      return;
    }

    const shipId = parseInt(shipEl.dataset.shipId, 10);
    const def = SHIP_DEFS[shipId];
    const cellEl = e.target.closest(".ship-bank__cell");
    const grabOffset = cellEl ? parseInt(cellEl.dataset.offset, 10) : 0;

    dragState = {
      active: true,
      shipId,
      shipLength: def.length,
      grabOffset,
      isHorizontal: true,
      sourceShip: null,
    };

    e.dataTransfer.effectAllowed = "move";
  });

  // Player board: dragstart (pick up a placed ship to reposition)
  dom.playerBoard.addEventListener("dragstart", (e) => {
    if (gameState.phase !== PHASES.SETUP) { e.preventDefault(); return; }

    const cellEl = e.target.closest(".cell");
    if (!cellEl || !cellEl.classList.contains("cell--ship")) {
      e.preventDefault();
      return;
    }

    const row = parseInt(cellEl.dataset.row, 10);
    const col = parseInt(cellEl.dataset.col, 10);

    const shipIndex = gameState.playerShips.findIndex((ship) =>
      ship.cells.some((c) => c.row === row && c.col === col)
    );
    if (shipIndex === -1) { e.preventDefault(); return; }

    const ship = gameState.playerShips[shipIndex];
    const grabOffset = ship.cells.findIndex(
      (c) => c.row === row && c.col === col
    );

    dragState = {
      active: true,
      shipId: ship.id,
      shipLength: ship.length,
      grabOffset,
      isHorizontal: ship.isHorizontal,
      sourceShip: { ...ship, cells: ship.cells.map((c) => ({ ...c })) },
    };

    // Remove ship from board state
    removeShipFromBoard(gameState.playerBoard, ship);
    gameState.playerShips.splice(shipIndex, 1);

    e.dataTransfer.effectAllowed = "move";

    // Visually update cells without full re-render (preserves drag ghost)
    ship.cells.forEach((c) => {
      const el = dom.playerBoard.querySelector(
        `.cell[data-row="${c.row}"][data-col="${c.col}"]`
      );
      if (el) {
        el.classList.remove("cell--ship");
        el.draggable = false;
      }
    });

    renderShipBank();
    updateStartButton();
  });

  // Player board: dragover (show preview)
  dom.playerBoard.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cell = e.target.closest(".cell");
    if (!cell) return;
    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    showPlacementPreview(row, col);
  });

  // Player board: dragleave (clear preview when leaving board)
  dom.playerBoard.addEventListener("dragleave", (e) => {
    if (!dom.playerBoard.contains(e.relatedTarget)) {
      clearPlacementPreview();
    }
  });

  // Player board: drop
  dom.playerBoard.addEventListener("drop", (e) => {
    e.preventDefault();
    const cell = e.target.closest(".cell");
    if (!cell) return;
    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    handleShipDrop(row, col);
  });

  // Global: dragend (restore ship on cancel, cleanup)
  document.addEventListener("dragend", () => {
    clearPlacementPreview();
    if (dragState.active) {
      if (dragState.sourceShip) {
        // Ship picked up from board but not re-placed — restore original position
        const s = dragState.sourceShip;
        const restored = placeShip(
          gameState.playerBoard, s.length,
          s.cells[0].row, s.cells[0].col, s.isHorizontal
        );
        restored.id = s.id;
        gameState.playerShips.push(restored);
      }
      dragState.active = false;
      dragState.sourceShip = null;
      renderAll();
    }
  });
}

// =============================================================================
// ATTACK RESOLUTION, SUNK / WIN DETECTION
// =============================================================================

/**
 * Checks whether every cell of a ship has been hit.
 * If so, marks ship.sunk = true and returns true (exactly once per ship).
 *
 * @param {string[][]} board - The board the ship sits on.
 * @param {{ cells: {row:number,col:number}[], sunk: boolean }} ship
 * @returns {boolean} true if the ship just became sunk.
 */
function checkSunk(board, ship) {
  if (ship.sunk) return false;
  const isSunk = ship.cells.every(({ row, col }) => board[row][col] === CELL_STATES.HIT);
  if (isSunk) {
    ship.sunk = true;
  }
  return isSunk;
}

/**
 * Returns true when every ship in the fleet has been sunk.
 * @param {{ sunk: boolean }[]} ships
 * @returns {boolean}
 */
function checkWin(ships) {
  return ships.length > 0 && ships.every((s) => s.sunk);
}

/**
 * Resolves a single attack on a board cell.
 * Updates board state, logs the move, checks sunk/win, and triggers turn switch.
 *
 * @param {"player"|"ai"} attacker - Who is attacking.
 * @param {string[][]} board - The target board (enemyBoard or playerBoard).
 * @param {object[]} ships - The target ship array.
 * @param {number} row
 * @param {number} col
 */
function resolveAttack(attacker, board, ships, row, col) {
  const isPlayer = attacker === "player";
  const cellState = board[row][col];
  const coordLabel = `(${row}, ${col})`;
  const who = isPlayer ? "Player" : "AI";

  if (cellState === CELL_STATES.SHIP) {
    // HIT
    board[row][col] = CELL_STATES.HIT;
    addLogEntry(`${who} attacks ${coordLabel} — HIT!`);

    // Check if any ship was just sunk
    const sunkShip = ships.find((s) => !s.sunk && s.cells.some((c) => c.row === row && c.col === col));
    if (sunkShip && checkSunk(board, sunkShip)) {
      const shipDef = SHIP_DEFS[sunkShip.id];
      const shipName = shipDef ? shipDef.name : `ship (len ${sunkShip.length})`;
      addLogEntry(`${who} sunk the ${shipName}!`);
      updateStatus(`${who} sunk the ${shipName}!`);
    } else {
      updateStatus(`${who} hit at ${coordLabel}!`);
    }

    // Update AI targeting memory on its own hits
    if (!isPlayer) {
      enqueueAiCandidates(row, col);
    }
  } else {
    // MISS
    board[row][col] = CELL_STATES.MISS;
    addLogEntry(`${who} attacks ${coordLabel} — miss.`);
    updateStatus(`${who} missed at ${coordLabel}.`);

    // If AI missed, drop back to hunt mode by clearing candidates for the
    // current chain (simple strategy: keep remaining candidates so adjacent
    // cells of earlier hits are still tried).
  }

  renderAll();

  // Check win
  if (checkWin(ships)) {
    const winner = isPlayer ? "Player" : "AI";
    gameState.phase = PHASES.GAME_OVER;
    updateStatus(`${winner} wins! All ships sunk. Press Restart to play again.`);
    addLogEntry(`=== ${winner} wins! ===`);
    renderAll();
    return;
  }

  // Switch turns
  if (isPlayer) {
    gameState.currentTurn = "ai";
    updateStatus("AI is thinking...");
    aiTimeoutId = setTimeout(() => {
      aiTimeoutId = null;
      aiTakeTurn();
    }, 600);
  } else {
    gameState.currentTurn = "player";
    updateStatus("Your turn! Click an enemy cell to attack.");
  }
}

// =============================================================================
// AI LOGIC (hunt / target mode)
// =============================================================================

/**
 * Picks a cell and fires. Uses target-mode candidates first (adjacent cells
 * of previous hits), falling back to random hunt-mode.
 */
function aiTakeTurn() {
  if (gameState.phase !== PHASES.PLAYING) return;

  let row, col;

  // Target mode: try queued candidates
  while (gameState.aiCandidates.length > 0) {
    const candidate = gameState.aiCandidates.shift();
    const key = `${candidate.row},${candidate.col}`;
    if (
      candidate.row >= 0 && candidate.row < BOARD_SIZE &&
      candidate.col >= 0 && candidate.col < BOARD_SIZE &&
      !gameState.aiAttacked.has(key)
    ) {
      row = candidate.row;
      col = candidate.col;
      break;
    }
  }

  // Hunt mode: pick a random un-attacked cell
  if (row === undefined) {
    const available = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!gameState.aiAttacked.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    if (available.length === 0) return; // no cells left (shouldn't happen)
    const pick = available[Math.floor(Math.random() * available.length)];
    row = pick.row;
    col = pick.col;
  }

  gameState.aiAttacked.add(`${row},${col}`);
  resolveAttack("ai", gameState.playerBoard, gameState.playerShips, row, col);
}

/**
 * After an AI hit, enqueue the four orthogonal neighbours as target candidates.
 * Skips cells already attacked.
 */
function enqueueAiCandidates(row, col) {
  const directions = [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];
  for (const d of directions) {
    const key = `${d.row},${d.col}`;
    if (
      d.row >= 0 && d.row < BOARD_SIZE &&
      d.col >= 0 && d.col < BOARD_SIZE &&
      !gameState.aiAttacked.has(key)
    ) {
      // Avoid duplicate entries
      if (!gameState.aiCandidates.some((c) => c.row === d.row && c.col === d.col)) {
        gameState.aiCandidates.push(d);
      }
    }
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Called when a cell on the player's own board is clicked.
 * During setup, clicking a placed ship rotates it.
 */
function handlePlayerBoardClick(row, col) {
  if (gameState.phase !== PHASES.SETUP) return;

  // Find which ship occupies this cell (if any) and rotate it
  const shipIndex = gameState.playerShips.findIndex((ship) =>
    ship.cells.some((c) => c.row === row && c.col === col)
  );

  if (shipIndex === -1) return;
  handleRotateShip(shipIndex);
}

/**
 * Called when a cell on the enemy board is clicked.
 * Validates the click and resolves the player's attack.
 */
function handleEnemyBoardClick(row, col) {
  if (!gameState.isGameStarted) {
    updateStatus("Start the game first!");
    return;
  }

  if (gameState.phase !== PHASES.PLAYING) {
    return;
  }

  if (gameState.currentTurn !== "player") {
    return;
  }

  const cellState = gameState.enemyBoard[row][col];
  if (cellState === CELL_STATES.HIT || cellState === CELL_STATES.MISS) {
    updateStatus("You already targeted that cell.");
    return;
  }

  // Resolve the attack
  resolveAttack("player", gameState.enemyBoard, gameState.enemyShips, row, col);
}

/** Randomizes ship placement on the player board and marks all bank ships as placed. */
function handleRandomize() {
  if (gameState.phase !== PHASES.SETUP) {
    updateStatus("Can only randomize during setup.");
    return;
  }

  // Reset player board and ships, then randomly place all
  gameState.playerBoard = createEmptyBoard(BOARD_SIZE);
  gameState.playerShips = placeAllShipsRandomly(gameState.playerBoard);

  updateStatus("All ships placed! Press Start Game to begin.");
  renderAll();
}

/** Starts the game once all ships are placed. */
function handleStartGame() {
  if (gameState.phase !== PHASES.SETUP) {
    return;
  }

  if (gameState.playerShips.length < SHIP_DEFS.length) {
    updateStatus(`Place all ${SHIP_DEFS.length} ships first!`);
    return;
  }

  // Place enemy ships (hidden from the player via renderBoard's hideShips option)
  gameState.enemyBoard = createEmptyBoard(BOARD_SIZE);
  gameState.enemyShips = placeAllShipsRandomly(gameState.enemyBoard);

  gameState.phase = PHASES.PLAYING;
  gameState.isGameStarted = true;
  gameState.currentTurn = "player";

  updateStatus("Game started \u2014 your turn! Click an enemy cell to attack.");
  addLogEntry("Game started.");
  renderAll();

  console.log("Game started");
}

/** Resets everything back to initial state. */
function handleRestart() {
  resetGameState();
  console.log("Game restarted");
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/** Wires up button listeners and performs the first render. */
function init() {
  dom.btnRandomize.addEventListener("click", handleRandomize);
  dom.btnStart.addEventListener("click", handleStartGame);
  dom.btnRestart.addEventListener("click", handleRestart);

  initDragAndDrop();
  renderAll();
}

// Kick everything off once the DOM is ready
init();
