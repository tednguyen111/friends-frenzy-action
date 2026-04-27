const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map();

function generateRoomId() {
    let id; do { id = Math.random().toString(36).substring(2, 8).toUpperCase(); } while(rooms.has(id)); return id;
}

function createRoomState(roomId) {
    return {
        id: roomId, phase: 'WAITING', players: [], decks: { action: [] }, discardPile: [],
        isResolving: false, selectedActions: {}, lastRoundWinners: [],
        logs: [`📢 Phòng [${roomId}] đã tạo (Chế độ Action-Only)!`],
        phaseTimer: null, phaseInterval: null, timerSeconds: 0, botThinking: {}
    };
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function initGame(room) {
    let actionDeck = [];
    ['Punch', 'Hug', 'Drink'].forEach(type => { for (let i = 0; i < 13; i++) actionDeck.push(type); });
    actionDeck.push('BFF');

    room.decks.action = shuffle(actionDeck);
    room.discardPile = []; room.selectedActions = {}; room.isResolving = false; room.phase = 'WAITING';

    room.players.forEach(p => {
        p.hand = { action: [] }; p.scoredZone = []; p.status = { hasWon: false };
        drawCards(room, p, 3);
    });
    room.logs.push('🃏 Đã chia 3 thẻ Hành động cho mỗi người!');
}

function drawCards(room, player, count) {
    for (let i = 0; i < count; i++) {
        if (room.decks.action.length === 0) {
            room.decks.action = shuffle([...room.discardPile]); room.discardPile = [];
        }
        if (room.decks.action.length > 0) player.hand.action.push(room.decks.action.pop());
    }
}

function getSanitizedState(room, targetPlayerId) {
    const { phaseTimer, phaseInterval, ...safeRoom } = room;
    const state = JSON.parse(JSON.stringify(safeRoom));

    state.players.forEach(player => { player.handCount = { action: player.hand?.action?.length || 0 }; });

    if (state.phase !== 'REVEAL' && state.phase !== 'GAME_OVER') {
        for (let pid in state.selectedActions) {
            if (pid !== targetPlayerId) state.selectedActions[pid] = "HIDDEN"; 
        }
    }
    return state;
}

function broadcastStateToPlayers(room) {
    room.players.forEach(player => {
        if (!player.isBot && player.socketId) io.to(player.socketId).emit('gameState', getSanitizedState(room, player.id));
    });
}

function startPhaseTimer(room, duration, callback) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.phaseInterval) clearInterval(room.phaseInterval);
    
    room.timerSeconds = duration / 1000;
    room.phaseInterval = setInterval(() => {
        room.timerSeconds--;
        io.to(room.id).emit('timerUpdate', room.timerSeconds);
        if (room.timerSeconds <= 0) clearInterval(room.phaseInterval);
    }, 1000);

    room.phaseTimer = setTimeout(() => { clearInterval(room.phaseInterval); callback(); }, duration);
}

function startNewRound(room) {
    room.selectedActions = {}; room.phase = 'ACTION';
    room.logs.push("⏳ ACTION PHASE: Hãy chọn lá bài bạn muốn úp!");
    broadcastStateToPlayers(room);
    startPhaseTimer(room, 15000, () => {
        room.players.forEach(p => {
            if (!room.selectedActions[p.id] && p.hand.action.length > 0) handleSelectAction(room, p.id, 0);
        });
    });
}

function handleSelectAction(room, playerId, cardIndex) {
    if (room.phase !== 'ACTION' || room.isResolving) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player || player.status.hasWon) return; 

    const cardName = player.hand.action[cardIndex];
    if (!cardName || room.selectedActions[playerId]) return;

    player.hand.action.splice(cardIndex, 1);
    room.selectedActions[playerId] = cardName;
    room.logs.push(`🔒 Player ${playerId} đã úp bài xong.`);
    broadcastStateToPlayers(room); 

    const activePlayers = room.players.filter(p => !p.status.hasWon);
    if (Object.keys(room.selectedActions).length === activePlayers.length) {
        if (room.phaseTimer) clearTimeout(room.phaseTimer);
        if (room.phaseInterval) clearInterval(room.phaseInterval);
        room.logs.push("✅ Tất cả đã úp bài! Tiến hành LẬT BÀI.");
        setTimeout(() => resolveRound(room), 1000);
    }
}

