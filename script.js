/* ============================================================
   FIREBASE & ADMIN CONFIG
============================================================ */
const firebaseConfig = {
    apiKey: "AIzaSyBqNscnlBWW8BKvtv4SXqyqAajlurFdOZ8",
    authDomain: "renksitesi-default-rtdb.firebaseapp.com",
    databaseURL: "https://renksitesi-default-rtdb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "renksitesi-default-rtdb",
    storageBucket: "renksitesi-default-rtdb.appspot.com",
    messagingSenderId: "1032338380234",
    appId: "1:1032338380234:web:6e38bc741e975fb901729b"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

const ADMIN_PASSWORD = "Admin1903!0704";
let isAdminLoggedIn = false;

/* ============================================================
   GLOBAL STATE & UTILS
============================================================ */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast-container');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// Yükleme ekranı kaldırma
window.addEventListener('load', () => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.classList.add('fade-out');
        }, 400);
    }
});

// Tema Değiştirici
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');

themeToggleBtn?.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme');
    const isLight = document.body.classList.contains('light-theme');
    sunIcon?.classList.toggle('hidden', isLight);
    moonIcon?.classList.toggle('hidden', !isLight);
});

// Admin Paneli Tetikleyici
const adminTrigger = document.getElementById('admin-trigger');
const navAdminBtn = document.getElementById('nav-admin-btn');
adminTrigger?.addEventListener('click', () => {
    navAdminBtn?.classList.remove('hidden');
    switchPanel('admin');
});

// Panel Yönlendirme Sistemi
function switchPanel(panelName) {
    const panels = {
        'home': document.getElementById('home-panel'),
        'color': document.getElementById('color-game-panel'),
        'weather': document.getElementById('weather-panel'),
        'rplace': document.getElementById('rplace-game-panel'),
        'okey': document.getElementById('okey-game-panel'),
        'admin': document.getElementById('admin-panel')
    };

    Object.keys(panels).forEach(key => {
        if (panels[key]) panels[key].classList.add('hidden');
    });

    if (panels[panelName]) {
        panels[panelName].classList.remove('hidden');
    }
}

