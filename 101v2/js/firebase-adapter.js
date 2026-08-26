// ============================================================
// 101 OKEY v2 — ROBUST FIREBASE REALTIME ENGINE & GAME ADAPTER
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyCXphC--uF5LLjEiBxD2pT2-UzGVcFXt34",
    authDomain: "burakdmrcoglu11.firebaseapp.com",
    databaseURL: "https://burakdmrcoglu11-default-rtdb.firebaseio.com",
    projectId: "burakdmrcoglu11",
    storageBucket: "burakdmrcoglu11.firebasestorage.app",
    messagingSenderId: "406084996472",
    appId: "1:406084996472:web:d4f33f939c4825e2b3cc8d"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

class FirebaseSocketAdapter {
    constructor() {
        this.listeners = {};
        this.id = localStorage.getItem('okeyPlayerSocketId') || ('player_' + Math.random().toString(36).substr(2, 9));
        localStorage.setItem('okeyPlayerSocketId', this.id);
        this.roomUnsub = null;
        this.roomsListUnsub = null;
        this.currentRoom = 'MAIN';
        this.isHost = false;
        this.botTimeout = null;

        setTimeout(() => {
            this.trigger('connect', {});
            this.listenRoomsList();
        }, 50);
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        console.log('[SOCKET EMIT]', event, data);
        switch (event) {
            case 'joinGame':
                this.handleJoinGame(data);
                break;
            case 'createRoom':
                this.handleCreateRoom(data);
                break;
            case 'rejoinRoom':
                this.handleRejoinRoom(data);
                break;
            case 'forceStartGame':
            case 'startGame':
                this.handleForceStartGame(data);
                break;
            case 'drawTile':
                this.handleDrawTile(data);
                break;
            case 'drawFromDiscard':
                this.handleDrawTile({ source: 'discard' });
                break;
            case 'discardTile':
                this.handleDiscardTile(data);
                break;
            case 'openGroup':
            case 'openGroups':
                this.handleOpenGroup(data);
                break;
            case 'openPairs':
                this.handleOpenPairs(data);
                break;
            case 'addTileToGroup':
                this.handleAddTileToGroup(data);
                break;
            case 'finishGame':
                this.handleFinishGame(data);
                break;
            case 'throwTomato':
                this.handleThrowTomato(data);
                break;
            case 'leaveRoom':
                this.handleLeaveRoom();
                break;
        }
    }

    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try { cb(data); } catch (e) { console.error('Listener error for ' + event, e); }
            });
        }
    }

    listenRoomsList() {
        if (this.roomsListUnsub) this.roomsListUnsub();
        try {
            this.roomsListUnsub = db.collection('okey_v2_rooms').onSnapshot(snap => {
                const rooms = [];
                snap.forEach(doc => {
                    rooms.push({ code: doc.id, ...doc.data() });
                });
                this.trigger('roomsListUpdate', rooms);
            }, err => {
                console.warn('Rooms list snapshot error:', err);
            });
        } catch (e) {}
    }

    async handleCreateRoom(data) {
        const { roomCode, roomName, password, playerName, avatar, istaka, teamMode, stackingMode, penaltyMode } = data;
        const targetRoom = roomCode || ('MASA_' + Math.random().toString(36).substr(2, 6).toUpperCase());
        this.currentRoom = targetRoom;
        this.isHost = true;

        const roomRef = db.collection('okey_v2_rooms').doc(targetRoom);
        const hostPlayer = {
            id: this.id,
            name: playerName,
            avatar: avatar || 'alibicim.png',
            istaka: istaka || 'istaka.jpg',
            index: 0,
            position: 'bottom',
            team: teamMode ? 1 : null
        };

        const newRoom = {
            code: targetRoom,
            name: roomName || `${playerName} Masası`,
            password: password || null,
            hostId: this.id,
            players: [hostPlayer],
            teamMode: !!teamMode,
            stackingMode: !!stackingMode,
            penaltyMode: !!penaltyMode,
            gameStarted: false,
            gameStateJson: null,
            scores: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await roomRef.set(newRoom);

        this.trigger('joinedGame', {
            roomCode: targetRoom,
            teamMode: newRoom.teamMode,
            stackingMode: newRoom.stackingMode,
            penaltyMode: newRoom.penaltyMode,
            players: newRoom.players,
            isHost: true
        });

        this.listenRoom(targetRoom);
    }

    async handleJoinGame(data) {
        const { playerName, avatar, istaka, teamMode, stackingMode, penaltyMode, roomCode, password } = data;
        const targetRoom = roomCode || 'MAIN';
        this.currentRoom = targetRoom;

        const roomRef = db.collection('okey_v2_rooms').doc(targetRoom);

        try {
            const doc = await roomRef.get();
            let room = doc.exists ? doc.data() : {
                code: targetRoom,
                name: 'Ana Oyun Masası',
                password: null,
                players: [],
                teamMode: !!teamMode,
                stackingMode: !!stackingMode,
                penaltyMode: !!penaltyMode,
                gameStarted: false,
                gameStateJson: null,
                scores: {}
            };

            // Şifre kontrolü
            if (room.password && room.password !== password) {
                this.trigger('error', { message: 'Hatalı masa şifresi!' });
                return;
            }

            // Mevcut oyuncu kontrolü
            let player = room.players.find(p => p.id === this.id || p.name === playerName);
            if (!player) {
                if (room.players.length >= 4 && !room.gameStarted) {
                    this.trigger('error', { message: 'Masa dolu (4/4)!' });
                    return;
                }
                const playerIndex = room.players.length;
                const positions = ['bottom', 'right', 'top', 'left'];
                player = {
                    id: this.id,
                    name: playerName,
                    avatar: avatar || 'alibicim.png',
                    istaka: istaka || 'istaka.jpg',
                    index: playerIndex,
                    position: positions[playerIndex] || 'bottom',
                    team: room.teamMode ? (playerIndex % 2 === 0 ? 1 : 2) : null
                };
                room.players.push(player);
            } else {
                player.avatar = avatar || player.avatar;
                player.istaka = istaka || player.istaka;
            }

            if (room.players.length === 1 || room.hostId === this.id) {
                this.isHost = true;
                room.hostId = this.id;
            }

            await roomRef.set(room);

            this.trigger('joinedGame', {
                roomCode: targetRoom,
                teamMode: room.teamMode,
                stackingMode: room.stackingMode,
                penaltyMode: room.penaltyMode,
                players: room.players,
                isHost: this.isHost
            });

            this.listenRoom(targetRoom);
        } catch (err) {
            console.error('handleJoinGame error:', err);
            this.trigger('error', { message: 'Masaya bağlanırken hata oluştu!' });
        }
    }

    async handleRejoinRoom(data) {
        const targetRoom = data?.roomCode || this.currentRoom || 'MAIN';
        this.listenRoom(targetRoom);
    }

    async handleForceStartGame(data) {
        console.log('[FORCE START GAME] Called with:', data);
        const targetRoom = data?.roomCode || this.currentRoom || 'MAIN';
        const roomRef = db.collection('okey_v2_rooms').doc(targetRoom);

        try {
            const doc = await roomRef.get();
            let room = doc.exists ? doc.data() : {
                code: targetRoom,
                players: [{
                    id: this.id,
                    name: localStorage.getItem('okeyPlayerName') || 'Oyuncu',
                    avatar: localStorage.getItem('okeyPlayerAvatar') || 'alibicim.png',
                    istaka: localStorage.getItem('okeyPlayerIstaka') || 'istaka.jpg',
                    index: 0,
                    position: 'bottom',
                    team: null
                }],
                teamMode: false,
                stackingMode: false,
                penaltyMode: false
            };

            const botNames = ['Ege Fitness (Bot)', 'LeBron James (Bot)', 'Lvbel C5 (Bot)', 'Ali Biçim (Bot)'];
            const botAvatars = ['egefitness.png', 'james.jpg', 'lvblc5.jpg', 'alibicim.png'];
            const positions = ['bottom', 'right', 'top', 'left'];

            // 4 oyuncuya tamamla
            while (room.players.length < 4) {
                const pIndex = room.players.length;
                const botIdx = pIndex % botNames.length;
                room.players.push({
                    id: 'bot_' + Math.random().toString(36).substr(2, 7),
                    name: botNames[botIdx],
                    avatar: botAvatars[botIdx],
                    istaka: 'istaka.jpg',
                    index: pIndex,
                    position: positions[pIndex],
                    isBot: true,
                    team: room.teamMode ? (pIndex % 2 === 0 ? 1 : 2) : null
                });
            }

            const gameState = this.initGameLogic(room.players);
            room.gameStarted = true;
            room.gameStateJson = JSON.stringify(gameState); // NO NESTED ARRAYS ERROR!

            // Firestore'a kaydet
            await roomRef.set(room);
            console.log('[FORCE START GAME] Successfully saved to Firestore!');

            // Anında yerel olarak da başlat
            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = (room.players || []).find(p => p.id === this.id || p.name === myName);
            const myIndex = myPlayer ? myPlayer.index : 0;

            this.trigger('gameStarted', {
                players: room.players,
                playerIndex: myIndex,
                tiles: gameState.playerTiles[myIndex] || [],
                indicator: gameState.indicator,
                okey: gameState.okey,
                currentPlayer: gameState.currentPlayer,
                teamMode: room.teamMode,
                scores: room.scores || {},
                pileCount: gameState.tiles.length,
                discardPiles: gameState.discardPiles,
                tableGroups: gameState.tableGroups || [],
                playerStates: gameState.playerStates || []
            });
        } catch (e) {
            console.error('handleForceStartGame error:', e);
        }
    }

    initGameLogic(players) {
        const colors = ['Kirmizi', 'Yesil', 'Mavi', 'Siyah'];
        let tiles = [];
        for (let set = 0; set < 2; set++) {
            for (let c = 0; c < colors.length; c++) {
                for (let num = 1; num <= 13; num++) {
                    tiles.push({
                        color: colors[c],
                        number: num,
                        isJoker: false,
                        isFakeJoker: false,
                        id: `${colors[c]}-${num}-${set}`
                    });
                }
            }
        }
        tiles.push({ color: 'Sahte', number: 0, isJoker: false, isFakeJoker: true, id: 'Sahte-1' });
        tiles.push({ color: 'Sahte', number: 0, isJoker: false, isFakeJoker: true, id: 'Sahte-2' });

        // Karıştır
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }

        // Gösterge ve Okey
        let indicator;
        do {
            indicator = tiles.pop();
        } while (indicator.isFakeJoker);

        const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;
        const okey = { color: indicator.color, number: okeyNumber };

        // Dağıtıcı (0. oyuncu) 22 taş, diğerleri 21 taş alır
        const currentPlayer = 0;
        const playerTiles = [[], [], [], []];
        for (let p = 0; p < 4; p++) {
            const count = (p === currentPlayer) ? 22 : 21;
            for (let k = 0; k < count; k++) {
                playerTiles[p].push(tiles.pop());
            }
        }

        return {
            tiles,
            indicator,
            okey,
            currentPlayer,
            playerTiles,
            discardPiles: [[], [], [], []],
            hasDrawn: true,
            tableGroups: [],
            playerStates: [
                { hasOpened: false, openType: null, openedGroups: [], openScore: 0 },
                { hasOpened: false, openType: null, openedGroups: [], openScore: 0 },
                { hasOpened: false, openType: null, openedGroups: [], openScore: 0 },
                { hasOpened: false, openType: null, openedGroups: [], openScore: 0 }
            ]
        };
    }

    listenRoom(roomId) {
        if (this.roomUnsub) this.roomUnsub();
        const roomRef = db.collection('okey_v2_rooms').doc(roomId);

        this.roomUnsub = roomRef.onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();

            this.trigger('playerJoined', {
                players: data.players || [],
                teamMode: data.teamMode || false
            });

            this.trigger('roomUpdate', {
                players: data.players || [],
                teamMode: data.teamMode,
                stackingMode: data.stackingMode,
                penaltyMode: data.penaltyMode,
                scores: data.scores || {}
            });

            const gameState = data.gameStateJson ? JSON.parse(data.gameStateJson) : data.gameState;

            if (data.gameStarted && gameState) {
                const myName = localStorage.getItem('okeyPlayerName');
                const myPlayer = (data.players || []).find(p => p.id === this.id || p.name === myName);
                const myIndex = myPlayer ? myPlayer.index : 0;

                this.trigger('gameStarted', {
                    players: data.players,
                    playerIndex: myIndex,
                    tiles: gameState.playerTiles[myIndex] || [],
                    indicator: gameState.indicator,
                    okey: gameState.okey,
                    currentPlayer: gameState.currentPlayer,
                    teamMode: data.teamMode,
                    scores: data.scores || {},
                    pileCount: gameState.tiles.length,
                    discardPiles: gameState.discardPiles,
                    tableGroups: gameState.tableGroups || [],
                    playerStates: gameState.playerStates || []
                });

                // Eğer sıra bot oyuncudaysa, bot hamlesini tetikle
                const currPlayerObj = data.players[gameState.currentPlayer];
                if (currPlayerObj && currPlayerObj.isBot && this.isHost) {
                    this.scheduleBotTurn(roomId, gameState.currentPlayer);
                }
            }
        }, err => {
            console.warn('Firestore room snapshot error:', err);
        });
    }

    scheduleBotTurn(roomId, botIndex) {
        if (this.botTimeout) clearTimeout(this.botTimeout);
        this.botTimeout = setTimeout(async () => {
            const roomRef = db.collection('okey_v2_rooms').doc(roomId);
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
            if (!gameState || gameState.currentPlayer !== botIndex) return;

            // 1. Taş çek (yığından)
            if (gameState.tiles.length > 0) {
                const drawn = gameState.tiles.pop();
                gameState.playerTiles[botIndex].push(drawn);
            }

            // 2. Rastgele bir taş at
            const hand = gameState.playerTiles[botIndex];
            if (hand && hand.length > 0) {
                const discarded = hand.pop();
                gameState.discardPiles[botIndex].push(discarded);
            }

            // 3. Sırayı sonraki oyuncuya geçir
            gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;
            gameState.hasDrawn = false;

            room.gameStateJson = JSON.stringify(gameState);
            await roomRef.set(room);
        }, 1600);
    }

    async handleDrawTile({ source }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (!gameState) return;

        const myName = localStorage.getItem('okeyPlayerName');
        const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
        if (!myPlayer || gameState.currentPlayer !== myPlayer.index) return;

        let drawnTile = null;
        if (source === 'pile' && gameState.tiles.length > 0) {
            drawnTile = gameState.tiles.pop();
        } else if (source === 'discard') {
            const prevPlayer = (myPlayer.index + 3) % 4;
            const pile = gameState.discardPiles[prevPlayer];
            if (pile && pile.length > 0) {
                drawnTile = pile.pop();
            }
        }

        if (drawnTile) {
            gameState.playerTiles[myPlayer.index].push(drawnTile);
            gameState.hasDrawn = true;
            room.gameStateJson = JSON.stringify(gameState);
            await roomRef.set(room);
        }
    }

    async handleDiscardTile({ tileIndex }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (!gameState) return;

        const myName = localStorage.getItem('okeyPlayerName');
        const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
        if (!myPlayer || gameState.currentPlayer !== myPlayer.index) return;

        const playerHand = gameState.playerTiles[myPlayer.index];
        const discarded = playerHand.splice(tileIndex, 1)[0];

        if (discarded) {
            gameState.discardPiles[myPlayer.index].push(discarded);
            gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;
            gameState.hasDrawn = false;
            room.gameStateJson = JSON.stringify(gameState);
            await roomRef.set(room);
        }
    }

    async handleOpenGroup({ groups }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (!gameState) return;

        const myName = localStorage.getItem('okeyPlayerName');
        const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
        if (!myPlayer) return;

        groups.forEach(g => {
            gameState.tableGroups.push({
                tiles: g,
                playerIndex: myPlayer.index
            });
        });

        gameState.playerStates[myPlayer.index].hasOpened = true;
        gameState.playerStates[myPlayer.index].openType = 'normal';
        room.gameStateJson = JSON.stringify(gameState);
        await roomRef.set(room);
    }

    async handleOpenPairs({ pairs }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (!gameState) return;

        const myName = localStorage.getItem('okeyPlayerName');
        const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
        if (!myPlayer) return;

        pairs.forEach(p => {
            gameState.tableGroups.push({
                tiles: p,
                playerIndex: myPlayer.index,
                isPair: true
            });
        });

        gameState.playerStates[myPlayer.index].hasOpened = true;
        gameState.playerStates[myPlayer.index].openType = 'pairs';
        room.gameStateJson = JSON.stringify(gameState);
        await roomRef.set(room);
    }

    async handleAddTileToGroup({ groupIndex, tile, position }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (!gameState || !gameState.tableGroups[groupIndex]) return;

        if (position === 'start') {
            gameState.tableGroups[groupIndex].tiles.unshift(tile);
        } else {
            gameState.tableGroups[groupIndex].tiles.push(tile);
        }
        room.gameStateJson = JSON.stringify(gameState);
        await roomRef.set(room);
    }

    async handleThrowTomato(data) {
        this.trigger('tomatoThrown', data);
    }

    async handleFinishGame(data) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = room.gameStateJson ? JSON.parse(room.gameStateJson) : room.gameState;
        if (gameState) {
            gameState.finished = true;
            gameState.winner = data;
            room.gameStateJson = JSON.stringify(gameState);
            await roomRef.set(room);
        }
    }

    async handleLeaveRoom() {
        if (this.roomUnsub) this.roomUnsub();
    }
}

// Global socket instance
window.io = function() {
    if (!window._firebaseSocketInstance) {
        window._firebaseSocketInstance = new FirebaseSocketAdapter();
    }
    return window._firebaseSocketInstance;
};
