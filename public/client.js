const socket = io();
let myId = null; 

// --- AUDIO SYSTEM ---
const SFX = {
    play: new Audio('audio/card-play.mp3'),
    hit: new Audio('audio/explosion.mp3'),
    win: new Audio('audio/win.mp3'),
    bgm: new Audio('audio/bgm.mp3')
};
SFX.bgm.loop = true;
SFX.bgm.volume = 0.2;
let isBgmMuted = true;
let isSfxMuted = true;

function playSound(sound) {
    if (sound === 'bgm') return;
    if (SFX[sound] && !isSfxMuted) {
        const snd = SFX[sound].cloneNode();
        snd.volume = SFX[sound].volume || 1;
        snd.play().catch(e => {});
    }
}

// --- ELO SYSTEM ---
let myElo = parseInt(localStorage.getItem('ff_elo')) || 1000;
function updateEloDisplay() {
    const rankEl = document.getElementById('player-rank');
    if (rankEl) {
        let rankName = myElo >= 1500 ? "Thách Đấu 💎" : (myElo >= 1200 ? "Vàng 🥇" : (myElo >= 1100 ? "Bạc 🥈" : "Tân Binh 🥉"));
        rankEl.innerText = `🏆 Xếp Hạng: ${myElo} (${rankName})`;
    }
}

// --- INTERACTION SYSTEM (Chỉ dùng cho Emoji ở bản này) ---
let interactionMode = { type: null, payload: null }; 
function cancelInteraction() {
    interactionMode = { type: null, payload: null };
    document.body.classList.remove('targeting-mode');
    dom.guideMessage.classList.add('hidden');
}

// --- ASSETS & DATA ---
const IMAGES = {
    'Punch': 'images/The Punch.svg',
    'Hug': 'images/The Hug.svg',
    'Drink': 'images/The Drink.svg',
    'BFF': 'images/The Bro.svg'
};

const CARD_DESC = {
    'Punch': 'Tấn công! Úp cùng đa số để chiến thắng và loại bỏ kẻ khác.',
    'Hug': 'Hòa bình! Úp cùng đa số để chiến thắng vòng đấu.',
    'Drink': 'Nâng ly! Úp cùng đa số để chiến thắng.',
    'BFF': 'Lá bài Tối thượng! Thắng ngay lập tức vòng này nếu không ai úp trùng với bạn.'
};

const dom = {
    turnIndicator: document.getElementById('turn-indicator'),
    chainStack: document.getElementById('chain-stack'),
    logContent: document.getElementById('log-content'),
    myScore: document.getElementById('my-score'),
    handActions: document.getElementById('hand-actions'),
    guideMessage: document.getElementById('guide-message'),
    opponents: {
        'B': document.getElementById('player-B'),
        'C': document.getElementById('player-C'),
        'D': document.getElementById('player-D')
    }
};

// --- INITIALIZATION ---
socket.on('assignId', (id) => {
    myId = id;
    const myAvatar = document.querySelector('.my-avatar');
    if (myAvatar) {
        myAvatar.id = `player-${id}`;
        myAvatar.innerText = `YOU (${id})`;
    }

    const allIds = ['A', 'B', 'C', 'D'];
    const opponentIds = allIds.filter(pid => pid !== id);
    
    const topEl = document.querySelector('.top-area .opponent');
    const leftEl = document.querySelectorAll('.side-opponent')[0];
    const rightEl = document.querySelectorAll('.side-opponent')[1];

    if (topEl && leftEl && rightEl) {
        topEl.id = `player-${opponentIds[0]}`; topEl.querySelector('.avatar').innerText = opponentIds[0];
        leftEl.id = `player-${opponentIds[1]}`; leftEl.querySelector('.avatar').innerText = opponentIds[1];
        rightEl.id = `player-${opponentIds[2]}`; rightEl.querySelector('.avatar').innerText = opponentIds[2];
        dom.opponents = { [opponentIds[0]]: topEl, [opponentIds[1]]: leftEl, [opponentIds[2]]: rightEl };
    }
    localStorage.setItem('ff_playerId', id);
    socket.emit('requestState'); 
});

