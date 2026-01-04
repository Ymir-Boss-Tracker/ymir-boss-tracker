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

// Configurações de Tempos
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MYRK_MIN_MS = 50 * 60 * 1000; 
const MYRK_MAX_MS = 60 * 60 * 1000; 
const FIVE_MINS = 5 * 60 * 1000;

const BOSS_IMAGES = {
    "Berserker": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674395545-53214fcd-e6aa-41e5-b91d-ba44ee3bd3f3.png",
    "Mage": "https://gcdn-dev.wemade.games/dev/lygl/official/api/upload/helpInquiry/1764674409406-c5b70062-7ad2-4958-9a5c-3d2b2a2edcb6.png",
    "Skald": "https://framerusercontent.com/images/XJzkQNlvMBB6ZOBgb6DUs5u1Mgk.png?width=1000&height=2280"
};

const MYRK_LIST = [
    "[Lv.66] Capitão Intruso Trésá l",
    "[Lv.67] Capitão Intruso Troll Veterano",
    "[Lv.68] Capitão Combatente Jotun Truculento",
    "[Lv.68] Capitão Desordeiro Jotun do Fogo Atroz"
];

let BOSS_DATA = {};
let currentUser = null;
let isCompactView = false;
let userWebhookUrl = "";

function initializeBossData() {
    BOSS_DATA = {};
    const configs = {
        'Comum': { name: 'Folkvangr Comum', bosses: ["Lancer", "Berserker", "Skald", "Mage"], dur: EIGHT_HOURS_MS, win: false },
        'Universal': { name: 'Folkvangr Universal', bosses: ["Lancer", "Berserker", "Skald", "Mage"], dur: TWO_HOURS_MS, win: false },
        'Myrk1': { name: 'Myrkheimr Canal 1', bosses: MYRK_LIST, dur: MYRK_MIN_MS, win: true },
        'Myrk2': { name: 'Myrkheimr Canal 2', bosses: MYRK_LIST, dur: MYRK_MIN_MS, win: true }
    };

    for (const key in configs) {
        BOSS_DATA[key] = { name: configs[key].name, floors: {} };
        const floorsCount = (key.startsWith('Myrk')) ? 1 : 4;
        for (let i = 1; i <= floorsCount; i++) {
            const fName = floorsCount > 1 ? `Piso ${i}` : 'Área Única';
            BOSS_DATA[key].floors[fName] = { bosses: [] };
            configs[key].bosses.forEach(name => {
                BOSS_DATA[key].floors[fName].bosses.push({
                    id: `${key}_${i}_${name.replace(/\s+/g, '_')}`,
                    name, respawnTime: 0, maxRespawnTime: 0, lastRespawnTime: null,
                    alerted: false, isWindowed: configs[key].win, duration: configs[key].dur,
                    image: BOSS_IMAGES[name] || "https://placehold.co/50x50/111/d4af37?text=Boss"
                });
            });
        }
    }
}

// Auth e Data Loading
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-name').textContent = `Olá, ${user.displayName}`;
        document.getElementById('app-content').style.display = 'block';
        initializeBossData();
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            const data = snap.data();
            userWebhookUrl = data.webhookUrl || "";
            document.getElementById('webhook-url-input').value = userWebhookUrl;
            (data.timers || []).forEach(saved => {
                const b = findBossById(saved.id);
                if (b) { b.respawnTime = saved.time; b.maxRespawnTime = saved.maxTime || 0; }
            });
        }
        render();
    }
});

function findBossById(id) {
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            const b = BOSS_DATA[t].floors[f].bosses.find(x => x.id === id);
            if (b) return b;
        }
    }
}

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
    const [h, m] = val.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    b.respawnTime = d.getTime() + b.duration;
    if (b.isWindowed) b.maxRespawnTime = d.getTime() + MYRK_MAX_MS;
    save(); render();
};

