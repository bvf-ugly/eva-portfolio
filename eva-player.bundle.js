/**
 * eva-player.bundle.js
 * ----------------------
 * Build combinado de eva-player-utils.js + eva-player.js en un único
 * archivo, cargado como <script> clásico (NO type="module"). Esto
 * evita por completo los problemas de MIME-type/CORS que algunos
 * servidores de desarrollo (incluido Live Server con ciertas
 * configuraciones) tienen al servir módulos ES con import/export,
 * que pueden fallar en silencio sin mostrar error en consola.
 *
 * Expone window.EvaPlayer. No requiere "type=module" en el <script>
 * que lo carga, así que funciona en cualquier servidor estático sin
 * configuración adicional.
 *
 * Este archivo se genera a partir de eva-player.js + eva-player-utils.js.
 * Si editas la lógica, hazlo en esos dos archivos fuente y vuelve a
 * generar este bundle (o pide ayuda para regenerarlo).
 */
(function (global) {
  'use strict';

const AUDIO_EXT = ['.mp3', '.m4a', '.ogg', '.wav', '.flac'];

function isAudioFile(filename) {
  const lower = filename.toLowerCase();
  return AUDIO_EXT.some((ext) => lower.endsWith(ext));
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/^\d+[\s._-]*/, '');
}

async function readId3Basic(file) {
  try {
    const buf = await file.slice(0, 1024 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) return null;
    const size = ((view.getUint8(6) & 0x7f) << 21) | ((view.getUint8(7) & 0x7f) << 14) |
                 ((view.getUint8(8) & 0x7f) << 7) | (view.getUint8(9) & 0x7f);
    let offset = 10;
    const end = Math.min(10 + size, buf.byteLength);
    const result = { title: null, artist: null, picture: null };
    while (offset < end - 10) {
      const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
      const frameSize = view.getUint32(offset + 4, false);
      if (frameSize <= 0 || offset + 10 + frameSize > buf.byteLength) break;
      const frameStart = offset + 10;
      if (id === 'TIT2' || id === 'TPE1') {
        const encoding = view.getUint8(frameStart);
        const bytes = new Uint8Array(buf, frameStart + 1, frameSize - 1);
        let text = (encoding === 1 || encoding === 2) ? new TextDecoder('utf-16').decode(bytes) : new TextDecoder('latin1').decode(bytes);
        text = text.replace(/\0/g, '').trim();
        if (id === 'TIT2') result.title = text; else result.artist = text;
      } else if (id === 'APIC') {
        const bytes = new Uint8Array(buf, frameStart, frameSize);
        let p = 1; let mime = '';
        while (bytes[p] !== 0 && p < bytes.length) { mime += String.fromCharCode(bytes[p]); p++; }
        p++; p++;
        while (bytes[p] !== 0 && p < bytes.length) p++;
        p++;
        const blob = new Blob([bytes.slice(p)], { type: mime || 'image/jpeg' });
        result.picture = URL.createObjectURL(blob);
      }
      offset = frameStart + frameSize;
    }
    return (result.title || result.artist || result.picture) ? result : null;
  } catch { return null; }
}

async function trackFromFile(file) {
  const tags = await readId3Basic(file);
  return {
    title: tags?.title || titleFromFilename(file.name) || file.name,
    artist: tags?.artist || 'Unknown',
    src: URL.createObjectURL(file),
    cover: tags?.picture || '',
    duration: 0,
    _localFile: true,
  };
}

const STORAGE_KEY = 'eva-player-state-v1';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 3l-7 7 7 7M5 21l7-7-7-7"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 3a6 6 0 0 1 0 12M3 21a6 6 0 0 1 0-12"/><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/></svg>',
  volHigh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  volLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  volMute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
};

