import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Constantes de Tempo
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MYRK_MIN_MS = 50 * 60 * 1000; 
const MYRK_MAX_MS = 60 * 60 * 1000; 
const FIVE_MINUTES_MS = 5 * 1000 * 60;
const ONE_MINUTE_MS = 1000 * 60;

const BOSS_IMAGES = {
    "Berserker": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674395545-53214fcd-e6aa-41e5-b91d-ba44ee3bd3f3.png",
    "Mage": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674409406-c5b70062-7ad2-4958-9a5c-3d2b2a2edcb6.png",
    "Skald": "https://framerusercontent.com/images/XJzkQNlvMBB6ZOBgb6DUs5u1Mgk.png?width=1000&height=2280",
    "Lancer": "https://placehold.co/400x400/000000/000000.png"
};

const MYRK_BOSSES = [
    "[Lv.66] Capitão Intruso Trésá l",
    "[Lv.67] Capitão Intruso Troll Veterano",
    "[Lv.68] Capitão Combatente Jotun Truculento",
    "[Lv.68] Capitão Desordeiro Jotun do Fogo Atroz"
];

let BOSS_DATA = {};
let currentUser = null;
let isCompactView = false;
let userWebhookUrl = "";

// Inicialização Estruturada
function initializeBossData() {
    BOSS_DATA = {};
    const structures = {
        'Comum': { name: 'Folkvangr Comum', list: ["Lancer", "Berserker", "Skald", "Mage"], dur: EIGHT_HOURS_MS, win: false },
        'Universal': { name: 'Folkvangr Universal', list: ["Lancer", "Berserker", "Skald", "Mage"], dur: TWO_HOURS_MS, win: false },
        'Myrk1': { name: 'Myrkheimr Canal 1', list: MYRK_BOSSES, dur: MYRK_MIN_MS, win: true },
        'Myrk2': { name: 'Myrkheimr Canal 2', list: MYRK_BOSSES, dur: MYRK_MIN_MS, win: true }
    };

    for (const key in structures) {
        const config = structures[key];
        BOSS_DATA[key] = { name: config.name, floors: {} };
        const totalFloors = (key === 'Comum' || key === 'Universal') ? 4 : 1;
        for (let p = 1; p <= totalFloors; p++) {
            const fKey = totalFloors > 1 ? 'Piso ' + p : 'Área Única';
            BOSS_DATA[key].floors[fKey] = { bosses: [] };
            config.list.forEach(name => {
                BOSS_DATA[key].floors[fKey].bosses.push({
                    id: `${key.toLowerCase()}_${p}_${name.replace(/[\[\]\.\s]+/g, '_').toLowerCase()}`,
                    name: name, respawnTime: 0, maxRespawnTime: 0, lastRespawnTime: null, alerted: false,
                    floor: fKey, type: key, isWindowed: config.win, duration: config.dur, image: BOSS_IMAGES[name] || "https://placehold.co/60x60"
                });
            });
        }
    }
}

// Funções de Interface
document.getElementById('toggle-view-btn').onclick = () => {
    isCompactView = !isCompactView;
    document.getElementById('toggle-view-btn').textContent = isCompactView ? "🎴 Modo Cards" : "📱 Modo Compacto";
    render();
};

window.killBoss = (id) => {
    const b = findBossById(id);
    b.lastRespawnTime = b.respawnTime;
    b.respawnTime = Date.now() + b.duration;
    if (b.isWindowed) b.maxRespawnTime = Date.now() + MYRK_MAX_MS;
    b.alerted = false; save(); render();
};

