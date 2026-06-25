let selectedPreview = null;
let modalLocation = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// --- Refs helpers (used in preview, manual, and edit forms) ---
function initRefSection(refInputId, refAddBtnId, refListId) {
  const refs = [];
  const input = $(refInputId);
  const list = $(refListId);

  function render() {
    list.innerHTML = refs.map((url, i) => `
      <span class="ref-tag">
        <a href="${esc(url)}" target="_blank" class="ref-link">${esc(truncate(url, 40))}</a>
        <button class="ref-remove" data-i="${i}">&times;</button>
      </span>
    `).join('');
    list.querySelectorAll('.ref-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        refs.splice(parseInt(btn.dataset.i), 1);
        render();
      });
    });
  }

  $(refAddBtnId).addEventListener('click', () => {
    const url = input.value.trim();
    if (url && !refs.includes(url)) {
      refs.push(url);
      input.value = '';
      render();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $(refAddBtnId).click();
    }
  });

  return {
    get: () => refs.slice(),
    set: (arr) => { refs.length = 0; if (arr) refs.push(...arr); render(); },
    clear: () => { refs.length = 0; render(); },
  };
}

const previewRefs = initRefSection('#preview-ref-input', '#preview-ref-add', '#preview-refs');
const manualRefs = initRefSection('#manual-ref-input', '#manual-ref-add', '#manual-refs');

// --- Split tags string into array ---
function parseTags(str) {
  return (str || '').split(',').map((t) => t.trim()).filter(Boolean);
}

// --- Load board on start ---
async function loadBoard() {
  const resp = await fetch('/api/locations');
  const locations = await resp.json();
  renderBoard(locations);
}

function renderBoard(locations) {
  const board = $('#board');
  const empty = $('#empty');
  board.innerHTML = '';

  if (locations.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  locations.forEach((loc) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = loc.id;

    const tagsHtml = (loc.tags && loc.tags.length)
      ? `<div class="card-tags">${loc.tags.map((t) => `<span class="card-tag">${esc(t)}</span>`).join('')}</div>`
      : '';

    const descSnippet = loc.description ? esc(firstSentences(loc.description, 2)) : '';
    const noteSnippet = loc.note ? `<div class="card-note-tag">"${esc(loc.note)}"</div>` : '';

    if (loc.image_url) {
      card.innerHTML = `
        <img src="${esc(loc.image_url)}" alt="${esc(loc.name)}" loading="lazy">
        <div class="card-overlay">
          ${tagsHtml}
          <div class="card-name">${esc(loc.name)}</div>
          <div class="card-details">
            ${descSnippet ? `<div class="card-desc">${descSnippet}</div>` : ''}
            ${noteSnippet}
          </div>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="card-placeholder" style="min-height: 200px;">
          <div class="card-overlay">
            ${tagsHtml}
            <div class="card-name">${esc(loc.name)}</div>
            <div class="card-details">
              ${descSnippet ? `<div class="card-desc">${descSnippet}</div>` : ''}
              ${noteSnippet}
            </div>
          </div>
        </div>`;
    }

    card.addEventListener('click', () => openModal(loc));
    board.appendChild(card);
  });
}

// --- Search (debounced) ---
let searchTimeout;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = $('#search').value.trim();
  if (!q) {
    $('#search-results').classList.add('hidden');
    return;
  }
  searchTimeout = setTimeout(() => doSearch(q), 400);
});

$('#search').addEventListener('focus', () => {
  const q = $('#search').value.trim();
  if (q && $('#search-results').children.length > 0) {
    $('#search-results').classList.remove('hidden');
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    $('#search-results').classList.add('hidden');
  }
});

async function doSearch(q) {
  const container = $('#search-results');
  try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const results = await resp.json();

    if (results.length === 0) {
      container.innerHTML = '<div class="search-result-item"><span class="result-title">No results</span><br><span class="result-snippet">Try different keywords or use "Add manually"</span></div>';
    } else {
      container.innerHTML = results.map((r) => `
        <div class="search-result-item" data-title="${esc(r.title)}">
          <div class="result-title">${esc(r.title)}</div>
          <div class="result-snippet">${r.snippet}</div>
        </div>
      `).join('');

      container.querySelectorAll('.search-result-item').forEach((item) => {
        item.addEventListener('click', () => {
          selectResult(item.dataset.title);
        });
      });
    }

    container.classList.remove('hidden');
  } catch {
    container.innerHTML = '<div class="search-result-item"><span class="result-title">Search failed</span></div>';
    container.classList.remove('hidden');
  }
}

