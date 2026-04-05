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
    maxUnlockedDepth: CHECKPOINT_INTERVAL,
    timeLeft: INITIAL_TIME,
    heat: 0,
    points: 0,
    foundCount: 0,
    upgrades: { cooling: 0, power: 0 },
    inventory: { cool: 0, sonar: 0 },
    isOverheated: false,
    isMuted: true,
    isGameActive: false,
    lastScrollTime: Date.now(),
    lastScrollPos: 0,
    ranking: JSON.parse(localStorage.getItem('scrollArch_ranking')) || []
};

// Elements
const drillerSpace = document.getElementById('driller-space');
const timerValue = document.getElementById('timer-value');
const depthValue = document.getElementById('depth-value');
const heatFill = document.getElementById('heat-fill');
const artifactContainer = document.getElementById('artifact-container');
const veinContainer = document.getElementById('vein-container');
const introScreen = document.getElementById('intro-screen');
const startBtn = document.getElementById('start-btn');
const soundToggle = document.getElementById('sound-toggle');
const gameoverModal = document.getElementById('gameover-modal');
const leaderboardList = document.getElementById('leaderboard-list');
const restartBtn = document.getElementById('restart-btn');
const drillUnit = document.getElementById('drill-unit');
const drillHeatOverlay = document.getElementById('drill-heat-overlay');
const notification = document.getElementById('notification');

let audioCtx, drillOsc, drillGain;
let particles = [];
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let gameTimer;

function init() {
    resizeCanvas();
    spawnObstacles();
    updateHUD();
    renderLeaderboard();

    window.addEventListener('resize', resizeCanvas);
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', () => location.reload());
    soundToggle.addEventListener('click', toggleMute);
    
    drillerSpace.addEventListener('scroll', handleScroll);
    requestAnimationFrame(gameLoop);
}