document.getElementById('brand-logo')?.addEventListener('click', () => switchPanel('home'));
document.getElementById('nav-color-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchPanel('color'); });
document.getElementById('nav-weather-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchPanel('weather'); fetchWeather(); });
document.getElementById('nav-rplace-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchPanel('rplace'); });
document.getElementById('nav-okey-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchPanel('okey'); });
document.getElementById('nav-admin-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchPanel('admin'); });

document.getElementById('home-card-color')?.addEventListener('click', () => switchPanel('color'));
document.getElementById('home-card-weather')?.addEventListener('click', () => { switchPanel('weather'); fetchWeather(); });
document.getElementById('home-card-rplace')?.addEventListener('click', () => switchPanel('rplace'));
document.getElementById('home-card-okey')?.addEventListener('click', () => switchPanel('okey'));

/* ============================================================
   ÖZEL SOHBET MODALI
============================================================ */
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatModal = document.getElementById('chat-modal');
const chatCloseBtn = document.getElementById('chat-close-btn');

chatToggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    chatModal?.classList.toggle('hidden');
});
chatCloseBtn?.addEventListener('click', () => chatModal?.classList.add('hidden'));

const chatLoginBtn = document.getElementById('chat-login-btn');
const chatAuthScreen = document.getElementById('chat-auth-screen');
const chatRoomScreen = document.getElementById('chat-room-screen');

chatLoginBtn?.addEventListener('click', async () => {
    const email = document.getElementById('chat-username-input').value.trim();
    const password = document.getElementById('chat-password-input').value.trim();
    const errorEl = document.getElementById('chat-auth-error');

    if (!email || !password) {
        errorEl.textContent = 'Lütfen e-posta ve şifre girin!';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            await auth.createUserWithEmailAndPassword(email, password);
        }
        chatAuthScreen.classList.add('hidden');
        chatRoomScreen.classList.remove('hidden');
        listenGlobalChat();
    } catch (e) {
        errorEl.textContent = 'Giriş hatası: ' + e.message;
        errorEl.classList.remove('hidden');
    }
});

function listenGlobalChat() {
    db.ref('global_chat').limitToLast(50).on('value', snapshot => {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        const data = snapshot.val();
        if (!data) return;

        Object.values(data).forEach(msg => {
            const div = document.createElement('div');
            const isMe = auth.currentUser && msg.sender === auth.currentUser.email;
            div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
            div.textContent = `${msg.sender.split('@')[0]}: ${msg.text}`;
            chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

document.getElementById('chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-message-input');
    const text = input.value.trim();
    if (!text || !auth.currentUser) return;

    db.ref('global_chat').push({
        sender: auth.currentUser.email,
        text: text,
        timestamp: Date.now()
    });
    input.value = '';
});

/* ============================================================
   HAVA DURUMU SİSTEMİ
============================================================ */
async function fetchWeather() {
    const cityEl = document.getElementById('weather-city-district');
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const feelsEl = document.getElementById('weather-feels');
    const windEl = document.getElementById('weather-wind');
    const humidityEl = document.getElementById('weather-humidity');
    const iconEl = document.getElementById('weather-icon');

    try {
        // Varsayılan İstanbul Koordinatları
        let lat = 41.0082, lon = 28.9784, cityName = "İstanbul";

        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m,apparent_temperature`);
        const data = await res.json();

        if (data && data.current_weather) {
            cityEl.textContent = cityName;
            tempEl.textContent = Math.round(data.current_weather.temperature);
            descEl.textContent = "Açık / Az Bulutlu";
            feelsEl.textContent = `${Math.round(data.current_weather.temperature)}°C`;
            windEl.textContent = `${data.current_weather.windspeed} km/s`;
            humidityEl.textContent = `%${data.hourly.relativehumidity_2m[0] || 50}`;
            iconEl.textContent = '☀️';
        }
    } catch (e) {
        showToast('Hava durumu verisi alınamadı.', 'error');
    }
}
document.getElementById('refresh-weather-btn')?.addEventListener('click', fetchWeather);

/* ============================================================
   101 OKEY CANLI MASA SİSTEMİ
============================================================ */
let okeyState = {
    nickname: '',
    currentRoomId: null,
    currentSeat: null,
    selectedTileIndex: null,
    rack: Array(28).fill(null), // 2 Sıra, toplam 28 Slot
    activeFilter: 'all',
    searchQuery: '',
    roomData: null,
    selectedRoomForPass: null
};

// Lobiye Giriş
document.getElementById('okey-enter-lobby-btn')?.addEventListener('click', () => {
    const nick = document.getElementById('okey-nickname-input').value.trim();
    if (!nick) {
        showToast('Lütfen bir oyuncu adı girin!', 'error');
        return;
    }
    okeyState.nickname = nick;
    document.getElementById('okey-user-display').textContent = `Oyuncu: ${nick}`;
    document.getElementById('okey-login-step').classList.add('hidden');
    document.getElementById('okey-lobby-step').classList.remove('hidden');
    listenOkeyRooms();
});

// Oda Listesini Dinleme
function listenOkeyRooms() {
    db.ref('okey_rooms').on('value', snapshot => {
        const roomsContainer = document.getElementById('okey-rooms-container');
        const emptyState = document.getElementById('okey-empty-rooms');
        if (!roomsContainer) return;

        roomsContainer.innerHTML = '';
        const rooms = snapshot.val();

        if (!rooms) {
            emptyState?.classList.remove('hidden');
            return;
        }

        emptyState?.classList.add('hidden');
        let count = 0;

        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];

            // Filtreleme Kontrolleri
            if (okeyState.activeFilter === 'public' && room.password) return;
            if (okeyState.activeFilter === 'locked' && !room.password) return;
            if (okeyState.searchQuery && !room.name.toLowerCase().includes(okeyState.searchQuery.toLowerCase())) return;

            const playerCount = room.players ? Object.keys(room.players).length : 0;
            if (okeyState.activeFilter === 'available' && playerCount >= 4) return;

            count++;
            const card = document.createElement('div');
            card.className = 'okey-room-card';
            card.innerHTML = `
                <div class="okey-room-card-header">
                    <h4>${room.name}</h4>
                    <div class="okey-room-badges">
                        <span class="okey-mode-pill">${room.mode || 'Klasik'}</span>
                        <span class="okey-room-badge">${playerCount}/4</span>
                    </div>
                </div>
                <div class="okey-room-host-info">
                    👑 Kurucu: ${room.hostName || 'Bilinmiyor'} ${room.password ? '🔒' : ''}
                </div>
                <button class="play-btn" style="padding:8px 14px;font-size:13px;margin-top:6px" onclick="attemptJoinRoom('${roomId}', ${!!room.password})">
                    ${playerCount >= 4 ? 'Odayı İzle' : 'Masaya Otur'}
                </button>
            `;
            roomsContainer.appendChild(card);
        });

        if (count === 0) emptyState?.classList.remove('hidden');
    });
}

// Filtre Butonları
document.querySelectorAll('.okey-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.okey-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        okeyState.activeFilter = e.target.dataset.filter;
        listenOkeyRooms();
    });
});

document.getElementById('okey-room-search')?.addEventListener('input', (e) => {
    okeyState.searchQuery = e.target.value.trim();
    listenOkeyRooms();
});

// Yeni Masa Oluşturma Modalı
document.getElementById('okey-open-create-modal-btn')?.addEventListener('click', () => {
    document.getElementById('okey-create-modal').classList.remove('hidden');
});
document.getElementById('okey-close-create-modal')?.addEventListener('click', () => {
    document.getElementById('okey-create-modal').classList.add('hidden');
});

// Oda Kurma
document.getElementById('okey-confirm-create-btn')?.addEventListener('click', () => {
    const roomName = document.getElementById('new-room-name').value.trim();
    const roomPass = document.getElementById('new-room-pass').value.trim();
    const modeBtn = document.querySelector('.okey-mode-btn.active');
    const mode = modeBtn ? modeBtn.dataset.mode : 'klasik';

    if (!roomName) {
        showToast('Masa adı boş bırakılamaz!', 'error');
        return;
    }

    const newRoomRef = db.ref('okey_rooms').push();
    const roomId = newRoomRef.key;

    const initialRoomData = {
        id: roomId,
        name: roomName,
        password: roomPass || null,
        mode: mode,
        hostName: okeyState.nickname,
        hostId: okeyState.nickname + '_' + Date.now(),
        status: 'waiting',
        players: {
            bottom: { name: okeyState.nickname, isHost: true }
        }
    };

    newRoomRef.set(initialRoomData).then(() => {
        document.getElementById('okey-create-modal').classList.add('hidden');
        enterRoom(roomId, 'bottom');
    });
});

// Odaya Katılma İsteği
window.attemptJoinRoom = function(roomId, isLocked) {
    if (isLocked) {
        okeyState.selectedRoomForPass = roomId;
        document.getElementById('okey-pass-prompt-modal').classList.remove('hidden');
    } else {
        findAvailableSeatAndJoin(roomId);
    }
};

document.getElementById('okey-close-pass-modal')?.addEventListener('click', () => {
    document.getElementById('okey-pass-prompt-modal').classList.add('hidden');
});

document.getElementById('okey-confirm-pass-btn')?.addEventListener('click', () => {
    const pass = document.getElementById('okey-room-pass-input').value.trim();
    const roomId = okeyState.selectedRoomForPass;

    db.ref(`okey_rooms/${roomId}`).once('value', snapshot => {
        const room = snapshot.val();
        if (room && room.password === pass) {
            document.getElementById('okey-pass-prompt-modal').classList.add('hidden');
            findAvailableSeatAndJoin(roomId);
        } else {
            showToast('Hatalı masa şifresi!', 'error');
        }
    });
});

function findAvailableSeatAndJoin(roomId) {
    db.ref(`okey_rooms/${roomId}/players`).once('value', snapshot => {
        const players = snapshot.val() || {};
        const seats = ['bottom', 'right', 'top', 'left'];
        let freeSeat = seats.find(s => !players[s]);

        if (!freeSeat) {
            showToast('Masa dolu! İzleyici olarak katılanıyorsunuz...', 'info');
            enterRoom(roomId, null);
            return;
        }
        
        db.ref(`okey_rooms/${roomId}/players/${freeSeat}`).set({
            name: okeyState.nickname,
            isHost: false
        }).then(() => {
            enterRoom(roomId, freeSeat);
        });
    });
}

// Odaya Giriş Yapma ve Arayüzü Yükleme
function enterRoom(roomId, seatKey) {
    okeyState.currentRoomId = roomId;
    okeyState.currentSeat = seatKey;

    document.getElementById('okey-lobby-step').classList.add('hidden');
    document.getElementById('okey-room-step').classList.remove('hidden');

    initRackSlots();
    listenCurrentRoom();
}

function listenCurrentRoom() {
    db.ref(`okey_rooms/${okeyState.currentRoomId}`).on('value', snapshot => {
        const room = snapshot.val();
        if (!room) {
            showToast('Masa kapatıldı.', 'error');
            leaveRoom();
            return;
        }

        okeyState.roomData = room;
        document.getElementById('okey-current-room-title').textContent = room.name;
        document.getElementById('okey-room-mode-badge').textContent = room.mode;

        // Koltukları Güncelle
        updateSeatsUI(room.players || {}, room.turnSeat);

        // Başlat Butonu Kontrolü (Kurucu İçin)
        const startBtn = document.getElementById('okey-start-game-btn');
        const isHost = room.players && room.players[okeyState.currentSeat]?.isHost;
        if (isHost && room.status === 'waiting') {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }

        // Oyun İçeriklerini Dinleme
        if (room.status === 'playing' && room.gameState) {
            renderTableCenter(room.gameState);
        }
    });

    // Masa Sohbeti
    db.ref(`okey_rooms/${okeyState.currentRoomId}/chat`).limitToLast(30).on('value', snapshot => {
        const chatBox = document.getElementById('okey-chat-messages');
        if (!chatBox) return;
        chatBox.innerHTML = '';
        const msgs = snapshot.val();
        if (!msgs) return;

        Object.values(msgs).forEach(m => {
            const div = document.createElement('div');
            div.className = 'rplace-chat-msg ' + (m.sender === okeyState.nickname ? 'me' : 'other');
            div.innerHTML = `<div class="author">${m.sender}</div><div>${m.text}</div>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// Masadan Ayrılma
document.getElementById('okey-leave-room-btn')?.addEventListener('click', leaveRoom);

function leaveRoom() {
    if (okeyState.currentRoomId && okeyState.currentSeat) {
        db.ref(`okey_rooms/${okeyState.currentRoomId}/players/${okeyState.currentSeat}`).remove();
        db.ref(`okey_rooms/${okeyState.currentRoomId}`).off();
    }
    okeyState.currentRoomId = null;
    okeyState.currentSeat = null;
    document.getElementById('okey-room-step').classList.add('hidden');
    document.getElementById('okey-lobby-step').classList.remove('hidden');
}

// Koltuk Görünümü
function updateSeatsUI(players, activeTurnSeat) {
    const seats = ['bottom', 'right', 'top', 'left'];

    seats.forEach(s => {
        const seatEl = document.getElementById(`seat-${s}`);
        const nameEl = seatEl.querySelector('.seat-name');
        const crownEl = seatEl.querySelector('.seat-crown');
        const pData = players[s];

        if (pData) {
            seatEl.classList.add('occupied');
            nameEl.textContent = pData.name;
            crownEl.classList.toggle('hidden', !pData.isHost);
        } else {
            seatEl.classList.remove('occupied');
            nameEl.textContent = 'Boş Slot';
            crownEl.classList.add('hidden');
        }

        seatEl.classList.toggle('active-turn', activeTurnSeat === s);
    });
}

/* ============================================================
   101 OKEY TAŞ DİZİLİMİ VE ISTAKA MEKANİZMASI
============================================================ */
function initRackSlots() {
    const row1 = document.getElementById('okey-rack-row-1');
    const row2 = document.getElementById('okey-rack-row-2');
    row1.innerHTML = '';
    row2.innerHTML = '';

    for (let i = 0; i < 28; i++) {
        const slot = document.createElement('div');
        slot.className = 'okey-rack-slot';
        slot.dataset.index = i;

        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            slot.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            moveTileToSlot(fromIndex, i);
        });

        if (i < 14) row1.appendChild(slot);
        else row2.appendChild(slot);
    }
}

function moveTileToSlot(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const temp = okeyState.rack[fromIndex];
    okeyState.rack[fromIndex] = okeyState.rack[toIndex];
    okeyState.rack[toIndex] = temp;
    renderRackTiles();
}

function renderRackTiles() {
    const slots = document.querySelectorAll('.okey-rack-slot');
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        const tile = okeyState.rack[index];

        if (tile) {
            const tileEl = document.createElement('div');
            tileEl.className = `okey-tile tile-${tile.color} ${tile.isJoker ? 'tile-joker' : ''}`;
            tileEl.draggable = true;
            tileEl.textContent = tile.isJoker ? '★' : tile.number;

            tileEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
            });

            slot.appendChild(tileEl);
        }
    });
}

// Oyunu Başlatma (Deste Oluşturma & Dağıtma)
document.getElementById('okey-start-game-btn')?.addEventListener('click', () => {
    if (!okeyState.currentRoomId) return;

    // 106 Taşlık Deste Hazırlığı
    const colors = ['red', 'blue', 'black', 'yellow'];
    let deck = [];

    colors.forEach(c => {
        for (let i = 1; i <= 13; i++) {
            deck.push({ color: c, number: i });
            deck.push({ color: c, number: i });
        }
    });
    // 2 Sahte Okey
    deck.push({ color: 'joker', number: 0, isJoker: true });
    deck.push({ color: 'joker', number: 0, isJoker: true });

    // Karıştır
    deck.sort(() => Math.random() - 0.5);

    // Gösterge Çek
    const indicator = deck.pop();

    const gameState = {
        deck: deck,
        indicator: indicator,
        turnSeat: 'bottom',
        status: 'playing'
    };

    db.ref(`okey_rooms/${okeyState.currentRoomId}/gameState`).set(gameState);
    db.ref(`okey_rooms/${okeyState.currentRoomId}/status`).set('playing');

    // Kendine Taşları Dağıt (Örnek 21 Taş)
    let myTiles = deck.splice(0, 21);
    okeyState.rack = Array(28).fill(null);
    myTiles.forEach((t, i) => okeyState.rack[i] = t);
    renderRackTiles();

    showToast('Oyun Başladı! Taşlar Dağıtıldı.', 'success');
});

function renderTableCenter(gameState) {
    document.getElementById('okey-deck-count').textContent = gameState.deck ? gameState.deck.length : 0;
    const indEl = document.getElementById('okey-indicator-tile');

    if (gameState.indicator) {
        indEl.textContent = gameState.indicator.isJoker ? '★' : gameState.indicator.number;
        indEl.className = `okey-tile-item tile-${gameState.indicator.color}`;
    }

    const turnBadge = document.getElementById('okey-turn-indicator');
    const isMyTurn = gameState.turnSeat === okeyState.currentSeat;
    turnBadge.textContent = isMyTurn ? '⚡ Sıra Sende!' : 'Diğer Oyuncunun Sırası';
    turnBadge.className = `okey-turn-badge ${isMyTurn ? 'my-turn' : ''}`;
}

// Otomatik Taş Dizilim Butonları
document.getElementById('okey-sort-color-btn')?.addEventListener('click', () => {
    let tiles = okeyState.rack.filter(t => t !== null);
    tiles.sort((a, b) => {
        if (a.color === b.color) return a.number - b.number;
        return a.color.localeCompare(b.color);
    });
    okeyState.rack = Array(28).fill(null);
    tiles.forEach((t, i) => okeyState.rack[i] = t);
    renderRackTiles();
});

document.getElementById('okey-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('okey-chat-input');
    const msg = input.value.trim();
    if (!msg || !okeyState.currentRoomId) return;

    db.ref(`okey_rooms/${okeyState.currentRoomId}/chat`).push({
        sender: okeyState.nickname,
        text: msg,
        timestamp: Date.now()
    });
    input.value = '';
});

