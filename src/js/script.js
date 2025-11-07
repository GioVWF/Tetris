const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
ctx.scale(20, 20);

const nextCanvas = document.getElementById('next-piece-canvas');
const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;

// 1. Variables Globales

const DIFFICULTY_PRESETS = {
  facil: {
    MS: 500,
    MIN_SPEED: 60,
    SPEED_DECREASE_RATE: 20,
    SCORE_MULTIPLIER: 0.8
  },
  normal: {
    MS: 400,
    MIN_SPEED: 50,
    SPEED_DECREASE_RATE: 20,
    SCORE_MULTIPLIER: 1.0
  },
  dificil: {
    MS: 200,
    MIN_SPEED: 30,
    SPEED_DECREASE_RATE: 20,
    SCORE_MULTIPLIER: 1.5
  },
  imposible: {
    MS: 100,
    MIN_SPEED: 10,
    SPEED_DECREASE_RATE: 20,
    SCORE_MULTIPLIER: 2.0
  }
};

let MS = 300;
let MIN_SPEED = 20;
let SPEED_DECREASE_RATE = 25;
let SCORE_MULTIPLIER = 1.0;

const FAST_DROP_MS = 20;
var CURRENT_INTERVAL_MS = MS;
let selectedDifficulty = null;

const field = createMatrix(18, 40);

const pieces = {
    "O": [
        [0, 0, 0],
        [0, 1, 1],
        [0, 1, 1]
    ],
    "T": [
        [0, 2, 0],
        [2, 2, 2],
        [0, 0, 0]
    ],
    "S": [
      [0, 3, 3],
      [3, 3, 0],
      [0, 0, 0]
    ],
    "Z": [
      [4, 4, 0],
      [0, 4, 4],
      [0, 0, 0]
    ],
    "L": [
      [0, 0, 5],
      [5, 5, 5],
      [0, 0, 0]
    ],
    "J": [
      [6, 0, 0],
      [6, 6, 6],
      [0, 0, 0]
    ],
    "I": [
      [0, 0, 0, 0],
      [7, 7, 7, 7],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  };

const PIECE_NAMES = ['O','T','S','Z','L','J','I'];

const PIECE_SCORES = {
  'O': 10,
  'T': 40,
  'S': 20,
  'Z': 20,
  'L': 30,
  'J': 30,
  'I': 50
};

const COLORS = [
  '#000000',
  '#00F0F0',
  '#A000F0',
  '#FF0000',
  '#0000FF',
  '#ff9808ff',
  '#fff205ff',
  '#00FF00',
]

let audioContext = null;

function initAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      soundEnabled = false;
    }
  }
  return audioContext;
}

function playSound(soundName) {
  if (!soundEnabled) return;

  const ctx = initAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  switch(soundName) {
    case 'move':
      playBeep(ctx, 200, 0.05, 'sine');
      break;
    case 'rotate':
      playBeep(ctx, 300, 0.08, 'square');
      break;
    case 'drop':
      playBeep(ctx, 150, 0.15, 'triangle');
      break;
    case 'lineClear':
      playBeep(ctx, 500, 0.2, 'sine');
      setTimeout(() => playBeep(ctx, 600, 0.2, 'sine'), 100);
      break;
    case 'levelUp':
      playBeep(ctx, 400, 0.15, 'sine');
      setTimeout(() => playBeep(ctx, 500, 0.15, 'sine'), 100);
      setTimeout(() => playBeep(ctx, 600, 0.2, 'sine'), 200);
      break;
    case 'gameOver':
      playBeep(ctx, 300, 0.2, 'sawtooth');
      setTimeout(() => playBeep(ctx, 250, 0.2, 'sawtooth'), 150);
      setTimeout(() => playBeep(ctx, 200, 0.3, 'sawtooth'), 300);
      break;
  }
}

function playBeep(ctx, frequency, duration, type = 'sine') {
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 3;
    this.vy = (Math.random() - 0.5) * 3 - 1.2;
    this.color = color;
    this.life = 1;
    this.decay = Math.random() * 0.06 + 0.12;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.12;
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life * 0.7;
    ctx.fillRect(this.x, this.y, 0.3, 0.3);
    ctx.globalAlpha = 1;
  }

  isDead() {
    return this.life <= 0;
  }
}

