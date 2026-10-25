/* ===== الغرف الصوتية =====
   - الصوت مباشر بين الطلاب (WebRTC)، وSupabase Realtime يستخدم فقط لتعارف الأجهزة.
   - لا يحتاج جداول أو SQL: الغرفة تظهر طالما فيها أحد وتختفي إذا فضيت.
   - الحد الأقصى 6 أشخاص في الغرفة. يحتاج رابط https (GitHub Pages يوفره). */
const MAX_ROOM = 6;
const rtClient = (DB_READY && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const me = { id: Math.random().toString(36).slice(2, 10) };
let lobby = null, roomCh = null, localStream = null, curRoom = null, voiceMuted = false;
const peers = new Map();

const myName = () => (typeof currentUser !== 'undefined' && currentUser ? currentUser.name : 'طالب');
const roomKey = n => { let h = 5381; for (const c of n) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'room-' + h.toString(16); };
const lobbyPeople = () => lobby ? Object.values(lobby.presenceState()).flat() : [];

/* ---------- واجهة الغرف ---------- */
function setupStudyRoomsUI() {
    const grid = document.getElementById('study-rooms-grid');
    if (!grid) return;
    if (!rtClient) {
        grid.innerHTML = '<div class="sm:col-span-2 text-center py-12 rounded-2xl border border-dashed border-slate-600 text-slate-400 text-sm font-semibold">الغرف الصوتية تحتاج ربط Supabase (config.js).</div>';
        return;
    }
    const rooms = {};
    lobbyPeople().forEach(p => { if (p.room) (rooms[p.room] = rooms[p.room] || []).push(p.name); });

    let html = `<div class="sm:col-span-2 bg-slate-900 p-4 rounded-2xl border border-slate-700 flex gap-2">
        <input id="new-room-name" maxlength="30" placeholder="اسم غرفة جديدة، مثال: مراجعة فيزياء" class="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 text-slate-100">
        <button id="create-room-btn" class="px-4 py-2 bg-gradient-to-r from-primary-600 to-accent-500 text-white font-bold rounded-xl text-sm whitespace-nowrap">إنشاء وانضمام</button>
    </div>`;
    const names = Object.keys(rooms);
    if (!names.length) {
        html += '<div class="sm:col-span-2 text-center py-10 rounded-2xl border border-dashed border-slate-600 text-slate-400 text-sm font-semibold">لا توجد غرف نشطة حالياً، أنشئ أول غرفة!</div>';
    }
    names.forEach(n => {
        const people = rooms[n], here = n === curRoom, full = people.length >= MAX_ROOM;
        html += `<div class="bg-slate-900 p-5 rounded-2xl border ${here ? 'border-primary-500' : 'border-slate-700'} flex flex-col justify-between space-y-4">
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-emerald-400"><i class="fa-solid fa-microphone ml-1"></i>غرفة صوتية</span>
                    <span class="text-xs font-bold text-slate-400"><i class="fa-solid fa-users ml-1"></i>${people.length}/${MAX_ROOM}</span>
                </div>
                <h4 class="font-bold text-slate-100 text-base">${esc(n)}</h4>
                <p class="text-xs text-slate-400 mt-1">${people.map(esc).join('، ')}</p>
            </div>
            <button data-join="${esc(n)}" ${here || full ? 'disabled' : ''} class="px-4 py-2 rounded-xl text-xs font-bold transition ${here || full ? 'bg-slate-800 text-slate-500' : 'bg-primary-500/10 hover:bg-primary-600 text-primary-300 hover:text-white'}">${here ? 'أنت في الغرفة' : full ? 'الغرفة ممتلئة' : 'الانضمام بالصوت'}</button>
        </div>`;
    });
    grid.innerHTML = html;
    grid.querySelectorAll('[data-join]').forEach(b => b.onclick = () => joinVoiceRoom(b.dataset.join));
    document.getElementById('create-room-btn').onclick = () => {
        const v = document.getElementById('new-room-name').value.trim();
        if (v) joinVoiceRoom(v); else toast('اكتب اسم الغرفة أولاً.');
    };
}

function renderVoiceBar() {
    let bar = document.getElementById('voice-bar');
    if (!curRoom) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'voice-bar';
        bar.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-xl bg-slate-900 border border-primary-500/40 shadow-2xl rounded-2xl p-3 flex items-center justify-between gap-3';
        document.body.appendChild(bar);
    }
    const members = roomCh ? Object.values(roomCh.presenceState()).flat().map(p => p.name) : [];
    bar.innerHTML = `<div class="min-w-0">
            <p class="text-sm font-bold text-slate-100 truncate"><i class="fa-solid fa-circle text-emerald-400 text-[8px] ml-1.5"></i>${esc(curRoom)}</p>
            <p class="text-[11px] text-slate-400 truncate">${members.map(esc).join('، ')}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button id="vb-mute" class="w-10 h-10 rounded-xl ${voiceMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-200'}"><i class="fa-solid ${voiceMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i></button>
            <button id="vb-leave" class="px-4 h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">خروج</button>
        </div>`;
    document.getElementById('vb-mute').onclick = toggleMute;
    document.getElementById('vb-leave').onclick = leaveVoiceRoom;
}

