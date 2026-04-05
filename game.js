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

let gameState = {
    depth: 0,
    heat: 0,
    foundItems: JSON.parse(localStorage.getItem('scrollArch_found')) || [],
    isOverheated: false,
    lastScrollTime: Date.now(),
    lastScrollPos: 0
};

// Elements
const drillerSpace = document.getElementById('driller-space');
const depthValue = document.getElementById('depth-value');
const heatFill = document.getElementById('heat-fill');
const foundCount = document.getElementById('found-count');
const artifactContainer = document.getElementById('artifact-container');
const overheatWarning = document.getElementById('overheat-warning');
const startBtn = document.getElementById('start-btn');
const introScreen = document.getElementById('intro-screen');
const collectionBtn = document.getElementById('collection-btn');
const collectionModal = document.getElementById('collection-modal');
const closeModal = document.getElementById('close-modal');
const artifactsGrid = document.getElementById('artifacts-grid');
const notification = document.getElementById('notification');

// Initialize
function init() {
    spawnArtifacts();
    updateHUD();
    renderCollection();

    startBtn.addEventListener('click', () => {
        introScreen.classList.add('hidden');
    });

    closeModal.addEventListener('click', () => {
        collectionModal.classList.add('hidden');
    });

    collectionBtn.addEventListener('click', () => {
        renderCollection();
        collectionModal.classList.remove('hidden');
    });

    drillerSpace.addEventListener('scroll', handleScroll);
}

function spawnArtifacts() {
    artifactContainer.innerHTML = '';
    ARTIFACTS.forEach((item, index) => {
        const spot = document.createElement('div');
        spot.className = 'artifact-spot';
        spot.style.top = `${item.depth}px`;
        spot.style.left = `${20 + Math.random() * 60}%`;
        
        // Check if already found
        if (gameState.foundItems.includes(item.id)) {
            spot.innerHTML = `<span style="font-size: 40px; filter: grayscale(0.5); opacity: 0.5;">${item.icon}</span>`;
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
    
    // Depth calc (1px = 1m for simplicity)
    gameState.depth = Math.floor(currentPos);
    
    // Heat calc
    if (timeDiff > 0) {
        const speed = posDiff / timeDiff; // pixels per ms
        if (speed > 1.5) {
            gameState.heat = Math.min(100, gameState.heat + speed * 2);
        } else {
            gameState.heat = Math.max(0, gameState.heat - 1.5);
        }
    }

    if (gameState.heat >= 100 && !gameState.isOverheated) {
        triggerOverheat();
    }

    gameState.lastScrollTime = currentTime;
    gameState.lastScrollPos = currentPos;
    
    updateHUD();
}

function triggerOverheat() {
    gameState.isOverheated = true;
    overheatWarning.classList.remove('hidden');
    drillerSpace.style.overflowY = 'hidden'; // Stop scrolling
    
    let cooldown = setInterval(() => {
        gameState.heat -= 5;
        updateHUD();
        if (gameState.heat <= 0) {
            clearInterval(cooldown);
            gameState.isOverheated = false;
            overheatWarning.classList.add('hidden');
            drillerSpace.style.overflowY = 'scroll';
        }
    }, 100);
}

function updateHUD() {
    depthValue.innerText = gameState.depth.toLocaleString();
    heatFill.style.width = `${gameState.heat}%`;
    
    // Color logic for heat
    if (gameState.heat > 80) heatFill.style.background = '#f44336';
    else if (gameState.heat > 50) heatFill.style.background = '#ff9800';
    else heatFill.style.background = '#4caf50';

    foundCount.innerText = gameState.foundItems.length;
}

function collectItem(item) {
    if (gameState.foundItems.includes(item.id)) return;
    
    gameState.foundItems.push(item.id);
    localStorage.setItem('scrollArch_found', JSON.stringify(gameState.foundItems));
    
    // Notify
    notification.querySelector('.message').innerText = `FOUND: ${item.name}!`;
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 3000);
    
    // Re-spawn to update icons
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
            <h3>${isFound ? item.name : 'Unknown Artifact'}</h3>
            <p style="font-size: 10px; color: rgba(255,255,255,0.5);">${isFound ? 'Found at ' + item.depth + 'm' : 'Hidden in the depths'}</p>
        `;
        artifactsGrid.appendChild(div);
    });
}

// Start
init();
