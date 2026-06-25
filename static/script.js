let selectedPreview = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

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

    const descSnippet = loc.description ? esc(firstSentences(loc.description, 2)) : '';
    const noteSnippet = loc.note ? `<div class="card-note-tag">"${esc(loc.note)}"</div>` : '';

    if (loc.image_url) {
      card.innerHTML = `
        <img src="${esc(loc.image_url)}" alt="${esc(loc.name)}" loading="lazy">
        <div class="card-overlay">
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
  const note = $('#preview-note').value.trim();

  const resp = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: selectedPreview.title,
      description: selectedPreview.description,
      image_url: selectedPreview.image_url,
      image_urls: selectedPreview.image_urls || [],
      lat: selectedPreview.lat,
      lon: selectedPreview.lon,
      note,
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
    loadBoard();
  }
});

// --- Modal ---
let galleryImages = [];
let galleryIdx = 0;

function openModal(loc) {
  $('#modal-title').textContent = loc.name;
  $('#modal-desc').textContent = loc.description || '';
  $('#modal-note').textContent = loc.note || '';

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

  $('#modal-delete').onclick = async () => {
    if (!confirm('Delete this card?')) return;
    await fetch(`/api/locations/${loc.id}`, { method: 'DELETE' });
    closeModal();
    loadBoard();
  };

  $('#modal').classList.remove('hidden');
  $('#modal').dataset.id = loc.id;
}

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

function firstSentences(text, n) {
  const match = String(text).match(/(.*?[.!?](\s|$)){1,' + n + '}/s);
  return match ? match[0].trim() : text;
}

// --- Init ---
loadBoard();