async function selectResult(title) {
  $('#search').value = title;
  $('#search-results').classList.add('hidden');

  try {
    const resp = await fetch(`/api/preview?title=${encodeURIComponent(title)}`);
    if (!resp.ok) {
      alert('Could not load details for this place.');
      return;
    }
    const data = await resp.json();
    showPreview(data);
  } catch {
    alert('Failed to load preview.');
  }
}

function showPreview(data) {
  selectedPreview = data;
  $('#preview-title').textContent = data.title;
  $('#preview-desc').textContent = firstSentences(data.description, 3);
  $('#preview-note').value = '';
  $('#preview-tags').value = '';
  previewRefs.clear();

  if (data.image_url) {
    $('#preview-img').src = data.image_url;
    $('#preview-img').style.display = '';
  } else {
    $('#preview-img').style.display = 'none';
  }

  if (data.lat && data.lon) {
    $('#preview-coords').textContent = `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`;
    $('#preview-map').href = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
    $('#preview-map').classList.remove('hidden');
  } else {
    $('#preview-coords').textContent = '';
    $('#preview-map').classList.add('hidden');
  }

  $('#preview').classList.remove('hidden');
  $('#manual-form').classList.add('hidden');
}

// --- Save from preview ---
$('#save-btn').addEventListener('click', async () => {
  if (!selectedPreview) return;

  const resp = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: selectedPreview.title,
      description: selectedPreview.description,
      image_url: selectedPreview.image_url,
      image_urls: selectedPreview.image_urls || [],
      tags: parseTags($('#preview-tags').value),
      refs: previewRefs.get(),
      lat: selectedPreview.lat,
      lon: selectedPreview.lon,
      note: $('#preview-note').value.trim(),
    }),
  });

  if (resp.ok) {
    selectedPreview = null;
    $('#preview').classList.add('hidden');
    $('#search').value = '';
    loadBoard();
  }
});

$('#cancel-preview').addEventListener('click', () => {
  selectedPreview = null;
  $('#preview').classList.add('hidden');
});

// --- Manual mode ---
$('#manual-btn').addEventListener('click', () => {
  $('#manual-form').classList.remove('hidden');
  $('#preview').classList.add('hidden');
  $('#search-results').classList.add('hidden');
  $('#manual-name').value = '';
  $('#manual-tags').value = '';
  manualRefs.clear();
});

$('#cancel-manual').addEventListener('click', () => {
  $('#manual-form').classList.add('hidden');
});

$('#manual-save').addEventListener('click', async () => {
  const name = $('#manual-name').value.trim();
  if (!name) { alert('Name is required.'); return; }

  const resp = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: $('#manual-desc').value.trim(),
      image_url: $('#manual-image').value.trim(),
      tags: parseTags($('#manual-tags').value),
      refs: manualRefs.get(),
      lat: parseFloat($('#manual-lat').value) || null,
      lon: parseFloat($('#manual-lon').value) || null,
      note: $('#manual-note').value.trim(),
    }),
  });

  if (resp.ok) {
    $('#manual-form').classList.add('hidden');
    $('#manual-name').value = '';
    $('#manual-image').value = '';
    $('#manual-desc').value = '';
    $('#manual-lat').value = '';
    $('#manual-lon').value = '';
    $('#manual-note').value = '';
    $('#manual-tags').value = '';
    manualRefs.clear();
    loadBoard();
  }
});

// --- Modal ---
let galleryImages = [];
let galleryIdx = 0;
const modalEditRefs = initRefSection('#modal-edit-ref-input', '#modal-edit-ref-add', '#modal-edit-refs');

function openModal(loc) {
  modalLocation = loc;

  $('#modal-title').textContent = loc.name;
  $('#modal-desc').textContent = loc.description || '';
  $('#modal-note').textContent = loc.note || '';

  renderModalTags(loc.tags);
  renderModalRefs(loc.refs);

  if (loc.lat && loc.lon) {
    $('#modal-map').href = `https://www.google.com/maps?q=${loc.lat},${loc.lon}`;
    $('#modal-map').classList.remove('hidden');
  } else {
    $('#modal-map').classList.add('hidden');
  }

  galleryImages = [];
  if (loc.image_url) galleryImages.push(loc.image_url);
  if (loc.image_urls && Array.isArray(loc.image_urls)) {
    loc.image_urls.forEach((u) => { if (!galleryImages.includes(u)) galleryImages.push(u); });
  }

  galleryIdx = 0;
  renderGallery();

  $('#modal-edit').classList.add('hidden');

  $('#modal').classList.remove('hidden');
  $('#modal').dataset.id = loc.id;
}

