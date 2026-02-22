# Battleship

A browser-based, single-player Battleship game built with vanilla HTML, CSS, and JavaScript.

## Current Progress

**Foundation / UI scaffold**

- 10x10 grid rendering for player and enemy boards
- Game state data structure (phase, boards, ships, move log)
- Stub event handlers wired to buttons and board cells
- CSS classes defined for all future cell states (ship, hit, miss, disabled, preview)
- Move log panel placeholder

## How to Run

1. Clone or download this repository.
2. Open `index.html` in any modern web browser.

No build step, no dependencies.

## Planned Next Steps

1. **Ship placement** — random algorithm + optional manual drag-and-drop
2. **Enemy ship placement** — random placement at game start
3. **Attack resolution** — hit/miss detection, board updates, sunk tracking
4. **AI turns** — basic random targeting, then smarter hunt/target logic
5. **Win/loss conditions** — detect when all ships of a fleet are sunk
6. **Polish** — animations, sound effects, responsive layout improvements

## File Structure

| File         | Purpose                              |
| ------------ | ------------------------------------ |
| `index.html` | Page structure and layout            |
| `style.css`  | Styling, grid layout, cell states    |
| `script.js`  | Game state, rendering, event wiring  |
| `README.md`  | Project documentation                |
