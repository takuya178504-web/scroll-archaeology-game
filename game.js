const CHECKPOINT_INTERVAL = 5000;
const INITIAL_TIME = 120;

const ARTIFACTS = [
    { id: 1, name: "古代ティラノサウルスの牙", icon: "🦖" },
    { id: 2, name: "古代ローマの金貨", icon: "🪙" },
    { id: 3, name: "錆びついた騎士の剣", icon: "⚔️" },
    { id: 4, name: "神秘のこもった青水晶", icon: "💎" },
    { id: 5, name: "古代の石版", icon: "📜" },
    { id: 6, name: "サイバネティクス・アーム", icon: "🦾" },
    { id: 7, name: "希少な化石の卵", icon: "🥚" },
    { id: 8, name: "黒曜石の短剣", icon: "🔪" },
    { id: 9, name: "失われた王冠", icon: "👑" },
    { id: 10, name: "隕石の核", icon: "☄️" }
];

let gameState = {
    depth: 0,
    speed: 0,
    maxUnlockedDepth: CHECKPOINT_INTERVAL,
    timeLeft: INITIAL_TIME,
    heat: 0,
    foundCount: 0,
    upgrades: { cooling: 0, power: 0 },
    isOverheated: false,
    isMuted: true,
    isGameActive: false,
    isStunned: false,
    isHolding: false,
    lastPressTime: 0,
    feverTime: 0,
    lastFrameTime: Date.now(),
    ranking: JSON.parse(localStorage.getItem('scrollArch_ranking')) || [],
    obstacles: [],
    moles: []
};

// Elements
const gameContainer = document.getElementById('game-container');
const drillerSpace = document.getElementById('driller-space');
const timerValue = document.getElementById('timer-value');
const depthValue = document.getElementById('depth-value');
const heatFill = document.getElementById('heat-fill');
const progressFill = document.getElementById('progress-fill');
const artifactContainer = document.getElementById('artifact-container');
const veinContainer = document.getElementById('vein-container');
const introScreen = document.getElementById('intro-screen');
const startBtn = document.getElementById('start-btn');
const soundToggle = document.getElementById('sound-toggle');
const gameoverModal = document.getElementById('gameover-modal');
const leaderboardList = document.getElementById('leaderboard-list');
const menuLeaderboard = document.getElementById('menu-leaderboard');
const restartBtn = document.getElementById('restart-btn');
const drillUnit = document.getElementById('drill-unit');
const drillHeatOverlay = document.getElementById('drill-heat-overlay');
const notification = document.getElementById('notification');
const actionHint = document.getElementById('action-hint');

let audioCtx, drillOsc, drillGain;
let particles = [];
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let gameTimer;

function init() {
    resizeCanvas();
    spawnObstacles();
    updateHUD();
    renderLeaderboards();

    window.addEventListener('resize', resizeCanvas);
    
    if (startBtn) startBtn.onclick = (e) => { e.preventDefault(); startGame(); };
    if (restartBtn) restartBtn.onclick = () => location.reload();
    soundToggle.addEventListener('click', toggleMute);
    
    // Action Controls (V4: Hold to drill)
    gameContainer.addEventListener('mousedown', handlePress);
    gameContainer.addEventListener('touchstart', handlePress, {passive: false});
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);
    
    requestAnimationFrame(gameLoop);
}

function handlePress(e) {
    if (!gameState.isGameActive || gameState.isStunned) return;
    if (e.target.id === 'sound-toggle') return;
    
    gameState.isHolding = true;
    gameState.lastPressTime = Date.now();
    actionHint.classList.add('hidden'); // Hide hint when playing
    gameContainer.classList.add('drilling');
}

function handleRelease() {
    gameState.isHolding = false;
    gameContainer.classList.remove('drilling');
}