class EvaPlayer {
  constructor(rootEl) {
    this.root = rootEl;
    this.audio = null; // Deferred — created on first user gesture (mobile requires this)
    this.state = {
      playlist: [], index: 0, shuffledIndices: [],
      loop: 'none', shuffle: false, volume: 0.5, muted: false,
      view: 'expanded', pos: null,
    };
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };
    this._playlistOpen = false;
    this._restorePersisted();
    this._render();
    this._bindAudioEvents();
    this._bindGlobalEvents();
    this._bootSequence();
    this._eq = null;
    window.__evaPlayer = this;
    setTimeout(() => this._initEQ(), 150);
  }

  _ensureAudio() {
    if (this.audio) return this.audio;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    // Re-apply saved state
    this.audio.volume = this.state.muted ? 0 : this.state.volume;
    this.audio.muted = this.state.muted;
    // Re-bind audio events on the new element
    this._bindAudioEvents();
    // Connect EQ if available
    this._connectEQToPlayer();
    return this.audio;
  }

  _restorePersisted() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.pos) this.state.pos = saved.pos;
      if (saved.view) this.state.view = saved.view;
      if (typeof saved.volume === 'number') this.state.volume = saved.volume;
      if (saved.loop) this.state.loop = saved.loop;
      if (typeof saved.shuffle === 'boolean') this.state.shuffle = saved.shuffle;
    } catch { /* no-op */ }
  }

  _persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        pos: this.state.pos, view: this.state.view,
        volume: this.state.volume, loop: this.state.loop, shuffle: this.state.shuffle,
      }));
    } catch { /* no-op */ }
  }

  async loadFromJson(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        this.setPlaylist(data, `JSON: ${url}`);
      } else {
        this._showEmptyMessage('Sin pistas — toca 📁 para elegir música');
      }
    } catch (err) {
      console.warn('[EVA Player] No se pudo cargar', url, err.message);
      if (window.__EVA_PLAYLIST_DATA && window.__EVA_PLAYLIST_DATA.length) {
        this.setPlaylist(window.__EVA_PLAYLIST_DATA, 'Playlist embebida');
      } else {
        this._showEmptyMessage('Sin pistas — toca 📁 para elegir música');
      }
    }
  }

  setPlaylist(arr) {
    this.state.playlist = arr.map((t, i) => ({
      title: t.title || `Track ${i + 1}`,
      artist: t.artist || 'Unknown',
      src: t.src, cover: t.cover || '', duration: t.duration || 0,
    }));
    this.state.index = 0;
    this._buildShuffledIndices();
    this._renderPlaylistItems();
    this._loadTrack(0);
  }

  _showEmptyMessage(text) {
    const titleEl = this.root.querySelector('.ep-title');
    const artistEl = this.root.querySelector('.ep-artist');
    if (titleEl) titleEl.textContent = text;
    if (artistEl) artistEl.textContent = '';
  }

  _loadTrack(index) {
    const list = this.state.playlist;
    if (!list.length) return;
    const track = list[index];
    const a = this._ensureAudio();
    a.src = track.src;
    a.load();
    const titleEl = this.root.querySelector('.ep-title');
    const artistEl = this.root.querySelector('.ep-artist');
    const coverImg = this.root.querySelector('.ep-cover-img');
    const coverPlaceholder = this.root.querySelector('.ep-cover-placeholder');
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    coverImg.classList.remove('is-loaded');
    if (track.cover) {
      coverImg.onload = () => coverImg.classList.add('is-loaded');
      coverImg.onerror = () => { coverImg.style.display = 'none'; coverPlaceholder.style.display = 'flex'; };
      coverImg.style.display = 'block';
      coverPlaceholder.style.display = 'none';
      coverImg.src = track.cover;
    } else {
      coverImg.style.display = 'none';
      coverPlaceholder.style.display = 'flex';
    }
    this._updateActivePlaylistItem();
  }

  play() {
    const a = this._ensureAudio();
    // Resume AudioContext if suspended (mobile browsers require user gesture)
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    a.play().catch(() => {});
  }
  pause() { if (this.audio) this.audio.pause(); }
  toggle() { this._ensureAudio(); this.audio.paused ? this.play() : this.pause(); }

  prev() {
    if (!this.state.playlist.length) return;
    this.state.index = this._stepIndex(-1);
    this._loadTrack(this.state.index); this.play();
  }

  next() {
    if (!this.state.playlist.length) return;
    if (this.state.loop === 'one') { if (this.audio) this.audio.currentTime = 0; this.play(); return; }
    this.state.index = this._stepIndex(1);
    this._loadTrack(this.state.index); this.play();
  }

  _stepIndex(direction) {
    const { playlist, shuffle, shuffledIndices, index } = this.state;
    if (shuffle) {
      const pos = shuffledIndices.indexOf(index);
      return shuffledIndices[(pos + direction + shuffledIndices.length) % shuffledIndices.length];
    }
    return (index + direction + playlist.length) % playlist.length;
  }

  seek(percent) {
    if (!this.audio || !isFinite(this.audio.duration)) return;
    this.audio.currentTime = percent * this.audio.duration;
  }

  setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    this.state.volume = v;
    if (this.audio) this.audio.volume = this.state.muted ? 0 : v;
    this._updateVolumeUI(); this._persist();
  }

  toggleMute() {
    this.state.muted = !this.state.muted;
    if (this.audio) this.audio.muted = this.state.muted;
    this._updateVolumeUI();
  }

  setLoop(mode) {
    this.state.loop = mode;
    this.root.querySelector('.ep-btn-loop').classList.toggle('is-active', mode !== 'none');
    this._persist();
  }

  setShuffle(on) {
    this.state.shuffle = !!on;
    this.root.querySelector('.ep-btn-shuffle').classList.toggle('is-active', this.state.shuffle);
    this._buildShuffledIndices(); this._persist();
  }

  _buildShuffledIndices() {
    const arr = [...Array(this.state.playlist.length).keys()];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this.state.shuffledIndices = arr;
  }

  _bindAudioEvents() {
    const a = this.audio;
    if (!a) return;
    a.addEventListener('play', () => this._setPlayingUI(true));
    a.addEventListener('pause', () => this._setPlayingUI(false));
    a.addEventListener('waiting', () => this._setLoadingUI(true));
    a.addEventListener('canplay', () => this._setLoadingUI(false));
    a.addEventListener('timeupdate', () => this._onTimeUpdate());
    a.addEventListener('loadedmetadata', () => this._onLoadedMeta());
    a.addEventListener('progress', () => this._onBufferProgress());
    a.addEventListener('ended', () => this._onEnded());
    a.addEventListener('error', () => this._onAudioError());
  }

  _setPlayingUI(isPlaying) {
    this.root.querySelector('.ep-icon-play').style.display = isPlaying ? 'none' : 'block';
    this.root.querySelector('.ep-icon-pause').style.display = isPlaying ? 'block' : 'none';
    this.root.querySelector('.ep-cover').classList.toggle('is-playing', isPlaying);
  }

  _setLoadingUI(isLoading) {
    const btnPlay = this.root.querySelector('.ep-btn-play');
    btnPlay.style.opacity = isLoading ? '0.55' : '1';
    btnPlay.style.pointerEvents = isLoading ? 'none' : 'auto';
  }

  _onTimeUpdate() {
    if (this._draggingProgress || !this.audio) return;
    const pct = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    this.root.querySelector('.ep-progress-fill').style.width = `${pct}%`;
    this.root.querySelector('.ep-progress-handle').style.left = `${pct}%`;
    this.root.querySelector('.ep-current-time').textContent = formatTime(this.audio.currentTime);
  }

  _onLoadedMeta() {
    if (!this.audio) return;
    this.root.querySelector('.ep-duration').textContent = formatTime(this.audio.duration);
    const track = this.state.playlist[this.state.index];
    if (track) track.duration = this.audio.duration;
    this._renderPlaylistItems();
  }

  _onBufferProgress() {
    if (!this.audio) return;
    const buffered = this.audio.buffered;
    if (buffered.length && this.audio.duration) {
      const pct = (buffered.end(buffered.length - 1) / this.audio.duration) * 100;
      this.root.querySelector('.ep-progress-buffered').style.width = `${pct}%`;
    }
  }

  _onEnded() {
    if (this.state.loop === 'one') { if (this.audio) this.audio.currentTime = 0; this.play(); }
    else this.next();
  }

  _onAudioError() {
    this._showEmptyMessage('Error al cargar la pista');
    this._setLoadingUI(false); this._glitch();
  }

  _render() {
    this.root.innerHTML = `
      <div class="ep" data-view="${this.state.view}">
        <div class="ep-drag-handle" title="Arrastrar">${ICONS.drag}</div>
        <div class="ep-card">
          <div class="ep-scanline" aria-hidden="true"></div>
          <div class="ep-body">
            <div class="ep-cover" aria-hidden="true">
              <img class="ep-cover-img" src="" alt="" loading="lazy" decoding="async">
              <div class="ep-cover-placeholder">EVA</div>
            </div>
            <div class="ep-info">
              <div class="ep-title">—</div>
              <div class="ep-artist">—</div>
              <div class="ep-meta-row">
                <span class="ep-current-time">0:00</span>
                <div class="ep-progress" role="slider" aria-label="Progreso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                  <div class="ep-progress-buffered"></div>
                  <div class="ep-progress-fill"></div>
                  <div class="ep-progress-handle"></div>
                </div>
                <span class="ep-duration">0:00</span>
              </div>
            </div>
            <div class="ep-controls">
              <button class="ep-btn ep-btn-shuffle" aria-label="Aleatorio" title="Aleatorio (S)">${ICONS.shuffle}</button>
              <button class="ep-btn ep-btn-prev" aria-label="Anterior" title="Anterior (P)">${ICONS.prev}</button>
              <button class="ep-btn ep-btn-play ep-btn-play--main" aria-label="Reproducir" title="Reproducir/Pausa (Espacio)">
                <span class="ep-icon-play">${ICONS.play}</span>
                <span class="ep-icon-pause" style="display:none">${ICONS.pause}</span>
              </button>
              <button class="ep-btn ep-btn-next" aria-label="Siguiente" title="Siguiente (N)">${ICONS.next}</button>
              <button class="ep-btn ep-btn-loop" aria-label="Repetir" title="Repetir (L)">${ICONS.loop}</button>
            </div>
            <div class="ep-volume">
              <button class="ep-btn ep-btn-mute" aria-label="Silenciar" title="Silenciar (M)">
                <span class="ep-icon-vol-high">${ICONS.volHigh}</span>
                <span class="ep-icon-vol-low" style="display:none">${ICONS.volLow}</span>
                <span class="ep-icon-vol-mute" style="display:none">${ICONS.volMute}</span>
              </button>
              <input type="range" class="ep-volume-slider" min="0" max="1" step="0.01" aria-label="Volumen">
            </div>
            <button class="ep-btn ep-btn-eq" aria-label="Ecualizador" title="Ecualizador (Q)">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <line x1="2" y1="4" x2="14" y2="4"/>
                <line x1="2" y1="9" x2="14" y2="9"/>
                <line x1="2" y1="13" x2="14" y2="13"/>
                <circle cx="5" cy="4" r="1.6" fill="currentColor" stroke="none"/>
                <circle cx="10" cy="9" r="1.6" fill="currentColor" stroke="none"/>
                <circle cx="7" cy="13" r="1.6" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            <div class="ep-window-controls">
              <button class="ep-btn ep-btn-collapse" aria-label="Minimizar" title="Minimizar a pastilla">${ICONS.collapse}</button>
              <button class="ep-btn ep-btn-hide" aria-label="Ocultar" title="Ocultar reproductor">${ICONS.close}</button>
            </div>
          </div>
          <div class="ep-playlist" role="listbox" aria-label="Lista de reproducción"></div>
        </div>
        <button class="ep-reopen-fab" aria-label="Mostrar reproductor" title="Mostrar reproductor">
          <span class="ep-fab-pulse" aria-hidden="true"></span>
          ${ICONS.play}
        </button>
      </div>
    `;
    this._bindUIEvents();
    this._applyView();
    this._updateVolumeUI();
    this.root.querySelector('.ep-volume-slider').value = this.state.volume;
    this.setLoop(this.state.loop);
    this.setShuffle(this.state.shuffle);
  }

  _renderPlaylistItems() {
    const container = this.root.querySelector('.ep-playlist');
    container.innerHTML = '';
    this.state.playlist.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = 'ep-playlist-item' + (i === this.state.index ? ' is-active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', i === this.state.index);
      item.innerHTML = `
        <img class="ep-playlist-cover" src="${track.cover || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="ep-playlist-meta">
          <span class="ep-playlist-title">${escapeHtml(track.title)}</span>
          <span class="ep-playlist-artist">${escapeHtml(track.artist)}</span>
        </div>
        <span class="ep-playlist-duration">${track.duration ? formatTime(track.duration) : '—'}</span>
      `;
      item.addEventListener('click', () => {
        this.state.index = i; this._loadTrack(i); this.play(); this._closePlaylist();
      });
      container.appendChild(item);
    });
  }

  _updateActivePlaylistItem() {
    this.root.querySelectorAll('.ep-playlist-item').forEach((el, i) => {
      el.classList.toggle('is-active', i === this.state.index);
      el.setAttribute('aria-selected', i === this.state.index);
    });
  }

  _updateVolumeUI() {
    const v = this.state.muted ? 0 : this.state.volume;
    this.root.querySelector('.ep-icon-vol-high').style.display = v > 0.5 ? 'block' : 'none';
    this.root.querySelector('.ep-icon-vol-low').style.display = v > 0 && v <= 0.5 ? 'block' : 'none';
    this.root.querySelector('.ep-icon-vol-mute').style.display = v === 0 ? 'block' : 'none';
  }

  setView(view) {
    this.state.view = view;
    this._applyView();
    this._persist();
    requestAnimationFrame(() => {
      if (!this.state.pos) return;
      const clamped = this._clampToViewport(this.state.pos.x, this.state.pos.y);
      this._setPosition(clamped.x, clamped.y);
    });
  }

  _applyView() {
    const wrapper = this.root.querySelector('.ep');
    if (!wrapper) return;
    wrapper.dataset.view = this.state.view;
    const btnCollapse = this.root.querySelector('.ep-btn-collapse');
    const isCollapsed = this.state.view === 'collapsed';
    btnCollapse.innerHTML = isCollapsed ? ICONS.expand : ICONS.collapse;
    btnCollapse.title = isCollapsed ? 'Expandir reproductor' : 'Minimizar a pastilla';
    btnCollapse.setAttribute('aria-pressed', String(isCollapsed));
  }

  _bindUIEvents() {
    const $ = (sel) => this.root.querySelector(sel);
    $('.ep-btn-play').addEventListener('click', () => this.toggle());
    $('.ep-btn-prev').addEventListener('click', () => this.prev());
    $('.ep-btn-next').addEventListener('click', () => this.next());
    $('.ep-btn-loop').addEventListener('click', () => {
      const modes = ['none', 'all', 'one'];
      this.setLoop(modes[(modes.indexOf(this.state.loop) + 1) % modes.length]);
    });
    $('.ep-btn-shuffle').addEventListener('click', () => this.setShuffle(!this.state.shuffle));
    $('.ep-btn-mute').addEventListener('click', () => this.toggleMute());
    $('.ep-volume-slider').addEventListener('input', (e) => this.setVolume(parseFloat(e.target.value)));

    const progress = $('.ep-progress');
    progress.addEventListener('pointerdown', (e) => this._startProgressDrag(e));
    progress.addEventListener('keydown', (e) => this._progressKeyNav(e));

    $('.ep-btn-collapse').addEventListener('click', () => {
      this.setView(this.state.view === 'collapsed' ? 'expanded' : 'collapsed');
    });
    $('.ep-btn-hide').addEventListener('click', () => this.setView('hidden'));
    $('.ep-reopen-fab').addEventListener('click', () => this.setView('expanded'));

    // Botón EQ — abre/cierra el EQ flotante
    const eqBtn = this.root.querySelector('.ep-btn-eq');
    if (eqBtn) {
      eqBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = eqBtn.classList.toggle('is-active');
        if (this._eq) {
          if (isActive) {
            this._eq.show();
          } else {
            this._eq.hide();
          }
        }
      });
    }

    // Tecla Q abre/cierra EQ
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !e.target.closest('input,textarea,[contenteditable]')) {
        const btn = this.root.querySelector('.ep-btn-eq');
        if (btn) btn.click();
      }
    });

    // Escuchar cierre desde el EQ
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'eva-eq-closed') {
        const btn = this.root.querySelector('.ep-btn-eq');
        if (btn) btn.classList.remove('is-active');
      }
    });

    this._bindDrag();
  }

  _togglePlaylist() {
    this._playlistOpen = !this._playlistOpen;
    this.root.querySelector('.ep-playlist').classList.toggle('is-open', this._playlistOpen);
  }

  _closePlaylist() {
    this._playlistOpen = false;
    this.root.querySelector('.ep-playlist').classList.remove('is-open');
  }

  _startProgressDrag(e) {
    this._draggingProgress = true;
    this._updateProgressFromEvent(e);
    const move = (ev) => this._draggingProgress && this._updateProgressFromEvent(ev);
    const end = () => {
      this._draggingProgress = false;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
  }

  _updateProgressFromEvent(e) {
    const progress = this.root.querySelector('.ep-progress');
    const rect = progress.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.seek(pct);
    this.root.querySelector('.ep-progress-fill').style.width = `${pct * 100}%`;
    this.root.querySelector('.ep-progress-handle').style.left = `${pct * 100}%`;
  }

  _progressKeyNav(e) {
    const progress = this.root.querySelector('.ep-progress');
    let pct = (parseFloat(progress.getAttribute('aria-valuenow')) || 0) / 100;
    const step = 0.01;
    if (e.key === 'ArrowRight') pct = Math.min(1, pct + step);
    else if (e.key === 'ArrowLeft') pct = Math.max(0, pct - step);
    else if (e.key === 'Home') pct = 0;
    else if (e.key === 'End') pct = 1;
    else return;
    e.preventDefault(); this.seek(pct);
  }

  _bindDrag() {
    const handle = this.root.querySelector('.ep-drag-handle');
    const card = this.root.querySelector('.ep-card');
    const wrapper = this.root.querySelector('.ep');

    const onPointerDown = (e) => {
      this._dragging = true;
      wrapper.classList.add('is-dragging');
      const rect = this.root.getBoundingClientRect();
      this._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!this._dragging) return;
      const maxX = window.innerWidth - this.root.offsetWidth;
      const maxY = window.innerHeight - this.root.offsetHeight;
      this._setPosition(
        Math.max(0, Math.min(maxX, e.clientX - this._dragOffset.x)),
        Math.max(0, Math.min(maxY, e.clientY - this._dragOffset.y))
      );
    };

    const onPointerUp = () => {
      this._dragging = false;
      wrapper.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      this._persist();
    };

    handle.addEventListener('pointerdown', onPointerDown);
    card.querySelector('.ep-cover').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      onPointerDown(e);
    });
  }

  _setPosition(x, y) {
    this.state.pos = { x, y };
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.root.style.bottom = 'auto';
  }

  _applyInitialPosition() {
    if (this.state.pos) {
      const clamped = this._clampToViewport(this.state.pos.x, this.state.pos.y);
      this._setPosition(clamped.x, clamped.y);
    } else {
      this.root.style.left = '20px';
      this.root.style.bottom = '20px';
      this.root.style.top = 'auto';
    }
    window.addEventListener('resize', () => {
      if (!this.state.pos) return;
      const clamped = this._clampToViewport(this.state.pos.x, this.state.pos.y);
      this._setPosition(clamped.x, clamped.y);
    });
  }

  _clampToViewport(x, y) {
    const w = this.root.offsetWidth || 300;
    const h = this.root.offsetHeight || 60;
    return {
      x: Math.max(0, Math.min(Math.max(0, window.innerWidth - w), x)),
      y: Math.max(0, Math.min(Math.max(0, window.innerHeight - h), y)),
    };
  }

  _bindGlobalEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.toggle(); break;
        case 'ArrowRight':
          if (this.audio && isFinite(this.audio.duration)) { e.preventDefault(); this.seek(Math.min(1, (this.audio.currentTime + 5) / this.audio.duration)); } break;
        case 'ArrowLeft':
          if (this.audio && isFinite(this.audio.duration)) { e.preventDefault(); this.seek(Math.max(0, (this.audio.currentTime - 5) / this.audio.duration)); } break;
        case 'KeyM': this.toggleMute(); break;
        case 'KeyN': this.next(); break;
        case 'KeyP': this.prev(); break;
        case 'KeyS': this.setShuffle(!this.state.shuffle); break;
        case 'KeyL': {
          const modes = ['none', 'all', 'one'];
          this.setLoop(modes[(modes.indexOf(this.state.loop) + 1) % modes.length]); break;
        }
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.root.contains(e.target)) { this._closePlaylist(); }
    });
    this._applyInitialPosition();
  }

  _initEQ() {
    if (!window.EvaEQFloat) return;
    try {
      this._eq = new window.EvaEQFloat({
        container: document.body,
        defaultPosition: { x: window.innerWidth - 520, y: 60 }
      });
      this._connectEQToPlayer();
    } catch(e) {
      console.error('[EVA Player] Error al inicializar EQ:', e);
    }
  }

  _connectEQToPlayer() {
    if (!this._eq) return;
    if (!this._eq.state) return;
    if (!this.audio) return; // Audio not created yet (deferred for mobile)

    // Create AudioContext if it doesn't exist
    if (!this._audioCtx) {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Resume if suspended (mobile browsers suspend without user gesture)
        if (this._audioCtx.state === 'suspended') {
          this._audioCtx.resume();
        }
      } catch(e) {
        console.error('[EVA Player] No se pudo crear AudioContext:', e);
        return;
      }
    }
    const ctx = this._audioCtx;

    // Create MediaElementSource if not already connected
    if (!this._mediaSource) {
      try {
        this._mediaSource = ctx.createMediaElementSource(this.audio);
      } catch(e) {
        console.error('[EVA Player] No se pudo crear MediaElementSource:', e);
        return;
      }
    }

    // Set up EQ state for the module
    this._eq.state.audioCtx = ctx;
    this._eq.state.source = this._mediaSource;

    // Create destination gain node
    this._eq.state.destination = ctx.createGain();
    this._eq.state.destination.connect(ctx.destination);

    // Create EQ filters
    this._eq.state.filters = [];
    const freqs = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000];
    for (let i = 0; i < freqs.length; i++) {
      const f = ctx.createBiquadFilter();
      f.type = (i === 0) ? 'lowshelf' : (i === freqs.length - 1) ? 'highshelf' : 'peaking';
      f.frequency.value = freqs[i];
      f.Q.value = 1.4;
      f.gain.value = (this._eq.state.gains && this._eq.state.gains[i]) || 0;
      this._eq.state.filters.push(f);
    }

    // Connect chain: source → filters → destination
    let chain = this._mediaSource;
    for (const f of this._eq.state.filters) {
      chain.connect(f);
      chain = f;
    }
    chain.connect(this._eq.state.destination);

    console.log('[EVA Player] EQ conectado al AudioContext');
  }

  _bootSequence() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = this.root.querySelector('.ep-card');
    card.classList.add('ep-boot');
    setTimeout(() => card.classList.remove('ep-boot'), 900);
  }

  _glitch() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = this.root.querySelector('.ep-card');
    card.classList.add('ep-glitch');
    setTimeout(() => card.classList.remove('ep-glitch'), 420);
  }
}

  global.EvaPlayer = EvaPlayer;
})(window);
