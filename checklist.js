/* ===== لائحة الدراسة (قسم الغرف) =====
   تنحفظ في متصفح الطالب نفسه، وكل واحد له لائحته الخاصة. */
(function () {
    const KEY = 'aldaris_checklist';
    let items = [];
    try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
    const save = () => localStorage.setItem(KEY, JSON.stringify(items));

    const col = document.querySelector('#view-rooms .lg\\:col-span-1');
    if (!col) return;

    const card = document.createElement('div');
    card.className = 'bg-slate-900 rounded-2xl p-6 border border-slate-700 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
            <h3 class="font-bold text-slate-100 text-sm flex items-center"><i class="fa-solid fa-list-check ml-2 text-emerald-400"></i>لائحة الدراسة</h3>
            <span id="cl-count" class="text-xs font-bold text-slate-400"></span>
        </div>
        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4"><div id="cl-bar" class="h-full bg-emerald-500 transition-all" style="width:0%"></div></div>
        <form id="cl-form" class="flex gap-2 mb-3">
            <input id="cl-input" maxlength="60" autocomplete="off" placeholder="أضف مادة أو مهمة..." class="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 text-slate-100">
            <button class="px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"><i class="fa-solid fa-plus"></i></button>
        </form>
        <ul id="cl-list" class="space-y-2"></ul>
        <button id="cl-clear" class="hidden mt-3 text-xs font-bold text-slate-400 hover:text-rose-400 transition">مسح المنجز</button>`;
    col.insertBefore(card, col.children[1] || null);

    const list = card.querySelector('#cl-list');

    function render() {
        const done = items.filter(i => i.done).length;
        card.querySelector('#cl-count').textContent = items.length ? `${done}/${items.length}` : '';
        card.querySelector('#cl-bar').style.width = items.length ? (done / items.length * 100) + '%' : '0%';
        card.querySelector('#cl-clear').classList.toggle('hidden', !done);
        list.innerHTML = items.length ? '' : '<li class="text-center text-slate-400 text-xs py-4">اللائحة فاضية، أضف أول مادة.</li>';
        items.forEach(it => {
            const li = document.createElement('li');
            li.className = 'flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2';
            li.innerHTML = `
                <button class="cl-check w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center text-[10px] transition ${it.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600 hover:border-emerald-400'}">${it.done ? '<i class="fa-solid fa-check"></i>' : ''}</button>
                <span class="flex-1 min-w-0 break-words text-sm font-semibold ${it.done ? 'line-through text-slate-500' : 'text-slate-100'}">${esc(it.text)}</span>
                <button class="cl-del text-slate-500 hover:text-rose-400 text-xs"><i class="fa-solid fa-xmark"></i></button>`;
            li.querySelector('.cl-check').onclick = () => { it.done = !it.done; save(); render(); };
            li.querySelector('.cl-del').onclick = () => { items = items.filter(x => x.id !== it.id); save(); render(); };
            list.appendChild(li);
        });
    }

    card.querySelector('#cl-form').addEventListener('submit', e => {
        e.preventDefault();
        const inp = card.querySelector('#cl-input');
        const text = inp.value.trim();
        if (!text) return;
        items.push({ id: Date.now(), text, done: false });
        inp.value = '';
        save(); render();
    });
    card.querySelector('#cl-clear').onclick = () => { items = items.filter(i => !i.done); save(); render(); };

    render();
})();
