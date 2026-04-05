const ARTIFACTS = [
    { id: 1, name: "古代ティラノサウルスの牙", depth: 1500, icon: "🦖", color: "#8d6e63" },
    { id: 2, name: "古代ローマの金貨", depth: 5200, icon: "🪙", color: "#ffd700" },
    { id: 3, name: "錆びついた騎士の剣", depth: 12000, icon: "⚔️", color: "#757575" },
    { id: 4, name: "神秘のこもった青水晶", depth: 25000, icon: "💎", color: "#00b0ff" },
    { id: 5, name: "古代の石版", depth: 38000, icon: "📜", color: "#a1887f" },
    { id: 6, name: "サイバネティクス・アーム", depth: 55000, icon: "🦾", color: "#607d8b" },
    { id: 7, name: "希少な化石の卵", depth: 68000, icon: "🥚", color: "#d7ccc8" },
    { id: 8, name: "黒曜石の短剣", depth: 75000, icon: "🔪", color: "#212121" },
    { id: 9, name: "失われた王冠", depth: 88000, icon: "👑", color: "#ffab00" },
    { id: 10, name: "隕石の核", depth: 98000, icon: "☄️", color: "#ff5252" }
];

const UPGRADES = [
    { id: 'cooling', name: '高性能冷却システム', desc: 'ドリルの発熱を15%抑制します', cost: 1000, level: 0, max: 5 },
    { id: 'power', name: '強化ダイヤモンドビット', desc: '硬い岩板での作業効率をアップします', cost: 2000, level: 0, max: 3 }
];

let gameState = {
    depth: 0,
    heat: 0,
    points: parseInt(localStorage.getItem('scrollArch_points')) || 0,
    foundItems: JSON.parse(localStorage.getItem('scrollArch_found')) || [],
    upgrades: JSON.parse(localStorage.getItem('scrollArch_upgrades')) || { cooling: 0, power: 0 },
    isOverheated: false,
    isMuted: true,
    lastScrollTime: Date.now(),
    lastScrollPos: 0
};

// Particles & Canvas
let particles = [];
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

// Audio Context
let audioCtx, drillOsc, drillGain;

// Elements
const body = document.body;
const drillerSpace = document.getElementById('driller-space');
const depthValue = document.getElementById('depth-value');
const heatFill = document.getElementById('heat-fill');
const foundCount = document.getElementById('found-count');
const artifactContainer = document.getElementById('artifact-container');
const overheatWarning = document.getElementById('overheat-warning');
const startBtn = document.getElementById('start-btn');
const introScreen = document.getElementById('intro-screen');
const drillContainer = document.getElementById('drill-container');
const drillUnit = document.getElementById('drill-unit');
const drillHeatOverlay = document.getElementById('drill-heat-overlay');
const soundToggle = document.getElementById('sound-toggle');

const collectionBtn = document.getElementById('collection-btn');
const collectionModal = document.getElementById('collection-modal');
const closeCollection = document.getElementById('close-collection');
const upgradeBtn = document.getElementById('upgrade-btn');
const upgradeModal = document.getElementById('upgrade-modal');
const closeUpgrade = document.getElementById('close-upgrade');
const upgradesList = document.getElementById('upgrades-list');
const artifactsGrid = document.getElementById('artifacts-grid');
const notification = document.getElementById('notification');

function init() {
    resizeCanvas();
    spawnArtifacts();
    updateHUD();
    renderCollection();
    renderUpgrades();

    window.addEventListener('resize', resizeCanvas);
    
    startBtn.addEventListener('click', () => {
        introScreen.classList.add('hidden');
        initAudio();
    });

    soundToggle.addEventListener('click', toggleMute);
    closeCollection.addEventListener('click', () => collectionModal.classList.add('hidden'));
    closeUpgrade.addEventListener('click', () => upgradeModal.classList.add('hidden'));
    
    collectionBtn.addEventListener('click', () => {
        renderCollection();
        collectionModal.classList.remove('hidden');
    });

    upgradeBtn.addEventListener('click', () => {
        renderUpgrades();
        upgradeModal.classList.remove('hidden');
    });

    drillerSpace.addEventListener('scroll', handleScroll);
    requestAnimationFrame(gameLoop);
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

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = drillerSpace.scrollHeight;
}