// --- RENDER HELPERS ---
function renderScore(scoredZone) {
    if (!scoredZone || scoredZone.length === 0) return '0 điểm';
    const counts = { Punch: 0, Hug: 0, Drink: 0, BFF: 0 };
    scoredZone.forEach(c => { if (counts[c] !== undefined) counts[c]++; });
    let html = '';
    if(counts.Punch) html += `<span title="Punch">👊${counts.Punch}</span>`;
    if(counts.Hug) html += `<span title="Hug">🫂${counts.Hug}</span>`;
    if(counts.Drink) html += `<span title="Drink">🥂${counts.Drink}</span>`;
    if(counts.BFF) html += `<span title="BFF">💖${counts.BFF}</span>`;
    return html;
}

function renderScoredIcons(scoredZone) {
    if (!scoredZone || scoredZone.length === 0) return '<span style="opacity:0.3;font-size:0.7rem;">—</span>';
    return scoredZone.map(card => {
        if (card === 'Punch') return `<span class="score-icon punch">👊</span>`;
        if (card === 'Hug') return `<span class="score-icon hug">🤗</span>`;
        if (card === 'Drink') return `<span class="score-icon drink">🍻</span>`;
        if (card === 'BFF') return `<span class="score-icon bff">💖</span>`;
        return '';
    }).join('');
}

function showTooltip(e, name) {
    const tooltip = document.getElementById('card-tooltip');
    let desc = CARD_DESC[name];
    if (!tooltip || !desc) return;
    const topPos = e.clientY > window.innerHeight - 150 ? e.clientY - 120 : e.clientY + 20;
    tooltip.innerHTML = `<h4>${name}</h4><p style="margin:0;">${desc}</p><i>Thẻ Hành động</i>`;
    tooltip.style.opacity = '1';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = topPos + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('card-tooltip');
    if (tooltip) tooltip.style.opacity = '0';
}

// --- ANIMATIONS & 3D EFFECTS ---
function playFlightAnimation(cardEl) {
    playSound('play');
    const rect = cardEl.getBoundingClientRect();
    const clone = cardEl.cloneNode(true);
    clone.className = 'card has-image';
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.margin = '0';
    clone.style.zIndex = '999999';
    clone.style.transition = 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);

    const target = document.getElementById('chain-stack');
    if (!target) { clone.remove(); return; }
    const targetRect = target.getBoundingClientRect();
    
    setTimeout(() => {
        clone.style.left = (targetRect.left + targetRect.width/2 - rect.width/2) + 'px';
        clone.style.top = (targetRect.top + targetRect.height/2 - rect.height/2) + 'px';
        clone.style.transform = 'scale(0.3) rotate(720deg)';
        clone.style.opacity = '0.2';
    }, 10);

    setTimeout(() => clone.remove(), 500);
}

function addTiltEffect(el) {
    el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -20; 
        const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 20;
        el.style.setProperty('--rx', `${rotateX}deg`);
        el.style.setProperty('--ry', `${rotateY}deg`);
    });
    
    el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', `0deg`);
        el.style.setProperty('--ry', `0deg`);
    });
}

