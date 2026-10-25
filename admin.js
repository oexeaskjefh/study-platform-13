/* ===== الأدمن: تسجيل دخول، حذف ملفات/رسائل، حظر ===== */
let isAdmin = false;
const ADMIN_KEY = 'aldaris_admin_token';

async function adminDelete(table, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: sbHeaders({ Prefer: 'return=representation' }) });
    if (r.status === 401) { adminLogout(true); toast('انتهت الجلسة، سجّل الدخول من جديد.'); return 0; }
    if (!r.ok) return 0;
    return (await r.json()).length;
}

function adminModal(inner) {
    closeAdminModal();
    const o = document.createElement('div');
    o.id = 'admin-modal';
    o.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
    o.innerHTML = `<div class="glass-card w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">${inner}</div>`;
    o.addEventListener('click', e => { if (e.target === o) closeAdminModal(); });
    document.body.appendChild(o);
}
function closeAdminModal() { document.getElementById('admin-modal')?.remove(); }

function openAdminModal() {
    if (!DB_READY) { toast('لم يتم ربط قاعدة البيانات.'); return; }
    if (!isAdmin) {
        adminModal(`<h3 class="font-bold text-slate-100 mb-4"><i class="fa-solid fa-lock ml-2 text-primary-400"></i>دخول الأدمن</h3>
            <form id="adm-form" class="space-y-3">
                <input id="adm-email" type="email" required placeholder="البريد الإلكتروني" class="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 text-slate-100">
                <input id="adm-pass" type="password" required placeholder="كلمة المرور" class="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 text-slate-100">
                <button class="w-full py-2.5 bg-gradient-to-r from-primary-600 to-accent-500 text-white font-bold rounded-xl text-sm">دخول</button>
            </form>`);
        document.getElementById('adm-form').onsubmit = adminLogin;
        return;
    }
    adminModal(`<div class="flex items-center justify-between mb-4"><h3 class="font-bold text-slate-100"><i class="fa-solid fa-user-shield ml-2 text-primary-400"></i>لوحة الأدمن</h3>
            <button id="adm-logout" class="text-xs font-bold text-rose-400">تسجيل خروج</button></div>
        <p class="text-xs font-bold text-slate-300 mb-2">المحظورون</p><div id="adm-bans" class="space-y-2"></div>`);
    document.getElementById('adm-logout').onclick = () => { adminLogout(); closeAdminModal(); };
    loadBans();
}

async function loadBans() {
    const box = document.getElementById('adm-bans');
    if (!box) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bans?select=*&order=created_at.desc`, { headers: sbHeaders() });
    const b = r.ok ? await r.json() : [];
    box.innerHTML = b.length ? b.map(x => `<div class="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm">
        <span class="text-slate-200 truncate">${esc(x.name || 'بدون اسم')}</span>
        <button data-unban="${esc(x.device_id)}" class="text-xs font-bold text-emerald-400">فك الحظر</button></div>`).join('')
        : '<p class="text-slate-400 text-sm text-center py-4">لا يوجد محظورون.</p>';
    box.querySelectorAll('[data-unban]').forEach(btn => btn.onclick = async () => {
        const n = await adminDelete('bans', `device_id=eq.${encodeURIComponent(btn.dataset.unban)}`);
        toast(n ? 'تم فك الحظر' : 'فشل فك الحظر', n ? 'success' : 'error');
        loadBans();
    });
}

async function adminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adm-email').value.trim();
    const password = document.getElementById('adm-pass').value;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!r.ok) { toast('بيانات الدخول غير صحيحة.'); return; }
    adminToken = (await r.json()).access_token;
    sessionStorage.setItem(ADMIN_KEY, adminToken);
    await verifyAdmin();
    if (!isAdmin) { adminLogout(true); toast('هذا الحساب ليس أدمن.'); return; }
    closeAdminModal();
    toast('أهلاً بك أيها الأدمن', 'success');
}

async function verifyAdmin() {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/admins?select=user_id`, { headers: sbHeaders() });
        isAdmin = r.ok && (await r.json()).length > 0;
    } catch (e) { isAdmin = false; }
    if (!isAdmin) { adminToken = null; sessionStorage.removeItem(ADMIN_KEY); }
    refreshAdminUI();
}