const player = {
  pos: { x: 8, y: -2 },
  piece: null,
  pieceName: null
};

// 2. Loop Jugable
let lastTime = 0;
let timer = 0;
let score = 0;
let lines = 0;
let gameStartTime = 0;
let isGameStarted = false;
let isPaused = true;
let animationId = null;
let isGameOver = false;
let pauseStartTime = 0;
let totalPausedTime = 0;
let nextPiece = null;
let nextPieceName = null;
let isCountingDown = false;
let countdownValue = 0;
let combo = 0;
let maxCombo = 0;
let heldPiece = null;
let heldPieceName = null;
let canHold = true;
let fps = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let particles = [];
let soundEnabled = true;
let particlesEnabled = true;
const MAX_PARTICLES = 100;
let maxScore = 0;
let stats = {
  totalPieces: 0,
  singleLines: 0,
  doubleLines: 0,
  tripleLines: 0,
  tetris: 0,
  startTime: 0,
  playTime: 0,
  pieces: {
    'O': 0,
    'T': 0,
    'S': 0,
    'Z': 0,
    'L': 0,
    'J': 0,
    'I': 0
  }
};

function gameLoop(currentTime) {
  frameCount++;
  if (currentTime - lastFpsUpdate >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFpsUpdate = currentTime;
    updateDebugInfo();
  }

  if (isGameOver) {
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  if (isPaused) {
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  if (!lastTime) {
    lastTime = currentTime;
  }

  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;
  timer += deltaTime;

  const dynamicSpeed = calculateCurrentSpeed();
  const effectiveSpeed = (CURRENT_INTERVAL_MS === FAST_DROP_MS) ? FAST_DROP_MS : dynamicSpeed;

  if (timer >= effectiveSpeed) {
    player.pos.y++;

    if (collide(field, player)) {
      player.pos.y--;
      join(field, player);
      playSound('drop');
      addPieceScore();
      clearLine();
      resetPlayerPosition();
    }

    draw();

    timer -= effectiveSpeed;
  }

  animationId = requestAnimationFrame(gameLoop);
}

//3. Dibujado de la matris y piezas
function createMatrix(w, h) {
  const matrix = [];
  while (h--) {
    matrix.push(new Array(w).fill(0));
  }
  return matrix;
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Advertencia visual si hay piezas cerca del techo
  let dangerZone = false;
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < field[y].length; x++) {
      if (field[y][x] !== 0) {
        dangerZone = true;
        break;
      }
    }
  }

  const canvasWrapper = document.getElementById('canvas-wrapper');
  if (canvasWrapper) {
    if (dangerZone && !isGameOver) {
      canvasWrapper.classList.add('danger');
    } else {
      canvasWrapper.classList.remove('danger');
    }
  }

  drawPiece(field, { x: 0, y: 0 }); // dibuja el fondo
  drawGhostPiece();
  drawPiece(player.piece, player.pos);

  if (particles.length > 0) {
    const newParticles = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.update();
      if (!p.isDead()) {
        p.draw(ctx);
        newParticles.push(p);
      }
    }
    particles = newParticles;
  }

  updateScore();

  if (!isGameStarted) {
    drawStartButton();
  } else if (isCountingDown) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, 18, 40);

    if (countdownValue > 0) {
      ctx.fillStyle = '#F0F000';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(countdownValue, 9, 22);
    } else {
      ctx.fillStyle = '#F0F000';
      ctx.font = 'bold 4px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('¡Listo!', 9, 22);
    }
  } 

  if (isGameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, 18, 40);

    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 2px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PERDISTE', 9, 18);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '1px Arial';
    ctx.fillText(`Puntos: ${score}`, 9, 20);
    ctx.fillText(`Líneas: ${lines}`, 9, 21.5);
    ctx.fillText('Click para reiniciar', 9, 23);
    } else if (isPaused && isGameStarted && !isCountingDown) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, 18, 40);

    ctx.fillStyle = '#F0F000';
    ctx.font = 'bold 2px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSA', 9, 20);

    ctx.fillStyle = '#fff';
    ctx.font = '0.8px Arial';
    ctx.fillText('Presiona ESPACIO o ESCAPE', 9, 22);
    ctx.fillText('o click para continuar', 9, 23);
  }
}

