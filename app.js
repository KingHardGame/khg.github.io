// ========== IndexedDB обёртка ==========
const DB_NAME = 'porab-control-db';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('timeEntries')) {
        db.createObjectStore('timeEntries', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('materials')) {
        db.createObjectStore('materials', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function dbAdd(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ========== Утилиты ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatDate(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ========== Вкладки ==========
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ========== Модуль «Смена» ==========
let shiftActive = false;
let shiftStartId = null;

async function renderShifts() {
  const entries = await dbGetAll('timeEntries');
  entries.sort((a, b) => b.start - a.start);
  const list = $('#shift-list');
  if (entries.length === 0) {
    list.innerHTML = '<li class="empty">Пока нет отметок</li>';
    return;
  }
  list.innerHTML = entries.slice(0, 10).map(e => `
    <li>
      <strong>${formatDate(e.start)}</strong>
      ${e.end ? ` → ${formatDate(e.end)}` : ' → <span style="color:#16a34a">смена идёт</span>'}
    </li>
  `).join('');
}

async function startShift() {
  const entry = { start: Date.now(), end: null };
  shiftStartId = await dbAdd('timeEntries', entry);
  shiftActive = true;
  $('#shift-status').textContent = `Смена начата: ${formatDate(entry.start)}`;
  $('#btn-start-shift').disabled = true;
  $('#btn-end-shift').disabled = false;
  renderShifts();
}

async function endShift() {
  if (!shiftStartId) return;
  const entries = await dbGetAll('timeEntries');
  const current = entries.find(e => e.id === shiftStartId);
  if (current) {
    current.end = Date.now();
    await dbPut('timeEntries', current);
  }
  shiftActive = false;
  shiftStartId = null;
  $('#shift-status').textContent = 'Смена завершена';
  $('#btn-start-shift').disabled = false;
  $('#btn-end-shift').disabled = true;
  renderShifts();
}

$('#btn-start-shift').addEventListener('click', startShift);
$('#btn-end-shift').addEventListener('click', endShift);

// ========== Модуль «Задания» ==========
async function renderTasks() {
  const tasks = await dbGetAll('tasks');
  tasks.sort((a, b) => b.created - a.created);
  const list = $('#task-list');
  if (tasks.length === 0) {
    list.innerHTML = '<li class="empty">Заданий пока нет</li>';
    return;
  }
  list.innerHTML = tasks.map(t => `
    <li>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
        <div>
          <strong>${escapeHtml(t.title)}</strong><br>
          <span style="font-size:0.8rem;color:#64748b;">${escapeHtml(t.worker || '—')}</span>
          ${t.desc ? `<div style="font-size:0.8rem;color:#475569;">${escapeHtml(t.desc)}</div>` : ''}
        </div>
        <span class="status-badge ${t.status === 'done' ? 'status-done' : 'status-todo'}">
          ${t.status === 'done' ? 'Выполнено' : 'В работе'}
        </span>
      </div>
      <button class="btn" style="margin-top:0.4rem;font-size:0.75rem;padding:0.3rem;"
        onclick="toggleTask(${t.id})">
        ${t.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненным'}
      </button>
    </li>
  `).join('');
}

async function addTask() {
  const title = $('#task-title').value.trim();
  if (!title) return alert('Введите название задания');
  await dbAdd('tasks', {
    title,
    worker: $('#task-worker').value.trim(),
    desc: $('#task-desc').value.trim(),
    status: 'todo',
    created: Date.now()
  });
  $('#task-title').value = '';
  $('#task-worker').value = '';
  $('#task-desc').value = '';
  renderTasks();
}

async function toggleTask(id) {
  const tasks = await dbGetAll('tasks');
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = task.status === 'done' ? 'todo' : 'done';
    await dbPut('tasks', task);
    renderTasks();
  }
}

$('#btn-add-task').addEventListener('click', addTask);

// ========== Модуль «Фото» ==========
let pendingPhotoDataUrl = null;

$('#photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingPhotoDataUrl = ev.target.result;
  };
  reader.readAsDataURL(file);
});

async function savePhoto() {
  if (!pendingPhotoDataUrl) return alert('Выберите фото');
  const caption = $('#photo-caption').value.trim() || 'Без подписи';
  await dbAdd('photos', {
    dataUrl: pendingPhotoDataUrl,
    caption,
    created: Date.now()
  });
  pendingPhotoDataUrl = null;
  $('#photo-input').value = '';
  $('#photo-caption').value = '';
  renderPhotos();
}

async function renderPhotos() {
  const photos = await dbGetAll('photos');
  photos.sort((a, b) => b.created - a.created);
  const gallery = $('#photo-gallery');
  if (photos.length === 0) {
    gallery.innerHTML = '<p class="empty">Фотографий пока нет</p>';
    return;
  }
  gallery.innerHTML = photos.map(p => `
    <figure>
      <img src="${p.dataUrl}" alt="${escapeHtml(p.caption)}">
      <figcaption>${escapeHtml(p.caption)}</figcaption>
    </figure>
  `).join('');
}

$('#btn-upload-photo').addEventListener('click', savePhoto);

// ========== Модуль «Материалы» ==========
async function renderMaterials() {
  const materials = await dbGetAll('materials');
  materials.sort((a, b) => b.created - a.created);
  const list = $('#material-list');
  if (materials.length === 0) {
    list.innerHTML = '<li class="empty">Записей о расходе нет</li>';
    return;
  }
  list.innerHTML = materials.map(m => `
    <li>
      <strong>${escapeHtml(m.name)}</strong> — ${m.qty} ${m.unit}
      <span style="font-size:0.75rem;color:#94a3b8;">(${formatDate(m.created)})</span>
    </li>
  `).join('');
}

async function addMaterial() {
  const name = $('#mat-name').value.trim();
  const qty = parseFloat($('#mat-qty').value);
  if (!name || !qty) return alert('Заполните наименование и количество');
  await dbAdd('materials', {
    name,
    qty,
    unit: $('#mat-unit').value,
    created: Date.now()
  });
  $('#mat-name').value = '';
  $('#mat-qty').value = '';
  renderMaterials();
}

$('#btn-add-material').addEventListener('click', addMaterial);

// ========== Экранирование ==========
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (s) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[s]));
}

// ========== Инициализация ==========
window.toggleTask = toggleTask;

(async () => {
  await openDB();
  renderShifts();
  renderTasks();
  renderPhotos();
  renderMaterials();

  // Регистрация service worker (PWA)
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      console.log('SW зарегистрирован');
    } catch (err) {
      console.warn('Ошибка SW:', err);
    }
  }
})();