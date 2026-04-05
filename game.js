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
    { id: 'power', name: '強化ダイヤモンドビット', desc: '硬い岩板での作業効率をアップします', cost: 2000, level: 0, max: 5 }
];

let gameState = {
    depth: 0,
    heat: 0,
    points: parseInt(localStorage.getItem('scrollArch_points')) || 0,
    foundItems: JSON.parse(localStorage.getItem('scrollArch_found')) || [],
    upgrades: JSON.parse(localStorage.getItem('scrollArch_upgrades')) || { cooling: 0, power: 0 },
    inventory: { cool: 0, sonar: 0 },
    isOverheated: false,
    isMuted: true,
    isSuperMode: false,
    lastScrollTime: Date.now(),
    lastScrollPos: 0,
    veins: []
};

// Audio Context
let audioCtx, drillOsc, drillGain;

// Elements
const body = document.body;
const drillerSpace = document.getElementById('driller-space');
const depthValue = document.getElementById('depth-value');
const heatFill = document.getElementById('heat-fill');
const foundCount = document.getElementById('found-count');
const artifactContainer = document.getElementById('artifact-container');
const veinContainer = document.getElementById('vein-container');
const overheatWarning = document.getElementById('overheat-warning');
const startBtn = document.getElementById('start-btn');
const introScreen = document.getElementById('intro-screen');
const drillUnit = document.getElementById('drill-unit');
const drillHeatOverlay = document.getElementById('drill-heat-overlay');
const soundToggle = document.getElementById('sound-toggle');

const collectionBtn = document.getElementById('collection-btn');
const upgradeBtn = document.getElementById('upgrade-btn');
const collectionModal = document.getElementById('collection-modal');
const upgradeModal = document.getElementById('upgrade-modal');
const closeCollection = document.getElementById('close-collection');
const closeUpgrade = document.getElementById('close-upgrade');
const upgradesList = document.getElementById('upgrades-list');
const artifactsGrid = document.getElementById('artifacts-grid');
const notification = document.getElementById('notification');

const slotCool = document.getElementById('slot-cool');
const slotSonar = document.getElementById('slot-sonar');

// Particles
let particles = [];
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

function init() {
    resizeCanvas();
    spawnArtifacts();
    spawnVeins();
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
    
    collectionBtn.addEventListener('click', () => { renderCollection(); collectionModal.classList.remove('hidden'); });
    upgradeBtn.addEventListener('click', () => { renderUpgrades(); upgradeModal.classList.remove('hidden'); });

    slotCool.addEventListener('click', () => useItem('cool'));
    slotSonar.addEventListener('click', () => useItem('sonar'));

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
    ARTIFACTS.forEach(item => {
        const spot = document.createElement('div');
        spot.className = 'artifact-spot';
        spot.style.top = `${item.depth}px`;
        spot.style.left = `${20 + Math.random() * 60}%`;
        spot.innerHTML = gameState.foundItems.includes(item.id) ? 
            `<span style="font-size: 40px; opacity: 0.2;">${item.icon}</span>` : 
            `<span class="gift-box">🎁</span>`;
        if (!gameState.foundItems.includes(item.id)) {
            spot.addEventListener('click', () => collectItem(item));
        }
        artifactContainer.appendChild(spot);
    });

    // Random Items in ground
    for (let i = 0; i < 20; i++) {
        const depth = 2000 + (i * 5000) + Math.random() * 2000;
        const type = Math.random() > 0.5 ? 'cool' : 'sonar';
        const itemNode = document.createElement('div');
        itemNode.className = 'artifact-spot bonus-item';
        itemNode.style.top = `${depth}px`;
        itemNode.style.left = `${10 + Math.random() * 80}%`;
        itemNode.innerHTML = type === 'cool' ? '❄️' : '📡';
        itemNode.addEventListener('click', () => {
            pickUpItem(type);
            itemNode.remove();
        });
        artifactContainer.appendChild(itemNode);
    }
}