function drawPiece(piece, offset) {
  piece.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = COLORS[value];
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x + offset.x, y + offset.y, 0.4, 0.4);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x + offset.x + 0.6, y + offset.y + 0.6, 0.4, 0.4);

        ctx.strokeStyle = '#222';
        ctx.lineWidth = 0.05;
        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function resetPlayerPosition() {
  stats.totalPieces++;

  if (player.pieceName && stats.pieces[player.pieceName] !== undefined) {
    stats.pieces[player.pieceName]++;
  }

  canHold = true;
  player.pos.x = 8;
  player.pos.y = -2;

  player.piece = nextPiece;
  player.pieceName = nextPieceName;

  const nextRandom = getRandomPiece();

  nextPiece = nextRandom.piece;
  nextPieceName = nextRandom.name;

  drawNextPiece();
  drawPieceStats();

  if (checkGameOver()) {
    gameOver();
  }
}

function checkGameOver() {
  if (collide(field, player)) {
    isGameOver = true;
    return true;
  }
  return false;
}

function holdPiece() {
  if (!canHold || isPaused || isGameOver || !isGameStarted || isCountingDown) return;

  if (heldPiece === null) {
    heldPiece = player.piece;
    heldPieceName = player.pieceName;

    player.piece = nextPiece;
    player.pieceName = nextPieceName;

    const nextRandom = getRandomPiece();
    nextPiece = nextRandom.piece;
    nextPieceName = nextRandom.name;
  } else {
    const tempPiece = player.piece;
    const tempName = player.pieceName;

    player.piece = heldPiece;
    player.pieceName = heldPieceName;

    heldPiece = tempPiece;
    heldPieceName = tempName;
  }

  player.pos.x = 8;
  player.pos.y = -2;

  canHold = false;

  drawHeldPiece();
  drawNextPiece();
  draw();
}

// const piece = [
//   [0, 0, 0],
//   [0, 1, 1],
//   [0, 1, 1],

// ];

function join(field, player) {
  player.piece.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const fieldY = y + player.pos.y;
        const fieldX = x + player.pos.x;

        if (
          fieldY >= 0 &&
          fieldY < field.length &&
          fieldX >= 0 &&
          fieldX < field[0].length
        ) {
          field[fieldY][fieldX] = value;
        }
      }
    });
  });
}

