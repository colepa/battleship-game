// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 10;

const SHIP_DEFS = [
  { name: "Carrier", length: 5 },
  { name: "Battleship", length: 4 },
  { name: "Cruiser", length: 3 },
  { name: "Submarine", length: 3 },
  { name: "Destroyer", length: 2 },
];

const SHIP_LENGTHS = SHIP_DEFS.map((s) => s.length);

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
  btnRandomize: document.getElementById("btn-randomize"),
  btnClear: document.getElementById("btn-clear"),
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
  shipBank: document.getElementById("ship-bank"),
  shipBankContainer: document.querySelector(".ship-bank-container"),
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
 * @returns {object}
 */
function createGameState() {
  return {
    phase: PHASES.SETUP,
    currentTurn: "player",
    isGameStarted: false,

    playerBoard: createEmptyBoard(BOARD_SIZE),
    enemyBoard: createEmptyBoard(BOARD_SIZE),

    // Ship arrays hold: { name, length, cells: [{row, col}], orientation, sunk, bankIndex }
    playerShips: [],
    enemyShips: [],

    // Track which ships from the bank have been placed
    placedShipIndices: new Set(),

    moveLog: [],
  };
}

/** The single source of truth for the current game. */
let gameState = createGameState();

/** Currently dragged ship info */
let dragState = null;

/**
 * Resets the game state back to initial values and re-renders everything.
 */
function resetGameState() {
  gameState = createGameState();
  dragState = null;
  renderAll();
  renderShipBank();
  updateStatus("Setup your game — drag ships onto your board or click Randomize");
  clearMoveLog();
}

// =============================================================================
// SHIP PLACEMENT HELPERS
// =============================================================================

/**
 * Checks if a ship can be placed at a given position on the board.
 * @param {string[][]} board
 * @param {number} row - Starting row.
 * @param {number} col - Starting col.
 * @param {number} length - Ship length.
 * @param {"horizontal"|"vertical"} orientation
 * @returns {boolean}
 */
function canPlaceShip(board, row, col, length, orientation) {
  for (let i = 0; i < length; i++) {
    const r = orientation === "vertical" ? row + i : row;
    const c = orientation === "horizontal" ? col + i : col;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c] !== CELL_STATES.EMPTY) return false;
  }
  return true;
}

/**
 * Places a ship on the board. Assumes canPlaceShip was already checked.
 * @returns {{row: number, col: number}[]} - The cells occupied.
 */
function placeShipOnBoard(board, row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    const r = orientation === "vertical" ? row + i : row;
    const c = orientation === "horizontal" ? col + i : col;
    board[r][c] = CELL_STATES.SHIP;
    cells.push({ row: r, col: c });
  }
  return cells;
}

/**
 * Removes a ship from the board by clearing its cells.
 */
function removeShipFromBoard(board, cells) {
  for (const { row, col } of cells) {
    board[row][col] = CELL_STATES.EMPTY;
  }
}

/**
 * Returns the cells a ship would occupy, or null if any cell is out of bounds.
 */
function getShipCells(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    const r = orientation === "vertical" ? row + i : row;
    const c = orientation === "horizontal" ? col + i : col;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
    cells.push({ row: r, col: c });
  }
  return cells;
}

/**
 * Randomly places all ships on a board.
 * @param {string[][]} board
 * @returns {object[]} Array of ship objects.
 */
function randomPlaceAllShips(board) {
  const ships = [];
  for (const def of SHIP_DEFS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      attempts++;
      const orientation = Math.random() < 0.5 ? "horizontal" : "vertical";
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (canPlaceShip(board, row, col, def.length, orientation)) {
        const cells = placeShipOnBoard(board, row, col, def.length, orientation);
        ships.push({
          name: def.name,
          length: def.length,
          cells,
          orientation,
          sunk: false,
        });
        placed = true;
      }
    }
  }
  return ships;
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * Renders a 10x10 grid of cells into the given board element.
 */