function toggleMute() {
    voiceMuted = !voiceMuted;
    localStream?.getAudioTracks().forEach(t => t.enabled = !voiceMuted);
    renderVoiceBar();
}

/* ---------- الاتصال الصوتي ---------- */
function sendSignal(to, type, data) {
    roomCh?.send({ type: 'broadcast', event: 'signal', payload: { to, from: me.id, type, data } });
}

function makePeer(pid, initiator) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    document.body.appendChild(audio);
    const peer = { pc, audio, queue: [] };
    peers.set(pid, peer);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => { if (e.candidate) sendSignal(pid, 'ice', e.candidate); };
    pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
    if (initiator) {
        pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => sendSignal(pid, 'offer', pc.localDescription)).catch(console.error);
    }
    return peer;
}

function dropPeer(pid) {
    const p = peers.get(pid);
    if (!p) return;
    p.pc.close();
    p.audio.remove();
    peers.delete(pid);
}

async function flushQueue(peer) {
    while (peer.queue.length) await peer.pc.addIceCandidate(peer.queue.shift()).catch(() => {});
}

async function onSignal(p) {
    if (p.to !== me.id) return;
    let peer = peers.get(p.from);
    try {
        if (p.type === 'offer') {
            peer = peer || makePeer(p.from, false);
            await peer.pc.setRemoteDescription(p.data);
            await flushQueue(peer);
            const ans = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(ans);
            sendSignal(p.from, 'answer', peer.pc.localDescription);
        } else if (p.type === 'answer' && peer) {
            await peer.pc.setRemoteDescription(p.data);
            await flushQueue(peer);
        } else if (p.type === 'ice') {
            peer = peer || makePeer(p.from, false);
            if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(p.data).catch(() => {});
            else peer.queue.push(p.data);
        }
    } catch (e) { console.error(e); }
}

async function joinVoiceRoom(name) {
    if (!rtClient) return;
    if (curRoom) await leaveVoiceRoom();
    if (!navigator.mediaDevices?.getUserMedia) { toast('المتصفح لا يدعم المايك، افتح الموقع عبر https.'); return; }
    const count = lobbyPeople().filter(p => p.room === name).length;
    if (count >= MAX_ROOM) { toast('الغرفة ممتلئة.'); return; }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { toast('لازم تسمح باستخدام المايك للانضمام.'); return; }

    curRoom = name;
    voiceMuted = false;
    roomCh = rtClient.channel(roomKey(name), { config: { presence: { key: me.id }, broadcast: { self: false } } });
    roomCh
        .on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload))
        .on('presence', { event: 'join' }, ({ key }) => { if (key !== me.id && me.id < key && !peers.has(key)) makePeer(key, true); })
        .on('presence', { event: 'leave' }, ({ key }) => dropPeer(key))
        .on('presence', { event: 'sync' }, renderVoiceBar)
        .subscribe(async status => {
            if (status === 'SUBSCRIBED') {
                await roomCh.track({ name: myName() });
                await lobby.track({ name: myName(), room: name });
                toast('انضممت للغرفة', 'success');
            }
        });
    renderVoiceBar();
    setupStudyRoomsUI();
}

async function leaveVoiceRoom() {
    peers.forEach((_, id) => dropPeer(id));
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null;
    if (roomCh) { await rtClient.removeChannel(roomCh); roomCh = null; }
    curRoom = null;
    renderVoiceBar();
    lobby?.track({ name: myName(), room: null });
    setupStudyRoomsUI();
}

/* ---------- تشغيل ---------- */
(function initVoiceRooms() {
    const h = document.querySelector('#view-rooms h2');
    if (h) h.textContent = 'غرف الدراسة الصوتية';
    const p = document.querySelector('#view-rooms .z-10 p');
    if (p) p.textContent = 'ادخل غرفة، شغّل المايك، وذاكر مع زملائك بالصوت. اكتم نفسك وقت ما تحب، وتقدر تستعين بمؤقت البومودورو وأصوات الخلفية.';
    const b = document.querySelector('#view-rooms .z-10 span');
    if (b) b.innerHTML = '<i class="fa-solid fa-microphone ml-1.5"></i>دراسة جماعية بالصوت';
    const sub = document.querySelector('#view-rooms h3.text-lg');
    if (sub) sub.textContent = 'الغرف النشطة الآن';

    if (!rtClient) return;
    lobby = rtClient.channel('lobby', { config: { presence: { key: me.id } } });
    lobby.on('presence', { event: 'sync' }, setupStudyRoomsUI)
         .subscribe(status => { if (status === 'SUBSCRIBED') lobby.track({ name: myName(), room: curRoom }); });
    window.addEventListener('beforeunload', () => { localStream?.getTracks().forEach(t => t.stop()); });
})();