function collide(field, player) {
  const piece = player.piece;
  const player_position = player.pos;

  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] !== 0) {
        const fieldY = y + player_position.y;
        const fieldX = x + player_position.x;

        if (fieldX < 0 || fieldX >= field[0].length) {
          return true;
        }

        if (fieldY >= field.length) {
          return true;
        }

        if (fieldY >= 0 && field[fieldY][fieldX] !== 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function getRandomPiece() {
  const randomIndex = Math.floor(Math.random() * PIECE_NAMES.length)
  const pieceName = PIECE_NAMES[randomIndex];

  return {
    piece: pieces[pieceName],
    name: pieceName
  };
}

function clearLine() {
    let linesCleared = 0;

    outerLoop: for (let y = field.length - 1; y >= 0; y--) {
      for (let x = 0; x < field[y].length; x++) {
        if (field[y][x] === 0) {
          continue outerLoop;
        }
      }

      if (particlesEnabled) {
        const particleCount = Math.floor(Math.random() * 3) + 8;
        for (let i = 0; i < particleCount; i++) {
          if (particles.length < MAX_PARTICLES) {
            const x = Math.floor(Math.random() * field[y].length);
            const color = COLORS[field[y][x]];
            particles.push(new Particle(x + Math.random(), y + Math.random(), color));
          }
        }
      }

      const row = field.splice(y, 1)[0].fill(0);
      field.unshift(row);
      y++;
      linesCleared++;
    }

    if (linesCleared > 0) {
      lines += linesCleared;

      switch(linesCleared) {
        case 1: stats.singleLines++; break;
        case 2: stats.doubleLines++; break;
        case 3: stats.tripleLines++; break;
        case 4:
          stats.tetris++;
          console.log('🎉 ¡TETRIS! (4 líneas)');
          break;
      }

      // Incrementar combo
      combo++;
      if (combo > maxCombo) {
        maxCombo = combo;
      }

      playSound('lineClear');

      // Calcular puntos con multiplicador de combo y dificultad
      const basePoints = linesCleared * 100;
      const comboBonus = combo > 1 ? (combo - 1) * 50 : 0;
      score += Math.floor((basePoints + comboBonus) * SCORE_MULTIPLIER);
    } else {
      // Resetear combo si no se limpiaron líneas
      combo = 0;
    }
}

function calculateCurrentSpeed() {
  if (!isGameStarted || gameStartTime === 0) {
    return MS;
  }

  const elapsedTime = Date.now() - gameStartTime - totalPausedTime;
  const secondsPlayed = Math.floor(elapsedTime / 1000);

  const speedIncreaseFactor = Math.floor(secondsPlayed / 30);
  const speedReduction = speedIncreaseFactor * SPEED_DECREASE_RATE;
  const currentSpeed = Math.max(MIN_SPEED, MS - speedReduction);

  return currentSpeed;
}

function rotate(piece) {
  const rotatedPiece = [];

  for (let i = 0; i < piece[0].length; i++) {
    const newRow = [];
    for (let j = piece.length - 1; j >= 0; j--) {
      newRow.push(piece[j][i]);
    }

    rotatedPiece.push(newRow);
  }

  return rotatedPiece;
}

function tryRotateWithKick(piece, player, field) {
  const rotated = rotate(piece);

  const testPlayer = { ...player, piece: rotated };
  if (!collide(field, testPlayer)) {
    return { success: true, piece: rotated, offsetX: 0 };
  }

  testPlayer.pos = { ...player.pos, x: player.pos.x + 1 };
  if (!collide(field, testPlayer)) {
    return { success: true, piece: rotated, offsetX: 1 };
  }

  testPlayer.pos = { ...player.pos, x: player.pos.x - 1 };
  if (!collide(field, testPlayer)) {
    return { success: true, piece: rotated, offsetX: -1 };
  }

  testPlayer.pos = { ...player.pos, x: player.pos.x + 2 };
  if (!collide(field, testPlayer)) {
    return { success: true, piece: rotated, offsetX: 2 };
  }

  testPlayer.pos = { ...player.pos, x: player.pos.x - 2 };
  if (!collide(field, testPlayer)) {
    return { success: true, piece: rotated, offsetX: -2 };
  }

  return { success: false, piece: piece, offsetX: 0 };
}

function initializePlayer() {
  const randomRandom = getRandomPiece();
  player.piece = randomRandom.piece;
  player.pieceName = randomRandom.name;

  const nextRandom = getRandomPiece();
  nextPiece = nextRandom.piece;
  nextPieceName = nextRandom.name;

  drawNextPiece();
}

//4. Funciones Visuales (Scoreboard, empezar/pausar, etc)

function updateScore() {
  document.getElementById('score-value').textContent = score;
  document.getElementById('lines-value').textContent = lines;
  document.getElementById('max-combo').textContent = maxCombo;

  if (score > maxScore) {
    maxScore = score;
    saveMaxScore();
    updateMaxScoreDisplay();
  }

  if (isGameStarted && !isPaused && !isGameOver && gameStartTime > 0) {
    const elapsed = Date.now() - gameStartTime - totalPausedTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;

    const timeElement = document.getElementById('time-value');
    if (timeElement) {
      timeElement.textContent = `${minutes}:${displaySeconds.toString().padStart(2, '0')}`;
    }

    const ppm = stats.totalPieces / (elapsed / 60000);
    const ppmElement = document.getElementById('ppm-value');
    if (ppmElement) {
      ppmElement.textContent = Math.round(ppm) || 0;
    }
  }

  updateStats();
}

function updateStats() {
  const totalPiecesEl = document.getElementById('total-pieces-value');
  const tetrisCountEl = document.getElementById('tetris-count');
  const tripleCountEl = document.getElementById('triple-count');
  const doubleCountEl = document.getElementById('double-count');
  const singleCountEl = document.getElementById('single-count');

  if (totalPiecesEl) totalPiecesEl.textContent = stats.totalPieces;
  if (tetrisCountEl) tetrisCountEl.textContent = stats.tetris;
  if (tripleCountEl) tripleCountEl.textContent = stats.tripleLines;
  if (doubleCountEl) doubleCountEl.textContent = stats.doubleLines;
  if (singleCountEl) singleCountEl.textContent = stats.singleLines;
}

function drawPieceStats() {
  PIECE_NAMES.forEach(pieceName => {
    const canvasId = `piece-stat-${pieceName}`;
    const countId = `piece-count-${pieceName}`;

    const canvas = document.getElementById(canvasId);
    const countEl = document.getElementById(countId);

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(8, 8);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 5, 5);

    const piece = pieces[pieceName];

    const pieceWidth = piece[0].length;
    const pieceHeight = piece.length;
    let offsetX = (5 - pieceWidth) / 2;
    let offsetY = (6 - pieceHeight) / 2;

    if (pieceName === "O") {
      offsetX = (3 - pieceWidth) / 2 + 0.5;
      offsetY = (3 - pieceHeight) / 2 + 0.5;
    }

    piece.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          ctx.fillStyle = COLORS[value];
          ctx.fillRect(x + offsetX, y + offsetY, 1, 1);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(x + offsetX, y + offsetY, 0.4, 0.4);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(x + offsetX + 0.6, y + offsetY + 0.6, 0.4, 0.4);

          ctx.strokeStyle = '#222';
          ctx.lineWidth = 0.05;
          ctx.strokeRect(x + offsetX, y + offsetY, 1, 1);
        }
      });
    });

    if (countEl) {
      countEl.textContent = stats.pieces[pieceName] || 0;
    }
  });
}

