// ============================================================
// 101 OKEY v2 — ANA SAYFA & LOBİ MANTIĞI
// ============================================================

const socket = io();

// DOM Elements
const playerNameInput = document.getElementById('playerNameInput');
const errorToast = document.getElementById('errorToast');
const quickJoinBtn = document.getElementById('quickJoinBtn');
const teamModeToggle = document.getElementById('teamModeToggle');
const stackingModeToggle = document.getElementById('stackingModeToggle');
const penaltyModeToggle = document.getElementById('penaltyModeToggle');

// Modal Elements
const createRoomModalBtn = document.getElementById('createRoomModalBtn');
const createRoomModal = document.getElementById('createRoomModal');
const cancelCreateRoomBtn = document.getElementById('cancelCreateRoomBtn');
const confirmCreateRoomBtn = document.getElementById('confirmCreateRoomBtn');
const newRoomNameInput = document.getElementById('newRoomNameInput');
const newRoomPasswordInput = document.getElementById('newRoomPasswordInput');

const roomPasswordModal = document.getElementById('roomPasswordModal');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
const enterRoomPasswordInput = document.getElementById('enterRoomPasswordInput');
const roomsListContainer = document.getElementById('roomsListContainer');

let selectedAvatar = localStorage.getItem('okeyPlayerAvatar') || 'alibicim.png';
let selectedIstaka = localStorage.getItem('okeyPlayerIstaka') || 'istaka.jpg';
let pendingJoinRoom = null;

// Önceden kayıtlı ismi yükle
if (playerNameInput) {
    playerNameInput.value = localStorage.getItem('okeyPlayerName') || '';
}

// Avatar Seçimi
const avatarOptions = document.querySelectorAll('.avatar-option');
avatarOptions.forEach(option => {
    if (option.dataset.avatar === selectedAvatar) {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
    }
    option.addEventListener('click', () => {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedAvatar = option.dataset.avatar;
        localStorage.setItem('okeyPlayerAvatar', selectedAvatar);
        playSound('click');
    });
});

// Istaka Seçimi
const istakaOptions = document.querySelectorAll('.istaka-option');
istakaOptions.forEach(option => {
    if (option.dataset.istaka === selectedIstaka) {
        istakaOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
    }
    option.addEventListener('click', () => {
        istakaOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedIstaka = option.dataset.istaka;
        localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
        sessionStorage.setItem('selectedIstaka', selectedIstaka);
        playSound('click');
    });
});

// Ses Efekti
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'click') {
            osc.frequency.setValueAtTime(450, ctx.currentTime);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'success') {
            osc.frequency.setValueAtTime(520, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
        }
    } catch (e) {}
}

function getPlayerName() {
    let name = playerNameInput ? playerNameInput.value.trim() : '';
    if (!name) {
        name = 'Oyuncu' + Math.floor(1000 + Math.random() * 9000);
    }
    localStorage.setItem('okeyPlayerName', name);
    return name;
}

// Hızlı Masaya Otur
if (quickJoinBtn) {
    quickJoinBtn.addEventListener('click', () => {
        const name = getPlayerName();
        playSound('success');

        socket.emit('joinGame', {
            playerName: name,
            avatar: selectedAvatar,
            istaka: selectedIstaka,
            teamMode: teamModeToggle ? teamModeToggle.checked : false,
            stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
            penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false,
            roomCode: 'MAIN'
        });
    });
}

// Belirli Masaya Katıl
window.joinSpecificRoom = function(roomCode, hasPassword) {
    const name = getPlayerName();
    if (hasPassword) {
        pendingJoinRoom = roomCode;
        if (roomPasswordModal) {
            enterRoomPasswordInput.value = '';
            roomPasswordModal.classList.remove('hidden');
        }
        return;
    }

    playSound('success');
    socket.emit('joinGame', {
        playerName: name,
        avatar: selectedAvatar,
        istaka: selectedIstaka,
        teamMode: teamModeToggle ? teamModeToggle.checked : false,
        stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
        penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false,
        roomCode: roomCode
    });
};

// Yeni Masa Kur Modal
if (createRoomModalBtn) {
    createRoomModalBtn.addEventListener('click', () => {
        if (createRoomModal) {
            newRoomNameInput.value = '';
            newRoomPasswordInput.value = '';
            createRoomModal.classList.remove('hidden');
        }
    });
}

if (cancelCreateRoomBtn) {
    cancelCreateRoomBtn.addEventListener('click', () => {
        if (createRoomModal) createRoomModal.classList.add('hidden');
    });
}

