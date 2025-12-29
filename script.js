import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1453986988125458524/dFMLs1p0MGfMB9asjuYErVLdz8r0mcfnSJT1OT_weNbDy9Oux9mm8-3cZwr9pCtRiluI";

const firebaseConfig = {
  apiKey: "AIzaSyCjWmsnTIA8hJDw-rJC5iJhPhwbK-U1_YU",
  authDomain: "ymir-boss-tracker.firebaseapp.com",
  projectId: "ymir-boss-tracker",
  storageBucket: "ymir-boss-tracker.firebasestorage.app",
  messagingSenderId: "302224766558",
  appId: "1:302224766558:web:03ed0efc7473e64aa1a6cf"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const BOSS_IMAGES = {
    "Berserker": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674395545-53214fcd-e6aa-41e5-b91d-ba44ee3bd3f3.png",
    "Mage": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674409406-c5b70062-7ad2-4958-9a5c-3d2b2a2edcb6.png",
    "Skald": "https://framerusercontent.com/images/XJzkQNlvMBB6ZOBgb6DUs5u1Mgk.png?width=1000&height=2280",
    "Lancer": "https://placehold.co/400x400/000000/000000.png" 
};

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 1000 * 60;
const ONE_MINUTE_MS = 1000 * 60;
const BOSS_NAMES = ["Lancer", "Berserker", "Skald", "Mage"];
let BOSS_DATA = { 'Comum': { name: 'Folkvangr Comum', floors: {} }, 'Universal': { name: 'Folkvangr Universal', floors: {} } };
let currentUser = null;
let isCompactView = false;

window.scrollToBoss = (id) => {
    const element = document.getElementById('card-' + id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

document.getElementById('toggle-view-btn').onclick = () => {
    isCompactView = !isCompactView;
    document.getElementById('toggle-view-btn').textContent = isCompactView ? "🎴 Modo Cards" : "📱 Modo Compacto";
    render();
};

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);
document.getElementById('export-btn').onclick = () => exportReport();
document.getElementById('sync-comum-btn').onclick = () => sendReportToDiscord('Comum');
document.getElementById('sync-universal-btn').onclick = () => sendReportToDiscord('Universal');
document.getElementById('reset-all-btn').onclick = () => resetAllTimers();

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('user-name').textContent = 'Olá, ' + user.displayName;
        document.getElementById('app-content').style.display = 'block';
        loadUserData();
    } else {
        currentUser = null;
        document.getElementById('app-content').style.display = 'none';
    }
});

function initializeBossData() {
    BOSS_DATA = { 'Comum': { name: 'Folkvangr Comum', floors: {} }, 'Universal': { name: 'Folkvangr Universal', floors: {} } };
    ['Comum', 'Universal'].forEach(type => {
        for (let p = 1; p <= 4; p++) {
            const floorKey = 'Piso ' + p;
            BOSS_DATA[type].floors[floorKey] = { name: floorKey, bosses: [] };
            BOSS_NAMES.forEach(bossName => {
                BOSS_DATA[type].floors[floorKey].bosses.push({
                    id: type.toLowerCase() + '_' + p + '_' + bossName.toLowerCase(),
                    name: bossName, respawnTime: 0, lastRespawnTime: null, alerted: false, floor: floorKey, type: type,
                    image: BOSS_IMAGES[bossName]
                });
            });
        }
    });
}

async function loadUserData() {
    initializeBossData();
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
        const saved = docSnap.data().timers;
        saved.forEach(s => {
            const b = findBossById(s.id);
            if (b) { b.respawnTime = s.time; b.alerted = s.alerted; }
        });
    }
    render();
}

async function save() {
    if (!currentUser) return;
    const list = [];
    ['Comum', 'Universal'].forEach(t => {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({id: b.id, time: b.respawnTime, alerted: b.alerted});
            });
        }
    });
    await setDoc(doc(db, "users", currentUser.uid), { timers: list });
}

function findBossById(id) {
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            const b = BOSS_DATA[t].floors[f].bosses.find(x => x.id === id);
            if (b) return b;
        }
    }
}

// MELHORIA DE PERFORMANCE: ATUALIZAÇÃO CIRÚRGICA DO DOM
function updateBossTimers() {
    const now = Date.now();
    let nextBoss = null;
    let minDiff = Infinity;

    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id);
                const bar = document.getElementById('bar-' + boss.id);
                const card = document.getElementById('card-' + boss.id);
                if (!timerTxt) return;

                if (boss.respawnTime === 0 || boss.respawnTime <= now) {
                    boss.respawnTime = 0;
                    timerTxt.textContent = "DISPONÍVEL!";
                    timerTxt.style.color = "#2ecc71";
                    bar.style.width = "100%";
                    card.classList.remove('alert', 'fire-alert');
                } else {
                    const diff = boss.respawnTime - now;
                    const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                    const percent = (diff / duration) * 100;
                    bar.style.width = percent + '%';

                    if (diff < minDiff) { minDiff = diff; nextBoss = boss; }
                    
                    if (diff <= ONE_MINUTE_MS) {
                        card.classList.add('fire-alert');
                        timerTxt.style.color = "#ff8c00";
                    } else if (diff <= FIVE_MINUTES_MS) {
                        card.classList.add('alert');
                        timerTxt.style.color = "#ff4d4d";
                        if (!boss.alerted) {
                            document.getElementById('alert-sound').play().catch(() => {});
                            boss.alerted = true; save();
                        }
                    } else {
                        card.classList.remove('alert', 'fire-alert');
                        timerTxt.style.color = "#f1c40f";
                    }

                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                }
            });
        }
    });

    const highlightDiv = document.getElementById('next-boss-display');
    if (nextBoss) {
        const h = Math.floor(minDiff / 3600000).toString().padStart(2,'0');
        const m = Math.floor((minDiff % 3600000) / 60000).toString().padStart(2,'0');
        const s = Math.floor((minDiff % 60000) / 1000).toString().padStart(2,'0');
        highlightDiv.innerHTML = `<div onclick="scrollToBoss('${nextBoss.id}')">🎯 PRÓXIMO: <strong>${nextBoss.name}</strong> (${nextBoss.floor}) <span class="next-boss-timer">${h}:${m}:${s}</span></div>`;
    }
}