function spawnArtifacts() {
    artifactContainer.innerHTML = '';
    ARTIFACTS.forEach((item) => {
        const spot = document.createElement('div');
        spot.className = 'artifact-spot';
        spot.style.top = `${item.depth}px`;
        spot.style.left = `${20 + Math.random() * 60}%`;
        
        if (gameState.foundItems.includes(item.id)) {
            spot.innerHTML = `<span style="font-size: 40px; filter: grayscale(0.5); opacity: 0.2;">${item.icon}</span>`;
        } else {
            spot.innerHTML = `<span style="font-size: 40px;">🎁</span>`;
            spot.addEventListener('click', () => collectItem(item));
        }
        artifactContainer.appendChild(spot);
    });
}

function handleScroll() {
    const currentPos = drillerSpace.scrollTop;
    const currentTime = Date.now();
    const timeDiff = currentTime - gameState.lastScrollTime;
    const posDiff = Math.abs(currentPos - gameState.lastScrollPos);
    
    if (timeDiff > 0 && !gameState.isOverheated) {
        const rawSpeed = posDiff / timeDiff;
        let speed = rawSpeed;

        // Hard Rock Logic (15000m - 20000m)
        const isHardRock = gameState.depth > 15000 && gameState.depth < 20000;
        let heatMultiplier = 1;
        
        if (isHardRock) {
            const powerBonus = gameState.upgrades.power * 0.2;
            speed *= (0.3 + powerBonus);
            heatMultiplier = 4;
        }

        // Apply heat & effects
        if (speed > 0.05) {
            const coolingBonus = 1 - (gameState.upgrades.cooling * 0.15);
            gameState.heat = Math.min(100, gameState.heat + (speed * 2.5 * heatMultiplier * coolingBonus));
            
            // Visuals
            drillContainer.classList.add('drilling');
            body.classList.add('shake-screen');
            createParticles(currentPos + window.innerHeight * 0.8, speed);
            
            // Audio
            updateDrillSound(speed);
        } else {
            gameState.heat = Math.max(0, gameState.heat - 1.2);
            drillContainer.classList.remove('drilling');
            body.classList.remove('shake-screen');
            stopDrillSound();
        }
    } else {
        stopDrillSound();
        body.classList.remove('shake-screen');
    }

    if (gameState.heat >= 100 && !gameState.isOverheated) {
        triggerOverheat();
    }

    // Heat Glow Effect
    drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.6;

    gameState.depth = Math.floor(currentPos);
    gameState.lastScrollTime = currentTime;
    gameState.lastScrollPos = currentPos;
    
    updateHUD();
}

function updateDrillSound(speed) {
    if (!drillGain || gameState.isMuted) return;
    const freq = 50 + speed * 200;
    const volume = Math.min(0.2, speed * 0.3);
    drillOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
    drillGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
}

function stopDrillSound() {
    if (!drillGain) return;
    drillGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
}

