// =============================================================================
// CONSTANTS
// =============================================================================

const BOARD_SIZE = 10;

const SHIP_LENGTHS = [5, 4, 3, 3, 2];

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
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
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
// EVENT HANDLERS (stubs — gameplay logic goes here later)
// =============================================================================

/**
 * Called when a cell on the player's own board is clicked.
 * Will be used for manual ship placement in a future step.
 */
function handlePlayerBoardClick(row, col) {
  // TODO: Implement manual ship placement during SETUP phase
  console.log(`Player board clicked: (${row}, ${col})`);
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

  // TODO: Resolve attack (check for ship, mark hit/miss, check sunk/win)
  console.log(`Attack enemy at: (${row}, ${col})`);
  addLogEntry(`Player attacks (${row}, ${col})`);
  updateStatus("Attack registered — resolve logic TODO");
}

/** Stub: randomizes ship placement on the player board. */
function handleRandomize() {
  if (gameState.phase !== PHASES.SETUP) {
    updateStatus("Can only randomize during setup.");
    return;
  }

  // TODO: Implement random ship placement algorithm
  // 1. Clear current player ships
  // 2. For each ship length in SHIP_LENGTHS, pick random position & orientation
  // 3. Validate no overlaps or out-of-bounds
  // 4. Write CELL_STATES.SHIP into playerBoard
  // 5. Store ship objects in gameState.playerShips

  console.log("Randomize ships — not yet implemented");
  updateStatus("Ship randomization coming soon!");
  renderAll();
}

/** Stub: starts the game (transitions from setup to playing). */
function handleStartGame() {
  if (gameState.phase !== PHASES.SETUP) {
    return;
  }

  if (gameState.playerShips.length === 0) {
    updateStatus("Place your ships first! (use Randomize)");
    return;
  }

  // TODO: Also randomize enemy ships here (or beforehand)
  // TODO: Validate both fleets are fully placed

  gameState.phase = PHASES.PLAYING;
  gameState.isGameStarted = true;
  gameState.currentTurn = "player";

  updateStatus("Game started — your turn! Click an enemy cell to attack.");
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

  renderAll();
}

// Kick everything off once the DOM is ready
init();
