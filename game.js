const COLS = 8;
const ROWS = 12;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const BASE_SPEED = 20; // ms per pixel upwards

let gameState = {
    isGameActive: false,
    depth: 0,
    currentColor: '',
    nextColor: '',
    drillXPct: 50, // 0 to 100
    grid: [], // 2D array [row][col] of color strings or null
    offsetY: 0,
    cellHeight: 0,
    cellWidth: 0,
    projectiles: [],
    lastFrameTime: Date.now(),
    nextShiftTime: 0,
    shiftSpeedMult: 1.0,
    foundCount: 0,
    ranking: JSON.parse(localStorage.getItem('scrollArch_ranking')) || []
};

// Elements
const gameContainer = document.getElementById('game-container');
const gridContainer = document.getElementById('grid-container');
const projectilesLayer = document.getElementById('projectiles-layer');
const drillTank = document.getElementById('drill-tank');
const drillUnit = document.getElementById('drill-unit');
const drillBit = document.getElementById('tank-drill-bit');
const nextAmmoColor = document.getElementById('next-ammo-color');
const depthValue = document.getElementById('depth-value');
const introScreen = document.getElementById('intro-screen');
const startBtn = document.getElementById('start-btn');
const gameoverModal = document.getElementById('gameover-modal');
const restartBtn = document.getElementById('restart-btn');
const progressFill = document.getElementById('progress-fill');

let audioCtx, shootOsc, boomOsc;
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function init() {
    window.addEventListener('resize', resizeLayout);
    if (startBtn) startBtn.onclick = (e) => { e.preventDefault(); startGame(); };
    if (restartBtn) restartBtn.onclick = () => location.reload();
    
    // Controls
    gameContainer.addEventListener('mousemove', handleAim);
    gameContainer.addEventListener('touchmove', handleAim, {passive: false});
    gameContainer.addEventListener('mousedown', handleShoot);
    gameContainer.addEventListener('touchstart', (e)=>{ handleAim(e); handleShoot(); }, {passive: false});
    
    requestAnimationFrame(gameLoop);
}

function resizeLayout() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const rect = gridContainer.getBoundingClientRect();
    gameState.cellWidth = rect.width / COLS;
    gameState.cellHeight = rect.height / ROWS;
    renderGridDOM(); // re-align blocks
}

function handleAim(e) {
    if (!gameState.isGameActive) return;
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    const rect = drillTank.getBoundingClientRect();
    let xPos = ((clientX - rect.left) / rect.width) * 100;
    gameState.drillXPct = Math.max(5, Math.min(95, xPos));
    drillUnit.style.left = `${gameState.drillXPct}%`;
}

function handleShoot() {
    if (!gameState.isGameActive) return;
    // Prevent shooting if there's already a fast projectile? Let's allow spam for action!
    if (gameState.projectiles.length > 2) return; // limit to 3 on screen max
    
    const xPx = (gameState.drillXPct / 100) * gameContainer.getBoundingClientRect().width;
    const rect = gridContainer.getBoundingClientRect();
    
    const proj = {
        x: xPx,
        y: drillTank.getBoundingClientRect().height, 
        color: gameState.currentColor,
        node: document.createElement('div')
    };
    proj.node.className = `projectile color-${proj.color}`;
    // SVG Drill shape for projectile
    proj.node.innerHTML = `<svg viewBox="0 0 30 45">
        <path d="M15,45 L30,0 L0,0 Z" fill="${getColorHex(proj.color)}" />
    </svg>`;
    proj.node.style.left = `${proj.x}px`;
    proj.node.style.top = `${proj.y}px`;
    
    projectilesLayer.appendChild(proj.node);
    gameState.projectiles.push(proj);
    
    playShootSound();
    cycleColors();
}

function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function cycleColors() {
    gameState.currentColor = gameState.nextColor || getRandomColor();
    gameState.nextColor = getRandomColor();
    drillBit.setAttribute('fill', getColorHex(gameState.currentColor));
    nextAmmoColor.className = `color-${gameState.nextColor}`;
}

function getColorHex(color) {
    const map = { 'red': '#e53935', 'blue': '#1e88e5', 'green': '#43a047', 'yellow': '#fdd835' };
    return map[color] || '#fff';
}

