// ============================================================
// 101 OKEY v2 — GERÇEK ZAMANLI MULTIPLAYER FIREBASE ADAPTÖRÜ
// Bot sistemi TAMAMEN KALDIRILMIŞTIR.
// Sadece odaya katılan gerçek oyuncular birlikte oynar.
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyBqNscnlBWW8BKvtv4SXqyqAajlurFdOZ8",
    authDomain: "renksitesi.firebaseapp.com",
    projectId: "renksitesi",
    storageBucket: "renksitesi.firebasestorage.app",
    messagingSenderId: "504044698335",
    appId: "1:504044698335:web:fb630d11ea52c3de9f876a",
    measurementId: "G-97TSCB6QV6"
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
        this.gameStartedEver = false;
        this.lastProcessedActionId = null;

        setTimeout(() => {
            this.trigger('connect', {});
            this.listenRoomsList();
        }, 50);
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        if (!callback) {
            delete this.listeners[event];
        } else {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
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
                this.handleStartGame(data);
                break;
            case 'drawTile':
                this.handleDrawTile(data);
                break;
            case 'drawFromDiscard':
                this.handleDrawTile({ fromDiscard: true });
                break;
            case 'discardTile':
                this.handleDiscardTile(data);
                break;
            case 'openHand':
            case 'openGroup':
            case 'openGroups':
                this.handleOpenHand(data);
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
            case 'sortTiles':
                this.handleSortTiles(data);
                break;
            case 'throwTomato':
                this.handleThrowTomato(data);
                break;
            case 'newRound':
                this.handleNewRound(data);
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
        this.gameStartedEver = false;
        this.lastProcessedActionId = null;

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
            lastAction: null,
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
        this.gameStartedEver = false;
        this.lastProcessedActionId = null;

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
                lastAction: null,
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
            } else {
                this.isHost = (room.hostId === this.id);
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
        this.currentRoom = targetRoom;
        this.listenRoom(targetRoom);
    }

    // Oyunu Başlat — SADECE GERÇEK OYUNCULARLA, SIFIR BOT
    async handleStartGame(data) {
        const targetRoom = data?.roomCode || this.currentRoom || 'MAIN';
        const roomRef = db.collection('okey_v2_rooms').doc(targetRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) {
                this.trigger('error', { message: 'Masa bulunamadı!' });
                return;
            }

            const room = doc.data();
            const realPlayers = (room.players || []).filter(p => !p.isBot);

            if (realPlayers.length < 2) {
                this.trigger('error', { message: 'Oyunu başlatmak için masada en az 2 gerçek oyuncu olmalıdır!' });
                return;
            }

            // Pozisyonları ve indeksleri netleştir
            const positions = ['bottom', 'right', 'top', 'left'];
            realPlayers.forEach((p, idx) => {
                p.index = idx;
                p.position = positions[idx];
                if (room.teamMode) {
                    p.team = (idx % 2 === 0 ? 1 : 2);
                }
            });
            room.players = realPlayers;

            // Oyun mantığını kur
            const gameState = this.initGameLogic(realPlayers);
            room.gameStarted = true;
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: 'start_' + Date.now(),
                type: 'gameStartedSync',
                payload: {},
                timestamp: Date.now()
            };

            await roomRef.set(room);
            console.log('[GAME STARTED] Gerçek oyuncularla oyun başarıyla başlatıldı!');
        } catch (e) {
            console.error('handleStartGame error:', e);
            this.trigger('error', { message: 'Oyun başlatılırken hata oluştu!' });
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

        // Gösterge ve Okey belirleme
        let indicator;
        do {
            indicator = tiles.pop();
        } while (indicator.isFakeJoker);

        const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;
        const okey = { color: indicator.color, number: okeyNumber };

        // Dağıtıcı (0. oyuncu) 22 taş, diğerleri 21 taş alır
        const currentPlayer = 0;
        const playerCount = players.length;
        const playerTiles = [];
        const discardPiles = [];
        const playerStates = [];

        for (let p = 0; p < playerCount; p++) {
            playerTiles.push([]);
            discardPiles.push([]);
            playerStates.push({
                hasOpened: false,
                openType: null,
                openedGroups: [],
                openScore: 0,
                mustOpenThisTurn: false,
                drawnFromDiscardTile: null
            });

            const count = (p === currentPlayer) ? 22 : 21;
            for (let k = 0; k < count; k++) {
                if (tiles.length > 0) {
                    playerTiles[p].push(tiles.pop());
                }
            }
        }

        return {
            tiles,
            indicator,
            okey,
            currentPlayer,
            playerTiles,
            discardPiles,
            hasDrawn: true, // İlk başlayan oyuncu zaten 22 taş aldı
            tableGroups: [],
            playerStates,
            minimumOpenScore: 101
        };
    }

    listenRoom(roomId) {
        if (this.roomUnsub) this.roomUnsub();
        const roomRef = db.collection('okey_v2_rooms').doc(roomId);

        this.roomUnsub = roomRef.onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();

            // Lobi / Oyuncu listesi güncellemesi
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

            if (!data.gameStarted || !data.gameStateJson) {
                this.gameStartedEver = false;
                return;
            }

            const gameState = JSON.parse(data.gameStateJson);
            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = (data.players || []).find(p => p.id === this.id || p.name === myName);
            const myIndex = myPlayer ? myPlayer.index : 0;

            // Oyun ilk kez başladığında tam initialize et
            if (!this.gameStartedEver) {
                this.gameStartedEver = true;
                this.lastProcessedActionId = data.lastAction?.id || null;

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
                    discardPiles: gameState.discardPiles || [],
                    tableGroups: gameState.tableGroups || [],
                    playerStates: gameState.playerStates || []
                });
                return;
            }

            // Son hamle aksiyonu varsa (incremental update)
            if (data.lastAction && data.lastAction.id !== this.lastProcessedActionId) {
                this.lastProcessedActionId = data.lastAction.id;
                const { type, payload } = data.lastAction;

                if (type === 'tileDiscarded') {
                    this.trigger('tileDiscarded', payload);
                } else if (type === 'tileDrawn') {
                    // Sadece çeken oyuncu tileDrawn alsın
                    if (payload.playerIndex === myIndex) {
                        this.trigger('tileDrawn', {
                            tile: payload.tile,
                            fromDiscard: payload.fromDiscard,
                            mustOpenHand: payload.mustOpenHand
                        });
                    } else {
                        // Diğer oyuncular taş sayısını güncellesin
                        this.trigger('playerDrewTile', {
                            playerIndex: payload.playerIndex,
                            fromDiscard: payload.fromDiscard,
                            tileCount: payload.tileCount
                        });
                    }
                } else if (type === 'handOpened') {
                    this.trigger('handOpened', payload);
                } else if (type === 'pairsOpened') {
                    this.trigger('pairsOpened', payload);
                } else if (type === 'groupUpdated') {
                    this.trigger('groupUpdated', payload);
                } else if (type === 'gameFinished') {
                    this.trigger('gameFinished', payload);
                } else if (type === 'penaltyApplied') {
                    this.trigger('penaltyApplied', payload);
                } else if (type === 'tomatoThrown') {
                    this.trigger('tomatoThrown', payload);
                    if (payload.targetPlayerIndex === myIndex) {
                        this.trigger('tomatoHit', payload);
                    }
                }

                // Deste taş sayısını güncelle
                if (gameState.tiles) {
                    this.trigger('pileUpdate', { count: gameState.tiles.length });
                }
            }
        }, err => {
            console.warn('Firestore room snapshot error:', err);
        });
    }

    // Taş Çekme: Yığından veya Yerden (Yandan)
    async handleDrawTile(data) {
        const isFromDiscard = data?.fromDiscard === true || data?.source === 'discard';
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (!myPlayer || gameState.currentPlayer !== myPlayer.index) {
                this.trigger('error', { message: 'Sıra sizde değil!' });
                return;
            }

            if (gameState.hasDrawn) {
                this.trigger('error', { message: 'Zaten taş çektiniz!' });
                return;
            }

            const numPlayers = room.players.length;
            let drawnTile = null;
            let mustOpenHand = false;

            if (isFromDiscard) {
                // Solundaki oyuncunun attığı son taşı çek
                const prevPlayer = (myPlayer.index - 1 + numPlayers) % numPlayers;
                const pile = gameState.discardPiles[prevPlayer];
                if (!pile || pile.length === 0) {
                    this.trigger('error', { message: 'Yerde çekilecek taş yok!' });
                    return;
                }
                drawnTile = pile.pop();
                mustOpenHand = true; // 101 kuralı: Yerden taş alan oyuncu bu el açmak ZORUNDADIR!
                gameState.playerStates[myPlayer.index].drawnFromDiscardTile = drawnTile;
                gameState.playerStates[myPlayer.index].mustOpenThisTurn = true;
            } else {
                // Yığından çek
                if (!gameState.tiles || gameState.tiles.length === 0) {
                    this.trigger('error', { message: 'Destede taş kalmadı!' });
                    return;
                }
                drawnTile = gameState.tiles.pop();
            }

            if (!drawnTile) return;

            gameState.playerTiles[myPlayer.index].push(drawnTile);
            gameState.hasDrawn = true;

            const actionId = 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: actionId,
                type: 'tileDrawn',
                payload: {
                    playerIndex: myPlayer.index,
                    tile: drawnTile,
                    fromDiscard: isFromDiscard,
                    mustOpenHand: mustOpenHand,
                    tileCount: gameState.playerTiles[myPlayer.index].length
                },
                timestamp: Date.now()
            };

            await roomRef.set(room);
        } catch (err) {
            console.error('handleDrawTile error:', err);
        }
    }

    // Taş Atma
    async handleDiscardTile({ tileIndex }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (!myPlayer || gameState.currentPlayer !== myPlayer.index) {
                this.trigger('error', { message: 'Sıra sizde değil!' });
                return;
            }

            if (!gameState.hasDrawn) {
                this.trigger('error', { message: 'Önce taş çekmelisiniz!' });
                return;
            }

            // Yerden taş aldıysa ve el açmadıysa ceza kontrolü
            const pState = gameState.playerStates[myPlayer.index];
            if (pState.mustOpenThisTurn && !pState.hasOpened) {
                // 101 kuralı: Yerden taş alıp açamayan oyuncuya 101 ceza puanı verilir
                if (room.scores) {
                    const sc = room.scores[myPlayer.name] || 0;
                    room.scores[myPlayer.name] = sc + 101;
                }
                this.trigger('penaltyApplied', {
                    playerIndex: myPlayer.index,
                    playerName: myPlayer.name,
                    reason: 'Yerden taş alıp el açamadı!',
                    penalty: 101,
                    scores: room.scores || {}
                });
            }

            const playerHand = gameState.playerTiles[myPlayer.index];
            const discarded = playerHand.splice(tileIndex, 1)[0];
            if (!discarded) return;

            gameState.discardPiles[myPlayer.index].push(discarded);

            const numPlayers = room.players.length;
            const nextPlayer = (myPlayer.index + 1) % numPlayers;
            gameState.currentPlayer = nextPlayer;
            gameState.hasDrawn = false;
            pState.mustOpenThisTurn = false;
            pState.drawnFromDiscardTile = null;

            // Bitirme kontrolü (Elde taş kalmadıysa)
            if (playerHand.length === 0) {
                this.finishGameLogic(room, gameState, myPlayer.index, false);
                return;
            }

            const actionId = 'discard_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: actionId,
                type: 'tileDiscarded',
                payload: {
                    playerIndex: myPlayer.index,
                    tile: discarded,
                    nextPlayer: nextPlayer,
                    leftDiscard: discarded,
                    tileCount: playerHand.length
                },
                timestamp: Date.now()
            };

            await roomRef.set(room);
        } catch (err) {
            console.error('handleDiscardTile error:', err);
        }
    }

    // El Açma (Seri / Perler ile 101+ puan)
    async handleOpenHand(data) {
        const { groups, score } = data;
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (!myPlayer) return;

            const playerHand = gameState.playerTiles[myPlayer.index];
            const openedGroups = groups.map(groupIndices => {
                return groupIndices.map(idx => playerHand[idx]).filter(Boolean);
            });

            // Açılan taşları elden çıkar (büyük indeksten küçüğe doğru)
            const allIndices = groups.flat().sort((a, b) => b - a);
            allIndices.forEach(idx => {
                playerHand.splice(idx, 1);
            });

            // Masa açık gruplarına ekle
            openedGroups.forEach(g => {
                gameState.tableGroups.push({
                    tiles: g,
                    playerIndex: myPlayer.index
                });
            });

            gameState.playerStates[myPlayer.index].hasOpened = true;
            gameState.playerStates[myPlayer.index].openType = 'normal';
            gameState.playerStates[myPlayer.index].openScore = score;
            gameState.playerStates[myPlayer.index].openedGroups = openedGroups;
            gameState.playerStates[myPlayer.index].mustOpenThisTurn = false;

            // Katlamalı modda bir sonraki açma için barajı güncelle
            if (room.stackingMode) {
                gameState.minimumOpenScore = score + 1;
            }

            const actionId = 'open_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: actionId,
                type: 'handOpened',
                payload: {
                    playerIndex: myPlayer.index,
                    playerName: myPlayer.name,
                    openedGroups: openedGroups,
                    score: score,
                    tileCount: playerHand.length,
                    remainingTiles: playerHand,
                    minimumOpenScore: gameState.minimumOpenScore
                },
                timestamp: Date.now()
            };

            await roomRef.set(room);
        } catch (err) {
            console.error('handleOpenHand error:', err);
        }
    }

    // Çift Açma (En az 5 çift)
    async handleOpenPairs(data) {
        const { pairs } = data;
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (!myPlayer) return;

            const playerHand = gameState.playerTiles[myPlayer.index];
            const openedPairs = pairs.map(pairIndices => {
                return pairIndices.map(idx => playerHand[idx]).filter(Boolean);
            });

            // Taşları elden çıkar
            const allIndices = pairs.flat().sort((a, b) => b - a);
            allIndices.forEach(idx => {
                playerHand.splice(idx, 1);
            });

            openedPairs.forEach(p => {
                gameState.tableGroups.push({
                    tiles: p,
                    playerIndex: myPlayer.index,
                    isPair: true
                });
            });

            gameState.playerStates[myPlayer.index].hasOpened = true;
            gameState.playerStates[myPlayer.index].openType = 'pairs';
            gameState.playerStates[myPlayer.index].mustOpenThisTurn = false;

            const actionId = 'pairs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: actionId,
                type: 'pairsOpened',
                payload: {
                    playerIndex: myPlayer.index,
                    playerName: myPlayer.name,
                    pairsCount: openedPairs.length,
                    tileCount: playerHand.length,
                    pairs: openedPairs
                },
                timestamp: Date.now()
            };

            await roomRef.set(room);
        } catch (err) {
            console.error('handleOpenPairs error:', err);
        }
    }

    // Açılmış Sete Taş İşleme (İşler Taş)
    async handleAddTileToGroup(data) {
        const { groupIndex, targetPlayerIndex, position, tileIndex, tile } = data;
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);

        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (!myPlayer) return;

            const playerHand = gameState.playerTiles[myPlayer.index];
            const targetGroup = gameState.tableGroups[groupIndex];
            if (!targetGroup) return;

            // Taşı elden çıkar
            playerHand.splice(tileIndex, 1);

            // Gruba ekle
            if (position === 'left' || position === 'start') {
                targetGroup.tiles.unshift(tile);
            } else {
                targetGroup.tiles.push(tile);
            }

            const actionId = 'groupUp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: actionId,
                type: 'groupUpdated',
                payload: {
                    group: targetGroup,
                    groupIndex: groupIndex,
                    targetPlayerIndex: targetPlayerIndex,
                    playerIndex: myPlayer.index,
                    tileIndices: [tileIndex],
                    playerTileCount: playerHand.length
                },
                timestamp: Date.now()
            };

            await roomRef.set(room);
        } catch (err) {
            console.error('handleAddTileToGroup error:', err);
        }
    }

    // Oyunu Bitirme Mantığı ve Skor Hesaplama
    async finishGameLogic(room, gameState, winnerIndex, isOkeyFinish) {
        const winner = room.players[winnerIndex];
        const numPlayers = room.players.length;
        const points = new Array(numPlayers).fill(0);

        if (!room.scores) room.scores = {};

        for (let i = 0; i < numPlayers; i++) {
            const p = room.players[i];
            const pHand = gameState.playerTiles[i] || [];
            const pState = gameState.playerStates[i] || {};

            if (i === winnerIndex) {
                // Kazanan: -101 puan (veya okeyle bitirildiyse -202)
                points[i] = isOkeyFinish ? -202 : -101;
            } else if (!pState.hasOpened) {
                // El açamayan ceza: 202 puan (okeyle bittiyse 404)
                points[i] = isOkeyFinish ? 404 : 202;
            } else {
                // El açan kalan taşlarının toplamı kadar ceza alır
                let sum = 0;
                pHand.forEach(t => { sum += (t.number || 0); });
                points[i] = isOkeyFinish ? sum * 2 : sum;
            }

            // Toplam skora ekle
            const prev = room.scores[p.name] || 0;
            room.scores[p.name] = prev + points[i];
        }

        gameState.finished = true;
        room.gameStateJson = JSON.stringify(gameState);
        room.lastAction = {
            id: 'finish_' + Date.now(),
            type: 'gameFinished',
            payload: {
                winner: winnerIndex,
                winnerName: winner ? winner.name : 'Oyuncu',
                isOkeyFinish: !!isOkeyFinish,
                points: points,
                scores: room.scores,
                teamMode: room.teamMode
            },
            timestamp: Date.now()
        };

        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        await roomRef.set(room);
    }

    async handleFinishGame(data) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        const gameState = JSON.parse(room.gameStateJson);

        const myName = localStorage.getItem('okeyPlayerName');
        const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
        if (!myPlayer) return;

        await this.finishGameLogic(room, gameState, myPlayer.index, data?.isOkeyFinish);
    }

    async handleSortTiles(data) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const gameState = JSON.parse(room.gameStateJson);

            const myName = localStorage.getItem('okeyPlayerName');
            const myPlayer = room.players.find(p => p.id === this.id || p.name === myName);
            if (myPlayer && gameState.playerTiles[myPlayer.index]) {
                gameState.playerTiles[myPlayer.index] = data.tiles;
                room.gameStateJson = JSON.stringify(gameState);
                await roomRef.set(room);
            }
        } catch (e) {}
    }

    async handleThrowTomato(data) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();

            room.lastAction = {
                id: 'tomato_' + Date.now(),
                type: 'tomatoThrown',
                payload: data,
                timestamp: Date.now()
            };
            await roomRef.set(room);
        } catch (e) {}
    }

    async handleNewRound() {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const realPlayers = room.players || [];

            const gameState = this.initGameLogic(realPlayers);
            this.gameStartedEver = false;
            room.gameStateJson = JSON.stringify(gameState);
            room.lastAction = {
                id: 'newround_' + Date.now(),
                type: 'gameStartedSync',
                payload: {},
                timestamp: Date.now()
            };
            await roomRef.set(room);
        } catch (e) {}
    }

    async handleLeaveRoom() {
        if (this.roomUnsub) this.roomUnsub();
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        try {
            const doc = await roomRef.get();
            if (!doc.exists) return;
            const room = doc.data();
            const updated = (room.players || []).filter(p => p.id !== this.id);
            if (updated.length === 0) {
                await roomRef.delete();
            } else {
                let newHost = room.hostId;
                if (room.hostId === this.id) {
                    newHost = updated[0].id;
                }
                await roomRef.update({ players: updated, hostId: newHost });
            }
        } catch (e) {}
    }
}

// Global socket instance
window.io = function() {
    if (!window._firebaseSocketInstance) {
        window._firebaseSocketInstance = new FirebaseSocketAdapter();
    }
    return window._firebaseSocketInstance;
};