/* ============================================================
   ADMIN PANELİ LOGİĞİ
============================================================ */
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminError = document.getElementById('admin-error');

adminLoginBtn?.addEventListener('click', () => {
    const pass = adminPasswordInput.value.trim();
    if (pass === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        document.getElementById('admin-login-view').classList.add('hidden');
        document.getElementById('admin-dashboard-view').classList.remove('hidden');
        initAdminDashboard();
    } else {
        adminError?.classList.remove('hidden');
    }
});

document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    isAdminLoggedIn = false;
    document.getElementById('admin-dashboard-view').classList.add('hidden');
    document.getElementById('admin-login-view').classList.remove('hidden');
    adminPasswordInput.value = '';
});

function initAdminDashboard() {
    // İstatistikler & Dinleyiciler
    db.ref('okey_rooms').on('value', snap => {
        const rooms = snap.val() || {};
        document.getElementById('stat-rooms-count').textContent = Object.keys(rooms).length;

        const roomsList = document.getElementById('admin-rooms-list');
        if (!roomsList) return;
        roomsList.innerHTML = '';

        Object.keys(rooms).forEach(rId => {
            const div = document.createElement('div');
            div.className = 'admin-room-item';
            div.innerHTML = `
                <span><b>${rooms[rId].name}</b> (${rooms[rId].hostName})</span>
                <button class="admin-msg-del" onclick="deleteRoomAdmin('${rId}')">Kapat</button>
            `;
            roomsList.appendChild(div);
        });
    });

    db.ref('global_chat').on('value', snap => {
        const msgs = snap.val() || {};
        document.getElementById('stat-chat-msgs').textContent = Object.keys(msgs).length;
    });
}

window.deleteRoomAdmin = function(roomId) {
    if (confirm('Bu odayı kapatmak istediğinize emin misiniz?')) {
        db.ref(`okey_rooms/${roomId}`).remove();
    }
};

document.getElementById('admin-reset-all-rooms')?.addEventListener('click', () => {
    if (confirm('TÜM aktif 101 masaları silinecek. Onaylıyor musunuz?')) {
        db.ref('okey_rooms').remove();
    }
});

document.getElementById('admin-clear-global-chat')?.addEventListener('click', () => {
    if (confirm('Sohbet geçmişi silinecek?')) {
        db.ref('global_chat').remove();
    }
});
