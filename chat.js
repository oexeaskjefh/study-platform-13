/* ===== المحادثات (شات جماعي) ===== */
let chatMsgs = [], chatStarted = false, lastSend = 0;

function switchTab(tab) {
    ['feed', 'rooms', 'chat'].forEach(t => {
        const on = t === tab;
        document.getElementById('view-' + t).classList.toggle('hidden', !on);
        const n = document.getElementById('nav-' + t);
        if (n) n.className = `px-4 py-1.5 rounded-lg text-sm font-bold transition ${on ? 'text-primary-300 bg-slate-700 shadow-sm' : 'text-slate-300 hover:text-slate-100'}`;
        const m = document.getElementById('mob-nav-' + t);
        if (m) m.className = `flex-1 py-2 text-center text-xs font-bold ${on ? 'text-primary-400 border-b-2 border-primary-600' : 'text-slate-400'}`;
    });
    if (tab === 'chat') initChat();
}

const msgTime = iso => new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

function msgEl(m) {
    const mine = m.device_id === deviceId;
    const d = document.createElement('div');
    d.id = 'msg-' + m.id;
    d.className = 'flex ' + (mine ? 'justify-start' : 'justify-end');
    d.innerHTML = `<div class="max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2 ${mine ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-100'}">
        <p class="text-[11px] font-bold ${mine ? 'text-primary-100' : 'text-primary-400'} mb-0.5">${esc(m.name)}</p>
        <p class="text-sm break-words whitespace-pre-wrap">${esc(m.content)}</p>
        <p class="text-[10px] opacity-60 mt-1">${msgTime(m.created_at)}</p>
    </div>`;
    if (typeof decorateMsg === 'function') decorateMsg(d, m);
    return d;
}

function scrollChat() { const l = document.getElementById('chat-list'); l.scrollTop = l.scrollHeight; }

function renderChat() {
    const l = document.getElementById('chat-list');
    if (!l || !chatStarted) return;
    l.innerHTML = '';
    chatMsgs.forEach(m => l.appendChild(msgEl(m)));
    scrollChat();
}

function addMsg(m) {
    if (chatMsgs.some(x => x.id === m.id)) return;
    chatMsgs.push(m);
    if (chatMsgs.length > 200) chatMsgs.shift();
    const l = document.getElementById('chat-list');
    const near = l.scrollHeight - l.scrollTop - l.clientHeight < 120;
    l.appendChild(msgEl(m));
    if (near || m.device_id === deviceId) scrollChat();
}

function removeMsg(id) {
    chatMsgs = chatMsgs.filter(m => m.id !== id);
    document.getElementById('msg-' + id)?.remove();
}

async function initChat() {
    if (chatStarted) return;
    chatStarted = true;
    const l = document.getElementById('chat-list');
    if (!DB_READY || !rtClient) { l.innerHTML = '<p class="text-center text-slate-400 text-sm py-10">المحادثات تحتاج ربط Supabase.</p>'; return; }
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=100`, { headers: sbHeaders() });
        if (!r.ok) throw new Error(r.status);
        chatMsgs = (await r.json()).reverse();
        renderChat();
    } catch (e) { l.innerHTML = '<p class="text-center text-slate-400 text-sm py-10">تعذّر تحميل المحادثة. تأكد من تشغيل setup.sql.</p>'; return; }
    rtClient.channel('chat-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => addMsg(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => removeMsg(p.old.id))
        .subscribe();
}

document.getElementById('chat-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const inp = document.getElementById('chat-input');
    const content = inp.value.trim();
    if (!content) return;
    if (!DB_READY) { toast('لم يتم ربط قاعدة البيانات.'); return; }
    if (Date.now() - lastSend < 1500) { toast('على مهلك شوي، انتظر ثانية.'); return; }
    lastSend = Date.now();
    inp.value = '';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/messages`, { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name: currentUser.name, device_id: deviceId, content }) });
    if (!r.ok) toast('تعذّر إرسال الرسالة (ممكن تكون محظور).');
});