function spawnVeins() {
    veinContainer.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const depth = 1000 + (i * 3000) + Math.random() * 1000;
        const vein = { depth, left: Math.random() * 70, id: i };
        gameState.veins.push(vein);
        const node = document.createElement('div');
        node.className = 'vein-node';
        node.style.top = `${depth}px`;
        node.style.left = `${vein.left}%`;
        node.innerHTML = '✨ 金脈 ✨';
        veinContainer.appendChild(node);
    }
}

function handleScroll() {
    const currentPos = drillerSpace.scrollTop;
    const currentTime = Date.now();
    const timeDiff = currentTime - gameState.lastScrollTime;
    const posDiff = Math.abs(currentPos - gameState.lastScrollPos);
    
    if (timeDiff > 0 && !gameState.isOverheated) {
        const rawSpeed = posDiff / timeDiff;
        let speed = rawSpeed;

        // Difficulty Tuning
        const difficultyScale = 1 + (gameState.depth / 20000); // Progressively harder
        const isHardRock = gameState.depth > 15000 && gameState.depth < 20000;
        const isMagma = gameState.depth > 40000 && gameState.depth < 50000;
        
        let heatMultiplier = 1 * difficultyScale;
        if (isHardRock) { speed *= (0.3 + gameState.upgrades.power * 0.1); heatMultiplier *= 3; }
        if (isMagma) { heatMultiplier *= 5; }

        if (speed > 0.05) {
            // Points Calculation (Check Veins)
            let pointMult = 1;
            gameState.veins.forEach(v => {
                if (Math.abs(gameState.depth - v.depth) < 100) pointMult = 3; 
            });

            const pointsEarned = Math.floor(posDiff * pointMult);
            gameState.points += pointsEarned;

            // Heat Logic
            if (!gameState.isSuperMode) {
                const coolingBonus = 1 - (gameState.upgrades.cooling * 0.12);
                gameState.heat = Math.min(100, gameState.heat + (speed * 3 * heatMultiplier * coolingBonus));
            }
            
            // Effects
            body.classList.add('shake-screen');
            drillUnit.parentElement.classList.add('drilling');
            createParticles(currentPos + window.innerHeight * 0.8, speed);
            updateDrillSound(speed);
        } else {
            // Just Cool Down Check
            if (gameState.heat > 90 && !gameState.isSuperMode && !gameState.isOverheated) {
                triggerSuperMode();
            }
            gameState.heat = Math.max(0, gameState.heat - 1.5);
            body.classList.remove('shake-screen');
            drillUnit.parentElement.classList.remove('drilling');
            stopDrillSound();
        }
    }

    if (gameState.heat >= 100) triggerOverheat();

    gameState.depth = Math.floor(currentPos);
    gameState.lastScrollTime = currentTime;
    gameState.lastScrollPos = currentPos;
    
    drillHeatOverlay.style.fillOpacity = (gameState.heat / 100) * 0.8;
    updateHUD();
}

function triggerSuperMode() {
    gameState.isSuperMode = true;
    showNotification("ジャスト・冷却！3秒間スーパーモード！");
    drillUnit.style.filter = "hue-rotate(180deg) brightness(2)";
    
    setTimeout(() => {
        gameState.isSuperMode = false;
        drillUnit.style.filter = "";
        gameState.heat = 0;
    }, 3000);
}

function triggerOverheat() {
    if (gameState.isSuperMode) return;
    gameState.isOverheated = true;
    overheatWarning.classList.remove('hidden');
    stopDrillSound();
    
    let cooldown = setInterval(() => {
        gameState.heat -= 5;
        updateHUD();
        if (gameState.heat <= 0) {
            clearInterval(cooldown);
            gameState.isOverheated = false;
            overheatWarning.classList.add('hidden');
        }
    }, 100);
}