function startGame() {
    introScreen.classList.add('hidden');
    initAudio();
    
    // Init Grid
    gameState.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    
    // Fill bottom 4 rows initially
    for(let r = ROWS - 4; r < ROWS; r++) {
        for(let c = 0; c < COLS; c++) {
            gameState.grid[r][c] = { color: getRandomColor(), id: Math.random().toString() };
        }
    }
    
    gameState.offsetY = 0;
    gameState.isGameActive = true;
    cycleColors();
    resizeLayout();
}

function endGame() {
    gameState.isGameActive = false;
    document.getElementById('final-depth').innerText = gameState.depth;
    gameoverModal.classList.remove('hidden');
    
    const score = { depth: gameState.depth, date: new Date().toLocaleDateString() };
    gameState.ranking.push(score);
    gameState.ranking.sort((a, b) => b.depth - a.depth);
    gameState.ranking = gameState.ranking.slice(0, 5);
    localStorage.setItem('scrollArch_ranking', JSON.stringify(gameState.ranking));
}

function gameLoop() {
    const now = Date.now();
    const delta = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    if (gameState.isGameActive) {
        updateGridMovement(delta);
        updateProjectiles(delta);
        renderParticles(delta);
    }
    requestAnimationFrame(gameLoop);
}

function updateGridMovement(delta) {
    const pixelsToMove = (delta / BASE_SPEED) * gameState.shiftSpeedMult;
    gameState.offsetY += pixelsToMove;
    
    if (gameState.offsetY >= gameState.cellHeight) {
        gameState.offsetY -= gameState.cellHeight;
        shiftGridUp();
    }
    
    gridContainer.style.transform = `translateY(-${gameState.offsetY}px)`;
}

function shiftGridUp() {
    // Check GAME OVER (top row has blocks)
    let topRowBlocked = false;
    for(let c=0; c<COLS; c++) {
        if(gameState.grid[0][c] !== null) topRowBlocked = true;
    }
    
    if (topRowBlocked) {
        gridContainer.style.transform = `translateY(0px)`;
        endGame();
        return;
    }
    
    // Shift rows
    for(let r=1; r<ROWS; r++){
        gameState.grid[r-1] = [...gameState.grid[r]];
    }
    
    // New bottom row
    gameState.grid[ROWS-1] = Array(COLS).fill(null).map(() => ({ color: getRandomColor(), id: Math.random().toString() }));
    renderGridDOM();
}

function updateProjectiles(delta) {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        let p = gameState.projectiles[i];
        p.y += delta * 1.5; // very fast
        p.node.style.top = `${p.y}px`;
        
        // Check collision with bounding box of grid
        const gridRect = gridContainer.getBoundingClientRect();
        if (p.y > gridRect.top) {
            // It entered the grid. Calculate which row/col it's in.
            // P.y is relative to document. We need Y relative to grid container's internal zero (ignoring transform).
            const relativeY = p.y - gridRect.top;
            const r = Math.floor(relativeY / gameState.cellHeight);
            const c = Math.floor((p.x - gridRect.left) / gameState.cellWidth);
            
            // Check direct hit or if it passed a cell
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                if (gameState.grid[r][c] !== null) {
                    // Hit! Settle at r-1
                    settleProjectile(p, i, r - 1, c);
                } else if (r === ROWS - 1) {
                    // Reached absolute bottom empty space
                    settleProjectile(p, i, r, c);
                }
            }
        }
    }
}

function settleProjectile(proj, index, r, c) {
    // Remove from active
    proj.node.remove();
    gameState.projectiles.splice(index, 1);
    
    if (r < 0) {
        // Hit the top line directly
        endGame();
        return;
    }
    
    // Snap to grid
    gameState.grid[r][c] = { color: proj.color, id: Math.random().toString() };
    renderGridDOM();
    
    // Evaluate matches
    evaluateMatches(r, c);
}