// --- SMOOTH DRAG & DROP CHO BẢN STYLE GỐC ---
function makeDraggableActionCard(el, cardIndex) {
    let isDragging = false;
    let startX, startY, originRect;
    let ghost = null;

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return; 
        e.preventDefault();
        el.setPointerCapture(e.pointerId);

        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        originRect = el.getBoundingClientRect();
    });

    el.addEventListener('pointermove', (e) => {
        if (!originRect) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!isDragging && Math.hypot(dx, dy) < 8) return;

        if (!isDragging) {
            isDragging = true;
            ghost = el.cloneNode(true);
            ghost.style.cssText = `
                position: fixed;
                width: ${originRect.width}px;
                height: ${originRect.height}px;
                left: ${originRect.left}px;
                top: ${originRect.top}px;
                margin: 0;
                z-index: 999999;
                pointer-events: none;
                transition: transform 0.08s ease, box-shadow 0.1s ease;
                transform: scale(1.12) rotate(-4deg);
                box-shadow: 0 30px 60px rgba(0,0,0,0.45);
                border-radius: 18px;
                opacity: 0.95;
            `;
            document.body.appendChild(ghost);

            el.style.opacity = '0.25';
            el.style.transform = 'scale(0.95)';

            dom.chainStack.classList.add('drag-over-zone');
            dom.guideMessage.innerText = '🃏 Thả bài vào giữa bàn để úp!';
            dom.guideMessage.classList.remove('hidden');
        }

        if (ghost) {
            ghost.style.left = (e.clientX - originRect.width / 2) + 'px';
            ghost.style.top  = (e.clientY - originRect.height / 2) + 'px';

            // Nghiêng bóng bài theo hướng di chuyển chuột
            const tilt = Math.max(-15, Math.min(15, dx * 0.08));
            ghost.style.transform = `scale(1.12) rotate(${tilt}deg)`;

            const stackRect = dom.chainStack.getBoundingClientRect();
            const isOver = e.clientX > stackRect.left && e.clientX < stackRect.right
                        && e.clientY > stackRect.top  && e.clientY < stackRect.bottom;
            dom.chainStack.classList.toggle('drag-active-over', isOver);
        }
    });

    el.addEventListener('pointerup', (e) => {
        if (!originRect) return;

        if (!isDragging) {
            el.classList.add('just-played');
            el.style.pointerEvents = 'none';
            socket.emit('playAction', { cardIndex: cardIndex });
            return;
        }

        if (ghost) { ghost.remove(); ghost = null; }
        el.style.opacity = '1';
        el.style.transform = '';
        dom.chainStack.classList.remove('drag-over-zone', 'drag-active-over');
        dom.guideMessage.classList.add('hidden');
        isDragging = false;
        originRect = null;

        const stackRect = dom.chainStack.getBoundingClientRect();
        const isDropped = e.clientX > stackRect.left && e.clientX < stackRect.right
                       && e.clientY > stackRect.top  && e.clientY < stackRect.bottom;

        if (isDropped) {
            playFlightAnimation(el);
            el.style.pointerEvents = 'none';
            socket.emit('playAction', { cardIndex: cardIndex });
        }
    });

    el.addEventListener('pointercancel', () => {
        if (ghost) { ghost.remove(); ghost = null; }
        el.style.opacity = '1';
        el.style.transform = '';
        dom.chainStack.classList.remove('drag-over-zone', 'drag-active-over');
        dom.guideMessage.classList.add('hidden');
        isDragging = false;
        originRect = null;
    });
}

function createCardElement(name, index, isMine) {
    const el = document.createElement('div');
    el.className = 'card action';
    
    if (IMAGES[name]) {
        el.classList.add('has-image');
        el.innerHTML = `<img src="${IMAGES[name]}" class="card-img-content">`;
    }
    
    if (isMine) {
        el.addEventListener('mousemove', (e) => showTooltip(e, name));
        el.addEventListener('mouseleave', hideTooltip);
        addTiltEffect(el);
        makeDraggableActionCard(el, index);
    } else {
        el.style.cursor = 'default';
    }
    return el;
}

// Lắng nghe click avatar để ném Emoji
document.querySelectorAll('.opponent').forEach(oppEl => {
    const avatarCont = oppEl.querySelector('.avatar-container');
    if (avatarCont) {
        avatarCont.onclick = () => {
            const targetId = oppEl.id.replace('player-', ''); 
            if (interactionMode.type === 'EMOJI') {
                socket.emit('throwEmoji', { targetId: targetId, emoji: interactionMode.payload });
                cancelInteraction();
            }
        };
    }
});