function useItem(type) {
    if (gameState.inventory[type] <= 0) return;
    gameState.inventory[type]--;
    
    if (type === 'cool') {
        gameState.heat = 0;
        showNotification("冷却スプレーを使用！熱量をリセットしました。");
    } else if (type === 'sonar') {
        showNotification("ソナー作動！近くの遺物を探知中...");
        artifactContainer.querySelectorAll('.artifact-spot').forEach(spot => {
            const dist = Math.abs(parseInt(spot.style.top) - gameState.depth);
            if (dist < 5000) spot.style.boxShadow = "0 0 30px #00e5ff";
        });
        setTimeout(() => {
            artifactContainer.querySelectorAll('.artifact-spot').forEach(spot => spot.style.boxShadow = "");
        }, 5000);
    }
    updateHUD();
}

function pickUpItem(type) {
    gameState.inventory[type] = Math.min(3, (gameState.inventory[type] || 0) + 1);
    showNotification(`${type === 'cool' ? '冷却スプレー' : 'ソナードローン'}を獲得！`);
    updateHUD();
}

function showNotification(msg) {
    notification.querySelector('.message').innerText = msg;
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

function updateHUD() {
    depthValue.innerText = gameState.depth.toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    foundCount.innerText = gameState.foundItems.length;

    // Item Slots
    slotCool.classList.toggle('empty', gameState.inventory.cool <= 0);
    slotCool.innerHTML = `❄️<small style="position:absolute;bottom:0;right:2px;font-size:10px;">${gameState.inventory.cool}</small>`;
    slotSonar.classList.toggle('empty', gameState.inventory.sonar <= 0);
    slotSonar.innerHTML = `📡<small style="position:absolute;bottom:0;right:2px;font-size:10px;">${gameState.inventory.sonar}</small>`;

    // Drill Evolution
    const totalLevel = gameState.upgrades.cooling + gameState.upgrades.power;
    drillUnit.classList.remove('evo-2', 'evo-3');
    if (totalLevel >= 8) drillUnit.classList.add('evo-3');
    else if (totalLevel >= 4) drillUnit.classList.add('evo-2');
}

// Logic reuse from previous version
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
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 100,
            y: y,
            vx: (Math.random() - 0.5) * 20, vy: -(Math.random() * 10 + 5),
            life: 1.0, color: Math.random() > 0.4 ? '#ff9800' : '#ffeb3b',
            size: Math.random() * 6 + 2
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

function collectItem(item) {
    let cleanProgress = 0;
    showNotification("遺物を発見！タップでクリーニング中...");
    const cleanHandler = () => {
        cleanProgress += 20;
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
    showNotification(`${item.name} を入手！ (+5000 PTS)`);
    spawnArtifacts();
    updateHUD();
}

function renderCollection() {
    artifactsGrid.innerHTML = '';
    ARTIFACTS.forEach(item => {
        const found = gameState.foundItems.includes(item.id);
        const div = document.createElement('div');
        div.className = `collection-item ${found ? '' : 'locked'}`;
        div.innerHTML = `<div style="font-size:40px;">${found ? item.icon : '❓'}</div><h3>${found ? item.name : '？？？'}</h3>`;
        artifactsGrid.appendChild(div);
    });
}

function renderUpgrades() {
    upgradesList.innerHTML = `<div style="text-align:center;margin-bottom:10px;">所持：${gameState.points.toLocaleString()} PTS</div>`;
    UPGRADES.forEach(upg => {
        const lvl = gameState.upgrades[upg.id];
        const cost = upg.cost * (lvl + 1);
        const isMax = lvl >= upg.max;
        const div = document.createElement('div');
        div.className = 'upgrade-item';
        div.innerHTML = `<div class="upgrade-info"><h3>${upg.name} (Lv.${lvl})</h3><p>${upg.desc}</p></div>
            <button ${isMax || gameState.points < cost ? 'disabled' : ''} onclick="buyUpgrade('${upg.id}', ${cost})">${isMax ? 'MAX' : cost + ' PTS'}</button>`;
        upgradesList.appendChild(div);
    });
}

window.buyUpgrade = (id, cost) => {
    if (gameState.points >= cost) {
        gameState.points -= cost;
        gameState.upgrades[id]++;
        localStorage.setItem('scrollArch_points', gameState.points);
        localStorage.setItem('scrollArch_upgrades', JSON.stringify(gameState.upgrades));
        renderUpgrades(); updateHUD();
    }
};

init();
