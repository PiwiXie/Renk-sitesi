// 101 Okey - Ana Sayfa JavaScript (Sadeleştirilmiş)
const socket = io();

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
    alert('Sunucuyla bağlantı kurulamadı! Lütfen sayfayı yenileyin veya sunucunun çalıştığından emin olun.');
});

// DOM Elementleri
const nameSection = document.getElementById('nameSection');
const playerNameInput = document.getElementById('playerNameInput');
const errorToast = document.getElementById('errorToast');
const joinGameBtn = document.getElementById('joinGameBtn');
const teamModeToggle = document.getElementById('teamModeToggle');
const stackingModeToggle = document.getElementById('stackingModeToggle');
const penaltyModeToggle = document.getElementById('penaltyModeToggle');

let playerName = '';
let selectedAvatar = 'alibicim.png';
let selectedIstaka = 'istaka.jpg';

// Avatar seçimi
const avatarOptions = document.querySelectorAll('.avatar-option');
avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedAvatar = option.dataset.avatar;
        playSound('click');
    });
});

// Istaka renk seçimi
const istakaOptions = document.querySelectorAll('.istaka-option');
istakaOptions.forEach(option => {
    option.addEventListener('click', () => {
        istakaOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedIstaka = option.dataset.istaka;
        playSound('click');
    });
});

// Ses efektleri
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch (type) {
            case 'click':
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.1;
                oscillator.type = 'sine';
                break;
            case 'join':
                oscillator.frequency.value = 600;
                gainNode.gain.value = 0.15;
                oscillator.type = 'triangle';
                break;
            case 'success':
                oscillator.frequency.value = 1000;
                gainNode.gain.value = 0.1;
                oscillator.type = 'sine';
                break;
        }

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        console.warn('Ses çalınamadı:', e);
    }
}

// Rastgele oyuncu ID oluştur (her sekme için benzersiz)
function generatePlayerId() {
    return 'Oyuncu' + Math.floor(Math.random() * 9000 + 1000);
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    const savedAvatar = localStorage.getItem('okeyPlayerAvatar');
    const savedName = localStorage.getItem('okeyPlayerName');

    // Kaydedilmiş ismi yükle veya benzersiz ID oluştur
    if (savedName && savedName.trim()) {
        playerName = savedName;
        if (playerNameInput) playerNameInput.value = savedName;
    } else {
        // Her sekme için benzersiz ID
        let savedId = sessionStorage.getItem('okeyPlayerId');
        if (!savedId) {
            playerName = generatePlayerId();
            sessionStorage.setItem('okeyPlayerId', playerName);
        } else {
            playerName = savedId;
        }
    }

    if (savedAvatar) {
        selectedAvatar = savedAvatar;
        avatarOptions.forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.avatar === savedAvatar) {
                o.classList.add('selected');
            }
        });
    }

    // Kaydedilmiş istaka seçimi
    const savedIstaka = localStorage.getItem('okeyPlayerIstaka');
    if (savedIstaka) {
        selectedIstaka = savedIstaka;
        istakaOptions.forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.istaka === savedIstaka) {
                o.classList.add('selected');
            }
        });
    }
});

// Oyuna katıl butonuna tıklama
joinGameBtn.addEventListener('click', () => {
    console.log('Join button clicked');
    playSound('click');

    // İsim input'tan al
    const inputName = playerNameInput ? playerNameInput.value.trim() : '';
    if (inputName) {
        playerName = inputName;
        localStorage.setItem('okeyPlayerName', playerName);
    } else {
        // Boşsa otomatik ID kullan
        playerName = sessionStorage.getItem('okeyPlayerId') || generatePlayerId();
    }

    // Avatar ve istaka'yı kaydet
    localStorage.setItem('okeyPlayerAvatar', selectedAvatar);
    localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
    sessionStorage.setItem('selectedIstaka', selectedIstaka);

    const teamMode = teamModeToggle ? teamModeToggle.checked : false;
    const stackingMode = stackingModeToggle ? stackingModeToggle.checked : false;
    const penaltyMode = penaltyModeToggle ? penaltyModeToggle.checked : false;

    // Direkt sabit odaya katıl
    socket.emit('joinGame', {
        playerName,
        teamMode,
        stackingMode,
        penaltyMode,
        avatar: selectedAvatar
    });
});

// Socket Olayları

// Odaya katıldığında
socket.on('joinedGame', (data) => {
    playSound('success');

    // Lobi bilgilerini sakla ve game sayfasına yönlendir
    sessionStorage.setItem('lobbyData', JSON.stringify({
        roomCode: 'MAIN',
        teamMode: data.teamMode,
        players: data.players,
        playerName: playerName,
        isHost: false
    }));
    sessionStorage.setItem('playerName', playerName);

    window.location.href = 'game.html';
});

// Oyun başladığında
socket.on('gameStarted', (data) => {
    sessionStorage.setItem('gameData', JSON.stringify(data));
    sessionStorage.setItem('playerName', playerName);
    window.location.href = 'game.html';
});

// Hata
socket.on('error', (data) => {
    showError(data.message);
});

// Hata göster
function showError(message) {
    const toastMessage = errorToast.querySelector('.toast-message');
    toastMessage.textContent = message;
    errorToast.classList.remove('hidden');

    setTimeout(() => {
        errorToast.classList.add('hidden');
    }, 3000);
}
