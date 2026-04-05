const CHECKPOINT_INTERVAL = 5000;
const INITIAL_FUEL = 60; // 60 seconds of fuel to start

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
    speed: 15,
    baseSpeed: 15,
    maxUnlockedDepth: CHECKPOINT_INTERVAL,
    fuel: INITIAL_FUEL,
    heat: 0, // Heat acts as stun/damage penalty meter
    foundCount: 0,
    upgrades: { cooling: 0, power: 0 },
    isStunned: false,
    isGameActive: false,
    isMuted: true,
    feverTime: 0,
    lastFrameTime: Date.now(),
    drillX: 50, // Percentage 0-100
    targetX: 50,
    isDragging: false,
    ranking: JSON.parse(localStorage.getItem('scrollArch_ranking')) || [],
    entities: [] // All rocks and crystals
};

const gameContainer = document.getElementById('game-container');
const drillerSpace = document.getElementById('driller-space');
const timerContainer = document.querySelector('.timer-container .label');
const timerValue = document.getElementById('timer-value');
const timerUnit = document.querySelector('.timer-container .unit');
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
let fuelTimer;

function init() {
    resizeCanvas();
    updateHUD();
    renderLeaderboards();

    window.addEventListener('resize', resizeCanvas);
    
    if (startBtn) startBtn.onclick = (e) => { e.preventDefault(); startGame(); };
    if (restartBtn) restartBtn.onclick = () => location.reload();
    soundToggle.addEventListener('click', toggleMute);
    
    // Change UI Label for V5
    if (timerContainer) timerContainer.innerText = "燃料 (Fuel)";
    if (timerUnit) timerUnit.innerText = "L";

    // Action Controls (V5: Swipe/Drag to steer)
    gameContainer.addEventListener('mousedown', handleDragStart);
    gameContainer.addEventListener('touchstart', handleDragStart, {passive: false});
    window.addEventListener('mousemove', handleDragMove, {passive: false});
    window.addEventListener('touchmove', handleDragMove, {passive: false});
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    
    requestAnimationFrame(gameLoop);
}

// -----------------------------------------------------------
// DRAG TO STEER LOGIC
// -----------------------------------------------------------
function handleDragStart(e) {
    if (!gameState.isGameActive) return;
    if (e.target.id === 'sound-toggle') return;
    gameState.isDragging = true;
    actionHint.classList.add('hidden');
    updateTargetX(e);
}

function handleDragMove(e) {
    if (!gameState.isDragging || !gameState.isGameActive) return;
    updateTargetX(e);
}

function handleDragEnd() {
    gameState.isDragging = false;
}

function updateTargetX(e) {
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    
    const rect = gameContainer.getBoundingClientRect();
    let xPos = ((clientX - rect.left) / rect.width) * 100;
    gameState.targetX = Math.max(10, Math.min(90, xPos));
}