function checkWinCondition(room) {
    let winners = [];
    room.players.forEach(player => {
        const counts = { Punch: 0, Hug: 0, Drink: 0, BFF: 0 };
        player.scoredZone.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
        const has4Same = Object.values(counts).some(c => c >= 4);
        const has4Diff = Object.values(counts).filter(c => c > 0).length >= 4; 
        const hasSpecialCombo = counts.Hug >= 2 && counts.Drink >= 2 && counts.Punch >= 2;
        if (has4Same || has4Diff || hasSpecialCombo) winners.push(player.id);
    });
    return winners;
}

function resolveRound(room) {
    if (room.isResolving) return; 
    room.isResolving = true; room.phase = 'REVEAL';

    const activeIds = Object.keys(room.selectedActions);
    if (activeIds.length === 0) { finalizeAndContinue(room); return; }

    const actionCounts = {};
    activeIds.forEach(pid => { 
        const act = room.selectedActions[pid]; 
        actionCounts[act] = (actionCounts[act] || 0) + 1; 
    });

    const targetCount = Math.min(...Object.values(actionCounts));
    const winningActions = Object.keys(actionCounts).filter(a => actionCounts[a] === targetCount);

    let winnersThisRound = [], losersThisRound = [];
    const isTie = winningActions.length > 1 && targetCount > 1;

    if (!isTie) {
        activeIds.forEach(pid => {
            const playerAct = room.selectedActions[pid];
            if (winningActions.includes(playerAct)) {
                room.players.find(p => p.id === pid).scoredZone.push(playerAct);
                winnersThisRound.push(pid);
            } else losersThisRound.push(pid);
        });

        if (winnersThisRound.length > 0) {
            room.logs.push(`🏆 Chúc mừng: ${winnersThisRound.join(', ')} đã thắng round này!`);
            const firstWinAct = room.selectedActions[winnersThisRound[0]];
            if (['Hug', 'Punch', 'Drink'].includes(firstWinAct)) {
                io.to(room.id).emit('socialEvent', { action: firstWinAct, winners: winnersThisRound, losers: losersThisRound });
            }
        }
    } else {
        activeIds.forEach(pid => losersThisRound.push(pid));
        room.logs.push(`⚖️ HÒA! Tất cả thẻ bị hủy!`);
    }
    
    finalizeAndContinue(room);
}

function finalizeAndContinue(room) {
    const currentWinners = checkWinCondition(room);
    currentWinners.forEach(wid => {
        const p = room.players.find(x => x.id === wid);
        if (p) p.status.hasWon = true; 
    });

    for (let pid in room.selectedActions) room.discardPile.push(room.selectedActions[pid]);

    room.players.forEach(p => { if (!p.status.hasWon) drawCards(room, p, 3 - p.hand.action.length); });
    broadcastStateToPlayers(room);

    const winners = room.players.filter(p => p.status.hasWon);
    if (winners.length >= 1) {
        room.phase = 'GAME_OVER'; room.isResolving = false;
        room.logs.push(`🏆 GAME OVER! Người chiến thắng: ${winners.map(w => w.id).join(', ')}`);
        broadcastStateToPlayers(room);
    } else {
        setTimeout(() => { room.isResolving = false; startNewRound(room); }, 5000);
    }
}

// BOTS AUTO-PLAY ACTIONS ONLY
setInterval(() => {
    rooms.forEach(room => {
        if (room.isResolving || room.phase !== 'ACTION') return;
        const bots = room.players.filter(p => p.isBot && !p.status.hasWon);
        bots.forEach(bot => {
            if (room.botThinking[bot.id] || room.selectedActions[bot.id] || bot.hand.action.length === 0) return;
            room.botThinking[bot.id] = true;
            setTimeout(() => {
                if (room.phase === 'ACTION') handleSelectAction(room, bot.id, Math.floor(Math.random() * bot.hand.action.length));
                room.botThinking[bot.id] = false;
            }, 1500 + Math.random() * 2000);
        });
    });
}, 1000);