function updateDebugInfo() {
  const currentSpeed = calculateCurrentSpeed();
  const fpsElement = document.getElementById('fps-value');
  const speedElement = document.getElementById('speed-value');

  if (fpsElement) fpsElement.textContent = fps;
  if (speedElement) speedElement.textContent = Math.round(currentSpeed) + 'ms';
}

function loadMaxScore() {
  try {
    const savedMaxScore = localStorage.getItem('tetris_max_score');
    if (savedMaxScore !== null) {
      maxScore = parseInt(savedMaxScore, 10);
      updateMaxScoreDisplay();
    }
  } catch (e) {
    console.warn('Error loading max score from localStorage:', e);
  }
}

function saveMaxScore() {
  try {
    localStorage.setItem('tetris_max_score', maxScore.toString());
  } catch (e) {
    console.warn('Error saving max score to localStorage:', e);
  }
}

function updateMaxScoreDisplay() {
  const maxScoreElement = document.getElementById('max-score-value');
  if (maxScoreElement) {
    maxScoreElement.textContent = maxScore;
  }
}

function addPieceScore() {
  const piecePoints = PIECE_SCORES[player.pieceName] || 0;
  score += Math.floor(piecePoints * SCORE_MULTIPLIER);
}

function drawStartButton() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, 18, 40);

  const buttonWidth = 10;
  const buttonHeight = 3;
  const buttonX = (18 - buttonWidth) / 2;
  const buttonY = 18;

  // Fondo del botón
  ctx.fillStyle = '#000';
  ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

  // Borde del botón
  ctx.strokeStyle = '#F0F000';
  ctx.lineWidth = 0.1;
  ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

  // Texto START
  ctx.fillStyle = '#F0F000';
  ctx.font = 'bold 1.7px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('EMPEZAR', 9, buttonY + 2);

  // Instrucciones
  ctx.fillStyle = '#fff';
  ctx.font = '0.7px Arial';
  ctx.fillText('Click para empezar', 9, buttonY + 5);
  ctx.fillText('SPACE/ESC para pausar', 9, buttonY + 6);
}

function pauseGame() {
  if (!isGameStarted) return;
  isPaused = true;
  pauseStartTime = Date.now();
  draw();
}

function resumeGame() {
  if (!isGameStarted) return;
  isPaused = false;
  lastTime = 0;

  if (pauseStartTime > 0) {
    totalPausedTime += Date.now() - pauseStartTime;
    pauseStartTime = 0;
  }
}

