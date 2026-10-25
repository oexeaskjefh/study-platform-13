const FIELD_DATA = {
    'صحّي': {
        core: ['علوم حياتية (أحياء)', 'كيمياء', 'لغة إنجليزية'],
        electives: ['علوم الأرض والبيئة', 'الفيزياء', 'الرياضيات', 'الكيمياء التخصصية', 'علم الاجتماع وعلم النفس']
    },
    'هندسي': {
        core: ['رياضيات', 'فيزياء', 'لغة إنجليزية'],
        electives: ['علوم الأرض والبيئة', 'الكيمياء', 'الثقافة المالية', 'التاريخ']
    },
    'لغات': {
        core: ['تربية إسلامية', 'لغة عربية تخصص', 'لغة عربية أدب', 'لغة إنجليزية'],
        electives: ['جغرافيا', 'تاريخ', 'التربية الإسلامية التخصصية', 'علم الاجتماع وعلم النفس', 'الفلسفة']
    },
    'أعمال': {
        core: ['رياضيات الأعمال', 'الثقافة المالية', 'اللغة الإنجليزية'],
        electives: ['الجغرافيا', 'التاريخ', 'علم الاجتماع وعلم النفس', 'الفلسفة', 'التربية الإسلامية']
    }
};

const GENERAL_ELECTIVES = [
    'الرياضيات', 'الفيزياء', 'علوم الأرض والبيئة', 'الكيمياء', 
    'العلوم الحياتية', 'علم الاجتماع وعلم النفس', 'الفلسفة', 
    'الثقافة المالية', 'التاريخ', 'التربية الإسلامية التخصصية', 
    'العربي التخصصي', 'الجغرافيا'
];

const SUBJECT_ALIAS = {'علوم حياتية (أحياء)':'العلوم الحياتية','كيمياء':'الكيمياء','لغة إنجليزية':'اللغة الإنجليزية','رياضيات':'الرياضيات','فيزياء':'الفيزياء','تربية إسلامية':'التربية الإسلامية','تاريخ':'التاريخ','جغرافيا':'الجغرافيا'};
const canon = n => SUBJECT_ALIAS[n] || n;
Object.values(FIELD_DATA).forEach(f => {
    f.core = [...new Set(f.core.map(canon))];
    f.electives = [...new Set(f.electives.map(canon))].filter(x => x !== 'الكيمياء التخصصية');
});


const STUDY_ROOMS = [];

let currentUser = null;
let postsData = [];
let postsLoading = true;
let adminToken = null;
const deviceId = localStorage.getItem('aldaris_device') || (() => { const x = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('aldaris_device', x); return x; })();
let activeFilter = 'my-feed';
let selectedSubjectPill = 'ALL';
let currentPreviewPost = null;
let activeAudioSounds = {};

let timerInterval = null;
let timerSeconds = 25 * 60;
let isTimerRunning = false;
let timerMode = 'study';

window.onload = function() {
    loadUserData();
    loadPostsData();
    setInterval(loadPostsData, 30000);
    initAppUI();
    setupStudyRoomsUI();
};

function loadUserData() {
    const saved = localStorage.getItem('aldaris_user');
    if (saved) {
        try { currentUser = JSON.parse(saved); if (currentUser) currentUser.elective = canon(currentUser.elective); } catch(e) { currentUser = null; }
    }
}

function saveUserData(name, field, elective) {
    currentUser = { name, field, elective };
    localStorage.setItem('aldaris_user', JSON.stringify(currentUser));
}

function resetProfile() {
    if(confirm('هل ترغب في تغيير تخصصك أو اسمك؟')) {
        localStorage.removeItem('aldaris_user');
        currentUser = null;
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('onboarding-modal').classList.remove('hidden');
    }
}