function startGame() {
    introScreen.classList.add('hidden');
    gameState.isGameActive = true;
    initAudio();
    spawnCheckpoint(CHECKPOINT_INTERVAL);
    
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = setInterval(() => {
        if (!gameState.isGameActive) return;
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) endGame();
        updateHUD();
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    gameState.isHolding = false;
    clearInterval(gameTimer);
    stopDrillSound();
    
    const score = { depth: Math.floor(gameState.depth), artifacts: gameState.foundCount, date: new Date().toLocaleDateString() };
    gameState.ranking.push(score);
    gameState.ranking.sort((a, b) => b.depth - a.depth);
    gameState.ranking = gameState.ranking.slice(0, 5);
    localStorage.setItem('scrollArch_ranking', JSON.stringify(gameState.ranking));

    document.getElementById('final-depth').innerText = Math.floor(gameState.depth);
    document.getElementById('final-artifacts').innerText = gameState.foundCount;
    renderLeaderboards();
    gameoverModal.classList.remove('hidden');
}

function gameLoop() {
    const now = Date.now();
    const deltaMs = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    if (gameState.isGameActive && !gameState.isStunned) {
        processPhysics(deltaMs);
        checkCollisions();
        updateVisuals();
    }
    
    renderParticles();
    requestAnimationFrame(gameLoop);
}

function processPhysics(deltaMs) {
    let targetSpeed = 0;
    
    if (gameState.feverTime > 0) {
        gameState.feverTime -= deltaMs;
        targetSpeed = 50; // Super speed!
        gameState.heat = Math.max(0, gameState.heat - 2); // Cools down rapidly
        if (gameState.feverTime <= 0) gameContainer.classList.remove('fever-active');
    } else if (gameState.isHolding && !gameState.isOverheated) {
        targetSpeed = 25 + (gameState.upgrades.power * 2); 
        const coolingBonus = Math.max(0.2, 1 - (gameState.upgrades.cooling * 0.15));
        gameState.heat = Math.min(100, gameState.heat + (0.3 * coolingBonus));
    } else {
        targetSpeed = 0;
        gameState.heat = Math.max(0, gameState.heat - 1.0);
    }

    // Accelerate / Decelerate
    gameState.speed += (targetSpeed - gameState.speed) * 0.1;
    if (gameState.speed < 0.1) gameState.speed = 0;

    if (gameState.heat >= 100 && !gameState.isOverheated) triggerOverheat();

    // Checkpoint gate
    let nextPos = gameState.depth + gameState.speed;
    if (nextPos >= gameState.maxUnlockedDepth - 100 && gameState.speed > 0) {
        nextPos = gameState.maxUnlockedDepth - 101;
        gameState.speed = 0; // Force stop at checkpoint
    }

    gameState.depth = nextPos;
    drillerSpace.scrollTop = gameState.depth;
}

function checkCollisions() {
    const drillY = gameState.depth + window.innerHeight * 0.85;
    const drillXCenter = 50; // percentage
    const hitRadiusX = 15; // percentage width
    
    // Handle Moles movement and check collision
    gameState.moles.forEach(mole => {
        mole.x += mole.dir * 0.5;
        if (mole.x > 90 || mole.x < 10) mole.dir *= -1;
        mole.node.style.left = `${mole.x}%`;
        mole.node.style.transform = `scaleX(${mole.dir > 0 ? -1 : 1})`;
        
        checkUnitCollision(mole, drillY, drillXCenter, hitRadiusX, true);
    });

    // Handle Boulders
    gameState.obstacles.forEach(boulder => {
        checkUnitCollision(boulder, drillY, drillXCenter, hitRadiusX, false);
    });
}

function checkUnitCollision(obj, drillY, drillXCenter, hitRadiusX, isMole) {
    if (obj.destroyed) return;
    
    const distY = Math.abs(drillY - obj.y);
    const distX = Math.abs(drillXCenter - obj.x);
    
    if (distY < 60 && distX < hitRadiusX && !gameState.isStunned) {
        const timeSincePress = Date.now() - gameState.lastPressTime;
        
        // PARRY (Just frame) OR FEVER
        if (gameState.feverTime > 0 || timeSincePress < 300) {
            triggerParry(obj.node, isMole ? "🐹 モグラ粉砕！" : "💥 岩石粉砕！");
            obj.destroyed = true;
        } else {
            // CRASH
            triggerStun(isMole ? "🐹 モグラに激突！" : "🪨 岩石に激突！");
        }
    }
}

function triggerParry(node, msg) {
    // Explosion FX
    const boom = document.createElement('div');
    boom.className = 'parry-explode';
    node.appendChild(boom);
    node.classList.add('broken');
    setTimeout(() => node.remove(), 400);

    gameState.heat = 0;
    gameState.speed = 50; // instantaneous burst
    activateFever(1500); // 1.5sec mini fever
    showNotification(`🔥 PARRY!! ${msg}`);
}

function triggerStun(msg) {
    gameState.isStunned = true;
    gameState.speed = -20; // Bounce back
    gameState.heat = 100;
    gameContainer.classList.remove('drilling');
    
    showNotification(msg + " (ペナルティ)");
    let stunAnim = setInterval(() => { drillUnit.style.transform = `rotate(${Math.random() * 20 - 10}deg)`; }, 50);

    setTimeout(() => {
        clearInterval(stunAnim);
        drillUnit.style.transform = "";
        triggerOverheat();
        gameState.isStunned = false;
    }, 1000);
}

function triggerOverheat() {
    gameState.isOverheated = true;
    stopDrillSound();
    if (!gameState.isStunned) showNotification("オーバーヒート！冷却中...");
    setTimeout(() => {
        gameState.heat = 0;
        gameState.isOverheated = false;
        updateHUD();
    }, 2500);
}

function activateFever(durationMs) {
    gameState.feverTime = durationMs;
    gameContainer.classList.add('fever-active');
}

function spawnCheckpoint(depth) {
    const item = ARTIFACTS[gameState.foundCount % ARTIFACTS.length];
    const spot = document.createElement('div');
    spot.className = 'artifact-spot';
    spot.style.top = `${depth}px`;
    spot.style.left = `50%`;
    spot.style.transform = `translateX(-50%)`;
    spot.innerHTML = `<span class="gift-box" style="font-size:60px;">📦</span><div style="font-size:12px; font-weight:800;">BREAK ME!</div>`;
    
    // In V4, it's click to break the gate open OR drill into it
    spot.onclick = () => clearCheckpoint(spot, item);
    // Auto-break if drilled close enough (handled here for simplicity)
    const checkGate = setInterval(() => {
        if (!gameState.isGameActive) return clearInterval(checkGate);
        if (gameState.depth > depth - 150) {
            clearInterval(checkGate);
            clearCheckpoint(spot, item);
        }
    }, 100);
    
    artifactContainer.appendChild(spot);
}

function clearCheckpoint(node, item) {
    node.remove();
    gameState.foundCount++;
    gameState.timeLeft += 30; // +30 seconds
    gameState.maxUnlockedDepth += CHECKPOINT_INTERVAL;
    gameState.heat = 0;
    
    // Huge Fever Time for Checkpoint!
    activateFever(5000); 
    
    showNotification(`${item.name} 獲得！ FEVER MODE!!`);
    spawnCheckpoint(gameState.maxUnlockedDepth);
    updateHUD();
}

function spawnObstacles() {
    veinContainer.innerHTML = '';
    gameState.obstacles = [];
    gameState.moles = [];
    
    for (let i = 0; i < 60; i++) {
        const depth = 2000 + (Math.random() * 95000);
        const boulder = document.createElement('div');
        boulder.className = 'obstacle boulder';
        boulder.style.top = `${depth}px`;
        const xPos = 10 + Math.random() * 80;
        boulder.style.left = `${xPos}%`;
        boulder.innerHTML = '🪨';
        veinContainer.appendChild(boulder);
        gameState.obstacles.push({ y: depth, x: xPos, node: boulder, destroyed: false });
    }
    
    for (let i = 0; i < 30; i++) {
        const depth = 5000 + (Math.random() * 90000);
        const moleNode = document.createElement('div');
        moleNode.className = 'obstacle mole mole-anim';
        moleNode.style.top = `${depth}px`;
        moleNode.innerHTML = '🐹';
        veinContainer.appendChild(moleNode);
        gameState.moles.push({ y: depth, x: Math.random() * 80 + 10, dir: Math.random() > 0.5 ? 1 : -1, node: moleNode, destroyed: false });
    }
}

function updateVisuals() {
    const isMoving = gameState.speed > 5;
    
    if (isMoving && !gameState.isOverheated) {
        document.body.classList.add('shake-screen');
        createParticles(gameState.depth + window.innerHeight * 0.8, gameState.speed / 10);
        updateDrillSound(gameState.speed / 50);
        
        if (gameState.speed > 35) gameContainer.classList.add('boost');
        else gameContainer.classList.remove('boost');
    } else {
        document.body.classList.remove('shake-screen');
        gameContainer.classList.remove('boost');
        stopDrillSound();
    }
    
    updateHUD();
}

function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const viewTop = drillerSpace.scrollTop;
    const viewBottom = viewTop + window.innerHeight;

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.life -= 0.05;
        if (p.y > viewTop && p.y < viewBottom) {
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y - viewTop, p.size, 0, Math.PI * 2); ctx.fill(); // Offset by scroll!
        }
    });
}