function evaluateMatches(startR, startC) {
    const color = gameState.grid[startR][startC].color;
    let visited = new Set();
    let toCheck = [{r: startR, c: startC}];
    let matchGroup = [];
    
    while(toCheck.length > 0) {
        let curr = toCheck.pop();
        let key = `${curr.r},${curr.c}`;
        
        if(visited.has(key)) continue;
        visited.add(key);
        
        if(gameState.grid[curr.r][curr.c] && gameState.grid[curr.r][curr.c].color === color) {
            matchGroup.push(curr);
            
            // Add neighbors
            if(curr.r > 0) toCheck.push({r: curr.r-1, c: curr.c});
            if(curr.r < ROWS-1) toCheck.push({r: curr.r+1, c: curr.c});
            if(curr.c > 0) toCheck.push({r: curr.r, c: curr.c-1});
            if(curr.c < COLS-1) toCheck.push({r: curr.r, c: curr.c+1});
        }
    }
    
    if(matchGroup.length >= 3) {
        // Destroy!
        matchGroup.forEach(pos => {
            createExplosion(pos.r, pos.c, color);
            gameState.grid[pos.r][pos.c] = null;
        });
        
        gameState.depth += matchGroup.length * 10;
        depthValue.innerText = gameState.depth;
        playBoomSound();
        checkFloatingBlocks();
        renderGridDOM();
        
        // Progress to Checkpoint logic
        const threshold = (gameState.foundCount + 1) * 1000;
        let progress = (gameState.depth % 1000) / 1000 * 100;
        if(gameState.depth >= threshold) {
            gameState.foundCount++;
            gameState.shiftSpeedMult += 0.2; // Increase difficulty
            progress = 0;
            createFeverEffect();
        }
        progressFill.style.width = `${progress}%`;
    }
}

function checkFloatingBlocks() {
    // Space Invaders style floating blocks (if not connected to bottom row, they fall and die)
    let supported = new Set();
    let toCheck = [];
    
    // Add all blocks in bottom row
    for(let c=0; c<COLS; c++) {
        if(gameState.grid[ROWS-1][c] !== null) {
            toCheck.push({r: ROWS-1, c: c});
        }
    }
    
    // BFS upwards
    while(toCheck.length > 0) {
        let curr = toCheck.pop();
        let key = `${curr.r},${curr.c}`;
        if(supported.has(key)) continue;
        supported.add(key);
        
        if(curr.r > 0 && gameState.grid[curr.r-1][curr.c]) toCheck.push({r: curr.r-1, c: curr.c}); // Up
        if(curr.c > 0 && gameState.grid[curr.r][curr.c-1]) toCheck.push({r: curr.r, c: curr.c-1}); // Left
        if(curr.c < COLS-1 && gameState.grid[curr.r][curr.c+1]) toCheck.push({r: curr.r, c: curr.c+1}); // Right
        // Down not needed since we start from bottom
    }
    
    // Destroy unsupported
    let fell = false;
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(gameState.grid[r][c] !== null && !supported.has(`${r},${c}`)) {
                createExplosion(r, c, gameState.grid[r][c].color);
                gameState.grid[r][c] = null;
                fell = true;
            }
        }
    }
    if (fell) playBoomSound();
}

function renderGridDOM() {
    gridContainer.innerHTML = '';
    const w = 100 / COLS;
    const h = 100 / ROWS;
    
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            const cell = gameState.grid[r][c];
            if(cell) {
                const node = document.createElement('div');
                node.className = `puzzle-block color-${cell.color}`;
                node.style.left = `${c * w}%`;
                node.style.top = `${r * h}%`;
                node.style.width = `calc(${w}% - 2px)`;
                node.style.height = `calc(${h}% - 2px)`;
                gridContainer.appendChild(node);
            }
        }
    }
}

function createExplosion(r, c, colorStr) {
    const rect = gridContainer.getBoundingClientRect();
    const x = rect.left + (c * gameState.cellWidth) + (gameState.cellWidth/2);
    const y = rect.top + (r * gameState.cellHeight) + (gameState.cellHeight/2) - gameState.offsetY;
    
    const hex = getColorHex(colorStr);
    for(let i=0; i<10; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
            life: 1.0, color: hex, size: Math.random()*10+5
        });
    }
}

function renderParticles(delta) {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.life -= 0.05;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    });
}

function createFeverEffect() {
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 500);
}

// Minimal Audio
function initAudio() {
    if(audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playShootSound() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

function playBoomSound() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

init();