// --- GAME STATE SYNC ---
socket.on('gameState', (state) => {
    if (!myId) return;
    
    const waitingScreen = document.getElementById('waiting-screen');
    if (state.phase === 'WAITING') {
        waitingScreen.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = state.id;
        const wp = document.getElementById('waiting-players');
        wp.innerHTML = '';
        state.players.forEach((p, index) => {
            wp.innerHTML += `<div class="waiting-player-slot ${p.id === 'A' ? 'slot-host' : 'slot-filled'}"><span>Ghế ${index + 1}</span> <span>${p.isBot ? '🤖 Máy' : '👤 '+ (p.name || p.id)}</span></div>`;
        });
        document.getElementById('btn-start-game').classList.toggle('hidden', myId !== 'A');
        return; 
    } else {
        waitingScreen.classList.add('hidden');
    }

    const me = state.players.find(p => p.id === myId);
    
    // Cập nhật Avatar đối thủ
    Object.keys(dom.opponents).forEach(pid => {
        const p = state.players.find(pl => pl.id === pid);
        const oppEl = dom.opponents[pid];
        if (p && oppEl) {
            const avatar = oppEl.querySelector('.avatar');
            // Bật viền sáng nhắm mục tiêu nếu đang ném đồ
            avatar.classList.toggle('targetable', interactionMode.type === 'EMOJI');
            
            oppEl.querySelector('.stats').innerHTML = `
                <div><span style="color:#ff6b6b">Act: ${p.handCount?.action || 0}</span></div>
                <div class="scored-icons">${renderScoredIcons(p.scoredZone)}</div>
            `;
        }
    });

    const phaseNames = {
        'ACTION': 'ACTION PHASE (Hãy úp bài)',
        'REVEAL': 'LẬT BÀI PHÂN ĐỊNH',
        'GAME_OVER': 'KẾT THÚC VÁN'
    };
    
    dom.turnIndicator.innerText = phaseNames[state.phase] || state.phase;
    dom.turnIndicator.classList.toggle('your-turn', state.phase === 'ACTION' && !state.selectedActions[myId]);

    // Vẽ Bài Sàn Đấu
    dom.chainStack.innerHTML = '';
    const renderSlots = [
        { pid: myId, pos: 'bottom' },
        { pid: ['A','B','C','D'].filter(x=>x!==myId)[0], pos: 'top' },
        { pid: ['A','B','C','D'].filter(x=>x!==myId)[1], pos: 'left' },
        { pid: ['A','B','C','D'].filter(x=>x!==myId)[2], pos: 'right' }
    ];

    renderSlots.forEach((slotData, i) => {
        const cardName = state.selectedActions ? state.selectedActions[slotData.pid] : null;
        const playerInGame = state.players.find(p => p.id === slotData.pid);
        
        const slot = document.createElement('div');
        slot.className = `slot-card${cardName ? ' filled' : ' empty'}`;
        slot.dataset.pos = slotData.pos;
        
        const inner = document.createElement('div');
        inner.className = 'slot-inner';
        
        const back = document.createElement('div');
        back.className = 'slot-face back';
        back.innerHTML = cardName 
            ? `<img src="images/Back-action.svg" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` 
            : `<span style="font-family:'Fredoka',sans-serif;font-size:1rem;color:white;opacity:0.5;font-weight:700;">${slotData.pid}</span>`;
        
        const front = document.createElement('div');
        front.className = 'slot-face front';
        if (cardName && cardName !== 'HIDDEN') {
            front.innerHTML = `<img src="${IMAGES[cardName]}">`;
        }

        inner.appendChild(back);
        inner.appendChild(front);
        slot.appendChild(inner);
        
        if (cardName) {
            const badge = document.createElement('div');
            badge.className = 'slot-owner';
            badge.innerText = slotData.pid;
            slot.appendChild(badge);
        }
        dom.chainStack.appendChild(slot);

        if ((state.phase === 'REVEAL' || state.phase === 'GAME_OVER') && cardName && cardName !== 'HIDDEN') {
            setTimeout(() => inner.classList.add('is-flipped'), i * 200);
        }
    });

    // Vẽ Bài Trên Tay Bản Thân
    if (me && me.hand) {
        dom.handActions.innerHTML = '';
        me.hand.action.forEach((card, i) => {
            const el = createCardElement(card, i, true);
            el.style.setProperty('--i', i);
            el.style.setProperty('--total', me.hand.action.length);
            
            // Xử lý làm mờ hoặc sáng tùy theo Phase
            if (state.phase !== 'ACTION' || state.selectedActions[myId]) {
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none'; // Khóa tương tác
            } else {
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto'; // Mở khóa CSS Hover Zoom, Tilt, Brightness
                el.style.cursor = 'pointer';
            }
            dom.handActions.appendChild(el);
        });
    }

    dom.myScore.innerHTML = renderScore(me?.scoredZone);
    dom.logContent.innerHTML = state.logs.slice().reverse().map(l => `<div>> ${l}</div>`).join('');

    if (state.phase === 'GAME_OVER') {
        document.getElementById('game-container').classList.add('victory-zoom');
        if (!document.getElementById('victory-screen')) {
            showVictoryScreen(state.players.filter(p => p.status.hasWon).map(p => p.id), state.players.find(p => p.status.hasWon)?.scoredZone || []);
        }
    } else {
        document.getElementById('game-container').classList.remove('victory-zoom');
        const vs = document.getElementById('victory-screen');
        if (vs) vs.remove();
    }

    document.body.classList.toggle('danger-mode', state.players.some(p => p.scoredZone && p.scoredZone.length >= 2) && state.phase !== 'GAME_OVER');
});

