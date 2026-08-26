// ============================================================
// 101 OKEY v2 — FIREBASE REALTIME ADAPTER & GAME ENGINE
// ============================================================

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyCXphC--uF5LLjEiBxD2pT2-UzGVcFXt34",
    authDomain: "burakdmrcoglu11.firebaseapp.com",
    projectId: "burakdmrcoglu11",
    storageBucket: "burakdmrcoglu11.firebasestorage.app",
    messagingSenderId: "406084996472",
    appId: "1:406084996472:web:d4f33f939c4825e2b3cc8d"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Client-side Socket Emulator over Firebase Firestore
class FirebaseSocketAdapter {
    constructor() {
        this.listeners = {};
        this.id = 'player_' + Math.random().toString(36).substr(2, 9);
        this.roomUnsub = null;
        this.currentRoom = 'MAIN';
        this.isHost = false;
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (event === 'joinGame') {
            this.handleJoinGame(data);
        } else if (event === 'drawTile') {
            this.handleDrawTile(data);
        } else if (event === 'discardTile') {
            this.handleDiscardTile(data);
        } else if (event === 'openGroup') {
            this.handleOpenGroup(data);
        } else if (event === 'openPairs') {
            this.handleOpenPairs(data);
        } else if (event === 'addTileToGroup') {
            this.handleAddTileToGroup(data);
        } else if (event === 'finishGame') {
            this.handleFinishGame(data);
        } else if (event === 'sortTiles') {
            this.handleSortTiles(data);
        } else if (event === 'leaveRoom') {
            this.handleLeaveRoom();
        } else if (event === 'reconnect') {
            this.handleReconnect(data);
        }
    }

    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    async handleJoinGame(data) {
        const { playerName, teamMode, stackingMode, penaltyMode, avatar, istaka, roomCode } = data;
        const targetRoom = roomCode || 'MAIN';
        this.currentRoom = targetRoom;

        const roomRef = db.collection('okey_v2_rooms').doc(targetRoom);
        
        try {
            const doc = await roomRef.get();
            let room = doc.exists ? doc.data() : {
                code: targetRoom,
                players: [],
                teamMode: !!teamMode,
                stackingMode: !!stackingMode,
                penaltyMode: !!penaltyMode,
                gameStarted: false,
                gameState: null,
                scores: {}
            };

            // Check if player exists
            let player = room.players.find(p => p.id === this.id || p.name === playerName);
            if (!player) {
                if (room.players.length >= 4 && !room.gameStarted) {
                    this.trigger('error', { message: 'Oda dolu!' });
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
                    team: teamMode ? (playerIndex % 2 === 0 ? 1 : 2) : null
                };
                room.players.push(player);
            }

            if (room.players.length === 1) {
                this.isHost = true;
                room.hostId = this.id;
            }

            // If 4 players, start the game
            if (room.players.length === 4 && !room.gameStarted) {
                room.gameStarted = true;
                room.gameState = this.initGameLogic(room.players);
            }

            await roomRef.set(room);
            this.listenRoom(targetRoom);
        } catch (err) {
            console.error('Join error:', err);
            this.trigger('error', { message: 'Bağlantı hatası!' });
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

        // Shuffle
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }

        // Indicator & Okey
        let indicator;
        do {
            indicator = tiles.pop();
        } while (indicator.isFakeJoker);

        const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;
        const okey = { color: indicator.color, number: okeyNumber };

        // Hands
        const currentPlayer = Math.floor(Math.random() * 4);
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

            // Trigger playerJoined / roomUpdate
            this.trigger('roomUpdate', {
                players: data.players,
                teamMode: data.teamMode,
                stackingMode: data.stackingMode,
                penaltyMode: data.penaltyMode,
                scores: data.scores
            });

            if (data.gameStarted && data.gameState) {
                const myPlayer = data.players.find(p => p.id === this.id || p.name === localStorage.getItem('okeyPlayerName'));
                const myIndex = myPlayer ? myPlayer.index : 0;

                this.trigger('gameStarted', {
                    players: data.players,
                    playerIndex: myIndex,
                    tiles: data.gameState.playerTiles[myIndex] || [],
                    indicator: data.gameState.indicator,
                    okey: data.gameState.okey,
                    currentPlayer: data.gameState.currentPlayer,
                    teamMode: data.teamMode,
                    scores: data.scores,
                    pileCount: data.gameState.tiles.length,
                    discardPiles: data.gameState.discardPiles,
                    tableGroups: data.gameState.tableGroups,
                    playerStates: data.gameState.playerStates
                });
            }
        });
    }

    async handleDrawTile({ source }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        if (!room.gameState) return;

        const myPlayer = room.players.find(p => p.id === this.id || p.name === localStorage.getItem('okeyPlayerName'));
        if (!myPlayer || room.gameState.currentPlayer !== myPlayer.index) return;

        let drawnTile = null;
        if (source === 'pile' && room.gameState.tiles.length > 0) {
            drawnTile = room.gameState.tiles.pop();
        } else if (source === 'discard') {
            const prevPlayer = (myPlayer.index + 3) % 4;
            const pile = room.gameState.discardPiles[prevPlayer];
            if (pile && pile.length > 0) {
                drawnTile = pile.pop();
            }
        }

        if (drawnTile) {
            room.gameState.playerTiles[myPlayer.index].push(drawnTile);
            room.gameState.hasDrawn = true;
            await roomRef.update({ gameState: room.gameState });
        }
    }

    async handleDiscardTile({ tileIndex }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        if (!room.gameState) return;

        const myPlayer = room.players.find(p => p.id === this.id || p.name === localStorage.getItem('okeyPlayerName'));
        if (!myPlayer || room.gameState.currentPlayer !== myPlayer.index) return;

        const playerHand = room.gameState.playerTiles[myPlayer.index];
        const discarded = playerHand.splice(tileIndex, 1)[0];

        if (discarded) {
            room.gameState.discardPiles[myPlayer.index].push(discarded);
            room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % 4;
            room.gameState.hasDrawn = false;
            await roomRef.update({ gameState: room.gameState });
        }
    }

    async handleOpenGroup({ groups }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        if (!room.gameState) return;

        const myPlayer = room.players.find(p => p.id === this.id || p.name === localStorage.getItem('okeyPlayerName'));
        if (!myPlayer) return;

        groups.forEach(g => {
            room.gameState.tableGroups.push({
                tiles: g,
                playerIndex: myPlayer.index
            });
        });

        room.gameState.playerStates[myPlayer.index].hasOpened = true;
        room.gameState.playerStates[myPlayer.index].openType = 'normal';
        await roomRef.update({ gameState: room.gameState });
    }

    async handleOpenPairs({ pairs }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        if (!room.gameState) return;

        const myPlayer = room.players.find(p => p.id === this.id || p.name === localStorage.getItem('okeyPlayerName'));
        if (!myPlayer) return;

        pairs.forEach(p => {
            room.gameState.tableGroups.push({
                tiles: p,
                playerIndex: myPlayer.index,
                isPair: true
            });
        });

        room.gameState.playerStates[myPlayer.index].hasOpened = true;
        room.gameState.playerStates[myPlayer.index].openType = 'pairs';
        await roomRef.update({ gameState: room.gameState });
    }

    async handleAddTileToGroup({ groupIndex, tile, position }) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        const doc = await roomRef.get();
        if (!doc.exists) return;
        const room = doc.data();
        if (!room.gameState || !room.gameState.tableGroups[groupIndex]) return;

        if (position === 'start') {
            room.gameState.tableGroups[groupIndex].tiles.unshift(tile);
        } else {
            room.gameState.tableGroups[groupIndex].tiles.push(tile);
        }
        await roomRef.update({ gameState: room.gameState });
    }

    async handleFinishGame(data) {
        const roomRef = db.collection('okey_v2_rooms').doc(this.currentRoom);
        await roomRef.update({ 'gameState.finished': true, 'gameState.winner': data });
    }

    async handleSortTiles({ tiles }) {
        // Local slot sync
    }

    async handleLeaveRoom() {
        if (this.roomUnsub) this.roomUnsub();
    }

    async handleReconnect(data) {
        this.handleJoinGame(data);
    }
}

// Global socket replacement
window.io = function() {
    if (!window._firebaseSocketInstance) {
        window._firebaseSocketInstance = new FirebaseSocketAdapter();
    }
    return window._firebaseSocketInstance;
};