// -----------------------------------------------------------
// GAME LIFECYCLE
// -----------------------------------------------------------
function startGame() {
    introScreen.classList.add('hidden');
    
    // Reset state completely
    gameState.depth = 0;
    gameState.fuel = INITIAL_FUEL;
    gameState.foundCount = 0;
    gameState.maxUnlockedDepth = CHECKPOINT_INTERVAL;
    gameState.speed = gameState.baseSpeed;
    gameState.drillX = 50;
    gameState.targetX = 50;
    gameState.entities = [];
    veinContainer.innerHTML = '';
    artifactContainer.innerHTML = '';
    
    gameState.isGameActive = true;
    initAudio();
    spawnNextChunk(0, 10000); // Pre-spawn initial chunk
    spawnCheckpoint(CHECKPOINT_INTERVAL);
    
    if (fuelTimer) clearInterval(fuelTimer);
    fuelTimer = setInterval(() => {
        if (!gameState.isGameActive) return;
        // Natural fuel decay
        gameState.fuel -= 1;
        if (gameState.fuel <= 0) {
            gameState.fuel = 0;
            endGame();
        }
        updateHUD();
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    gameState.isDragging = false;
    clearInterval(fuelTimer);
    stopDrillSound();
    
    const score = { depth: Math.floor(gameState.depth), artifacts: gameState.foundCount, date: new Date().toLocaleDateString() };
    gameState.ranking.push(score);
    gameState.ranking.sort((a, b) => b.depth - a.depth);
    gameState.ranking = gameState.ranking.slice(0, 5);
    localStorage.setItem('scrollArch_ranking', JSON.stringify(gameState.ranking));

    document.getElementById('final-depth').innerText = Math.floor(gameState.depth);
    document.getElementById('final-artifacts').innerText = gameState.foundCount;
    renderLeaderboards();
    
    document.getElementById('gameover-title').innerText = "⛽ 燃料切れ！";
    gameoverModal.classList.remove('hidden');
}

// -----------------------------------------------------------
// MAIN LOOP & PHYSICS
// -----------------------------------------------------------
function gameLoop() {
    const now = Date.now();
    const deltaMs = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    if (gameState.isGameActive) {
        processPhysics(deltaMs);
        checkCollisions();
        updateVisuals();
        manageEntities(); // Spawn/Despawn continuously
    } else {
        renderParticles(); // title screen particles
    }
    
    requestAnimationFrame(gameLoop);
}

function processPhysics(deltaMs) {
    if (gameState.isStunned) {
        gameState.speed *= 0.8; // decelerate heavily
        gameState.heat = Math.max(0, gameState.heat - 3);
        if (gameState.heat <= 0) gameState.isStunned = false;
    } else {
        // Normal Descent
        let targetSpeed = gameState.baseSpeed + (gameState.upgrades.power * 2);
        
        // Fever speed
        if (gameState.feverTime > 0) {
            gameState.feverTime -= deltaMs;
            targetSpeed = 40; // Super speed!
            gameState.fuel += 0.01; // fuel recovered slightly during fever
            if (gameState.feverTime <= 0) gameContainer.classList.remove('fever-active');
        }
        
        gameState.speed += (targetSpeed - gameState.speed) * 0.1;
    }

    // Steering Lerp
    gameState.drillX += (gameState.targetX - gameState.drillX) * 0.15;
    
    // Move Forward
    gameState.depth += gameState.speed;
    drillerSpace.scrollTop = gameState.depth;
}

// -----------------------------------------------------------
// COLLISIONS & "SLALOM" MECHANICS
// -----------------------------------------------------------
function checkCollisions() {
    const drillY = gameState.depth + window.innerHeight * 0.85;
    const hitRadiusX = 8; // tighter hitbox for steering
    const hitRadiusY = 50;

    for (let i = gameState.entities.length - 1; i >= 0; i--) {
        let ent = gameState.entities[i];
        if (ent.destroyed) continue;
        
        // Mole Movement
        if (ent.type === 'mole') {
            ent.x += ent.dir * 0.4;
            if (ent.x > 90 || ent.x < 10) ent.dir *= -1;
            ent.node.style.left = `${ent.x}%`;
            ent.node.style.transform = `scaleX(${ent.dir > 0 ? -1 : 1})`;
        }
        
        // Math bounds
        const distY = Math.abs(drillY - ent.y);
        const distX = Math.abs(gameState.drillX - ent.x);
        
        if (distY < hitRadiusY && distX < hitRadiusX) {
            // HIT!
            handleHit(ent);
        }
    }
}

function handleHit(ent) {
    ent.destroyed = true;
    
    if (ent.type === 'crystal') {
        // GREAT! FUEL+
        ent.node.classList.add('broken');
        setTimeout(() => ent.node.remove(), 200);
        
        gameState.fuel += 2;
        showNotification("💎 燃料 +2L", true);
        
        // Create green sparks
        createSparks(ent.node, '#00e5ff');
        
    } else if (ent.type === 'rock' || ent.type === 'mole') {
        // BAD! DAMAGE
        if (gameState.feverTime > 0) {
            // Smash through during fever!
            ent.node.classList.add('broken');
            setTimeout(() => ent.node.remove(), 200);
            createSparks(ent.node, '#fff');
        } else if (!gameState.isStunned) {
            // Take damage
            gameState.isStunned = true;
            gameState.heat = 100;
            gameState.speed = -10; // bounce back
            gameState.fuel -= 5; // massive fuel penalty
            
            showNotification(ent.type === 'rock' ? "🪨 岩石に激突！ 연료 -5L" : "🐹 モグラに激突！ 燃料 -5L", false);
            triggerShake();
        }
    }
}

// -----------------------------------------------------------
// PROCEDURAL SPAWNING
// -----------------------------------------------------------
let lastSpawnDepth = 0;
function manageEntities() {
    // Despawn old
    const drillY = gameState.depth + window.innerHeight * 0.85;
    
    gameState.entities = gameState.entities.filter(ent => {
        if (ent.destroyed) return false;
        if (ent.y < drillY - 500) {
            // Passed it completely
            ent.node.remove();
            return false;
        }
        return true;
    });
    
    // Spawn new chunks ahead
    if (gameState.depth > lastSpawnDepth - 3000) {
        spawnNextChunk(lastSpawnDepth + 5000, lastSpawnDepth + 15000);
        lastSpawnDepth += 10000;
    }
}

function spawnNextChunk(startDepth, endDepth) {
    // Amount scales slightly with depth ?
    const count = 30 + Math.floor(gameState.foundCount * 5); 
    
    for (let i = 0; i < count; i++) {
        const y = startDepth + (Math.random() * (endDepth - startDepth));
        const x = 10 + Math.random() * 80;
        
        // 60% Crystal, 30% Rock, 10% Mole
        const rand = Math.random();
        let type, icon, cssClass;
        
        if (rand < 0.6) {
            type = 'crystal'; icon = '💎'; cssClass = 'bonus-item';
        } else if (rand < 0.9) {
            type = 'rock'; icon = '🪨'; cssClass = 'obstacle boulder';
        } else {
            type = 'mole'; icon = '🐹'; cssClass = 'obstacle mole mole-anim';
        }
        
        const node = document.createElement('div');
        node.className = `artifact-spot ${cssClass}`;
        if (type !== 'crystal') node.className = cssClass; // reset for obstacles
        
        node.style.top = `${y}px`;
        node.style.left = `${x}%`;
        node.innerHTML = icon;
        veinContainer.appendChild(node);
        
        gameState.entities.push({
            type, x, y, dir: Math.random() > 0.5 ? 1 : -1, node, destroyed: false
        });
    }
}

// -----------------------------------------------------------
// CHECKPOINT & FEVER
// -----------------------------------------------------------
function spawnCheckpoint(depth) {
    const item = ARTIFACTS[gameState.foundCount % ARTIFACTS.length];
    const spot = document.createElement('div');
    spot.className = 'artifact-spot';
    spot.style.top = `${depth}px`;
    spot.style.left = `50%`;
    spot.style.transform = `translateX(-50%)`;
    spot.innerHTML = `<span class="gift-box" style="font-size:60px;">📦</span><div style="font-size:12px; font-weight:800;">CHECKPOINT</div>`;
    
    const checkGate = setInterval(() => {
        if (!gameState.isGameActive) return clearInterval(checkGate);
        if (gameState.depth > depth - 150) {
            clearInterval(checkGate);
            clearCheckpoint(spot, item);
        }
    }, 100); // Check frequently
    artifactContainer.appendChild(spot);
}

function clearCheckpoint(node, item) {
    node.classList.add('broken');
    setTimeout(() => node.remove(), 500);
    
    gameState.foundCount++;
    gameState.fuel += 20; // +20 fuel!
    gameState.maxUnlockedDepth += CHECKPOINT_INTERVAL;
    
    activateFever(4000); // 4 Seconds Fever!
    
    showNotification(`${item.name} 獲得！ FEVER MODE!!`, true);
    spawnCheckpoint(gameState.maxUnlockedDepth);
    gameState.baseSpeed += 1; // Increase base speed per checkpoint
}

function activateFever(durationMs) {
    gameState.feverTime = durationMs;
    gameContainer.classList.add('fever-active');
}

// -----------------------------------------------------------
// VISUALS & EFFECTS
// -----------------------------------------------------------
function updateVisuals() {
    drillUnit.style.left = `${gameState.drillX}%`;
    
    // Tilt the drill based on steering target
    const tilt = (gameState.targetX - gameState.drillX) * 1.5;
    drillUnit.style.transform = `translateX(-50%) rotate(${tilt}deg)`;
    
    const isMoving = gameState.speed > 5;
    
    if (isMoving && !gameState.isStunned) {
        if (gameState.feverTime > 0) document.body.classList.add('shake-screen');
        else document.body.classList.remove('shake-screen');
        
        createParticles(gameState.depth + window.innerHeight * 0.85, gameState.speed / 10);
        updateDrillSound(gameState.speed / 50);
        
        if (gameState.speed > 25) gameContainer.classList.add('boost');
        else gameContainer.classList.remove('boost');
    } else {
        document.body.classList.remove('shake-screen');
        gameContainer.classList.remove('boost');
        stopDrillSound();
    }
    
    renderParticles();
    updateHUD();
}

function triggerShake() {
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 300);
}

function createSparks(node, color) {
    const boom = document.createElement('div');
    boom.className = 'parry-explode';
    boom.style.background = `radial-gradient(circle, #fff 0%, ${color} 30%, transparent 70%)`;
    node.appendChild(boom);
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
            ctx.beginPath(); ctx.arc(p.x, p.y - viewTop, p.size, 0, Math.PI * 2); ctx.fill();
        }
    });
}