// --- VISUAL & SOCIAL EFFECTS ---
socket.on('socialEvent', (data) => {
    const { action, winners } = data;
    const config = {
        'Hug': { emoji: '🤗', cssClass: 'hug', text: `${winners.join(', ')} ôm nhau!` },
        'Punch': { emoji: '👊', cssClass: 'punch', text: `${winners.join(', ')} tung đấm!` },
        'Drink': { emoji: '🍻', cssClass: 'drink', text: `${winners.join(', ')} cụng ly!` }
    };
    const c = config[action];
    if (!c) return;

    if (action === 'Punch') {
        document.getElementById('game-container').classList.add('screen-shake');
        setTimeout(() => document.getElementById('game-container').classList.remove('screen-shake'), 500);
        const impact = document.createElement('div');
        impact.className = 'impact-frame';
        document.body.appendChild(impact);
        setTimeout(() => impact.remove(), 150);
    }
    if (action === 'Hug' || action === 'Drink') {
        const particleEmoji = action === 'Hug' ? '💖' : '🫧';
        for (let i = 0; i < 15; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.innerText = particleEmoji;
            p.style.setProperty('--tx', `${(Math.random() - 0.5) * 400}px`);
            p.style.setProperty('--ty', `${(Math.random() - 0.5) * 400}px`);
            p.style.animationDuration = `${0.6 + Math.random() * 0.6}s`;
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 1200);
        }
    }
    const popup = document.createElement('div');
    popup.className = `social-popup ${c.cssClass}`;
    popup.innerHTML = `<span class="popup-emoji">${c.emoji}</span><span class="popup-text">${c.text}</span>`;
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.classList.add('dismissing');
        setTimeout(() => popup.remove(), 400);
    }, 2800);
});

socket.on('timerUpdate', (seconds) => {
    const indicator = document.getElementById('turn-indicator');
    if (indicator) {
        indicator.innerText = `${indicator.innerText.split(' (')[0]} (${seconds}s)`;
        indicator.classList.toggle('hurry-up', seconds <= 3 && seconds > 0);
    }
});

function launchConfetti() {
    const colors = ['#FFD700','#FF6B6B','#A2D2FF','#FFC8DD','#B9FBC0'];
    for (let i = 0; i < 120; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (8 + Math.random() * 8) + 'px';
        piece.style.height = (12 + Math.random() * 10) + 'px';
        piece.style.animationDuration = (2.5 + Math.random() * 3) + 's';
        document.body.appendChild(piece);
        piece.addEventListener('animationend', () => piece.remove());
    }
}

