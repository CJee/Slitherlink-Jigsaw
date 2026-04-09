# Slitherlink Jigsaw App

This application is a hybrid puzzle game combining Slitherlink (a logic puzzle) with a Jigsaw mechanic. Players must assemble the 3x3 tiles correctly and then solve the Slitherlink loop that spans across them.

## File Structure & Functions

### Root Files
- **`index.html`**: The entry point HTML file that loads the React application.
- **`metadata.json`**: Contains application metadata such as name, description, and required frame permissions.
- **`package.json`**: Manages project dependencies (React, Tailwind, Lucide, Framer Motion) and build scripts.
- **`vite.config.ts`**: Configuration for the Vite build tool.
- **`tsconfig.json`**: TypeScript compiler configuration.
- **`.env.example`**: A template for environment variables required by the application.
- **`.gitignore`**: Specifies files and directories that should be ignored by Git.

### Source Files (`/src`)
- **`main.tsx`**: The main entry point for React. It initializes the root element and renders the `<App />` component.
- **`index.css`**: Global stylesheet importing Tailwind CSS and defining the theme.
- **`App.tsx`**: The core of the application. It contains all game logic, state management, and UI components.
  - **`generatePuzzle`** (Line 66): Generates a valid Slitherlink loop and slices it into 3x3 tiles for the jigsaw.
  - **`App` Component** (Line 202): The main functional component.
    - **`handleKeyDown`** (Line 299): Manages keyboard shortcuts (Undo: Ctrl+Z, Redo: Ctrl+Y, Pencil: P, Eraser: E).
    - **`formatTime`** (Line 343): Converts game duration into a readable format.
    - **`updateEdge`** (Line 349): Toggles the state of a grid edge (Blank → Line → X).
    - **`handleInventoryEdgeClick`** (Line 367): Manages edge interactions for tiles in the bank.
    - **`handleBoardEdgeClick`** (Line 451): Manages edge interactions for tiles placed on the assembly board.
    - **`checkWin`** (Line 597): Validates if the puzzle is solved by checking loop continuity and number constraints.
    - **`handleDrop`** (Line 721): Logic for placing a tile onto the board.
    - **`removeFromBoard`** (Line 768): Logic for returning a tile from the board to the bank.

### Library Files (`/src/lib`)
- **`utils.ts`**: Contains helper functions.
  - **`cn`** (Line 4): A utility for conditionally joining Tailwind CSS classes using `clsx` and `tailwind-merge`.

