import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import seedrandom from 'seedrandom';
import { 
  RotateCcw, 
  HelpCircle, 
  Trophy, 
  Timer, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Info,
  Lightbulb,
  MousePointer2,
  Undo2,
  Redo2,
  Pencil,
  Eraser,
  Moon,
  Sun,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Hash,
  Copy,
  Check
} from 'lucide-react';
import { cn } from './lib/utils';

// --- Types ---

type EdgeStatus = 'blank' | 'line' | 'x' | 'pencil-line' | 'pencil-x';

interface Tile {
  id: string;
  numbers: number[][]; // 3x3
  correctPos: { r: number; c: number }; // 0, 1, 2
  hEdges: EdgeStatus[][]; // 4 rows, 3 columns
  vEdges: EdgeStatus[][]; // 3 rows, 4 columns
}

interface GameState {
  gridDim: number; // 3 or 4
  puzzleId: string;
  tiles: (Tile | null)[][]; 
  inventory: Tile[];
  boardHEdges: EdgeStatus[][]; 
  boardVEdges: EdgeStatus[][]; 
  solutionEdges: { h: boolean[][], v: boolean[][] };
  showSolution: boolean;
  time: number;
  isWon: boolean;
  isStarted: boolean;
  history: any[]; // Simple history stack
  redoStack: any[]; // Redo stack
}

// --- Constants ---

const DEFAULT_GRID_DIM = 3;
const CELL_SIZE = 3; // Each tile is always 3x3 cells

// --- Helper Functions ---

const generatePuzzle = (gridDim: number, seed: string): { tiles: Tile[], solutionEdges: { h: boolean[][], v: boolean[][] } } => {
  const rng = seedrandom(seed);
  const gridSize = gridDim * CELL_SIZE;
  let finalTiles: Tile[] = [];
  let finalH: boolean[][] = [];
  let finalV: boolean[][] = [];

  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    // 1. Generate a single closed loop on the grid
    const inside = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
    
    const startR = Math.floor(rng() * (gridSize - 1));
    const startC = Math.floor(rng() * (gridSize - 1));
    inside[startR][startC] = true;
    inside[startR+1][startC] = true;

    const iterations = (gridDim === 2 ? 20 : gridDim === 3 ? 80 : 180) + Math.floor(rng() * 40);
    for (let i = 0; i < iterations; i++) {
      const candidates: [number, number][] = [];
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (inside[r][c]) continue;
          
          // Check if adding this cell creates a 2x2 interior block
          const checks = [
            [[0, 1], [1, 0], [1, 1]],
            [[0, -1], [1, -1], [1, 0]],
            [[-1, 0], [-1, 1], [0, 1]],
            [[-1, -1], [-1, 0], [0, -1]]
          ];
          const creates2x2 = checks.some(check => 
            check.every(([dr, dc]) => {
              const nr = r + dr;
              const nc = c + dc;
              return nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && inside[nr][nc];
            })
          );
          if (creates2x2) continue;

          const neighbors = [
            [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
          ].filter(([nr, nc]) => nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && inside[nr][nc]);
          
          if (neighbors.length > 0) {
            const neighbors8 = [
              [r-1, c-1], [r-1, c], [r-1, c+1],
              [r, c+1], [r+1, c+1], [r+1, c],
              [r+1, c-1], [r, c-1]
            ].map(([nr, nc]) => (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && inside[nr][nc]) ? 1 : 0);
            
            let transitions = 0;
            for (let j = 0; j < 8; j++) {
              if (neighbors8[j] !== neighbors8[(j + 1) % 8]) transitions++;
            }
            
            if (transitions === 2) {
              candidates.push([r, c]);
            }
          }
        }
      }
      
      if (candidates.length === 0) break;
      const [nr, nc] = candidates[Math.floor(rng() * candidates.length)];
      inside[nr][nc] = true;
    }

    // 2. Calculate numbers based on the boundary
    const solutionH = Array.from({ length: gridSize + 1 }, () => Array(gridSize).fill(false));
    const solutionV = Array.from({ length: gridSize + 1 }, () => Array(gridSize).fill(false));
    const numbers = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const top = inside[r][c] !== (r > 0 ? inside[r-1][c] : false);
        const bottom = inside[r][c] !== (r < gridSize - 1 ? inside[r+1][c] : false);
        const left = inside[r][c] !== (c > 0 ? inside[r][c-1] : false);
        const right = inside[r][c] !== (c < gridSize - 1 ? inside[r][c+1] : false);
        
        let count = 0;
        if (top) { solutionH[r][c] = true; count++; }
        if (bottom) { solutionH[r+1][c] = true; count++; }
        if (left) { solutionV[c][r] = true; count++; }
        if (right) { solutionV[c+1][r] = true; count++; }
        
        numbers[r][c] = count;
      }
    }

    // 3. Check for at most two zeros per tile
    let valid = true;
    const tiles: Tile[] = [];
    for (let tr = 0; tr < gridDim; tr++) {
      for (let tc = 0; tc < gridDim; tc++) {
        let zeroCount = 0;
        const tileNumbers: number[][] = [];
        for (let r = 0; r < 3; r++) {
          const row: number[] = [];
          for (let c = 0; c < 3; c++) {
            const val = numbers[tr * 3 + r][tc * 3 + c];
            if (val === 0) zeroCount++;
            row.push(val);
          }
          tileNumbers.push(row);
        }
        if (zeroCount > 1) {
          valid = false;
        }
        tiles.push({
          id: `tile-${tr}-${tc}`,
          numbers: tileNumbers,
          correctPos: { r: tr, c: tc },
          hEdges: Array.from({ length: 4 }, () => Array(3).fill('blank')),
          vEdges: Array.from({ length: 3 }, () => Array(4).fill('blank')),
        });
      }
    }

    if (valid || attempts === 100) {
      finalTiles = tiles;
      finalH = solutionH;
      finalV = solutionV;
      break;
    }
  }

  return { 
    tiles: finalTiles, 
    solutionEdges: { h: finalH, v: finalV } 
  };
};