if (confirmCreateRoomBtn) {
    confirmCreateRoomBtn.addEventListener('click', () => {
        const name = getPlayerName();
        const roomName = newRoomNameInput.value.trim() || `${name} Masası`;
        const roomPassword = newRoomPasswordInput.value.trim();
        const roomCode = 'MASA_' + Math.random().toString(36).substr(2, 6).toUpperCase();

        if (createRoomModal) createRoomModal.classList.add('hidden');
        playSound('success');

        socket.emit('createRoom', {
            roomCode,
            roomName,
            password: roomPassword,
            playerName: name,
            avatar: selectedAvatar,
            istaka: selectedIstaka,
            teamMode: teamModeToggle ? teamModeToggle.checked : false,
            stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
            penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false
        });
    });
}

// Şifre Giriş Modal Butonları
if (cancelPasswordBtn) {
    cancelPasswordBtn.addEventListener('click', () => {
        if (roomPasswordModal) roomPasswordModal.classList.add('hidden');
        pendingJoinRoom = null;
    });
}

if (confirmPasswordBtn) {
    confirmPasswordBtn.addEventListener('click', () => {
        const name = getPlayerName();
        const password = enterRoomPasswordInput.value.trim();
        if (roomPasswordModal) roomPasswordModal.classList.add('hidden');

        playSound('success');
        socket.emit('joinGame', {
            playerName: name,
            avatar: selectedAvatar,
            istaka: selectedIstaka,
            teamMode: teamModeToggle ? teamModeToggle.checked : false,
            stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
            penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false,
            roomCode: pendingJoinRoom || 'MAIN',
            password
        });
        pendingJoinRoom = null;
    });
}

// Aktif Odaları Dinle & Render Et
socket.on('roomsListUpdate', (rooms) => {
    if (!roomsListContainer) return;
    roomsListContainer.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        roomsListContainer.innerHTML = `
            <div class="room-item-card" data-room="MAIN">
                <div class="room-item-left">
                    <span class="room-item-icon">🀄</span>
                    <div>
                        <div class="room-item-name">Ana Oyun Masası</div>
                        <div class="room-item-details">Klasik 101 • 4 Kişilik • Herkese Açık</div>
                    </div>
                </div>
                <div class="room-item-right">
                    <span class="room-item-badge">0/4</span>
                    <button class="room-join-btn" onclick="joinSpecificRoom('MAIN')">Otur</button>
                </div>
            </div>
        `;
        return;
    }

    rooms.forEach(r => {
        const count = r.players ? r.players.length : 0;
        const isLocked = !!r.password;
        const div = document.createElement('div');
        div.className = 'room-item-card';
        div.innerHTML = `
            <div class="room-item-left">
                <span class="room-item-icon">${isLocked ? '🔒' : '🀄'}</span>
                <div>
                    <div class="room-item-name">${r.name || r.code} ${isLocked ? '(Şifreli)' : ''}</div>
                    <div class="room-item-details">${r.teamMode ? 'Eşli Takım' : 'Bireysel'} • ${r.stackingMode ? 'Katlamalı' : 'Standart'}</div>
                </div>
            </div>
            <div class="room-item-right">
                <span class="room-item-badge">${count}/4</span>
                <button class="room-join-btn" onclick="joinSpecificRoom('${r.code}', ${isLocked})">Otur</button>
            </div>
        `;
        roomsListContainer.appendChild(div);
    });
});

// Odaya Katılma Başarılı
socket.on('joinedGame', (data) => {
    sessionStorage.setItem('lobbyData', JSON.stringify({
        roomCode: data.roomCode || 'MAIN',
        teamMode: data.teamMode,
        players: data.players,
        playerName: localStorage.getItem('okeyPlayerName'),
        isHost: data.isHost
    }));
    sessionStorage.setItem('playerName', localStorage.getItem('okeyPlayerName'));

    window.location.href = 'game.html';
});

// Oyun Başladıysa Direkt Masaya Yönlendir
socket.on('gameStarted', (data) => {
    sessionStorage.setItem('gameData', JSON.stringify(data));
    sessionStorage.setItem('playerName', localStorage.getItem('okeyPlayerName'));
    window.location.href = 'game.html';
});

// Hata Gösterimi
socket.on('error', (data) => {
    if (!errorToast) return;
    const toastMessage = errorToast.querySelector('.toast-message');
    if (toastMessage) toastMessage.textContent = data.message || 'Hata oluştu!';
    errorToast.classList.remove('hidden');
    setTimeout(() => errorToast.classList.add('hidden'), 3500);
});