function createParticles(y, intensity) {
    const count = Math.floor(intensity * 5);
    const color = gameState.feverTime > 0 ? '#ffeb3b' : '#ff9800';
    for (let i = 0; i < count; i++) {
        particles.push({
            x: (gameState.drillX / 100) * window.innerWidth + (Math.random() - 0.5) * 40, 
            y: y,
            vx: (Math.random() - 0.5) * 20, vy: -(Math.random() * 20 + 5),
            life: 1.0, color: color, size: Math.random() * 8 + 3
        });
    }
}

// -----------------------------------------------------------
// HUD UI
// -----------------------------------------------------------
let notifyTimer;
function showNotification(msg, isPositive) {
    notification.querySelector('.message').innerText = msg;
    notification.style.color = isPositive ? '#00e5ff' : '#f44336';
    notification.style.border = `1px solid ${isPositive ? '#00e5ff' : '#f44336'}`;
    notification.classList.remove('hidden');
    
    if (notifyTimer) clearTimeout(notifyTimer);
    notification.style.animation = 'none';
    notification.offsetHeight; 
    notification.style.animation = 'slideUp 0.3s ease-out';
    
    notifyTimer = setTimeout(() => notification.classList.add('hidden'), 2000);
}

function updateHUD() {
    timerValue.innerText = Math.floor(gameState.fuel);
    depthValue.innerText = Math.floor(gameState.depth).toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.8;
    timerValue.style.color = gameState.fuel < 15 ? '#f44336' : (gameState.feverTime > 0 ? '#ffeb3b' : '#00e5ff');

    const currentBase = (gameState.foundCount) * CHECKPOINT_INTERVAL;
    let progress = ((gameState.depth - currentBase) / CHECKPOINT_INTERVAL) * 100;
    progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function renderLeaderboards() {
    const render = (list, data) => {
        if (data.length === 0) {
            list.innerHTML = `<li><span>1. 10,000m (スラローム神)</span> <span>2024/--/--</span></li>
                              <li><span>2. 5,000m (探検家)</span> <span>2024/--/--</span></li>`;
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

// -----------------------------------------------------------
// AUDIO
// -----------------------------------------------------------
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
    drillOsc.frequency.setTargetAtTime(60 + speedRatio * 300, audioCtx.currentTime, 0.1);
    drillGain.gain.setTargetAtTime(Math.min(0.2, speedRatio * 0.3), audioCtx.currentTime, 0.1);
}

function stopDrillSound() {
    if (drillGain) drillGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
}

function resizeCanvas() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
}

init();