window.killBoss = (id) => {
    const b = findBossById(id);
    b.lastRespawnTime = b.respawnTime;
    const duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = Date.now() + duration;
    b.alerted = false;
    save(); render();
};

window.setManualTime = (id) => {
    const val = document.getElementById('manual-input-' + id).value;
    if (!val) return;
    const b = findBossById(id);
    const parts = val.split(':').map(Number);
    const d = new Date(); d.setHours(parts[0], parts[1], parts[2] || 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    const duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = d.getTime() + duration;
    b.alerted = false;
    save(); render();
};

window.undoKill = (id) => {
    const b = findBossById(id);
    if (b.lastRespawnTime) { b.respawnTime = b.lastRespawnTime; b.lastRespawnTime = null; save(); render(); }
};

window.resetBoss = (id) => {
    const b = findBossById(id); b.respawnTime = 0; save(); render();
};

window.resetAllTimers = async () => {
    if (!confirm("Resetar tudo?")) return;
    ['Comum', 'Universal'].forEach(t => {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => { b.respawnTime = 0; });
        }
    });
    await save(); render();
};

function render() {
    const container = document.getElementById('boss-list-container');
    container.innerHTML = '';
    const viewClass = isCompactView ? 'compact-mode' : '';

    ['Comum', 'Universal'].forEach(type => {
        const section = document.createElement('section');
        section.className = `type-section type-${type.toLowerCase()} ${viewClass}`;
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        const grid = document.createElement('div');
        grid.className = 'floors-container';
        
        for (const f in BOSS_DATA[type].floors) {
            const floorDiv = document.createElement('div');
            floorDiv.className = 'floor-section';
            let floorHtml = `<h3>${f}</h3><div class="boss-grid">`;
            
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                const mStr = boss.respawnTime > 0 ? new Date(boss.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--";
                const nStr = boss.respawnTime > 0 ? new Date(boss.respawnTime).toLocaleTimeString('pt-BR') : "--:--";

                floorHtml += `<div class="boss-card" id="card-${boss.id}">
                        <div class="boss-header">
                            <img src="${boss.image}" class="boss-thumb">
                            <h4>${boss.name}</h4>
                        </div>
                        <div class="timer" id="timer-${boss.id}">--:--:--</div>
                        <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${boss.id}"></div></div>
                        <div class="static-times">
                            <p>Morto: <span>${mStr}</span> | Nasce: <span>${nStr}</span></p>
                        </div>
                        <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                        <div class="manual-box">
                            <input type="time" id="manual-input-${boss.id}" step="1">
                            <button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button>
                        </div>
                        <div class="action-footer">
                            <button class="undo-btn" onclick="undoKill('${boss.id}')">desfazer</button>
                            <button class="reset-btn" onclick="resetBoss('${boss.id}')">Resetar</button>
                        </div>
                    </div>`;
            });
            floorDiv.innerHTML = floorHtml + '</div>';
            grid.appendChild(floorDiv);
        }
        section.appendChild(grid);
        container.appendChild(section);
    });
    updateBossTimers();
}

async function sendReportToDiscord(filterType) {
    let list = [];
    for (const f in BOSS_DATA[filterType].floors) {
        BOSS_DATA[filterType].floors[f].bosses.forEach(b => { if(b.respawnTime > 0) list.push(b); });
    }
    list.sort((a,b) => a.respawnTime - b.respawnTime);
    let desc = list.map(b => `• **${b.name}** (${b.floor}) -> **${new Date(b.respawnTime).toLocaleTimeString('pt-BR')}**`).join('\n') || "Nenhum no momento.";

    const payload = {
        embeds: [{
            title: `⚔️ STATUS ${filterType.toUpperCase()}`,
            description: desc,
            color: filterType === 'Comum' ? 3447003 : 10181046,
            timestamp: new Date().toISOString()
        }]
    };
    await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function exportReport() {
    let text = "⚔️ RELATÓRIO TXT ⚔️\n";
    ['Comum', 'Universal'].forEach(t => {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                if(b.respawnTime > 0) text += `${t} ${f} - ${b.name}: ${new Date(b.respawnTime).toLocaleTimeString()}\n`;
            });
        }
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relatorio_YMIR.txt';
    link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