function updateHUD() {
    timerValue.innerText = gameState.timeLeft;
    depthValue.innerText = Math.floor(gameState.depth).toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.8;
    timerValue.style.color = gameState.timeLeft < 20 ? '#f44336' : (gameState.feverTime > 0 ? '#ffeb3b' : '#ff9800');

    const currentBase = (gameState.foundCount) * CHECKPOINT_INTERVAL;
    let progress = ((gameState.depth - currentBase) / CHECKPOINT_INTERVAL) * 100;
    progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function renderLeaderboards() {
    const render = (list, data) => {
        if (data.length === 0) {
            list.innerHTML = `<li><span>1. 10,000m (伝説)</span> <span>2024/--/--</span></li>
                              <li><span>2. 5,000m (新人)</span> <span>2024/--/--</span></li>`;
            return;
        }
        list.innerHTML = '';
        data.forEach((entry, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${i+1}. ${entry.depth.toLocaleString()}m</span> <span>${entry.date}</span>`;
            list.appendChild(li);
        });
    };
    if (leaderboardList) render(leaderboardList, gameState.ranking);
    if (menuLeaderboard) render(menuLeaderboard, gameState.ranking);
}

function showNotification(msg) {
    notification.querySelector('.message').innerText = msg;
    notification.classList.remove('hidden');
    // Restart animation
    notification.style.animation = 'none';
    notification.offsetHeight; 
    notification.style.animation = 'slideUp 0.3s ease-out';
    
    setTimeout(() => notification.classList.add('hidden'), 2500);
}

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    drillOsc = audioCtx.createOscillator();
    drillOsc.type = 'sawtooth';
    drillGain = audioCtx.createGain();
    drillGain.gain.value = 0;
    drillOsc.connect(drillGain);
    drillGain.connect(audioCtx.destination);
    drillOsc.start();
}

function toggleMute() {
    gameState.isMuted = !gameState.isMuted;
    soundToggle.innerText = gameState.isMuted ? '🔇' : '🔊';
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function updateDrillSound(speedRatio) {
    if (!drillGain || gameState.isMuted) return;
    drillOsc.frequency.setTargetAtTime(60 + speedRatio * 400, audioCtx.currentTime, 0.1);
    drillGain.gain.setTargetAtTime(Math.min(0.2, speedRatio * 0.3), audioCtx.currentTime, 0.1);
}

function stopDrillSound() {
    if (drillGain) drillGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
}

function createParticles(y, intensity) {
    const count = Math.floor(intensity * 10);
    const color = gameState.feverTime > 0 ? '#ffeb3b' : '#ff9800';
    
    for (let i = 0; i < count; i++) {
        particles.push({
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 40, y: y,
            vx: (Math.random() - 0.5) * 30, vy: -(Math.random() * 20 + 5),
            life: 1.0, color: color, size: Math.random() * 8 + 3
        });
    }
}

function resizeCanvas() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; // Fixed to viewport since we handle offset manually!
}

init();