function renderBoard(boardEl, boardData, options = {}) {
  const { hideShips = false, onCellClick = null, isPlayerBoard = false } = options;

  boardEl.innerHTML = "";

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.row = row;
      cell.dataset.col = col;

      const state = boardData[row][col];

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
      }

      if (onCellClick) {
        cell.addEventListener("click", () => onCellClick(row, col));
      }

      // Drag-and-drop targets on player board during setup
      if (isPlayerBoard && gameState.phase === PHASES.SETUP) {
        cell.addEventListener("dragover", handleDragOver);
        cell.addEventListener("dragenter", handleDragEnter);
        cell.addEventListener("dragleave", handleDragLeave);
        cell.addEventListener("drop", handleDrop);
      }

      boardEl.appendChild(cell);
    }
  }
}

/**
 * Re-renders both boards.
 */
function renderAll() {
  renderBoard(dom.playerBoard, gameState.playerBoard, {
    hideShips: false,
    onCellClick: handlePlayerBoardClick,
    isPlayerBoard: true,
  });

  renderBoard(dom.enemyBoard, gameState.enemyBoard, {
    hideShips: true,
    onCellClick: handleEnemyBoardClick,
  });
}

/**
 * Renders the ship bank below the boards.
 */
function renderShipBank() {
  dom.shipBank.innerHTML = "";

  if (gameState.phase !== PHASES.SETUP) {
    dom.shipBankContainer.style.display = "none";
    return;
  }

  dom.shipBankContainer.style.display = "";

  SHIP_DEFS.forEach((def, index) => {
    const shipEl = document.createElement("div");
    shipEl.classList.add("ship-bank__ship");
    shipEl.dataset.shipIndex = index;
    shipEl.dataset.orientation = "horizontal";

    const isPlaced = gameState.placedShipIndices.has(index);
    if (isPlaced) {
      shipEl.classList.add("ship-bank__ship--placed");
      shipEl.draggable = false;
    } else {
      shipEl.draggable = true;
    }

    // Ship label
    const label = document.createElement("span");
    label.classList.add("ship-bank__label");
    label.textContent = `${def.name} (${def.length})`;
    shipEl.appendChild(label);

    // Ship cells visual
    const cellsContainer = document.createElement("div");
    cellsContainer.classList.add("ship-bank__cells");
    for (let i = 0; i < def.length; i++) {
      const cellEl = document.createElement("div");
      cellEl.classList.add("ship-bank__cell");
      cellsContainer.appendChild(cellEl);
    }
    shipEl.appendChild(cellsContainer);

    // Rotate button (only for unplaced ships)
    if (!isPlaced) {
      const rotateBtn = document.createElement("button");
      rotateBtn.classList.add("ship-bank__rotate-btn");
      rotateBtn.textContent = "Rotate";
      rotateBtn.title = "Toggle horizontal/vertical";
      rotateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = shipEl.dataset.orientation;
        const next = current === "horizontal" ? "vertical" : "horizontal";
        shipEl.dataset.orientation = next;
        cellsContainer.classList.toggle(
          "ship-bank__cells--vertical",
          next === "vertical"
        );
      });
      shipEl.appendChild(rotateBtn);
    }

    // Drag events
    shipEl.addEventListener("dragstart", (e) => {
      if (isPlaced) {
        e.preventDefault();
        return;
      }
      dragState = {
        shipIndex: index,
        shipDef: def,
        orientation: shipEl.dataset.orientation,
        gripOffset: 0,
      };

      // Compute grip offset (which cell the user grabbed)
      const cellRect = cellsContainer.getBoundingClientRect();
      const orientation = shipEl.dataset.orientation;
      if (orientation === "horizontal") {
        const cellWidth = cellRect.width / def.length;
        const offsetX = e.clientX - cellRect.left;
        dragState.gripOffset = Math.floor(offsetX / cellWidth);
      } else {
        const cellHeight = cellRect.height / def.length;
        const offsetY = e.clientY - cellRect.top;
        dragState.gripOffset = Math.floor(offsetY / cellHeight);
      }

      // Clamp grip offset to valid range
      dragState.gripOffset = Math.max(
        0,
        Math.min(dragState.gripOffset, def.length - 1)
      );

      shipEl.classList.add("ship-bank__ship--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "ship");
    });

    shipEl.addEventListener("dragend", () => {
      shipEl.classList.remove("ship-bank__ship--dragging");
      clearPreview();
      dragState = null;
    });

    dom.shipBank.appendChild(shipEl);
  });
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