window.setManualTime = (id) => {
    const val = document.getElementById('manual-input-' + id).value;
    if (!val) return;
    const b = findBossById(id);
    const parts = val.split(':').map(Number);
    const d = new Date(); d.setHours(parts[0], parts[1], parts[2] || 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    b.respawnTime = d.getTime() + b.duration;
    if (b.isWindowed) b.maxRespawnTime = d.getTime() + MYRK_MAX_MS;
    b.alerted = false; save(); render();
};

// ... (Restantes funções de reset, undo, findBossById mantidas da versão original)

function updateBossTimers() {
    const now = Date.now();
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id);
                const bar = document.getElementById('bar-' + boss.id);
                const card = document.getElementById('card-' + boss.id);
                if (!timerTxt || !card) return;

                if (boss.respawnTime === 0) {
                    timerTxt.textContent = "DISPONÍVEL!";
                    if(bar) bar.style.width = "100%";
                } else if (boss.isWindowed && now >= boss.respawnTime && now < boss.maxRespawnTime) {
                    // LÓGICA DE JANELA ABERTA (50-60 min)
                    card.classList.add('window-open');
                    const diffMax = boss.maxRespawnTime - now;
                    const m = Math.floor(diffMax / 60000), s = Math.floor((diffMax % 60000) / 1000);
                    timerTxt.innerHTML = `<span class="window-status">JANELA ABERTA</span>${m}:${s.toString().padStart(2,'0')}`;
                    timerTxt.style.color = "#2ecc71";
                    if(bar) { bar.style.width = "100%"; bar.style.backgroundColor = "#2ecc71"; }
                } else if (now >= (boss.isWindowed ? boss.maxRespawnTime : boss.respawnTime)) {
                    boss.respawnTime = 0; card.classList.remove('window-open', 'alert', 'fire-alert');
                    render();
                } else {
                    const diff = boss.respawnTime - now;
                    const totalDur = boss.isWindowed ? boss.duration : boss.duration;
                    if(bar) bar.style.width = (diff / totalDur * 100) + "%";

                    if (diff <= ONE_MINUTE_MS) card.classList.add('fire-alert');
                    else if (diff <= FIVE_MINUTES_MS) {
                        card.classList.add('alert');
                        if(!boss.alerted) { document.getElementById('alert-sound').play(); boss.alerted = true; save(); }
                    }

                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                }
            });
        }
    }
}

function render() {
    const container = document.getElementById('boss-list-container');
    container.innerHTML = '';
    const viewClass = isCompactView ? 'compact-mode' : '';

    for (const type in BOSS_DATA) {
        const section = document.createElement('section');
        section.className = `type-section ${viewClass}`;
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        for (const f in BOSS_DATA[type].floors) {
            const grid = document.createElement('div');
            grid.className = 'boss-grid';
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const mStr = boss.respawnTime > 0 ? new Date(boss.respawnTime - (boss.isWindowed ? 0 : boss.duration)).toLocaleTimeString('pt-BR') : "--:--";
                const nStr = boss.respawnTime > 0 ? new Date(boss.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
                
                grid.innerHTML += `<div class="boss-card" id="card-${boss.id}">
                    <div class="boss-header">
                        ${!isCompactView ? `<img src="${boss.image}" class="boss-thumb">` : ''}
                        <h4>${boss.name}</h4>
                    </div>
                    <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                    <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${boss.id}"></div></div>
                    <div class="static-times">
                        <p>Morto: <span>${mStr}</span></p>
                        <p>Nasce: <span>${nStr}${boss.isWindowed ? ' (+10m)' : ''}</span></p>
                    </div>
                    <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                    <div class="manual-box">
                        <input type="time" id="manual-input-${boss.id}" step="1">
                        <button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button>
                    </div>
                    <div class="action-footer">
                        <button class="undo-btn" onclick="undoKill('${boss.id}')">↩</button>
                        <button class="reset-btn" onclick="resetBoss('${boss.id}')">Reset</button>
                    </div>
                </div>`;
            });
            section.appendChild(grid);
        }
        container.appendChild(section);
    }
}

// ... Resto das funções de Firebase e Discord (loadUserData, save, etc) mantidas
// setInterval para atualização 1s
setInterval(updateBossTimers, 1000);