function togglePause() {
  if (!isGameStarted) return;

  if (isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function startGame() {
  isGameStarted = true;
  isPaused = false;

  stats.totalPieces = 0;
  stats.singleLines = 0;
  stats.doubleLines = 0;
  stats.tripleLines = 0;
  stats.tetris = 0;
  stats.pieces = {
    'O': 0,
    'T': 0,
    'S': 0,
    'Z': 0,
    'L': 0,
    'J': 0,
    'I': 0
  };

  drawPieceStats();
  startCountdown();
}

function beginGame() {
  isGameStarted = true;
  isPaused = false;
  lastTime = 0;
  gameStartTime = Date.now();
  draw();
}

function gameOver() {
  playSound('gameOver');
  isPaused = true;
  isGameOver = true;
  draw();
}

function drawNextPiece() {
  if (!nextCanvas) return;

  nextCtx.setTransform(1, 0, 0, 1, 0, 0);
  nextCtx.scale(10, 10);

  nextCtx.fillStyle = '#000';
  nextCtx.fillRect(0, 0, 5, 5);

  const pieceWidth = nextPiece[0].length;
  const pieceHeight = nextPiece.length;
  let offsetX = (5 - pieceWidth) / 2;
  let offsetY = (6 - pieceHeight) / 2;

  if (nextPieceName === "O") {
    offsetX = (3 - pieceWidth) / 2 + 0.5;
    offsetY = (3 - pieceHeight) / 2 + 0.5;
  }

  nextPiece.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        nextCtx.fillStyle = COLORS[value];
        nextCtx.fillRect(x + offsetX, y + offsetY, 1, 1);

        nextCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        nextCtx.fillRect(x + offsetX, y + offsetY, 0.4, 0.4);

        nextCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        nextCtx.fillRect(x + offsetX + 0.6, y + offsetY + 0.6, 0.4, 0.4);

        nextCtx.strokeStyle = '#222';
        nextCtx.lineWidth = 0.05;
        nextCtx.strokeRect(x + offsetX, y + offsetY, 1, 1);
      }
    });
  });
}

function drawHeldPiece() {
  const holdCanvas = document.getElementById('hold-piece-canvas');
  if (!holdCanvas) return;

  const holdCtx = holdCanvas.getContext('2d');

  holdCtx.setTransform(1, 0, 0, 1, 0, 0);
  holdCtx.scale(10, 10);

  holdCtx.fillStyle = '#000';
  holdCtx.fillRect(0, 0, 5, 5);

  if (heldPiece === null) return;

  const pieceWidth = heldPiece[0].length;
  const pieceHeight = heldPiece.length;
  let offsetX = (5 - pieceWidth) / 2;
  let offsetY = (6 - pieceHeight) / 2;

  if (heldPieceName === "O") {
    offsetX = (3 - pieceWidth) / 2 + 0.5;
    offsetY = (3 - pieceHeight) / 2 + 0.5;
  }

  heldPiece.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const alpha = canHold ? 1 : 0.3;

        holdCtx.fillStyle = COLORS[value];
        holdCtx.globalAlpha = alpha;
        holdCtx.fillRect(x + offsetX, y + offsetY, 1, 1);

        holdCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        holdCtx.fillRect(x + offsetX, y + offsetY, 0.4, 0.4);

        holdCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        holdCtx.fillRect(x + offsetX + 0.6, y + offsetY + 0.6, 0.4, 0.4);

        holdCtx.strokeStyle = '#222';
        holdCtx.lineWidth = 0.05;
        holdCtx.strokeRect(x + offsetX, y + offsetY, 1, 1);

        holdCtx.globalAlpha = 1;
      }
    });
  });
}

function startCountdown() {
  isCountingDown = true;
  isPaused = true;
  countdownValue = 4;

  const countdownInterval = setInterval(() => {
    countdownValue--;
    draw();

    if (countdownValue <= -1) {
      clearInterval(countdownInterval);
      isCountingDown = false;
      beginGame();
    }

  }, 1000);
}

function getGhostPosition() {
  let ghostY = player.pos.y;

  while (true) {
    ghostY++;

    const ghostPlayer = {
      piece: player.piece,
      pos: {x: player.pos.x, y: ghostY},
    };

    if (collide(field, ghostPlayer)) {
      ghostY--;
      break;
    }
  }

  return ghostY;
}

function drawGhostPiece() {
  const ghostY = getGhostPosition();

  if (ghostY === player.pos.y) return;

  player.piece.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        // Dibujar silueta semi-transparente
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + player.pos.x, y + ghostY, 1, 1);

        // Dibujar borde de la pieza fantasma
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.08;
        ctx.strokeRect(x + player.pos.x, y + ghostY, 1, 1);
      }
    });
  });
}