function toast(msg, type = 'error') {
    const t = document.createElement('div');
    t.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-bold shadow-xl border ${type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sbHeaders = (extra = {}) => ({ apikey: SUPABASE_KEY, ...((adminToken || SUPABASE_KEY.startsWith('eyJ')) ? { Authorization: 'Bearer ' + (adminToken || SUPABASE_KEY) } : {}), ...extra });

function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'الآن';
    if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
    if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`;
    return `منذ ${Math.floor(s / 86400)} يوم`;
}

async function loadPostsData() {
    if (!DB_READY) {
        postsLoading = false;
        if (!document.getElementById('db-notice')) {
            const n = document.createElement('div');
            n.id = 'db-notice';
            n.className = 'p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold';
            n.textContent = 'لم يتم ربط قاعدة البيانات بعد، لن تظهر الملفات للآخرين. عبّي SUPABASE_URL و SUPABASE_KEY أعلى سكربت الملف.';
            document.getElementById('view-feed').prepend(n);
        }
        return;
    }
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc`, { headers: sbHeaders() });
        if (!res.ok) throw new Error(res.status);
        postsData = (await res.json()).map(r => ({ id: r.id, title: r.title, author: r.author, field: r.field, subject: canon(r.subject), desc: r.description, type: r.type, date: timeAgo(r.created_at), fileUrl: r.file_url, fileName: r.file_name, deviceId: r.device_id }));
        postsLoading = false;
        if (currentUser) renderPosts();
    } catch (e) { console.error(e); postsLoading = false; if (currentUser) renderPosts(); }
}

function selectFieldCard(selectedField) {
    document.querySelectorAll('.field-card').forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        if (card.querySelector(`input[value="${selectedField}"]`)) {
            card.classList.add('border-primary-500', 'bg-primary-500/10');
            card.classList.remove('border-slate-700');
            radio.checked = true;
        } else {
            card.classList.remove('border-primary-500', 'bg-primary-500/10');
            card.classList.add('border-slate-700');
            radio.checked = false;
        }
    });

    const select = document.getElementById('elective-subject');
    select.innerHTML = '<option value="" disabled selected>اختر مادة اختيارية...</option>';

    const electives = FIELD_DATA[selectedField]?.electives || GENERAL_ELECTIVES;
    electives.forEach(subj => {
        const opt = document.createElement('option');
        opt.value = subj;
        opt.textContent = subj;
        select.appendChild(opt);
    });
}

function handleOnboardingSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('user-name').value.trim();
    const fieldRadio = document.querySelector('input[name="academic-field"]:checked');
    const elective = document.getElementById('elective-subject').value;

    if (!name || !fieldRadio || !elective) {
        alert('يرجى تعبئة جميع الحقول المطلوبة واختيار الحقل الأكاديمي والمادة.');
        return;
    }

    saveUserData(name, fieldRadio.value, elective);
    initAppUI();
}

function initAppUI() {
    if (!currentUser) {
        document.getElementById('onboarding-modal').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        return;
    }

    document.getElementById('onboarding-modal').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-details').textContent = `${currentUser.field} | ${currentUser.elective}`;
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0);

    filterPosts('all');
}

function renderSubjectPills() {
    const container = document.getElementById('subject-pills-container');
    container.innerHTML = '';

    let subjects = [];
    if (activeFilter === 'my-feed') {
        const fieldInfo = FIELD_DATA[currentUser.field];
        subjects = [...(fieldInfo?.core || []), currentUser.elective];
    } else if (activeFilter === 'all') {
        subjects = Object.values(FIELD_DATA).flatMap(f => [...f.core, ...f.electives]);
    } else if (FIELD_DATA[activeFilter]) {
        subjects = [...FIELD_DATA[activeFilter].core, ...FIELD_DATA[activeFilter].electives];
    } else {
        subjects = GENERAL_ELECTIVES;
    }

    subjects = Array.from(new Set(subjects));

    const allPill = document.createElement('button');
    allPill.className = `px-3 py-1 rounded-full border transition ${selectedSubjectPill === 'ALL' ? 'bg-slate-100 text-slate-900 border-slate-100' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}`;
    allPill.textContent = 'جميع مواد الحقل';
    allPill.onclick = () => { selectedSubjectPill = 'ALL'; renderSubjectPills(); renderPosts(); };
    container.appendChild(allPill);

    subjects.forEach(subj => {
        const pill = document.createElement('button');
        const isSelected = selectedSubjectPill === subj;
        pill.className = `px-3 py-1 rounded-full border transition ${isSelected ? 'bg-primary-600 text-white border-primary-600' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}`;
        pill.textContent = subj;
        pill.onclick = () => { selectedSubjectPill = subj; renderSubjectPills(); renderPosts(); };
        container.appendChild(pill);
    });
}