function showVictoryScreen(winnerIds, scoredZones) {
    const existing = document.getElementById('victory-screen');
    if (existing) existing.remove();
    const isMe = winnerIds.includes(myId);
    
    const screen = document.createElement('div');
    screen.id = 'victory-screen';
    screen.innerHTML = `
        <div class="victory-modal">
            <span class="victory-trophy">${isMe ? '🏆' : '🥈'}</span>
            <div class="victory-name">${winnerIds.join(' & ')}</div>
            <div class="victory-subtitle">${isMe ? 'You won!' : 'wins the game!'}</div>
            <button class="btn-victory-restart">Play Again 🎮</button>
        </div>`;
    document.body.appendChild(screen);
    
    if (isMe) { myElo += 25; playSound('win'); launchConfetti(); } else myElo = Math.max(0, myElo - 10);
    localStorage.setItem('ff_elo', myElo);
    updateEloDisplay();
    screen.querySelector('.btn-victory-restart').onclick = () => { screen.remove(); socket.emit('startGame'); };
}

// --- TAUNT & EMOJI SYSTEM ---
const myAvatarEl = document.querySelector('.my-avatar');
if (myAvatarEl) {
    myAvatarEl.onclick = () => { if (!myAvatarEl.classList.contains('taunting')) socket.emit('taunt'); };
}

socket.on('playerTaunt', (playerId) => {
    const targetEl = playerId === myId ? document.querySelector('.my-avatar') : dom.opponents[playerId]?.querySelector('.avatar-container');
    if (!targetEl) return;
    targetEl.classList.add('taunting');
    setTimeout(() => targetEl.classList.remove('taunting'), 2500);
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerText = ["Non! 😂", "Đấm nhẹ thôi! 🥹", "Cay chưa? 🌶️", "Xin cái top 1! 🏆"][Math.floor(Math.random() * 4)];
    targetEl.appendChild(bubble);
    setTimeout(() => { if (bubble.parentNode) bubble.remove(); }, 2500);
});

socket.on('playerChat', (data) => {
    const targetEl = data.playerId === myId ? document.querySelector('.my-avatar') : dom.opponents[data.playerId]?.querySelector('.avatar-container');
    if (!targetEl) return;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerText = data.msg;
    targetEl.appendChild(bubble);
    setTimeout(() => { if (bubble.parentNode) bubble.remove(); }, 3000);
});

socket.on('emojiThrown', (data) => {
    const fEl = data.fromId === myId ? document.querySelector('.my-avatar') : dom.opponents[data.fromId]?.querySelector('.avatar');
    const tEl = data.toId === myId ? document.querySelector('.my-avatar') : dom.opponents[data.toId]?.querySelector('.avatar');
    if (!fEl || !tEl) return;

    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const emojiEl = document.createElement('div');
    emojiEl.innerText = data.emoji;
    emojiEl.style.cssText = `position:fixed; z-index:9999; font-size:2rem; pointer-events:none; left:${fRect.left}px; top:${fRect.top}px; transition:all 0.5s cubic-bezier(0.25, 1, 0.5, 1); transform: rotate(360deg);`;
    document.body.appendChild(emojiEl);

    setTimeout(() => { emojiEl.style.left = tRect.left + 'px'; emojiEl.style.top = tRect.top + 'px'; }, 50);
    setTimeout(() => {
        playSound('hit'); emojiEl.remove();
        tEl.classList.add('faint-shake');
        setTimeout(() => tEl.classList.remove('faint-shake'), 500);
        if (data.emoji === '🍅' || data.emoji === '💩') {
            const mess = document.createElement('div');
            mess.className = 'mess-splat';
            mess.style.background = data.emoji === '🍅' ? 'radial-gradient(circle, #e74c3c 20%, transparent 70%)' : 'radial-gradient(circle, #6e4b3b 30%, transparent 70%)';
            tEl.appendChild(mess);
            setTimeout(() => mess.remove(), 3000);
        } else {
            const splat = document.createElement('div');
            splat.className = 'splat-anim';
            splat.style.left = (tRect.left + tRect.width/2) + 'px';
            splat.style.top = (tRect.top + tRect.height/2) + 'px';
            splat.innerHTML = `<img src="/images/splat.svg">`;
            document.body.appendChild(splat);
            setTimeout(() => splat.remove(), 1000);
        }
    }, 550);
});