function createParticles(y, speed) {
    const count = Math.floor(speed * 8);
    for (let i = 0; i < count; i++) {
        particles.push({
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
            y: y,
            vx: (Math.random() - 0.5) * 15,
            vy: -(Math.random() * 8 + 3),
            life: 1.0,
            color: Math.random() > 0.3 ? '#ffca28' : '#e64a19',
            size: Math.random() * 5 + 2
        });
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const viewTop = drillerSpace.scrollTop;
    const viewBottom = viewTop + window.innerHeight;

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; 
        p.life -= 0.025;
        
        if (p.y > viewTop && p.y < viewBottom) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    requestAnimationFrame(gameLoop);
}

function triggerOverheat() {
    gameState.isOverheated = true;
    overheatWarning.classList.remove('hidden');
    drillContainer.classList.remove('drilling');
    stopDrillSound();
    
    let cooldown = setInterval(() => {
        gameState.heat -= 4;
        updateHUD();
        drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.6;
        
        if (gameState.heat <= 0) {
            clearInterval(cooldown);
            gameState.isOverheated = false;
            overheatWarning.classList.add('hidden');
        }
    }, 100);
}

function updateHUD() {
    depthValue.innerText = gameState.depth.toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    
    if (gameState.heat > 85) heatFill.style.background = '#f44336';
    else if (gameState.heat > 55) heatFill.style.background = '#ff9800';
    else heatFill.style.background = '#4caf50';

    foundCount.innerText = gameState.foundItems.length;
}

function collectItem(item) {
    if (gameState.foundItems.includes(item.id)) return;
    
    let cleanProgress = 0;
    const notificationMsg = notification.querySelector('.message');
    notificationMsg.innerText = "遺物を発見！タップでクリーニング中...";
    notification.classList.remove('hidden');

    const cleanHandler = () => {
        cleanProgress += 15;
        if (cleanProgress >= 100) {
            window.removeEventListener('click', cleanHandler);
            finishCollection(item);
        }
    };
    window.addEventListener('click', cleanHandler);
}

function finishCollection(item) {
    gameState.foundItems.push(item.id);
    gameState.points += 5000;
    localStorage.setItem('scrollArch_found', JSON.stringify(gameState.foundItems));
    localStorage.setItem('scrollArch_points', gameState.points);
    
    notification.querySelector('.message').innerText = `${item.name} を入手！ (+5000 PTS)`;
    setTimeout(() => notification.classList.add('hidden'), 3500);
    
    spawnArtifacts();
    updateHUD();
    
    // Play discovery sound if possible
    playSfx(880, 0.2);
}

function playSfx(freq, duration) {
    if (!audioCtx || gameState.isMuted) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function renderCollection() {
    artifactsGrid.innerHTML = '';
    ARTIFACTS.forEach(item => {
        const isFound = gameState.foundItems.includes(item.id);
        const div = document.createElement('div');
        div.className = `collection-item ${isFound ? '' : 'locked'}`;
        div.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 10px;">${isFound ? item.icon : '❓'}</div>
            <h3>${isFound ? item.name : '？？？'}</h3>
            <p style="font-size: 10px; color: rgba(255,255,255,0.5);">${isFound ? item.depth + 'm' : '深度不明'}</p>
        `;
        artifactsGrid.appendChild(div);
    });
}

function renderUpgrades() {
    upgradesList.innerHTML = `<div style="text-align:center; margin-bottom:15px; font-weight:800;">所持ポイント: ${gameState.points.toLocaleString()} PTS</div>`;
    
    UPGRADES.forEach(upg => {
        const currentLevel = gameState.upgrades[upg.id];
        const cost = upg.cost * (currentLevel + 1);
        const isMax = currentLevel >= upg.max;
        const canAfford = gameState.points >= cost;

        const div = document.createElement('div');
        div.className = 'upgrade-item';
        div.innerHTML = `
            <div class="upgrade-info">
                <h3>${upg.name} (Lv.${currentLevel})</h3>
                <p style="font-size: 10px; color: rgba(255,255,255,0.6);">${upg.desc}</p>
            </div>
            <button ${ (isMax || !canAfford) ? 'disabled' : '' } onclick="buyUpgrade('${upg.id}', ${cost})">
                ${ isMax ? '最大強化' : cost + ' PTS' }
            </button>
        `;
        upgradesList.appendChild(div);
    });
}

window.buyUpgrade = (id, cost) => {
    if (gameState.points >= cost) {
        gameState.points -= cost;
        gameState.upgrades[id]++;
        localStorage.setItem('scrollArch_points', gameState.points);
        localStorage.setItem('scrollArch_upgrades', JSON.stringify(gameState.upgrades));
        renderUpgrades();
        updateHUD();
        playSfx(440, 0.1);
    }
};

init();