function renderModalTags(tags) {
  const el = $('#modal-tags');
  if (!tags || tags.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = tags.map((t) => `<span class="tag-badge">${esc(t)}</span>`).join('');
}

function renderModalRefs(refs) {
  const el = $('#modal-refs');
  if (!refs || refs.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = refs.map((url) =>
    `<a href="${esc(url)}" target="_blank" class="modal-ref-link">${esc(truncate(url, 50))}</a>`
  ).join('');
}

// --- Edit mode in modal ---
$('#modal-edit-btn').addEventListener('click', () => {
  if (!modalLocation) return;
  const loc = modalLocation;

  $('#modal-edit-tags').value = (loc.tags || []).join(', ');
  modalEditRefs.set(loc.refs || []);
  $('#modal-edit-note').value = loc.note || '';

  $('#modal-edit').classList.remove('hidden');
});

$('#modal-edit-save').addEventListener('click', async () => {
  if (!modalLocation) return;
  const loc = modalLocation;

  const tags = parseTags($('#modal-edit-tags').value);
  const refs = modalEditRefs.get();
  const note = $('#modal-edit-note').value.trim();

  const resp = await fetch(`/api/locations/${loc.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags, refs, note }),
  });

  if (resp.ok) {
    loc.tags = tags;
    loc.refs = refs;
    loc.note = note;
    modalLocation = loc;

    $('#modal-note').textContent = note;
    renderModalTags(tags);
    renderModalRefs(refs);
    $('#modal-edit').classList.add('hidden');
    loadBoard();
  }
});

// --- Delete ---
$('#modal-delete').addEventListener('click', async () => {
  if (!modalLocation || !confirm('Delete this card?')) return;
  await fetch(`/api/locations/${modalLocation.id}`, { method: 'DELETE' });
  closeModal();
  loadBoard();
});

// --- Gallery ---
function renderGallery() {
  const imgs = $('#modal-img');
  const gallery = $('#modal-gallery');
  const dots = $('.gallery-dots');

  if (galleryImages.length === 0) {
    gallery.style.display = 'none';
    return;
  }

  gallery.style.display = '';
  imgs.src = galleryImages[galleryIdx];

  dots.innerHTML = galleryImages.length > 1
    ? galleryImages.map((_, i) =>
        `<span class="dot ${i === galleryIdx ? 'active' : ''}" data-i="${i}"></span>`
      ).join('')
    : '';

  $('.gallery-prev').style.display = galleryImages.length > 1 ? '' : 'none';
  $('.gallery-next').style.display = galleryImages.length > 1 ? '' : 'none';

  dots.querySelectorAll('.dot').forEach((d) => {
    d.addEventListener('click', () => {
      galleryIdx = parseInt(d.dataset.i);
      renderGallery();
    });
  });
}

$('.gallery-prev').addEventListener('click', (e) => {
  e.stopPropagation();
  galleryIdx = (galleryIdx - 1 + galleryImages.length) % galleryImages.length;
  renderGallery();
});

$('.gallery-next').addEventListener('click', (e) => {
  e.stopPropagation();
  galleryIdx = (galleryIdx + 1) % galleryImages.length;
  renderGallery();
});

function closeModal() {
  $('#modal').classList.add('hidden');
  modalLocation = null;
}

$('.modal-overlay').addEventListener('click', closeModal);
$('.modal-close').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal();
  if (e.key === 'ArrowLeft' && !$('#modal').classList.contains('hidden') && galleryImages.length > 1) {
    galleryIdx = (galleryIdx - 1 + galleryImages.length) % galleryImages.length;
    renderGallery();
  }
  if (e.key === 'ArrowRight' && !$('#modal').classList.contains('hidden') && galleryImages.length > 1) {
    galleryIdx = (galleryIdx + 1) % galleryImages.length;
    renderGallery();
  }
});

// --- Helpers ---
function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '\u2026' : str;
}

function firstSentences(text, n) {
  const match = String(text).match(/(.*?[.!?](\s|$)){1,' + n + '}/s);
  return match ? match[0].trim() : text;
}

// --- Tabs ---
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $('#tab-search').classList.toggle('hidden', target !== 'search');
    $('#tab-identify').classList.toggle('hidden', target !== 'identify');
  });
});

// --- Identify tab ---
let identifyFiles = [];

$('#identify-dropzone').addEventListener('click', () => {
  $('#identify-input').click();
});

$('#identify-input').addEventListener('change', (e) => {
  addFiles(e.target.files);
});

['dragenter', 'dragover'].forEach((evt) => {
  $('#identify-dropzone').addEventListener(evt, (e) => {
    e.preventDefault();
    $('#identify-dropzone').classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  $('#identify-dropzone').addEventListener(evt, (e) => {
    e.preventDefault();
    $('#identify-dropzone').classList.remove('drag-over');
  });
});

$('#identify-dropzone').addEventListener('drop', (e) => {
  addFiles(e.dataTransfer.files);
});

function addFiles(fileList) {
  const newFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (identifyFiles.length + newFiles.length > 5) {
    alert('Max 5 images.');
    return;
  }
  identifyFiles.push(...newFiles);
  renderIdentifyPreviews();
}

function renderIdentifyPreviews() {
  const container = $('#identify-previews');
  const result = $('#identify-result');
  result.classList.add('hidden');

  if (identifyFiles.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = identifyFiles.map((f, i) => `
    <div class="preview-thumb">
      <img src="${URL.createObjectURL(f)}" alt="">
      <button class="preview-thumb-remove" data-i="${i}">&times;</button>
    </div>
  `).join('');

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = `Analyze ${identifyFiles.length} image${identifyFiles.length > 1 ? 's' : ''}`;
  btn.addEventListener('click', analyzeImages);
  container.appendChild(btn);

  container.querySelectorAll('.preview-thumb-remove').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      identifyFiles.splice(parseInt(b.dataset.i), 1);
      renderIdentifyPreviews();
    });
  });
}

async function analyzeImages() {
  const result = $('#identify-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="identify-loading">Analyzing screenshots&hellip;</div>';

  const form = new FormData();
  identifyFiles.forEach((f) => form.append('images', f));

  try {
    const resp = await fetch('/api/identify', { method: 'POST', body: form });
    const data = await resp.json();

    if (data.error) {
      result.innerHTML = `<div class="identify-clues"><p>${esc(data.error)}</p></div>`;
      return;
    }

    if (data.confidence === 'high' && data.name) {
      result.innerHTML = `
        <div class="identify-match">
          <div class="identify-match-icon">&#127758;</div>
          <strong>${esc(data.name)}</strong>
          <p>${esc(data.clues || '')}</p>
          <button class="btn-primary identify-search-btn">Search this place</button>
        </div>`;
      result.querySelector('.identify-search-btn').addEventListener('click', () => {
        $('#search').value = data.name;
        document.querySelector('.tab[data-tab="search"]').click();
        selectResult(data.name);
      });
    } else {
      result.innerHTML = `
        <div class="identify-clues">
          <strong>Not 100% sure, but here's what I see:</strong>
          <p>${esc(data.clues || 'No clues returned.')}</p>
          ${(data.suggestions || []).length ? `
            <div class="identify-suggestions">
              <span>Try searching for:</span>
              ${data.suggestions.map((s) => `
                <button class="btn-secondary clue-search-btn" data-q="${esc(s)}">${esc(s)}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>`;
      result.querySelectorAll('.clue-search-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          $('#search').value = btn.dataset.q;
          document.querySelector('.tab[data-tab="search"]').click();
          doSearch(btn.dataset.q);
        });
      });
    }
  } catch {
    result.innerHTML = '<div class="identify-clues"><p>Failed to analyze. Is your API key set?</p></div>';
  }
}

// --- Theme toggle ---
function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  $('#theme-toggle').textContent = dark ? '🌙' : '☀️';
  localStorage.setItem('pinbucket-dark', dark ? '1' : '0');
}

const savedDark = localStorage.getItem('pinbucket-dark') === '1';
applyTheme(savedDark);

$('#theme-toggle').addEventListener('click', () => {
  applyTheme(!document.body.classList.contains('dark'));
});

// --- Init ---
loadBoard();