async function save() {
    if (!currentUser) return;
    const timers = [];
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                timers.push({ id: b.id, time: b.respawnTime, maxTime: b.maxRespawnTime });
            });
        }
    }
    await setDoc(doc(db, "users", currentUser.uid), { timers, webhookUrl: userWebhookUrl });
}

function updateBossTimers() {
    const now = Date.now();
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                const timerEl = document.getElementById('timer-' + b.id);
                const cardEl = document.getElementById('card-' + b.id);
                const barEl = document.getElementById('bar-' + b.id);
                if (!timerEl) return;

                if (b.respawnTime === 0) {
                    timerEl.textContent = "DISPONÍVEL!";
                    if (barEl) barEl.style.width = "100%";
                } else if (b.isWindowed && now >= b.respawnTime && now < b.maxRespawnTime) {
                    // JANELA ABERTA
                    cardEl.classList.add('window-open');
                    const diffMax = b.maxRespawnTime - now;
                    const m = Math.floor(diffMax/60000), s = Math.floor((diffMax%60000)/1000);
                    timerEl.innerHTML = `<span class="window-status">JANELA ABERTA</span>${m}:${s.toString().padStart(2,'0')}`;
                    if (barEl) { barEl.style.width = "100%"; barEl.style.backgroundColor = "#2ecc71"; }
                } else if (now >= (b.isWindowed ? b.maxRespawnTime : b.respawnTime)) {
                    b.respawnTime = 0; cardEl.classList.remove('window-open', 'alert');
                    render();
                } else {
                    const diff = b.respawnTime - now;
                    if (barEl) barEl.style.width = (diff / (b.isWindowed ? MYRK_MIN_MS : b.duration) * 100) + "%";
                    if (diff <= FIVE_MINS && !b.alerted) { 
                        document.getElementById('alert-sound').play(); b.alerted = true; cardEl.classList.add('alert'); 
                    }
                    const h = Math.floor(diff/3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff%3600000)/60000).toString().padStart(2,'0');
                    const s = Math.floor((diff%60000)/1000).toString().padStart(2,'0');
                    timerEl.textContent = `${h}:${m}:${s}`;
                }
            });
        }
    }
}

function render() {
    const container = document.getElementById('boss-list-container');
    container.innerHTML = '';
    for (const t in BOSS_DATA) {
        const sec = document.createElement('section');
        sec.className = `type-section ${isCompactView ? 'compact-mode' : ''}`;
        sec.innerHTML = `<h2>${BOSS_DATA[t].name}</h2>`;
        for (const f in BOSS_DATA[t].floors) {
            const grid = document.createElement('div');
            grid.className = 'boss-grid';
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                grid.innerHTML += `
                <div class="boss-card" id="card-${b.id}">
                    <div class="boss-header">
                        <img src="${b.image}" class="boss-thumb">
                        <h4>${b.name}</h4>
                    </div>
                    <div class="timer" id="timer-${b.id}">--:--:--</div>
                    <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${b.id}"></div></div>
                    <div class="static-times">
                        <p>Nasce: <span>${b.respawnTime > 0 ? new Date(b.respawnTime).toLocaleTimeString() : '--:--'} ${b.isWindowed ? '(+10m)' : ''}</span></p>
                    </div>
                    <button class="kill-btn" onclick="killBoss('${b.id}')">MORTO AGORA</button>
                    <div class="manual-box"><input type="time" id="manual-input-${b.id}"><button class="conf-btn" onclick="setManualTime('${b.id}')">OK</button></div>
                    <div class="action-footer">
                        <button class="reset-btn" onclick="resetBoss('${b.id}')">Reset</button>
                    </div>
                </div>`;
            });
            sec.appendChild(grid);
        }
        container.appendChild(sec);
    }
}

setInterval(updateBossTimers, 1000);
document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);
document.getElementById('save-webhook-btn').onclick = () => { userWebhookUrl = document.getElementById('webhook-url-input').value; save(); alert("Salvo!"); };