//5. Controles del jugador

// Teclas Presionadas
document.addEventListener("keydown", (event) => {
  if (isCountingDown) return;

  if (event.key === ' ' || event.key === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }

  if (isPaused || isGameOver) return;

  if (event.key === "a" || event.key === "ArrowLeft" || event.key === "j") {
    player.pos.x--;
    if (collide(field, player)) {
      player.pos.x++;
    } else {
      playSound('move');
      draw();
    }
  } else if (event.key === "d" || event.key === "ArrowRight" || event.key === "l") {
    player.pos.x++;
    if (collide(field, player)) {
      player.pos.x--;
    } else {
      playSound('move');
      draw();
    }
  } else if (event.key === "s" || event.key === "ArrowDown" || event.key === "k") {
    CURRENT_INTERVAL_MS = FAST_DROP_MS;
  } else if (event.key === "r") {
    if (player.pieceName === "O") {
      playSound('rotate');
      return;
    }

    const result = tryRotateWithKick(player.piece, player, field);

    if (result.success) {
      player.piece = result.piece;
      player.pos.x += result.offsetX;
      playSound('rotate');
    }

    draw();
  } else if (event.key === "w" || event.key === "i" || event.key === "ArrowUp") {
    event.preventDefault();
    hardDrop();
  } else if (event.key === "h" || event.key === "H") {
    holdPiece();
  }
});

// Teclas Soltadas
document.addEventListener("keyup", (event) => {
  if (isCountingDown) return;
  if ( event.key === "s" || event.key === "ArrowDown" || event.key === "k") {
    CURRENT_INTERVAL_MS = MS;
  }
});

//Click en el canvas
canvas.addEventListener('click', (event) => {
  if (isGameOver) {
    location.reload();
  } else if (!isGameStarted && !isCountingDown) {
    startGame();
  } else if (isPaused && !isCountingDown) {
    resumeGame();
  }
});

//click fuera del canvas
document.addEventListener('click', (event) => {
  if (!canvas.contains(event.target) && isGameStarted && !isPaused && !isCountingDown) {
    pauseGame();
  }
});

// Cuando se pierde el foco
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isGameStarted && !isPaused && !isCountingDown) {
    pauseGame();
  }
});

window.addEventListener('blur', () => {
  if (isGameStarted && !isPaused && !isCountingDown) {
    pauseGame();
  }
});

function hardDrop() {
  if (!isGameStarted || isPaused || isCountingDown || isGameOver) return;

  while (!collide(field, player)) {
    player.pos.y++;
  }

  player.pos.y--;

  join(field, player);
  playSound('drop');
  addPieceScore();
  clearLine();
  resetPlayerPosition();

  timer = 0;

  draw();
}

// Inicializar el jugador
initializePlayer();

// Comenzar el gameLoop
requestAnimationFrame(gameLoop);
draw();

drawPieceStats();

loadMaxScore();

// 6. Selección de dificultad
document.querySelectorAll('.difficulty-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const difficulty = btn.getAttribute('data-difficulty');
    selectedDifficulty = difficulty;

    const preset = DIFFICULTY_PRESETS[difficulty];
    MS = preset.MS;
    MIN_SPEED = preset.MIN_SPEED;
    SPEED_DECREASE_RATE = preset.SPEED_DECREASE_RATE;
    SCORE_MULTIPLIER = preset.SCORE_MULTIPLIER;
    CURRENT_INTERVAL_MS = MS;

    const difficultyMenu = document.getElementById('difficulty-menu');
    if (difficultyMenu) {
      difficultyMenu.style.display = 'none';
    }

    draw();
  });
});

// 7. Sonido
const soundToggleBtn = document.getElementById('sound-toggle');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    if (isCountingDown) return;
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔊 Sonido: ON' : '🔇 Sonido: OFF';
  });
}

// 8. Partículas
const particlesToggleBtn = document.getElementById('particles-toggle');
if (particlesToggleBtn) {
  particlesToggleBtn.addEventListener('click', () => {
    if (isCountingDown) return;
    particlesEnabled = !particlesEnabled;
    particlesToggleBtn.textContent = particlesEnabled ? '✨ Partículas: ON' : '✨ Partículas: OFF';
    if (!particlesEnabled) {
      particles = [];
    }
  });
}