function addLogEntry(message) {
  gameState.moveLog.push(message);
  const li = document.createElement("li");
  li.textContent = message;
  dom.moveLog.prepend(li);
}

function clearMoveLog() {
  gameState.moveLog = [];
  dom.moveLog.innerHTML = "";
}

// =============================================================================
// DRAG & DROP HANDLERS
// =============================================================================

/**
 * Computes the anchor (top-left) row/col for a ship placement,
 * given the target cell and the grip offset within the ship.
 */
function getAnchorFromTarget(targetRow, targetCol) {
  if (!dragState) return null;
  const { orientation, gripOffset } = dragState;
  if (orientation === "horizontal") {
    return { row: targetRow, col: targetCol - gripOffset };
  } else {
    return { row: targetRow - gripOffset, col: targetCol };
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
  e.preventDefault();
  if (!dragState) return;

  const targetRow = parseInt(e.currentTarget.dataset.row);
  const targetCol = parseInt(e.currentTarget.dataset.col);
  const anchor = getAnchorFromTarget(targetRow, targetCol);
  if (!anchor) return;

  const { shipDef, orientation } = dragState;
  showPreview(anchor.row, anchor.col, shipDef.length, orientation);
}

function handleDragLeave(e) {
  const related = e.relatedTarget;
  if (!related || !dom.playerBoard.contains(related)) {
    clearPreview();
  }
}

function handleDrop(e) {
  e.preventDefault();
  if (!dragState) return;

  const targetRow = parseInt(e.currentTarget.dataset.row);
  const targetCol = parseInt(e.currentTarget.dataset.col);
  const anchor = getAnchorFromTarget(targetRow, targetCol);
  if (!anchor) return;

  const { shipIndex, shipDef, orientation } = dragState;

  if (
    canPlaceShip(
      gameState.playerBoard,
      anchor.row,
      anchor.col,
      shipDef.length,
      orientation
    )
  ) {
    const cells = placeShipOnBoard(
      gameState.playerBoard,
      anchor.row,
      anchor.col,
      shipDef.length,
      orientation
    );

    gameState.playerShips.push({
      name: shipDef.name,
      length: shipDef.length,
      cells,
      orientation,
      sunk: false,
      bankIndex: shipIndex,
    });

    gameState.placedShipIndices.add(shipIndex);

    renderAll();
    renderShipBank();
    updateShipCount();
  } else {
    updateStatus("Cannot place ship there — out of bounds or overlapping!");
  }

  clearPreview();
  dragState = null;
}

/**
 * Shows a placement preview (green/red) on the player board.
 */
function showPreview(row, col, length, orientation) {
  clearPreview();
  const cells = getShipCells(row, col, length, orientation);
  if (!cells) return;

  const valid = canPlaceShip(gameState.playerBoard, row, col, length, orientation);

  for (const { row: r, col: c } of cells) {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    const cellEl = dom.playerBoard.querySelector(
      `.cell[data-row="${r}"][data-col="${c}"]`
    );
    if (cellEl) {
      cellEl.classList.add(
        valid ? "cell--preview-valid" : "cell--preview-invalid"
      );
    }
  }
}

function clearPreview() {
  dom.playerBoard
    .querySelectorAll(".cell--preview-valid, .cell--preview-invalid")
    .forEach((el) => {
      el.classList.remove("cell--preview-valid", "cell--preview-invalid");
    });
}

function updateShipCount() {
  const placed = gameState.playerShips.length;
  const total = SHIP_DEFS.length;
  if (placed < total) {
    updateStatus(
      `Ships placed: ${placed}/${total} — drag more ships or click Randomize`
    );
  } else {
    updateStatus('All ships placed! Click "Start Game" to begin.');
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Called when a cell on the player's own board is clicked.
 * During setup: clicking on a placed ship removes it.
 */
function handlePlayerBoardClick(row, col) {
  if (gameState.phase !== PHASES.SETUP) return;

  const state = gameState.playerBoard[row][col];
  if (state === CELL_STATES.SHIP) {
    // Find which ship occupies this cell
    const shipIdx = gameState.playerShips.findIndex((ship) =>
      ship.cells.some((c) => c.row === row && c.col === col)
    );
    if (shipIdx !== -1) {
      const ship = gameState.playerShips[shipIdx];
      removeShipFromBoard(gameState.playerBoard, ship.cells);
      if (ship.bankIndex !== undefined) {
        gameState.placedShipIndices.delete(ship.bankIndex);
      }
      gameState.playerShips.splice(shipIdx, 1);
      renderAll();
      renderShipBank();
      updateShipCount();
    }
  }
}

/**
 * Called when a cell on the enemy board is clicked.
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

  // TODO: Resolve attack (check for ship, mark hit/miss, check sunk/win)
  console.log(`Attack enemy at: (${row}, ${col})`);
  addLogEntry(`Player attacks (${row}, ${col})`);
  updateStatus("Attack registered — resolve logic TODO");
}

/** Randomizes ship placement on the player board. */
function handleRandomize() {
  if (gameState.phase !== PHASES.SETUP) {
    updateStatus("Can only randomize during setup.");
    return;
  }

  // Clear current player ships
  gameState.playerBoard = createEmptyBoard(BOARD_SIZE);
  gameState.playerShips = [];
  gameState.placedShipIndices.clear();

  // Randomly place all ships
  gameState.playerShips = randomPlaceAllShips(gameState.playerBoard);

  // Mark all ships as placed from bank
  SHIP_DEFS.forEach((_, index) => {
    gameState.placedShipIndices.add(index);
  });

  // Assign bank indices to randomized ships
  gameState.playerShips.forEach((ship, i) => {
    ship.bankIndex = i;
  });

  renderAll();
  renderShipBank();
  updateStatus('All ships placed! Click "Start Game" to begin.');
}

/** Clears all placed ships from the player board. */
function handleClearBoard() {
  if (gameState.phase !== PHASES.SETUP) {
    updateStatus("Can only clear during setup.");
    return;
  }

  gameState.playerBoard = createEmptyBoard(BOARD_SIZE);
  gameState.playerShips = [];
  gameState.placedShipIndices.clear();

  renderAll();
  renderShipBank();
  updateStatus("Board cleared — drag ships onto your board or click Randomize");
}

/** Starts the game (transitions from setup to playing). */
function handleStartGame() {
  if (gameState.phase !== PHASES.SETUP) {
    return;
  }

  if (gameState.playerShips.length < SHIP_DEFS.length) {
    updateStatus(
      `Place all your ships first! (${gameState.playerShips.length}/${SHIP_DEFS.length} placed)`
    );
    return;
  }

  // Randomize enemy ships
  gameState.enemyShips = randomPlaceAllShips(gameState.enemyBoard);

  gameState.phase = PHASES.PLAYING;
  gameState.isGameStarted = true;
  gameState.currentTurn = "player";

  updateStatus("Game started — your turn! Click an enemy cell to attack.");
  addLogEntry("Game started.");
  renderAll();
  renderShipBank();

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
  dom.btnClear.addEventListener("click", handleClearBoard);
  dom.btnStart.addEventListener("click", handleStartGame);
  dom.btnRestart.addEventListener("click", handleRestart);

  renderAll();
  renderShipBank();
  updateStatus("Setup your game — drag ships onto your board or click Randomize");
}

// Kick everything off once the DOM is ready
init();
