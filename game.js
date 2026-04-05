const ARTIFACTS = [
    { id: 1, name: "Ancient T-Rex Tooth", depth: 1500, icon: "🦖", color: "#8d6e63" },
    { id: 2, name: "Golden Roman Coin", depth: 5200, icon: "🪙", color: "#ffd700" },
    { id: 3, name: "Rusty Knight Sword", depth: 12000, icon: "⚔️", color: "#757575" },
    { id: 4, name: "Mystic Blue Crystal", depth: 25000, icon: "💎", color: "#00b0ff" },
    { id: 5, name: "Ancient Stone Tablet", depth: 38000, icon: "📜", color: "#a1887f" },
    { id: 6, name: "Cybernetic Robot Arm", depth: 55000, icon: "🦾", color: "#607d8b" },
    { id: 7, name: "Rare Fossilized Egg", depth: 68000, icon: "🥚", color: "#d7ccc8" },
    { id: 8, name: "Obsidian Dagger", depth: 75000, icon: "🔪", color: "#212121" },
    { id: 9, name: "King's Lost Crown", depth: 88000, icon: "👑", color: "#ffab00" },
    { id: 10, name: "Meteorite Core", depth: 98000, icon: "☄️", color: "#ff5252" }
];

const UPGRADES = [
    { id: 'cooling', name: 'Advanced Cooling', desc: 'Reduce heat gain by 20%', cost: 1000, level: 0, max: 5 },
    { id: 'power', name: 'Diamond Bit', desc: 'Better performance in hard rock', cost: 2000, level: 0, max: 3 }
];

let gameState = {
    depth: 0,
    heat: 0,
    points: parseInt(localStorage.getItem('scrollArch_points')) || 0,
    foundItems: JSON.parse(localStorage.getItem('scrollArch_found')) || [],
    upgrades: JSON.parse(localStorage.getItem('scrollArch_upgrades')) || { cooling: 0, power: 0 },
    isOverheated: false,
    lastScrollTime: Date.now(),
    lastScrollPos: 0
};

// Particles
let particles = [];
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

// Elements
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
    startBtn.addEventListener('click', () => introScreen.classList.add('hidden'));
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
            spot.innerHTML = `<span style="font-size: 40px; filter: grayscale(0.5); opacity: 0.3;">${item.icon}</span>`;
        } else {
            spot.innerHTML = `<span style="font-size: 40px;">🎁</span>`;
            spot.addEventListener('click', () => collectItem(item));
        }
        artifactContainer.appendChild(spot);
    });
}

function handleScroll() {
    if (gameState.isOverheated) return;

    const currentPos = drillerSpace.scrollTop;
    const currentTime = Date.now();
    const timeDiff = currentTime - gameState.lastScrollTime;
    const posDiff = Math.abs(currentPos - gameState.lastScrollPos);
    
    if (timeDiff > 0) {
        const rawSpeed = posDiff / timeDiff;
        let speed = rawSpeed;

        // Hard Rock Logic (15000m - 20000m)
        const isHardRock = gameState.depth > 15000 && gameState.depth < 20000;
        let heatMultiplier = 1;
        
        if (isHardRock) {
            const powerBonus = gameState.upgrades.power * 0.2;
            speed *= (0.3 + powerBonus);
            heatMultiplier = 4;
            // Visual feedback for hard rock
            drillUnit.style.filter = 'sepia(1) saturate(5) hue-rotate(-50deg)';
        } else {
            drillUnit.style.filter = 'none';
        }

        // Apply heat
        if (speed > 0.1) {
            const coolingBonus = 1 - (gameState.upgrades.cooling * 0.15);
            gameState.heat = Math.min(100, gameState.heat + (speed * 2 * heatMultiplier * coolingBonus));
            drillContainer.classList.add('drilling');
            createParticles(currentPos + window.innerHeight * 0.8, speed);
        } else {
            gameState.heat = Math.max(0, gameState.heat - 1.0);
            drillContainer.classList.remove('drilling');
        }

        // Update points
        if (currentPos > gameState.lastScrollPos) {
            gameState.points += Math.floor(posDiff);
            localStorage.setItem('scrollArch_points', gameState.points);
        }
    }

    if (gameState.heat >= 100 && !gameState.isOverheated) {
        triggerOverheat();
    }

    gameState.depth = Math.floor(currentPos);
    gameState.lastScrollTime = currentTime;
    gameState.lastScrollPos = currentPos;
    
    updateHUD();
}

function createParticles(y, speed) {
    const count = Math.floor(speed * 5);
    for (let i = 0; i < count; i++) {
        particles.push({
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 60,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: -(Math.random() * 5 + 2),
            life: 1.0,
            color: Math.random() > 0.5 ? '#ffa726' : '#8d6e63',
            size: Math.random() * 4 + 2
        });
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only draw particles near the viewport for performance
    const viewTop = drillerSpace.scrollTop;
    const viewBottom = viewTop + window.innerHeight;

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // gravity
        p.life -= 0.02;
        
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
    
    let cooldown = setInterval(() => {
        gameState.heat -= 3;
        updateHUD();
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
    
    if (gameState.heat > 80) heatFill.style.background = '#f44336';
    else if (gameState.heat > 50) heatFill.style.background = '#ff9800';
    else heatFill.style.background = '#4caf50';

    foundCount.innerText = gameState.foundItems.length;
}

function collectItem(item) {
    if (gameState.foundItems.includes(item.id)) return;
    
    // Mini-game: Simple click accumulation as "cleaning"
    let cleanProgress = 0;
    const notificationMsg = notification.querySelector('.message');
    notificationMsg.innerText = "CLEANING ARTIFACT... TAP FAST!";
    notification.classList.remove('hidden');

    const cleanHandler = () => {
        cleanProgress += 10;
        if (cleanProgress >= 100) {
            window.removeEventListener('click', cleanHandler);
            finishCollection(item);
        }
    };
    window.addEventListener('click', cleanHandler);
}

function finishCollection(item) {
    gameState.foundItems.push(item.id);
    gameState.points += 5000; // Bonus points for artifacts
    localStorage.setItem('scrollArch_found', JSON.stringify(gameState.foundItems));
    localStorage.setItem('scrollArch_points', gameState.points);
    
    notification.querySelector('.message').innerText = `DISCOVERED: ${item.name}! (+5000 PTS)`;
    setTimeout(() => notification.classList.add('hidden'), 3000);
    
    spawnArtifacts();
    updateHUD();
}

function renderCollection() {
    artifactsGrid.innerHTML = '';
    ARTIFACTS.forEach(item => {
        const isFound = gameState.foundItems.includes(item.id);
        const div = document.createElement('div');
        div.className = `collection-item ${isFound ? '' : 'locked'}`;
        div.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 10px;">${isFound ? item.icon : '❓'}</div>
            <h3>${isFound ? item.name : 'Unknown'}</h3>
            <p style="font-size: 10px; color: rgba(255,255,255,0.5);">${isFound ? item.depth + 'm' : '???'}</p>
        `;
        artifactsGrid.appendChild(div);
    });
}

function renderUpgrades() {
    upgradesList.innerHTML = `<div style="text-align:center; margin-bottom:15px; font-weight:800;">TOTAL POINTS: ${gameState.points.toLocaleString()}</div>`;
    
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
                ${ isMax ? 'MAX' : cost + ' PTS' }
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
    }
};

init();