function adminLogout(silent) {
    adminToken = null; isAdmin = false;
    sessionStorage.removeItem(ADMIN_KEY);
    refreshAdminUI();
    if (!silent) toast('تم تسجيل الخروج', 'success');
}

function refreshAdminUI() {
    const b = document.getElementById('admin-btn');
    if (b) b.innerHTML = isAdmin ? '<i class="fa-solid fa-user-shield text-primary-400"></i>' : '<i class="fa-solid fa-lock"></i>';
    if (currentUser) renderPosts();
    renderChat();
}

async function banDevice(dev, name) {
    if (!dev) { toast('هذا المحتوى قديم وما فيه معرّف جهاز، ما بتقدر تحظره.'); return; }
    if (dev === deviceId) { toast('ما بتقدر تحظر جهازك.'); return; }
    if (!confirm(`حظر "${name}" من الموقع؟`)) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bans`, { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }), body: JSON.stringify({ device_id: dev, name }) });
    toast(r.ok ? 'تم حظر الجهاز' : 'فشل الحظر', r.ok ? 'success' : 'error');
}

async function adminDeletePost(post) {
    if (!confirm('حذف هذا الملف نهائياً؟')) return;
    const path = (post.fileUrl || '').split(`/public/${BUCKET}/`)[1];
    if (path) await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: sbHeaders() });
    const n = await adminDelete('posts', `id=eq.${post.id}`);
    if (n) { postsData = postsData.filter(p => p.id !== post.id); renderPosts(); toast('تم حذف الملف', 'success'); }
    else toast('فشل الحذف.');
}

async function adminDeleteMsg(m) {
    const n = await adminDelete('messages', `id=eq.${m.id}`);
    if (n) removeMsg(m.id); else toast('فشل حذف الرسالة.');
}

const toolBtn = (cls, icon, txt) => `<button class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${cls}"><i class="fa-solid ${icon} ml-1"></i>${txt}</button>`;

function decoratePostCard(card, post) {
    if (!isAdmin) return;
    const bar = document.createElement('div');
    bar.className = 'px-5 py-2 border-t border-slate-800 flex gap-2';
    bar.innerHTML = toolBtn('bg-rose-500/10 text-rose-400', 'fa-trash', 'حذف') + toolBtn('bg-amber-500/10 text-amber-400', 'fa-ban', 'حظر الناشر');
    const [del, ban] = bar.querySelectorAll('button');
    del.onclick = () => adminDeletePost(post);
    ban.onclick = () => banDevice(post.deviceId, post.author);
    card.appendChild(bar);
}

function decorateMsg(el, m) {
    if (!isAdmin) return;
    const inner = el.firstElementChild;
    const bar = document.createElement('div');
    bar.className = 'flex gap-2 mt-1.5';
    bar.innerHTML = toolBtn('bg-rose-500/20 text-rose-300', 'fa-trash', 'حذف') + toolBtn('bg-amber-500/20 text-amber-300', 'fa-ban', 'حظر');
    const [del, ban] = bar.querySelectorAll('button');
    del.onclick = () => adminDeleteMsg(m);
    ban.onclick = () => banDevice(m.device_id, m.name);
    inner.appendChild(bar);
}

function showBanned() {
    const o = document.createElement('div');
    o.className = 'fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-center';
    o.innerHTML = '<div><i class="fa-solid fa-ban text-5xl text-rose-500 mb-4"></i><h2 class="text-2xl font-bold text-slate-100">تم حظرك من المنصة</h2><p class="text-slate-400 mt-2 text-sm">إذا تعتقد أن هذا خطأ تواصل مع الإدارة.</p></div>';
    document.body.appendChild(o);
}

(async function initAdmin() {
    if (!DB_READY) return;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/bans?select=device_id&device_id=eq.${encodeURIComponent(deviceId)}`, { headers: sbHeaders() });
        if (r.ok && (await r.json()).length) { showBanned(); return; }
    } catch (e) {}
    const t = sessionStorage.getItem(ADMIN_KEY);
    if (t) { adminToken = t; await verifyAdmin(); }
})();