// --- LOBBY & BUTTONS LOGIC ---
document.getElementById('btn-rules').onclick = () => document.getElementById('rulebook-modal').classList.toggle('hidden');
document.getElementById('btn-close-rules').onclick = () => document.getElementById('rulebook-modal').classList.add('hidden');

document.getElementById('btn-create-room').onclick = () => socket.emit('createRoom', { playerName: document.getElementById('input-player-name').value.trim() || 'Guest' });
document.getElementById('btn-join-room').onclick = () => socket.emit('joinRoom', { playerName: document.getElementById('input-player-name').value.trim() || 'Guest', roomId: document.getElementById('input-room-code').value.trim().toUpperCase() });
document.getElementById('btn-start-game').onclick = () => socket.emit('startGame');

socket.on('roomJoined', (data) => {
    document.getElementById('lobby-screen').style.display = 'none';
    localStorage.setItem('ff_roomId', data.roomId);
});
socket.on('lobbyError', (msg) => {
    const err = document.getElementById('lobby-error');
    err.innerText = msg; err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 3000);
});
socket.on('clearSession', () => {
    localStorage.removeItem('ff_roomId');
    localStorage.removeItem('ff_playerId');
    document.getElementById('lobby-screen').style.display = 'flex';
});

const savedRoom = localStorage.getItem('ff_roomId');
const savedPlayer = localStorage.getItem('ff_playerId');
if (savedRoom && savedPlayer) {
    document.getElementById('lobby-screen').style.display = 'none';
    socket.emit('reconnectUser', { roomId: savedRoom, playerId: savedPlayer });
}

document.getElementById('btn-surrender').onclick = () => {
    socket.emit('surrender');
    localStorage.removeItem('ff_roomId');
    localStorage.removeItem('ff_playerId');
    window.location.reload();
};

const socialMenu = document.getElementById('social-menu');
document.getElementById('btn-social-toggle').onclick = () => socialMenu.classList.toggle('hidden');
document.getElementById('tab-chat').onclick = (e) => {
    e.target.classList.add('active'); document.getElementById('tab-emoji').classList.remove('active');
    document.getElementById('chat-list').classList.remove('hidden'); document.getElementById('emoji-list').classList.add('hidden');
};
document.getElementById('tab-emoji').onclick = (e) => {
    e.target.classList.add('active'); document.getElementById('tab-chat').classList.remove('active');
    document.getElementById('emoji-list').classList.remove('hidden'); document.getElementById('chat-list').classList.add('hidden');
};

document.querySelectorAll('.chat-btn').forEach(btn => btn.onclick = () => { socket.emit('sendChat', btn.innerText); socialMenu.classList.add('hidden'); });
document.querySelectorAll('.emoji-btn').forEach(btn => btn.onclick = () => {
    cancelInteraction();
    interactionMode = { type: 'EMOJI', payload: btn.dataset.emoji };
    document.body.classList.add('targeting-mode');
    dom.guideMessage.innerText = `🍅 Hãy click vào 1 Avatar để ném ${btn.dataset.emoji}`;
    dom.guideMessage.classList.remove('hidden');
    socialMenu.classList.add('hidden');
});

document.getElementById('btn-bgm-toggle').onclick = () => {
    isBgmMuted = !isBgmMuted; SFX.bgm.muted = isBgmMuted;
    if (!isBgmMuted) SFX.bgm.play().catch(e=>{});
};
document.getElementById('btn-sfx-toggle').onclick = () => {
    isSfxMuted = !isSfxMuted;
    Object.entries(SFX).forEach(([key, s]) => { if (key !== 'bgm') s.muted = isSfxMuted; });
};