function startGame() {
    introScreen.classList.add('hidden');
    gameState.isGameActive = true;
    initAudio();
    spawnCheckpoint(CHECKPOINT_INTERVAL);
    
    gameTimer = setInterval(() => {
        if (!gameState.isGameActive) return;
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) endGame();
        updateHUD();
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    clearInterval(gameTimer);
    stopDrillSound();
    
    // Save Ranking
    const score = { depth: gameState.depth, artifacts: gameState.foundCount, date: new Date().toLocaleDateString() };
    gameState.ranking.push(score);
    gameState.ranking.sort((a, b) => b.depth - a.depth);
    gameState.ranking = gameState.ranking.slice(0, 5);
    localStorage.setItem('scrollArch_ranking', JSON.stringify(gameState.ranking));

    document.getElementById('final-depth').innerText = gameState.depth;
    document.getElementById('final-artifacts').innerText = gameState.foundCount;
    renderLeaderboard();
    gameoverModal.classList.remove('hidden');
}

function handleScroll() {
    if (!gameState.isGameActive) return;

    const currentPos = drillerSpace.scrollTop;
    // Checkpoint Lock
    if (currentPos > gameState.maxUnlockedDepth - 100) {
        drillerSpace.scrollTop = gameState.maxUnlockedDepth - 101;
        return;
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - gameState.lastScrollTime;
    const posDiff = Math.abs(currentPos - gameState.lastScrollPos);

    if (timeDiff > 0 && !gameState.isOverheated) {
        const speed = posDiff / timeDiff;
        if (speed > 0.05) {
            const coolingBonus = 1 - (gameState.upgrades.cooling * 0.15);
            gameState.heat = Math.min(100, gameState.heat + (speed * 4 * coolingBonus));
            
            document.body.classList.add('shake-screen');
            drillUnit.parentElement.classList.add('drilling');
            createParticles(currentPos + window.innerHeight * 0.8, speed);
            updateDrillSound(speed);
        } else {
            gameState.heat = Math.max(0, gameState.heat - 2);
            document.body.classList.remove('shake-screen');
            drillUnit.parentElement.classList.remove('drilling');
            stopDrillSound();
        }
    }

    if (gameState.heat >= 100) triggerOverheat();

    gameState.depth = Math.floor(currentPos);
    gameState.lastScrollTime = currentTime;
    gameState.lastScrollPos = currentPos;
    updateHUD();
}

function triggerOverheat() {
    gameState.isOverheated = true;
    stopDrillSound();
    showNotification("オーバーヒート！3秒間停止！");
    
    setTimeout(() => {
        gameState.heat = 0;
        gameState.isOverheated = false;
        updateHUD();
    }, 3000);
}

function spawnCheckpoint(depth) {
    const item = ARTIFACTS[gameState.foundCount % ARTIFACTS.length];
    const spot = document.createElement('div');
    spot.className = 'artifact-spot';
    spot.style.top = `${depth}px`;
    spot.style.left = `50%`;
    spot.style.transform = `translateX(-50%)`;
    spot.innerHTML = `<span class="gift-box" style="font-size:60px;">📦</span><div style="font-size:12px; font-weight:800;">CHECKPOINT</div>`;
    
    spot.addEventListener('click', () => {
        let count = 0;
        spot.innerHTML = `🔨`;
        const interval = setInterval(() => {
            count++;
            spot.style.transform = `translateX(-50%) scale(${1 + count*0.1})`;
            if (count >= 10) {
                clearInterval(interval);
                clearCheckpoint(spot, item);
            }
        }, 100);
    });
    artifactContainer.appendChild(spot);
}

function clearCheckpoint(node, item) {
    node.remove();
    gameState.foundCount++;
    gameState.timeLeft += 40;
    gameState.maxUnlockedDepth += CHECKPOINT_INTERVAL;
    gameState.heat = 0;
    showNotification(`${item.name} 解放！タイム +40s`);
    spawnCheckpoint(gameState.maxUnlockedDepth);
    updateHUD();
}

function spawnObstacles() {
    veinContainer.innerHTML = '';
    // Boulders
    for (let i = 0; i < 50; i++) {
        const depth = 1000 + (Math.random() * 95000);
        const boulder = document.createElement('div');
        boulder.className = 'obstacle boulder';
        boulder.style.top = `${depth}px`;
        boulder.style.left = `${10 + Math.random() * 80}%`;
        boulder.innerHTML = '🪨';
        let hp = 3;
        boulder.addEventListener('click', () => {
            hp--;
            boulder.style.transform = `scale(${0.7 + hp*0.1})`;
            if (hp <= 0) {
                boulder.classList.add('broken');
                setTimeout(() => boulder.remove(), 300);
            }
        });
        veinContainer.appendChild(boulder);
    }

    // Power Ups
    for (let i = 0; i < 30; i++) {
        const depth = 2000 + (Math.random() * 90000);
        const part = document.createElement('div');
        part.className = 'artifact-spot bonus-item';
        part.style.top = `${depth}px`;
        part.style.left = `${10 + Math.random() * 80}%`;
        const type = Math.random() > 0.5 ? 'power' : 'cooling';
        part.innerHTML = type === 'power' ? '⚡' : '❄️';
        part.addEventListener('click', () => {
            gameState.upgrades[type]++;
            showNotification(`ドリル強化：${type === 'power' ? 'パワー' : '冷却'} Lv.${gameState.upgrades[type]}`);
            updateHUD();
            part.remove();
        });
        artifactContainer.appendChild(part);
    }
}

function updateHUD() {
    timerValue.innerText = gameState.timeLeft;
    depthValue.innerText = gameState.depth.toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.8;
    
    // Timer Warning
    timerValue.style.color = gameState.timeLeft < 20 ? '#f44336' : '#ff9800';

    // Drill Evolution
    const totalLevel = gameState.upgrades.cooling + gameState.upgrades.power;
    drillUnit.classList.toggle('evo-2', totalLevel >= 5);
    drillUnit.classList.toggle('evo-3', totalLevel >= 10);
}

function renderLeaderboard() {
    leaderboardList.innerHTML = '';
    gameState.ranking.forEach((entry, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${i+1}. ${entry.depth}m</span> <span>${entry.date}</span>`;
        leaderboardList.appendChild(li);
    });
}

function showNotification(msg) {
    notification.querySelector('.message').innerText = msg;
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

// Reuse core systems
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

function updateDrillSound(speed) {
    if (!drillGain || gameState.isMuted) return;
    drillOsc.frequency.setTargetAtTime(60 + speed * 300, audioCtx.currentTime, 0.1);
    drillGain.gain.setTargetAtTime(Math.min(0.2, speed * 0.4), audioCtx.currentTime, 0.1);
}

function stopDrillSound() {
    if (drillGain) drillGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
}

function createParticles(y, speed) {
    const count = Math.floor(speed * 10);
    for (let i = 0; i < count; i++) {
        particles.push({
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 100, y: y,
            vx: (Math.random() - 0.5) * 20, vy: -(Math.random() * 10 + 5),
            life: 1.0, color: '#ff9800', size: Math.random() * 5 + 2
        });
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const viewTop = drillerSpace.scrollTop;
    const viewBottom = viewTop + window.innerHeight;
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.life -= 0.03;
        if (p.y > viewTop && p.y < viewBottom) {
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
    });
    requestAnimationFrame(gameLoop);
}

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = drillerSpace.scrollHeight; }

init();
