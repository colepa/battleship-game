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
  gameOverOverlay: document.getElementById("game-over-overlay"),
  gameOverTitle: document.getElementById("game-over-title"),
  gameOverSubtitle: document.getElementById("game-over-subtitle"),
  gameOverBtn: document.getElementById("game-over-btn"),
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

    // AI decision-making memory — resets each game
    aiMemory: {
      mode: "hunt",            // "hunt" (random) or "target" (finishing a ship)
      candidateTargets: [],    // queued cells to try next (adjacent to hits)
      confirmedHits: [],       // connected hits for the ship currently being targeted
      lastMove: null,          // { row, col, result } of the most recent AI attack
    },
  };
}

/** The single source of truth for the current game. */
let gameState = createGameState();

/**
 * Resets the game state back to initial values and re-renders everything.
 */
function resetGameState() {
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
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;

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
  const ships = [];

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
      console.error(`Failed to place ship of length ${shipLength} after ${maxAttempts} attempts.`);
    }
  }

  return ships;
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

      // Overlay a sunk indicator if this HIT cell belongs to a sunk ship
      if (state === CELL_STATES.HIT && options.ships) {
        const sunkShip = options.ships.find(
          (s) => s.sunk && s.cells.some((c) => c.row === row && c.col === col)
        );
        if (sunkShip) {
          cell.classList.remove("cell--hit");
          cell.classList.add("cell--sunk");
        }
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
    ships: gameState.playerShips,
  });

  // Enemy board: hide ships, allow attacks
  renderBoard(dom.enemyBoard, gameState.enemyBoard, {
    hideShips: true,
    onCellClick: handleEnemyBoardClick,
    ships: gameState.enemyShips,
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

/**
 * Creates a custom drag image element that looks like a row/column of ship cells.
 * Positions the grab offset so the cursor lines up with the grabbed cell.
 * The element is appended off-screen and cleaned up after the drag frame.
 */
function setCustomDragImage(e, shipLength, grabOffset, isHorizontal) {
  const cellPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 36;
  const gapPx  = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--board-gap'))  || 2;

  const ghost = document.createElement('div');
  ghost.style.display = 'flex';
  ghost.style.flexDirection = isHorizontal ? 'row' : 'column';
  ghost.style.gap = gapPx + 'px';
  ghost.style.position = 'absolute';
  ghost.style.top = '-1000px';
  ghost.style.left = '-1000px';
  ghost.style.pointerEvents = 'none';

  for (let i = 0; i < shipLength; i++) {
    const cell = document.createElement('div');
    cell.style.width  = cellPx + 'px';
    cell.style.height = cellPx + 'px';
    cell.style.background = 'var(--color-cell-ship)';
    cell.style.borderRadius = '2px';
    cell.style.opacity = '0.85';
    ghost.appendChild(cell);
  }

  document.body.appendChild(ghost);

  // Offset so the cursor sits in the center of the grabbed cell
  const offsetMain = grabOffset * (cellPx + gapPx) + cellPx / 2;
  const offsetCross = cellPx / 2;
  const offsetX = isHorizontal ? offsetMain : offsetCross;
  const offsetY = isHorizontal ? offsetCross : offsetMain;

  e.dataTransfer.setDragImage(ghost, offsetX, offsetY);

  // Remove the ghost element after the browser captures it
  requestAnimationFrame(() => ghost.remove());
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
    setCustomDragImage(e, def.length, grabOffset, true);
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
    setCustomDragImage(e, ship.length, grabOffset, ship.isHorizontal);

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
// ATTACK RESOLUTION
// =============================================================================

/**
 * Converts row/col to a human-readable label like "A1", "B5", etc.
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
function coordLabel(row, col) {
  return String.fromCharCode(65 + row) + (col + 1);
}

/**
 * Checks whether a specific ship has been sunk (all cells are HIT).
 * If so, marks the ship's `sunk` property.
 * @param {string[][]} board
 * @param {{ cells: {row:number,col:number}[], sunk: boolean }} ship
 * @returns {boolean}
 */
function checkShipSunk(board, ship) {
  if (ship.sunk) return true;
  const isSunk = ship.cells.every((c) => board[c.row][c.col] === CELL_STATES.HIT);
  if (isSunk) ship.sunk = true;
  return isSunk;
}

/**
 * Returns true when every ship in the fleet has been sunk.
 * @param {{ sunk: boolean }[]} ships
 * @returns {boolean}
 */
function checkAllSunk(ships) {
  return ships.length > 0 && ships.every((s) => s.sunk);
}

/**
 * Resolves an attack on a board cell.
 * Mutates the board to HIT or MISS and returns the result.
 *
 * @param {string[][]} board   - Target board.
 * @param {{ cells: {row:number,col:number}[], sunk: boolean }[]} ships - Fleet on that board.
 * @param {number} row
 * @param {number} col
 * @returns {{ result: "hit"|"miss", sunkShip: object|null }}
 */
function resolveAttack(board, ships, row, col) {
  if (board[row][col] === CELL_STATES.SHIP) {
    board[row][col] = CELL_STATES.HIT;
    const hitShip = ships.find((s) =>
      s.cells.some((c) => c.row === row && c.col === col)
    );
    const justSunk = hitShip && checkShipSunk(board, hitShip);
    return { result: "hit", sunkShip: justSunk ? hitShip : null };
  }
  board[row][col] = CELL_STATES.MISS;
  return { result: "miss", sunkShip: null };
}

// =============================================================================
// AI TURN — HUNT / TARGET LOGIC
// =============================================================================

/**
 * Returns true if (row, col) is inside the board and has not been attacked yet.
 */
function isValidAiTarget(row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
  const state = gameState.playerBoard[row][col];
  return state !== CELL_STATES.HIT && state !== CELL_STATES.MISS;
}

/**
 * Returns the four cardinal neighbours of (row, col) that are valid targets.
 * Filters out already-attacked and out-of-bounds cells.
 */
function getValidAdjacentCells(row, col) {
  const directions = [
    { row: row - 1, col },  // up
    { row: row + 1, col },  // down
    { row, col: col - 1 },  // left
    { row, col: col + 1 },  // right
  ];
  return directions.filter((d) => isValidAiTarget(d.row, d.col));
}

/**
 * Given 2+ connected hits, returns only the cells that continue the line
 * in the detected direction (horizontal or vertical).
 * Falls back to all valid neighbours if direction can't be determined.
 */
function getDirectionalCandidates(confirmedHits) {
  if (confirmedHits.length < 2) return [];

  // Determine orientation from the first two hits
  const isHorizontal = confirmedHits[0].row === confirmedHits[1].row;

  // Sort hits along the line so we can extend from both ends
  const sorted = [...confirmedHits].sort((a, b) =>
    isHorizontal ? a.col - b.col : a.row - b.row
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Extend in both directions along the line
  const candidates = [];
  if (isHorizontal) {
    candidates.push({ row: first.row, col: first.col - 1 }); // extend left
    candidates.push({ row: last.row, col: last.col + 1 });    // extend right
  } else {
    candidates.push({ row: first.row - 1, col: first.col }); // extend up
    candidates.push({ row: last.row + 1, col: last.col });    // extend down
  }

  return candidates.filter((c) => isValidAiTarget(c.row, c.col));
}

/**
 * Picks the next cell for the AI to attack.
 *
 * Hunt mode:  random untargeted cell.
 * Target mode: pull from candidateTargets queue, skipping stale entries.
 *              If the queue is empty, fall back to hunt mode.
 */
function chooseAiMove() {
  const mem = gameState.aiMemory;

  // --- Target mode: try candidates first ---
  if (mem.mode === "target") {
    // Prefer directional candidates when we have 2+ hits in a line
    if (mem.confirmedHits.length >= 2) {
      const directional = getDirectionalCandidates(mem.confirmedHits);
      if (directional.length > 0) {
        return directional[0];
      }
    }

    // Otherwise drain the general candidate queue, skipping stale cells
    while (mem.candidateTargets.length > 0) {
      const next = mem.candidateTargets.shift();
      if (isValidAiTarget(next.row, next.col)) {
        return next;
      }
      // Cell was already attacked or invalid — skip and try the next one
    }

    // Queue exhausted without a usable target — fall back to hunt mode
    mem.mode = "hunt";
  }

  // --- Hunt mode: pick a random untargeted cell ---
  const available = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isValidAiTarget(r, c)) {
        available.push({ row: r, col: c });
      }
    }
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Updates the AI's memory after an attack resolves.
 *
 * On HIT:  record the hit, queue adjacent cells, enter target mode.
 * On MISS: nothing special (candidates may still be queued).
 * On SUNK: clear targeting data and return to hunt mode.
 */
function updateAiTargetingState(row, col, result, sunkShip) {
  const mem = gameState.aiMemory;
  mem.lastMove = { row, col, result };

  if (result === "hit") {
    mem.confirmedHits.push({ row, col });
    mem.mode = "target";

    // Queue adjacent cells that haven't been attacked yet
    const adjacents = getValidAdjacentCells(row, col);
    for (const adj of adjacents) {
      // Avoid duplicate entries in the queue
      const alreadyQueued = mem.candidateTargets.some(
        (c) => c.row === adj.row && c.col === adj.col
      );
      if (!alreadyQueued) {
        mem.candidateTargets.push(adj);
      }
    }
  }

  // Ship sunk — clear all targeting data and go back to hunting
  if (sunkShip) {
    resetAiTargeting();
  }
}

/**
 * Clears the AI's targeting memory so it returns to hunt mode.
 * Called when a ship is sunk or the game restarts.
 */
function resetAiTargeting() {
  const mem = gameState.aiMemory;
  mem.mode = "hunt";
  mem.candidateTargets = [];
  mem.confirmedHits = [];
  mem.lastMove = null;
}

/**
 * Executes the AI's turn after a short delay.
 * Uses hunt/target logic to pick the best cell, attacks it,
 * updates the UI / move log, then hands the turn back to the player.
 */
function aiTurn() {
  if (gameState.phase !== PHASES.PLAYING) return;

  gameState.currentTurn = "ai";
  updateStatus("Enemy is thinking...");

  setTimeout(() => {
    if (gameState.phase !== PHASES.PLAYING) return;

    const target = chooseAiMove();
    if (!target) return; // no cells left (shouldn't happen normally)

    const { result, sunkShip } = resolveAttack(
      gameState.playerBoard,
      gameState.playerShips,
      target.row,
      target.col
    );

    // Update AI memory with the outcome
    updateAiTargetingState(target.row, target.col, result, sunkShip);

    // Log the result
    const label = coordLabel(target.row, target.col);
    if (result === "hit") {
      const sunkMsg = sunkShip ? " and sunk your ship!" : "";
      addLogEntry(`Enemy attacks ${label} — HIT${sunkMsg}`);
    } else {
      addLogEntry(`Enemy attacks ${label} — MISS`);
    }

    // Check if AI won
    if (checkAllSunk(gameState.playerShips)) {
      gameState.phase = PHASES.GAME_OVER;
      updateStatus("You lost! All your ships have been sunk.");
      addLogEntry("Game over — you lost.");
      renderAll();
      showGameOverOverlay(false);
      return;
    }

    gameState.currentTurn = "player";
    updateStatus("Your turn! Click an enemy cell to attack.");
    renderAll();
  }, 800);
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
 * Will resolve attacks once gameplay is implemented.
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

  const { result, sunkShip } = resolveAttack(
    gameState.enemyBoard,
    gameState.enemyShips,
    row,
    col
  );

  const label = coordLabel(row, col);
  if (result === "hit") {
    const sunkMsg = sunkShip ? " and sunk a ship!" : "";
    addLogEntry(`You attack ${label} — HIT${sunkMsg}`);
    updateStatus(`HIT at ${label}!${sunkMsg}`);
  } else {
    addLogEntry(`You attack ${label} — MISS`);
    updateStatus(`Miss at ${label}.`);
  }

  // Check if player won
  if (checkAllSunk(gameState.enemyShips)) {
    gameState.phase = PHASES.GAME_OVER;
    updateStatus("You win! All enemy ships have been sunk!");
    addLogEntry("Game over — you win!");
    renderAll();
    showGameOverOverlay(true);
    return;
  }

  renderAll();
  aiTurn();
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

/**
 * Shows the game-over overlay with win or lose messaging.
 * @param {boolean} playerWon
 */
function showGameOverOverlay(playerWon) {
  const title = dom.gameOverTitle;
  const subtitle = dom.gameOverSubtitle;
  const btn = dom.gameOverBtn;

  title.textContent = playerWon ? "Victory!" : "Defeat";
  title.className = "game-over-overlay__title " +
    (playerWon ? "game-over-overlay__title--win" : "game-over-overlay__title--lose");

  subtitle.textContent = playerWon
    ? "You sunk the entire enemy fleet!"
    : "All your ships have been destroyed.";

  btn.className = "game-over-overlay__btn " +
    (playerWon ? "game-over-overlay__btn--win" : "game-over-overlay__btn--lose");

  dom.gameOverOverlay.classList.add("game-over-overlay--visible");
}

/** Hides the game-over overlay. */
function hideGameOverOverlay() {
  dom.gameOverOverlay.classList.remove("game-over-overlay--visible");
}

/** Resets everything back to initial state. */
function handleRestart() {
  hideGameOverOverlay();
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

  dom.gameOverBtn.addEventListener("click", handleRestart);

  initDragAndDrop();
  renderAll();
}

// Kick everything off once the DOM is ready
init();