// --- Components ---

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [draggedTile, setDraggedTile] = useState<Tile | null>(null);
  const [draggedFromBoard, setDraggedFromBoard] = useState<{r: number, c: number} | null>(null);
  const [hasDropped, setHasDropped] = useState(false);
  const [isPencilMode, setIsPencilMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [zoom, setZoom] = useState(90); 
  const [mouseButton, setMouseButton] = useState<number | null>(null);
  const [isEdgeHovered, setIsEdgeHovered] = useState(false);
  const [puzzleInput, setPuzzleInput] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  console.log("App Rendering, gameState:", !!gameState);

  const startNewGame = useCallback((gridDim: number = DEFAULT_GRID_DIM, seed?: string) => {
    try {
      const puzzleId = seed || Math.random().toString(36).substring(2, 8).toUpperCase();
      const { tiles, solutionEdges } = generatePuzzle(gridDim, puzzleId);
      
      // Use the same seed for shuffling tiles to keep it deterministic for the same ID
      const shuffleRng = seedrandom(puzzleId + '-shuffle');
      const shuffledTiles = [...tiles].sort(() => shuffleRng() - 0.5);
      const gridSize = gridDim * CELL_SIZE;
      
      setGameState({
        gridDim,
        puzzleId,
        tiles: Array.from({ length: gridDim }, () => Array(gridDim).fill(null)),
        inventory: shuffledTiles,
        boardHEdges: Array.from({ length: gridSize + 1 }, () => Array(gridSize).fill('blank')),
        boardVEdges: Array.from({ length: gridSize }, () => Array(gridSize + 1).fill('blank')),
        solutionEdges,
        showSolution: false,
        time: 0,
        isWon: false,
        isStarted: true,
        history: [],
        redoStack: []
      });
      setPuzzleInput('');
    } catch (error) {
      console.error("Failed to start new game:", error);
      const puzzleId = seed || 'ERROR';
      setGameState({
        gridDim,
        puzzleId,
        tiles: Array.from({ length: gridDim }, () => Array(gridDim).fill(null)),
        inventory: [],
        boardHEdges: Array.from({ length: gridDim * CELL_SIZE + 1 }, () => Array(gridDim * CELL_SIZE).fill('blank')),
        boardVEdges: Array.from({ length: gridDim * CELL_SIZE }, () => Array(gridDim * CELL_SIZE + 1).fill('blank')),
        solutionEdges: { h: [], v: [] },
        showSolution: false,
        time: 0,
        isWon: false,
        isStarted: false,
        history: [],
        redoStack: []
      });
    }
  }, []);

  // Initial game start - only runs once
  useEffect(() => {
    if (!gameState) {
      startNewGame(DEFAULT_GRID_DIM);
    }
  }, [startNewGame, gameState]);

  const undo = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.history.length === 0) return prev;
      const [lastState, ...remainingHistory] = prev.history;
      const { history, redoStack, ...currentState } = prev;
      return { 
        ...lastState, 
        history: remainingHistory,
        redoStack: [currentState, ...prev.redoStack].slice(0, 50)
      };
    });
  }, []);

  const redo = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.redoStack.length === 0) return prev;
      const [nextState, ...remainingRedo] = prev.redoStack;
      const { history, redoStack, ...currentState } = prev;
      return { 
        ...nextState, 
        redoStack: remainingRedo,
        history: [currentState, ...prev.history].slice(0, 50)
      };
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey)) {
        if (e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          redo();
        } else if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
        }
      } else {
        if (e.key.toLowerCase() === 'p') {
          setIsPencilMode(prev => {
            const next = !prev;
            if (next) setIsEraserMode(false);
            return next;
          });
        } else if (e.key.toLowerCase() === 'e') {
          setIsEraserMode(prev => {
            const next = !prev;
            if (next) setIsPencilMode(false);
            return next;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const handleMouseUp = () => setMouseButton(null);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    if (gameState && gameState.isStarted && !gameState.isWon) {
      const timer = setInterval(() => {
        setGameState(prev => prev ? { ...prev, time: prev.time + 1 } : null);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState?.isStarted, gameState?.isWon]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateEdge = (tile: Tile, type: 'h' | 'v', r: number, c: number, button: number): Tile => {
    const newH = tile.hEdges.map(row => [...row]);
    const newV = tile.vEdges.map(row => [...row]);
    const current = type === 'h' ? newH[r][c] : newV[r][c];
    let next: EdgeStatus = 'blank';

    if (button === 0) { // Left click
      next = current === 'line' ? 'blank' : 'line';
    } else { // Right click
      next = current === 'x' ? 'blank' : 'x';
    }

    if (type === 'h') newH[r][c] = next;
    else newV[r][c] = next;

    return { ...tile, hEdges: newH, vEdges: newV };
  };

  const handleInventoryEdgeClick = (tileId: string, type: 'h' | 'v', r: number, c: number, e: React.MouseEvent) => {
    if (!gameState || gameState.isWon) return;
    e.preventDefault();
    e.stopPropagation();
    setMouseButton(e.button);

    setGameState(prev => {
      if (!prev) return null;
      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      const newInventory = prev.inventory.map(t => {
        if (t.id === tileId) {
          const newH = t.hEdges.map(row => [...row]);
          const newV = t.vEdges.map(row => [...row]);
          const current = type === 'h' ? newH[r][c] : newV[r][c];
          let next: EdgeStatus = 'blank';

          if (isEraserMode) {
            next = 'blank';
          } else if (e.button === 0) { // Left click
            next = current === 'line' ? 'blank' : 'line';
          } else { // Right click
            next = current === 'x' ? 'blank' : 'x';
          }

          if (type === 'h') newH[r][c] = next;
          else newV[r][c] = next;

          return { ...t, hEdges: newH, vEdges: newV };
        }
        return t;
      });
      return { ...prev, inventory: newInventory, history: newHistory, redoStack: [] };
    });
  };

  const handleInventoryEdgeDrag = (tileId: string, type: 'h' | 'v', r: number, c: number) => {
    if (!gameState || gameState.isWon || mouseButton === null) return;

    setGameState(prev => {
      if (!prev) return null;
      
      let changed = false;
      const newInventory = prev.inventory.map(t => {
        if (t.id === tileId) {
          const current = type === 'h' ? t.hEdges[r][c] : t.vEdges[r][c];
          let next: EdgeStatus = 'blank';

          if (isEraserMode) {
            next = 'blank';
          } else if (mouseButton === 0) {
            next = 'line';
          } else {
            next = 'x';
          }

          if (current !== next) {
            changed = true;
            const newH = t.hEdges.map(row => [...row]);
            const newV = t.vEdges.map(row => [...row]);
            if (type === 'h') newH[r][c] = next;
            else newV[r][c] = next;
            return { ...t, hEdges: newH, vEdges: newV };
          }
        }
        return t;
      });

      if (!changed) return prev;

      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      return { ...prev, inventory: newInventory, history: newHistory, redoStack: [] };
    });
  };

  const getGlobalEdge = useCallback((type: 'h' | 'v', r: number, c: number): EdgeStatus => {
    if (!gameState) return 'blank';
    if (type === 'h') return gameState.boardHEdges[r][c];
    return gameState.boardVEdges[r][c];
  }, [gameState]);

  const handleBoardEdgeClick = (type: 'h' | 'v', r: number, c: number, e: React.MouseEvent) => {
    if (!gameState || gameState.isWon) return;
    e.preventDefault();
    e.stopPropagation();

    setGameState(prev => {
      if (!prev) return null;
      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      const newHEdges = prev.boardHEdges.map(row => [...row]);
      const newVEdges = prev.boardVEdges.map(row => [...row]);
      const newTiles = prev.tiles.map(row => [...row]);
      
      const current = type === 'h' ? newHEdges[r][c] : newVEdges[r][c];
      let next: EdgeStatus = 'blank';
      
      if (isEraserMode) {
        next = 'blank';
      } else if (isPencilMode) {
        if (e.button === 0) { // Left click
          next = current === 'pencil-line' ? 'blank' : 'pencil-line';
        } else { // Right click
          next = current === 'pencil-x' ? 'blank' : 'pencil-x';
        }
      } else {
        if (e.button === 0) { // Left click
          next = current === 'line' ? 'blank' : 'line';
        } else { // Right click
          next = current === 'x' ? 'blank' : 'x';
        }
      }

      if (current === next) return prev;

      if (type === 'h') newHEdges[r][c] = next;
      else newVEdges[r][c] = next;

      // Only update the tile if it's NOT a pencil mark
      if (next === 'line' || next === 'x' || next === 'blank') {
        const tr = Math.floor(r / 3);
        const tc = Math.floor(c / 3);
        
        const updateTileEdges = (targetTr: number, targetTc: number, edgeType: 'h' | 'v', localR: number, localC: number) => {
          if (targetTr < 0 || targetTr >= prev.gridDim || targetTc < 0 || targetTc >= prev.gridDim) return;
          const tile = newTiles[targetTr][targetTc];
          if (tile) {
            const updatedTile = { ...tile };
            const tH = updatedTile.hEdges.map(row => [...row]);
            const tV = updatedTile.vEdges.map(row => [...row]);
            if (edgeType === 'h') tH[localR][localC] = next as any;
            else tV[localR][localC] = next as any;
            updatedTile.hEdges = tH;
            updatedTile.vEdges = tV;
            newTiles[targetTr][targetTc] = updatedTile;
          }
        };

        if (type === 'h') {
          if (tr < prev.gridDim) updateTileEdges(tr, tc, 'h', r % 3, c % 3);
          if (r > 0 && r % 3 === 0) updateTileEdges(tr - 1, tc, 'h', 3, c % 3);
        } else {
          if (tc < prev.gridDim) updateTileEdges(tr, tc, 'v', r % 3, c % 3);
          if (c > 0 && c % 3 === 0) updateTileEdges(tr, tc - 1, 'v', r % 3, 3);
        }
      }

      return { 
        ...prev, 
        boardHEdges: newHEdges, 
        boardVEdges: newVEdges, 
        tiles: newTiles,
        history: newHistory,
        redoStack: []
      };
    });
  };

  const handleEdgeDrag = (type: 'h' | 'v', r: number, c: number) => {
    if (!gameState || gameState.isWon || mouseButton === null) return;
    
    setGameState(prev => {
      if (!prev) return null;
      const current = type === 'h' ? prev.boardHEdges[r][c] : prev.boardVEdges[r][c];
      let next: EdgeStatus = 'blank';
      
      if (isEraserMode) {
        next = 'blank';
      } else if (isPencilMode) {
        if (mouseButton === 0) next = 'pencil-line';
        else next = 'pencil-x';
      } else {
        if (mouseButton === 0) next = 'line';
        else next = 'x';
      }

      if (current === next) return prev;

      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      const newHEdges = prev.boardHEdges.map(row => [...row]);
      const newVEdges = prev.boardVEdges.map(row => [...row]);
      const newTiles = prev.tiles.map(row => [...row]);

      if (type === 'h') newHEdges[r][c] = next;
      else newVEdges[r][c] = next;

      // Sync to tiles
      if (next === 'line' || next === 'x' || next === 'blank') {
        const tr = Math.floor(r / 3);
        const tc = Math.floor(c / 3);
        const updateTileEdges = (targetTr: number, targetTc: number, edgeType: 'h' | 'v', localR: number, localC: number) => {
          if (targetTr < 0 || targetTr >= prev.gridDim || targetTc < 0 || targetTc >= prev.gridDim) return;
          const tile = newTiles[targetTr][targetTc];
          if (tile) {
            const updatedTile = { ...tile };
            const tH = updatedTile.hEdges.map(row => [...row]);
            const tV = updatedTile.vEdges.map(row => [...row]);
            if (edgeType === 'h') tH[localR][localC] = next as any;
            else tV[localR][localC] = next as any;
            updatedTile.hEdges = tH;
            updatedTile.vEdges = tV;
            newTiles[targetTr][targetTc] = updatedTile;
          }
        };
        if (type === 'h') {
          if (tr < prev.gridDim) updateTileEdges(tr, tc, 'h', r % 3, c % 3);
          if (r > 0 && r % 3 === 0) updateTileEdges(tr - 1, tc, 'h', 3, c % 3);
        } else {
          if (tc < prev.gridDim) updateTileEdges(tr, tc, 'v', r % 3, c % 3);
          if (c > 0 && c % 3 === 0) updateTileEdges(tr, tc - 1, 'v', r % 3, 3);
        }
      }

      return { 
        ...prev, 
        boardHEdges: newHEdges, 
        boardVEdges: newVEdges, 
        tiles: newTiles,
        history: newHistory,
        redoStack: []
      };
    });
  };

  const checkWin = useCallback(() => {
    try {
      if (!gameState) return;
      const { gridDim } = gameState;
      const gridSize = gridDim * 3;

      // 1. Check if all slots are filled
      for (let r = 0; r < gridDim; r++) {
        for (let c = 0; c < gridDim; c++) {
          if (!gameState.tiles[r][c]) return;
        }
      }

      // 2. Check if tiles are in correct positions
      for (let r = 0; r < gridDim; r++) {
        for (let c = 0; c < gridDim; c++) {
          const tile = gameState.tiles[r][c];
          if (tile?.correctPos.r !== r || tile?.correctPos.c !== c) return;
        }
      }

      // 3. Check Slitherlink rules
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const tr = Math.floor(r / 3);
          const tc = Math.floor(c / 3);
          const tile = gameState.tiles[tr][tc];
          if (!tile) return;
          
          const target = tile.numbers[r % 3][c % 3];
          let count = 0;
          if (getGlobalEdge('h', r, c) === 'line') count++;
          if (getGlobalEdge('h', r+1, c) === 'line') count++;
          if (getGlobalEdge('v', r, c) === 'line') count++;
          if (getGlobalEdge('v', r, c+1) === 'line') count++;
          
          if (count !== target) return;
        }
      }

      // 4. Check for a single closed loop
      const vertexDegrees: number[][] = Array.from({ length: gridSize + 1 }, () => Array(gridSize + 1).fill(0));
      let totalLineSegments = 0;

      for (let r = 0; r < gridSize + 1; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (getGlobalEdge('h', r, c) === 'line') {
            vertexDegrees[r][c]++;
            vertexDegrees[r][c+1]++;
            totalLineSegments++;
          }
        }
      }
      for (let c = 0; c < gridSize + 1; c++) {
        for (let r = 0; r < gridSize; r++) {
          if (getGlobalEdge('v', r, c) === 'line') {
            vertexDegrees[r][c]++;
            vertexDegrees[r+1][c]++;
            totalLineSegments++;
          }
        }
      }

      if (totalLineSegments === 0) return;

      for (let r = 0; r < gridSize + 1; r++) {
        for (let c = 0; c < gridSize + 1; c++) {
          if (vertexDegrees[r][c] !== 0 && vertexDegrees[r][c] !== 2) return;
        }
      }

      // 5. Connectivity check
      let startV: [number, number] | null = null;
      for (let r = 0; r < gridSize + 1; r++) {
        for (let c = 0; c < gridSize + 1; c++) {
          if (vertexDegrees[r][c] === 2) {
            startV = [r, c];
            break;
          }
        }
        if (startV) break;
      }

      if (!startV) return;

      let visitedCount = 0;
      const stack: [number, number][] = [startV];
      const visited = new Set<string>();
      visited.add(`${startV[0]},${startV[1]}`);

      while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        visitedCount++;

        const neighbors: [number, number][] = [];
        if (r > 0 && getGlobalEdge('v', r-1, c) === 'line') neighbors.push([r-1, c]);
        if (r < gridSize && getGlobalEdge('v', r, c) === 'line') neighbors.push([r+1, c]);
        if (c > 0 && getGlobalEdge('h', r, c-1) === 'line') neighbors.push([r, c-1]);
        if (c < gridSize && getGlobalEdge('h', r, c) === 'line') neighbors.push([r, c+1]);

        for (const [nr, nc] of neighbors) {
          const key = `${nr},${nc}`;
          if (!visited.has(key)) {
            visited.add(key);
            stack.push([nr, nc]);
          }
        }
      }

      const totalVerticesWithLines = vertexDegrees.flat().filter(d => d === 2).length;
      if (visitedCount === totalVerticesWithLines) {
        setGameState(prev => prev ? { ...prev, isWon: true } : null);
      }
    } catch (e) {
      console.error("Win check error:", e);
    }
  }, [gameState, getGlobalEdge]);

  useEffect(() => {
    if (gameState && !gameState.isWon) {
      checkWin();
    }
  }, [gameState?.tiles, gameState?.boardHEdges, gameState?.boardVEdges, checkWin]);

  const handleDrop = (r: number, c: number, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTile || !gameState) return;

    setGameState(prev => {
      if (!prev) return null;
      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      const newTiles = prev.tiles.map(row => [...row]);
      const newInventory = prev.inventory.filter(t => t.id !== draggedTile.id);
      
      const existingTile = newTiles[r][c];
      if (existingTile) {
        newInventory.push(existingTile);
      }

      newTiles[r][c] = draggedTile;

      // Sync edges from tile to board
      const newHEdges = prev.boardHEdges.map(row => [...row]);
      const newVEdges = prev.boardVEdges.map(row => [...row]);

      for (let hr = 0; hr < 4; hr++) {
        for (let hc = 0; hc < 3; hc++) {
          newHEdges[r * 3 + hr][c * 3 + hc] = draggedTile.hEdges[hr][hc];
        }
      }
      for (let vr = 0; vr < 3; vr++) {
        for (let vc = 0; vc < 4; vc++) {
          newVEdges[r * 3 + vr][c * 3 + vc] = draggedTile.vEdges[vr][vc];
        }
      }

      return { 
        ...prev, 
        tiles: newTiles, 
        inventory: newInventory, 
        boardHEdges: newHEdges, 
        boardVEdges: newVEdges,
        history: newHistory,
        redoStack: []
      };
    });
    setDraggedTile(null);
  };

  const removeFromBoard = (r: number, c: number) => {
    if (!gameState || gameState.isWon) return;
    const tile = gameState.tiles[r][c];
    if (!tile) return;

    setGameState(prev => {
      if (!prev) return null;
      const { history, ...stateToSave } = prev;
      const newHistory = [stateToSave, ...history].slice(0, 50);

      const newTiles = prev.tiles.map(row => [...row]);
      newTiles[r][c] = null;

      // Sync edges from board back to tile before putting it in inventory
      const updatedTile = { ...tile };
      const newH = updatedTile.hEdges.map(row => [...row]);
      const newV = updatedTile.vEdges.map(row => [...row]);

      const newBoardHEdges = prev.boardHEdges.map(row => [...row]);
      const newBoardVEdges = prev.boardVEdges.map(row => [...row]);

      for (let hr = 0; hr < 4; hr++) {
        for (let hc = 0; hc < 3; hc++) {
          const status = prev.boardHEdges[r * 3 + hr][c * 3 + hc];
          if (status === 'pencil-line' || status === 'pencil-x') {
            newBoardHEdges[r * 3 + hr][c * 3 + hc] = 'blank';
          } else {
            newH[hr][hc] = status;
          }
        }
      }
      for (let vr = 0; vr < 3; vr++) {
        for (let vc = 0; vc < 4; vc++) {
          const status = prev.boardVEdges[r * 3 + vr][c * 3 + vc];
          if (status === 'pencil-line' || status === 'pencil-x') {
            newBoardVEdges[r * 3 + vr][c * 3 + vc] = 'blank';
          } else {
            newV[vr][vc] = status;
          }
        }
      }
      updatedTile.hEdges = newH;
      updatedTile.vEdges = newV;

      return { 
        ...prev, 
        tiles: newTiles, 
        inventory: [...prev.inventory, updatedTile],
        boardHEdges: newBoardHEdges,
        boardVEdges: newBoardVEdges,
        history: newHistory,
        redoStack: []
      };
    });
  };

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700">Loading Puzzle...</h2>
          <p className="text-slate-500 mt-2">Generating a complex loop for you.</p>
        </div>
      </div>
    );
  }

  const gridDim = gameState.gridDim;
  const BOARD_MAX_WIDTH = 500;
  const BOARD_PADDING = 24; // p-3 on both sides
  const TILE_SIZE = (BOARD_MAX_WIDTH - BOARD_PADDING) / gridDim;
  const PIECE_PADDING = 12; // p-1.5 on both sides
  const PIECE_SIZE = TILE_SIZE + PIECE_PADDING;
  const BANK_COLS = gridDim <= 2 ? 2 : 3;
  const BANK_PADDING = 48; // p-6 on both sides
  const BANK_GAP = 12; // gap-3
  const BANK_WIDTH = (PIECE_SIZE * BANK_COLS) + BANK_PADDING + (BANK_GAP * (BANK_COLS - 1));

  return (
    <div className="min-h-screen transition-colors duration-300 bg-slate-50 text-slate-900">
      <div className="p-2 md:p-4 blueprint-grid min-h-screen flex flex-col items-center">
        {/* Top Bar */}
        <header className="w-full max-w-[1400px] bg-white rounded-2xl shadow-lg px-4 py-2 mb-3 flex flex-col lg:flex-row justify-between items-center gap-3 border border-slate-200">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-black tracking-tight">Slitherlink Jigsaw</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                  {gameState.gridDim}×{gameState.gridDim} Matrix
                </p>
                <div className="h-2 w-[1px] bg-slate-300" />
                <div className="flex items-center gap-1 group relative">
                  <Hash className="w-2.5 h-2.5 text-indigo-500" />
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">{gameState.puzzleId}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(gameState.puzzleId);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    title="Copy Puzzle ID"
                  >
                    {copiedId ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5 text-slate-400" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="h-8 w-[1px] bg-slate-200 hidden lg:block" />
            
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl">
              <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                <ZoomOut className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <input 
                type="range" 
                min="40" 
                max="120" 
                value={zoom} 
                onChange={(e) => setZoom(parseInt(e.target.value))}
                className="w-20 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <button onClick={() => setZoom(Math.min(120, zoom + 10))} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                <ZoomIn className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <button 
                onClick={() => setZoom(90)} 
                className="text-[9px] font-black text-indigo-600 hover:underline ml-1"
                title="Reset Zoom"
              >
                {zoom}%
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[2, 3, 4].map((dim) => (
                <button
                  key={dim}
                  onClick={() => startNewGame(dim)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    gameState.gridDim === dim 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {dim}x{dim}
                </button>
              ))}
            </div>

            <div className="bg-slate-100 px-4 py-1.5 rounded-xl flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Time</span>
                <div className="flex items-center gap-1.5">
                  <Timer className="w-3 h-3 text-indigo-500" />
                  <span className="font-bold text-sm tabular-nums">
                    {formatTime(gameState.time)}
                  </span>
                </div>
              </div>
              <div className="h-6 w-[1px] bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Status</span>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  gameState.isWon ? "text-emerald-500" : "text-indigo-500"
                )}>
                  {gameState.isWon ? "Solved" : "Active"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <input 
                  type="text" 
                  placeholder="Enter ID..." 
                  value={puzzleInput}
                  onChange={(e) => setPuzzleInput(e.target.value.toUpperCase())}
                  className="w-20 bg-transparent text-[10px] font-bold px-2 py-1 focus:outline-none uppercase"
                />
                <button 
                  onClick={() => puzzleInput && startNewGame(gameState.gridDim, puzzleInput)}
                  className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  title="Load Puzzle"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <button 
                onClick={() => {
                  setIsPencilMode(!isPencilMode);
                  if (!isPencilMode) setIsEraserMode(false);
                }}
                className={cn(
                  "p-2 rounded-lg transition-all active:scale-95 border",
                  isPencilMode 
                    ? "bg-amber-100 border-amber-200 text-amber-600" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
                title="Pencil Tool (P)"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setIsEraserMode(!isEraserMode);
                  if (!isEraserMode) setIsPencilMode(false);
                }}
                className={cn(
                  "p-2 rounded-lg transition-all active:scale-95 border",
                  isEraserMode 
                    ? "bg-rose-100 border-rose-200 text-rose-600" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
                title="Eraser Tool (E)"
              >
                <Eraser className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setGameState(prev => {
                    if (!prev) return null;
                    const showing = !prev.showSolution;
                    if (showing) {
                      // Place all pieces in their correct positions
                      const newTiles = Array.from({ length: prev.gridDim }, () => Array(prev.gridDim).fill(null));
                      const allTiles = [...prev.tiles.flat().filter(Boolean), ...prev.inventory] as Tile[];
                      allTiles.forEach(tile => {
                        newTiles[tile.correctPos.r][tile.correctPos.c] = tile;
                      });
                      
                      // Sync edges from all tiles to board
                      const newHEdges = prev.boardHEdges.map(row => [...row]);
                      const newVEdges = prev.boardVEdges.map(row => [...row]);
                      
                      allTiles.forEach(tile => {
                        const r = tile.correctPos.r;
                        const c = tile.correctPos.c;
                        for (let hr = 0; hr < 4; hr++) {
                          for (let hc = 0; hc < 3; hc++) {
                            newHEdges[r * 3 + hr][c * 3 + hc] = tile.hEdges[hr][hc];
                          }
                        }
                        for (let vr = 0; vr < 3; vr++) {
                          for (let vc = 0; vc < 4; vc++) {
                            newVEdges[r * 3 + vr][c * 3 + vc] = tile.vEdges[vr][vc];
                          }
                        }
                      });

                      return { 
                        ...prev, 
                        showSolution: true, 
                        tiles: newTiles, 
                        inventory: [],
                        boardHEdges: newHEdges,
                        boardVEdges: newVEdges,
                        redoStack: []
                      };
                    } else {
                      return { ...prev, showSolution: false };
                    }
                  });
                }}
                className={cn(
                  "p-2 rounded-lg transition-all active:scale-95 border",
                  gameState.showSolution 
                    ? "bg-amber-100 border-amber-200 text-amber-600" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
                title="Solution"
              >
                <Lightbulb className={cn("w-4 h-4", gameState.showSolution && "fill-amber-500")} />
              </button>
              <button 
                onClick={undo}
                disabled={!gameState || gameState.history.length === 0}
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button 
                onClick={redo}
                disabled={!gameState || gameState.redoStack.length === 0}
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => startNewGame(gameState.gridDim)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-200 transition-all active:scale-95 font-bold text-xs flex items-center gap-1.5"
                title="New Game"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                New
              </button>
              <button 
                onClick={() => setShowRules(true)}
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-all active:scale-95"
                title="Rules"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div 
          className="w-full transition-transform duration-200 origin-top flex justify-center"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          <main 
            className="w-full max-w-[1400px] grid grid-cols-1 lg:gap-4 items-start"
            style={{ 
              gridTemplateColumns: window.innerWidth >= 1024 ? `${BANK_WIDTH}px 1fr` : '1fr'
            }}
          >
            {/* Left Column: Piece Bank */}
            <aside 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (draggedFromBoard) {
                  setHasDropped(true);
                  removeFromBoard(draggedFromBoard.r, draggedFromBoard.c);
                  setDraggedFromBoard(null);
                  setDraggedTile(null);
                }
              }}
              className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 sticky top-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black flex items-center gap-2">
                  Piece Bank
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {gameState.inventory.length}
                  </span>
                </h2>
              </div>
              
              <div className={cn(
                "grid gap-3",
                BANK_COLS === 2 ? "grid-cols-2" : "grid-cols-3"
              )}>
                {gameState.inventory.map((tile) => (
                  <motion.div
                    key={tile.id}
                    layoutId={tile.id}
                    draggable={!isEdgeHovered && mouseButton === null}
                    onDragStart={() => {
                      if (isEdgeHovered || mouseButton !== null) return;
                      setDraggedTile(tile);
                      setDraggedFromBoard(null);
                      setHasDropped(false);
                    }}
                    onDragEnd={() => {
                      setDraggedTile(null);
                      setDraggedFromBoard(null);
                    }}
                    className="relative bg-slate-50 border-2 border-slate-100 rounded-2xl cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors overflow-hidden group p-1.5"
                    style={{ width: PIECE_SIZE, height: PIECE_SIZE }}
                  >
                    <div className="w-full h-full grid grid-cols-3 grid-rows-3 border border-slate-200 relative">
                      {tile.numbers.map((row, r) => row.map((num, c) => (
                        <div key={`${r}-${c}`} className="flex items-center justify-center text-2xl font-black text-slate-800 border-[0.5px] border-slate-100">
                          {num}
                        </div>
                      )))}
                      {/* Local Edges for Inventory */}
                      <div className="absolute inset-0 pointer-events-none">
                        {tile.hEdges.map((row, hr) => row.map((status, hc) => {
                          const isSolution = gameState.showSolution && gameState.solutionEdges.h[tile.correctPos.r * 3 + hr][tile.correctPos.c * 3 + hc];
                          return (
                            <div 
                              key={`h-${hr}-${hc}`}
                              onMouseDown={(e) => handleInventoryEdgeClick(tile.id, 'h', hr, hc, e)}
                              onMouseEnter={() => {
                                setIsEdgeHovered(true);
                                handleInventoryEdgeDrag(tile.id, 'h', hr, hc);
                              }}
                              onMouseLeave={() => setIsEdgeHovered(false)}
                              onContextMenu={(e) => e.preventDefault()}
                              className={cn(
                                "absolute h-3 pointer-events-auto cursor-pointer flex items-center justify-center",
                                status === 'line' || isSolution ? "bg-transparent" : "hover:bg-indigo-50/50"
                              )}
                              style={{ top: `${(hr / 3) * 100}%`, left: `${(hc / 3) * 100}%`, width: '33.33%', transform: 'translateY(-50%)' }}
                            >
                              {(status === 'line' || isSolution) && (
                                <div className={cn(
                                  "w-full h-[4px] rounded-full",
                                  isSolution ? "bg-amber-400 shadow-sm" : "bg-indigo-600"
                                )} />
                              )}
                              {status === 'x' && !isSolution && <div className="text-[12px] text-rose-500 font-black leading-none">×</div>}
                            </div>
                          );
                        }))}
                        {tile.vEdges.map((row, vr) => row.map((status, vc) => {
                          const isSolution = gameState.showSolution && gameState.solutionEdges.v[tile.correctPos.c * 3 + vc][tile.correctPos.r * 3 + vr];
                          return (
                            <div 
                              key={`v-${vr}-${vc}`}
                              onMouseDown={(e) => handleInventoryEdgeClick(tile.id, 'v', vr, vc, e)}
                              onMouseEnter={() => {
                                setIsEdgeHovered(true);
                                handleInventoryEdgeDrag(tile.id, 'v', vr, vc);
                              }}
                              onMouseLeave={() => setIsEdgeHovered(false)}
                              onContextMenu={(e) => e.preventDefault()}
                              className={cn(
                                "absolute w-3 pointer-events-auto cursor-pointer flex items-center justify-center",
                                status === 'line' || isSolution ? "bg-transparent" : "hover:bg-indigo-50/50"
                              )}
                              style={{ left: `${(vc / 3) * 100}%`, top: `${(vr / 3) * 100}%`, height: '33.33%', transform: 'translateX(-50%)' }}
                            >
                              {(status === 'line' || isSolution) && (
                                <div className={cn(
                                  "h-full w-[4px] rounded-full",
                                  isSolution ? "bg-amber-400 shadow-sm" : "bg-indigo-600"
                                )} />
                              )}
                              {status === 'x' && !isSolution && <div className="text-[12px] text-rose-500 font-black leading-none">×</div>}
                            </div>
                          );
                        }))}

                        {/* Local Vertices for Inventory */}
                        {Array.from({ length: 4 }).map((_, r) => 
                          Array.from({ length: 4 }).map((_, c) => (
                            <div 
                              key={`vtx-${r}-${c}`}
                              className="absolute w-1.5 h-1.5 bg-black rounded-full"
                              style={{ 
                                top: `${(r / 3) * 100}%`, 
                                left: `${(c / 3) * 100}%`,
                                transform: 'translate(-50%, -50%)'
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {gameState.inventory.length === 0 && (
                  <div className={cn(
                    "py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl",
                    BANK_COLS === 2 ? "col-span-2" : "col-span-3"
                  )}>
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete</p>
                  </div>
                )}
              </div>
            </aside>

            {/* Right Column: Unified Board */}
            <section className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 h-fit">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black">Assembly Board</h2>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Progress</span>
                  <span className="text-xs font-bold text-slate-700">{gameState.tiles.flat().filter(Boolean).length}/{gameState.gridDim * gameState.gridDim} Tiles</span>
                </div>
              </div>

              <div className="relative aspect-square w-full max-w-[500px] mx-auto bg-white border border-slate-100 rounded-2xl shadow-inner p-3">
                <div className="relative w-full h-full">
                  {/* Slots & Numbers Layer */}
                  <div 
                    className="absolute inset-0 grid gap-0"
                    style={{ 
                      gridTemplateColumns: `repeat(${gameState.gridDim}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${gameState.gridDim}, minmax(0, 1fr))`
                    }}
                  >
                    {gameState.tiles.map((row, tr) => 
                      row.map((tile, tc) => (
                        <div 
                          key={`slot-${tr}-${tc}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.add('bg-indigo-50/50');
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('bg-indigo-50/50');
                          }}
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('bg-indigo-50/50');
                            setHasDropped(true);
                            if (draggedFromBoard) {
                              // Moving from one board slot to another
                              const fromR = draggedFromBoard.r;
                              const fromC = draggedFromBoard.c;
                              if (fromR === tr && fromC === tc) return;
                              
                              setGameState(prev => {
                                if (!prev) return null;
                                const newTiles = prev.tiles.map(row => [...row]);
                                const tileToMove = newTiles[fromR][fromC];
                                const targetTile = newTiles[tr][tc];
                                
                                newTiles[tr][tc] = tileToMove;
                                newTiles[fromR][fromC] = targetTile;
                                return { ...prev, tiles: newTiles, redoStack: [] };
                              });
                              setDraggedFromBoard(null);
                              setDraggedTile(null);
                            } else {
                              handleDrop(tr, tc, e);
                            }
                          }}
                          className={cn(
                            "relative border-[0.5px] border-slate-100 transition-all cursor-default",
                            (tr + tc) % 2 === 0 ? "bg-white" : "bg-slate-100"
                          )}
                        >
                          {tile ? (
                            <motion.div 
                              draggable={!isEdgeHovered && mouseButton === null}
                              onDragStart={() => {
                                if (isEdgeHovered || mouseButton !== null) return;
                                setDraggedTile(tile);
                                setDraggedFromBoard({ r: tr, c: tc });
                                setHasDropped(false);
                              }}
                              onDragEnd={() => {
                                if (!hasDropped && draggedFromBoard) {
                                  removeFromBoard(draggedFromBoard.r, draggedFromBoard.c);
                                }
                                setDraggedTile(null);
                                setDraggedFromBoard(null);
                              }}
                              className="grid grid-cols-3 grid-rows-3 w-full h-full p-0 animate-in fade-in zoom-in duration-200 cursor-grab active:cursor-grabbing"
                            >
                              {tile.numbers.map((numRow, nr) => 
                                numRow.map((num, nc) => (
                                  <div 
                                    key={`${nr}-${nc}`} 
                                    className={cn(
                                      "flex items-center justify-center text-2xl font-black transition-colors",
                                      "text-slate-800",
                                      nr < 2 && "border-b border-b-slate-100/50",
                                      nc < 2 && "border-r border-r-slate-100/50"
                                    )}
                                  >
                                    {num}
                                  </div>
                                ))
                              )}
                            </motion.div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full border-2 border-slate-200 opacity-20" />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Edges Layer */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Horizontal Edges */}
                    {Array.from({ length: gameState.gridDim * 3 + 1 }).map((_, r) => (
                      <div key={`h-row-${r}`} className="absolute w-full flex" style={{ top: `${(r / (gameState.gridDim * 3)) * 100}%`, height: '18px', transform: 'translateY(-50%)' }}>
                        {Array.from({ length: gameState.gridDim * 3 }).map((_, c) => {
                          const status = getGlobalEdge('h', r, c);
                          const isSolution = gameState.showSolution && gameState.solutionEdges.h[r][c];
                          const isPencil = status === 'pencil-line' || status === 'pencil-x';
                          const isLine = status === 'line' || status === 'pencil-line' || isSolution;
                          
                          return (
                            <div 
                              key={`h-${r}-${c}`}
                              onMouseDown={(e) => {
                                setMouseButton(e.button);
                                handleBoardEdgeClick('h', r, c, e);
                              }}
                              onMouseEnter={() => {
                                setIsEdgeHovered(true);
                                handleEdgeDrag('h', r, c);
                              }}
                              onMouseLeave={() => setIsEdgeHovered(false)}
                              onContextMenu={(e) => e.preventDefault()}
                              className={cn(
                                "h-full pointer-events-auto cursor-pointer transition-all duration-150 flex items-center justify-center",
                                isLine ? "bg-transparent" : "hover:bg-indigo-100/50"
                              )}
                              style={{ width: `${(1 / (gameState.gridDim * 3)) * 100}%` }}
                            >
                              {isLine && (
                                <div className={cn(
                                  "w-[calc(100%-6px)] h-[8px] rounded-full",
                                  isSolution ? "bg-amber-400 shadow-sm" : isPencil ? "bg-slate-400" : "bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.3)]"
                                )} />
                              )}
                              {(status === 'x' || status === 'pencil-x') && !isSolution && (
                                <div className="relative w-4 h-4">
                                  <div className={cn("absolute top-1/2 left-0 w-full h-[2.5px] rotate-45 rounded-full", isPencil ? "bg-slate-400" : "bg-rose-400")} />
                                  <div className={cn("absolute top-1/2 left-0 w-full h-[2.5px] -rotate-45 rounded-full", isPencil ? "bg-slate-400" : "bg-rose-400")} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {/* Vertical Edges */}
                    {Array.from({ length: gameState.gridDim * 3 + 1 }).map((_, c) => (
                      <div key={`v-col-${c}`} className="absolute h-full flex flex-col" style={{ left: `${(c / (gameState.gridDim * 3)) * 100}%`, width: '18px', transform: 'translateX(-50%)' }}>
                        {Array.from({ length: gameState.gridDim * 3 }).map((_, r) => {
                          const status = getGlobalEdge('v', r, c);
                          const isSolution = gameState.showSolution && gameState.solutionEdges.v[c][r];
                          const isPencil = status === 'pencil-line' || status === 'pencil-x';
                          const isLine = status === 'line' || status === 'pencil-line' || isSolution;

                          return (
                            <div 
                              key={`v-${c}-${r}`}
                              onMouseDown={(e) => {
                                setMouseButton(e.button);
                                handleBoardEdgeClick('v', r, c, e);
                              }}
                              onMouseEnter={() => {
                                setIsEdgeHovered(true);
                                handleEdgeDrag('v', r, c);
                              }}
                              onMouseLeave={() => setIsEdgeHovered(false)}
                              onContextMenu={(e) => e.preventDefault()}
                              className={cn(
                                "w-full pointer-events-auto cursor-pointer transition-all duration-150 flex items-center justify-center",
                                isLine ? "bg-transparent" : "hover:bg-indigo-100/50"
                              )}
                              style={{ height: `${(1 / (gameState.gridDim * 3)) * 100}%` }}
                            >
                              {isLine && (
                                <div className={cn(
                                  "h-[calc(100%-6px)] w-[8px] rounded-full",
                                  isSolution ? "bg-amber-400 shadow-sm" : isPencil ? "bg-slate-400" : "bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.3)]"
                                )} />
                              )}
                              {(status === 'x' || status === 'pencil-x') && !isSolution && (
                                <div className="relative w-4 h-4">
                                  <div className={cn("absolute top-1/2 left-0 w-full h-[2.5px] rotate-45 rounded-full", isPencil ? "bg-slate-400" : "bg-rose-400")} />
                                  <div className={cn("absolute top-1/2 left-0 w-full h-[2.5px] -rotate-45 rounded-full", isPencil ? "bg-slate-400" : "bg-rose-400")} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {/* Vertices */}
                    {Array.from({ length: gameState.gridDim * 3 + 1 }).map((_, r) => 
                      Array.from({ length: gameState.gridDim * 3 + 1 }).map((_, c) => (
                        <div 
                          key={`vtx-${r}-${c}`}
                          className="absolute w-1.5 h-1.5 bg-black rounded-full"
                          style={{ 
                            top: `${(r / (gameState.gridDim * 3)) * 100}%`, 
                            left: `${(c / (gameState.gridDim * 3)) * 100}%`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>

        {/* Win Modal */}
        <AnimatePresence>
          {gameState.isWon && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl"
              >
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trophy className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 mb-2">Victory!</h2>
                <p className="text-slate-500 mb-8 text-lg">
                  You solved the jigsaw and the loop in <span className="font-bold text-indigo-600">{formatTime(gameState.time)}</span>.
                </p>
                <button 
                  onClick={startNewGame}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <RefreshCw className="w-6 h-6" />
                  Play Again
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules Modal */}
        <AnimatePresence>
          {showRules && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white rounded-[32px] p-6 max-w-lg w-full shadow-2xl relative"
              >
                <button 
                  onClick={() => setShowRules(false)}
                  className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <XCircle className="w-5 h-5 text-slate-400" />
                </button>
                
                <h2 className="text-2xl font-black text-slate-900 mb-4 flex items-center gap-2">
                  <HelpCircle className="w-6 h-6 text-indigo-600" />
                  How to Play
                </h2>
                
                <div className="space-y-4 text-slate-600 leading-relaxed text-sm">
                  <section>
                    <h3 className="font-bold text-slate-900 text-base mb-1">1. The Jigsaw</h3>
                    <p>Drag tiles from the Piece Bank to the board. Click a placed tile to return it.</p>
                  </section>
                  
                  <section>
                    <h3 className="font-bold text-slate-900 text-base mb-1">2. The Slitherlink</h3>
                    <p>Draw a single loop. Numbers indicate how many edges are part of the loop.</p>
                    <ul className="mt-1 space-y-0.5 ml-4 list-disc text-xs">
                      <li>The loop cannot intersect or branch.</li>
                      <li>Use the <strong>Pencil Tool</strong> (P) for temporary marks.</li>
                      <li>Use the <strong>Eraser Tool</strong> (E) to clear lines.</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-bold text-slate-900 text-base mb-1">3. Controls</h3>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                        <span className="font-bold text-indigo-600 block">Left Click</span>
                        Toggle Line
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                        <span className="font-bold text-indigo-600 block">Right Click</span>
                        Toggle X
                      </div>
                    </div>
                  </section>
                </div>

                <button 
                  onClick={() => setShowRules(false)}
                  className="mt-6 w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm"
                >
                  Got it!
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