function filterPosts(filter) {
    activeFilter = filter;
    selectedSubjectPill = 'ALL';

    document.querySelectorAll('.filter-tab-btn').forEach(btn => {
        btn.classList.remove('bg-primary-500/10', 'text-primary-300', 'border', 'border-primary-500/30');
        btn.classList.add('text-slate-300');
    });

    const activeBtn = document.getElementById(`filter-btn-${filter}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-primary-500/10', 'text-primary-300', 'border', 'border-primary-500/30');
    }

    const titleEl = document.getElementById('feed-header-title');
    const subEl = document.getElementById('feed-header-subtitle');

    if (filter === 'all') {
        titleEl.textContent = 'كل الشروحات والملفات';
        subEl.textContent = 'ملفات جميع الطلاب من كل الحقول والمواد.';
    } else if (filter === 'my-feed') {
        titleEl.textContent = `منشورات حقل ${currentUser.field} المخصصة لك`;
        subEl.textContent = `يعرض المواد الأساسية لحقلك بالإضافة لمادتك الاختيارية (${currentUser.elective}).`;
    } else {
        titleEl.textContent = `استكشاف شروحات وملفات: الحقل ${filter}`;
        subEl.textContent = `تصفح ملخصات الطلاب وملفاتهم المقترحة لهذا الحقل.`;
    }

    renderSubjectPills();
    renderPosts();
}

function renderPosts() {
    const container = document.getElementById('posts-container');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';
    if (postsLoading) {
        container.innerHTML = Array(3).fill('<div class="h-44 rounded-2xl bg-slate-900 border border-slate-700 animate-pulse"></div>').join('');
        emptyState.classList.add('hidden');
        return;
    }

    let filtered = [...postsData];

    if (activeFilter === 'all') {
        // show everything
    } else if (activeFilter === 'my-feed') {
        const userCore = FIELD_DATA[currentUser.field]?.core || [];
        const userElective = currentUser.elective;
        filtered = filtered.filter(p => p.field === currentUser.field && (userCore.includes(p.subject) || p.subject === userElective));
    } else {
        filtered = filtered.filter(p => p.field === activeFilter);
    }

    if (selectedSubjectPill !== 'ALL') {
        filtered = filtered.filter(p => p.subject === selectedSubjectPill);
    }

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    filtered.forEach(post => {
        const isPdf = post.type === 'pdf';
        const card = document.createElement('div');
        card.className = 'bg-slate-900 rounded-2xl border border-slate-700 hover:border-primary-500 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group';

        card.innerHTML = `
            <div class="p-5">
                <div class="flex items-center justify-between mb-3">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${isPdf ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'} flex items-center">
                        <i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-image'} ml-1"></i>
                        ${isPdf ? 'ملف PDF' : 'صورة شرح'}
                    </span>
                    <span class="text-[11px] text-slate-400 font-semibold">${post.date}</span>
                </div>
                <h4 class="font-bold text-slate-100 text-base mb-2 group-hover:text-primary-400 transition leading-snug">${esc(post.title)}</h4>
                <div class="flex items-center space-x-2 space-x-reverse text-xs font-semibold text-slate-400 mb-3">
                    <span class="bg-slate-800 px-2 py-0.5 rounded text-slate-200">${esc(post.field)}</span>
                    <span>•</span>
                    <span class="text-primary-400">${esc(post.subject)}</span>
                </div>
                <p class="text-xs text-slate-300 leading-relaxed line-clamp-2">${esc(post.desc) || 'لا يوجد وصف إضافي.'}</p>
            </div>
            <div class="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                <div class="flex items-center space-x-2 space-x-reverse text-xs text-slate-400">
                    <i class="fa-regular fa-user text-slate-400"></i>
                    <span class="font-semibold">${esc(post.author)}</span>
                </div>
                <button onclick="openPreviewModal(${post.id})" class="px-3 py-1.5 bg-slate-900 hover:bg-primary-600 text-primary-400 hover:text-white border border-primary-500/30 hover:border-primary-600 rounded-lg text-xs font-bold transition flex items-center shadow-sm">
                    <i class="fa-solid fa-eye ml-1"></i> استعراض
                </button>
            </div>
        `;
        if (typeof decoratePostCard === 'function') decoratePostCard(card, post);
                container.appendChild(card);
    });
}

function openPostModal() {
    const fieldSelect = document.getElementById('post-field');
    fieldSelect.value = currentUser ? currentUser.field : 'صحّي';
    updatePostSubjectDropdown();
    document.getElementById('post-modal').classList.remove('hidden');
}

function closePostModal() {
    document.getElementById('post-modal').classList.add('hidden');
}

function updatePostSubjectDropdown() {
    const selectedField = document.getElementById('post-field').value;
    const subjectSelect = document.getElementById('post-subject');
    subjectSelect.innerHTML = '';

    const fieldInfo = FIELD_DATA[selectedField];
    const allOptions = Array.from(new Set([...(fieldInfo?.core || []), ...(fieldInfo?.electives || [])]));

    allOptions.forEach(subj => {
        const opt = document.createElement('option');
        opt.value = subj;
        opt.textContent = subj;
        subjectSelect.appendChild(opt);
    });
}

function triggerFileInput() {
    document.getElementById('dummy-file-input').click();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('file-upload-label').textContent = `تم اختيار: ${file.name}`;
    }
}

async function handleNewPostSubmit(e) {
    e.preventDefault();
    if (!DB_READY) { toast('لم يتم ربط قاعدة البيانات بعد. عبّي SUPABASE_URL و SUPABASE_KEY في الملف.'); return; }
    const title = document.getElementById('post-title').value.trim();
    const field = document.getElementById('post-field').value;
    const subject = document.getElementById('post-subject').value;
    const desc = document.getElementById('post-desc').value.trim();
    const input = document.getElementById('dummy-file-input');
    const file = input.files[0];
    if (!title || !subject) return;
    if (!file) { toast('اختر الملف أولاً.'); return; }
    const isImg = file.type.startsWith('image/');
    if (!isImg && file.type !== 'application/pdf') { toast('المسموح PDF أو صور فقط.'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('حجم الملف أكبر من 50 ميجابايت.'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.textContent;
    btn.disabled = true; btn.textContent = 'جاري الرفع...';
    try {
        const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        let r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: sbHeaders({ 'Content-Type': file.type }), body: file });
        if (!r.ok) throw new Error('upload');
        const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
        r = await fetch(`${SUPABASE_URL}/rest/v1/posts`, { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ title, author: currentUser.name, field, subject, description: desc, type: isImg ? 'image' : 'pdf', file_url: fileUrl, file_name: file.name, device_id: deviceId }) });
        if (!r.ok) throw new Error('insert');

        document.getElementById('post-title').value = '';
        document.getElementById('post-desc').value = '';
        input.value = '';
        document.getElementById('file-upload-label').textContent = 'اضغط لاختيار ملف من جهازك';
        closePostModal();
        toast('تم نشر الملف بنجاح', 'success');
        await loadPostsData();
    } catch (err) {
        console.error(err);
        toast('تعذّر رفع الملف، حاول مرة أخرى.');
    } finally {
        btn.disabled = false; btn.textContent = oldText;
    }
}

function openPreviewModal(postId) {
    const post = postsData.find(p => p.id === postId);
    if (!post) return;

    currentPreviewPost = post;
    document.getElementById('preview-title').textContent = post.title;
    document.getElementById('preview-author').textContent = `ناشر الشرح: ${post.author} (${post.field} - ${post.subject})`;

    const previewIcon = document.getElementById('preview-icon');
    const previewBody = document.getElementById('preview-body');

    if (post.type === 'pdf') {
        previewIcon.innerHTML = '<i class="fa-solid fa-file-pdf text-red-500"></i>';
        previewBody.innerHTML = `<iframe src="${esc(post.fileUrl)}" class="w-full h-[60vh] rounded-lg border border-slate-700"></iframe>`;
    } else {
        previewIcon.innerHTML = '<i class="fa-solid fa-image text-emerald-500"></i>';
        previewBody.innerHTML = `
            <div class="text-center p-2">
                <img src="${esc(post.fileUrl)}" alt="Image Preview" class="max-h-[400px] w-auto shadow-md rounded-xl border border-slate-700 mx-auto object-contain">
            </div>
        `;
    }

    document.getElementById('preview-modal').classList.remove('hidden');
}

function closePreviewModal() {
    document.getElementById('preview-modal').classList.add('hidden');
}

function downloadSimulatedFile() {
    if (!currentPreviewPost) return;
    const a = document.createElement('a');
    a.href = currentPreviewPost.fileUrl;
    a.target = '_blank'; a.rel = 'noopener';
    a.download = currentPreviewPost.fileName || '';
    document.body.appendChild(a); a.click(); a.remove();
}

function switchTab(tab) {
    const feedView = document.getElementById('view-feed');
    const roomsView = document.getElementById('view-rooms');
    const navFeed = document.getElementById('nav-feed');
    const navRooms = document.getElementById('nav-rooms');
    const mobFeed = document.getElementById('mob-nav-feed');
    const mobRooms = document.getElementById('mob-nav-rooms');

    if (tab === 'feed') {
        feedView.classList.remove('hidden');
        roomsView.classList.add('hidden');
        navFeed.className = "px-4 py-1.5 rounded-lg text-sm font-bold transition text-primary-300 bg-slate-700 shadow-sm";
        navRooms.className = "px-4 py-1.5 rounded-lg text-sm font-bold transition text-slate-300 hover:text-slate-100";
        mobFeed.className = "flex-1 py-2 text-center text-xs font-bold text-primary-400 border-b-2 border-primary-600";
        mobRooms.className = "flex-1 py-2 text-center text-xs font-bold text-slate-400";
    } else {
        feedView.classList.add('hidden');
        roomsView.classList.remove('hidden');
        navRooms.className = "px-4 py-1.5 rounded-lg text-sm font-bold transition text-primary-300 bg-slate-700 shadow-sm";
        navFeed.className = "px-4 py-1.5 rounded-lg text-sm font-bold transition text-slate-300 hover:text-slate-100";
        mobRooms.className = "flex-1 py-2 text-center text-xs font-bold text-primary-400 border-b-2 border-primary-600";
        mobFeed.className = "flex-1 py-2 text-center text-xs font-bold text-slate-400";
    }
}

function setupStudyRoomsUI() {
    const grid = document.getElementById('study-rooms-grid');
    grid.innerHTML = '';
    if (!STUDY_ROOMS.length) {
        grid.innerHTML = '<div class="sm:col-span-2 text-center py-12 rounded-2xl border border-dashed border-slate-600 text-slate-400 text-sm font-semibold">لا توجد غرف دراسية حالياً</div>';
        return;
    }

    STUDY_ROOMS.forEach(room => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900 p-5 rounded-2xl border border-slate-700 hover:border-primary-500 shadow-sm flex flex-col justify-between space-y-4';
        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200">${room.field}</span>
                    <span class="text-xs font-bold text-emerald-400 flex items-center">
                        <i class="fa-solid fa-users ml-1 text-slate-400"></i> ${room.activeCount} طالب يتدارسون
                    </span>
                </div>
                <h4 class="font-bold text-slate-100 text-base">${room.name}</h4>
                <p class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-bullseye ml-1 text-slate-400"></i>${room.target}</p>
            </div>
            <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span class="text-[11px] text-slate-400 font-semibold"><i class="fa-solid fa-microphone-slash ml-1 text-rose-400"></i>صامتة تماماً</span>
                <button onclick="enterSilentRoom('${room.name}')" class="px-4 py-1.5 bg-primary-500/10 hover:bg-primary-600 text-primary-300 hover:text-white rounded-xl text-xs font-bold transition">
                    الانضمام للغرفة
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function enterSilentRoom(roomName) {
    alert(`تم دخول "${roomName}". يمكنك الاستعانة بمؤقت البومودورو وتشغيل صوت الخلفية المفضل لمباشرة الدراسة!`);
}

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    document.getElementById('timer-display').textContent = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function toggleTimer() {
    const btn = document.getElementById('timer-start-btn');
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.innerHTML = '<i class="fa-solid fa-play ml-1.5 text-sm"></i> استئناف';
        btn.classList.replace('bg-amber-600', 'bg-primary-600');
    } else {
        isTimerRunning = true;
        btn.innerHTML = '<i class="fa-solid fa-pause ml-1.5 text-sm"></i> إيقاف مؤقت';
        btn.classList.replace('bg-primary-600', 'bg-amber-600');

        timerInterval = setInterval(() => {
            if (timerSeconds > 0) {
                timerSeconds--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                isTimerRunning = false;
                btn.innerHTML = '<i class="fa-solid fa-play ml-1.5 text-sm"></i> بدء';
                alert(timerMode === 'study' ? 'انتهت جلسة الدراسة! خذ استراحة لمدة 5 دقائق.' : 'انتهت الاستراحة! استعد لجلسة دراسة جديدة.');
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timerSeconds = (timerMode === 'study') ? 25 * 60 : 5 * 60;
    const btn = document.getElementById('timer-start-btn');
    btn.innerHTML = '<i class="fa-solid fa-play ml-1.5 text-sm"></i> بدء';
    btn.className = "px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-md transition flex items-center";
    updateTimerDisplay();
}

function setTimerMode(mode) {
    timerMode = mode;
    document.getElementById('timer-mode-badge').textContent = mode === 'study' ? 'وقت الدراسة' : 'وقت الراحة';
    resetTimer();
}

let audioCtx = null;

function toggleAmbientSound(type) {
    const btn = document.getElementById(`sound-btn-${type}`);

    if (activeAudioSounds[type]) {
        activeAudioSounds[type].stop();
        delete activeAudioSounds[type];
        btn.textContent = 'تشغيل';
        btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700';
    } else {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const soundNode = createWhiteNoiseNode(type);
        activeAudioSounds[type] = soundNode;
        btn.textContent = 'إيقاف';
        btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30';
    }
}

function createWhiteNoiseNode(type) {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = audioCtx.createBiquadFilter();

    if (type === 'rain') {
        filter.type = 'lowpass';
        filter.frequency.value = 800;
    } else if (type === 'library') {
        filter.type = 'bandpass';
        filter.frequency.value = 400;
    } else {
        filter.type = 'lowpass';
        filter.frequency.value = 300;
    }

    const gain = audioCtx.createGain();
    gain.gain.value = 0.15;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start();

    return {
        stop: () => {
            try { noise.stop(); } catch(e){}
        }
    };
}