io.on('connection', (socket) => {
    socket.on('createRoom', (data) => {
        const roomId = generateRoomId(); const room = createRoomState(roomId); rooms.set(roomId, room);
        room.players = ['A', 'B', 'C', 'D'].map(id => ({
            id, socketId: null, isBot: true, name: `Bot ${id}`, hand: {action:[]}, scoredZone: [], status: {hasWon: false}
        }));
        room.players[0].isBot = false; room.players[0].socketId = socket.id; room.players[0].name = data.playerName;
        socket.join(roomId); socket.roomId = roomId; socket.playerId = 'A';
        socket.emit('roomJoined', { roomId }); socket.emit('assignId', 'A');
        broadcastStateToPlayers(room);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) { socket.emit('lobbyError', 'Mã phòng không tồn tại!'); return; }
        const availableSlot = room.players.find(p => p.isBot);
        if (!availableSlot) { socket.emit('lobbyError', 'Phòng đã đủ 4 người!'); return; }
        availableSlot.isBot = false; availableSlot.socketId = socket.id; availableSlot.name = data.playerName;
        socket.join(room.id); socket.roomId = room.id; socket.playerId = availableSlot.id;
        socket.emit('roomJoined', { roomId: room.id }); socket.emit('assignId', availableSlot.id);
        broadcastStateToPlayers(room);
    });

    socket.on('reconnectUser', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) { socket.emit('clearSession'); return; }
        const player = room.players.find(p => p.id === data.playerId);
        if (!player) { socket.emit('clearSession'); return; }
        player.isBot = false; player.socketId = socket.id;
        socket.join(room.id); socket.roomId = room.id; socket.playerId = player.id;
        socket.emit('roomJoined', { roomId: room.id }); socket.emit('assignId', player.id);
        broadcastStateToPlayers(room);
    });

    socket.on('playAction', (data) => {
        const room = rooms.get(socket.roomId); if (room) handleSelectAction(room, socket.playerId, data.cardIndex);
    });

    socket.on('taunt', () => { if (socket.roomId && socket.playerId) io.to(socket.roomId).emit('playerTaunt', socket.playerId); });
    socket.on('sendChat', (msg) => { if (socket.roomId && socket.playerId) io.to(socket.roomId).emit('playerChat', { playerId: socket.playerId, msg }); });
    socket.on('throwEmoji', (data) => { if (socket.roomId && socket.playerId) io.to(socket.roomId).emit('emojiThrown', { fromId: socket.playerId, toId: data.targetId, emoji: data.emoji }); });

    socket.on('startGame', () => {
        const room = rooms.get(socket.roomId);
        if (room) { initGame(room); startNewRound(room); broadcastStateToPlayers(room); }
    });
    socket.on('requestState', () => {
        const room = rooms.get(socket.roomId); if (room && socket.playerId) socket.emit('gameState', getSanitizedState(room, socket.playerId));
    });
    socket.on('surrender', () => {
        const room = rooms.get(socket.roomId);
        if (room && socket.playerId) {
            const p = room.players.find(x => x.id === socket.playerId);
            if (p && !p.isBot) { p.isBot = true; p.socketId = null; p.name = `Bot ${p.id}`; broadcastStateToPlayers(room); }
        }
    });
    socket.on('disconnect', () => {
        const room = rooms.get(socket.roomId);
        if (room && socket.playerId) {
            const p = room.players.find(x => x.id === socket.playerId);
            if (p) { p.isBot = true; p.socketId = null; p.name = `Bot ${p.id}`; broadcastStateToPlayers(room); }
        }
    });
});

const PORT = process.env.PORT || 1111;
server.listen(PORT, () => console.log(`✅ Máy chủ Action-Only chạy tại port: ${PORT}`));