/* ============================================
   eva-eq-float.js — EQ flotante reutilizable
   Trabaja con AudioContext del player o crea el suyo propio
   ============================================ */

 export class EvaEQFloat {
   constructor(options = {}) {
     this.options = {
       container: document.body,
       defaultPosition: { x: 100, y: 100 },
       ...options
     };

     this.state = {
       isOpen: false,
       isDragging: false,
       isVisible: true,
       gains: [],
       masterGain: 1,
       activePreset: null,
       audioCtx: null,
       destination: null,
       filters: [],
       position: { ...this.options.defaultPosition },
       dragOffset: { x: 0, y: 0 }
     };

     this._bindEQData();
     this._buildUI();
     this._bindEvents();
     this._restorePosition();

     // Esperar a que el AudioContext del player esté listo
     this._waitForAudioConnection();
   }

   _bindEQData() {
     // Bandas EQ NERV/Evangelion
     this.eqBands = [
       { f: 60, label: '60', db: 0 },
       { f: 170, label: '170', db: 0 },
       { f: 310, label: '310', db: 0 },
       { f: 600, label: '600', db: 0 },
       { f: 1000, label: '1K', db: 0 },
       { f: 3000, label: '3K', db: 0 },
       { f: 6000, label: '6K', db: 0 },
       { f: 12000, label: '12K', db: 0 },
       { f: 14000, label: '14K', db: 0 },
     ];

     // Presets NERV
     this.presets = {
       flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
       nerv: [4, 3, 1, 0, -1, 2, 4, 5, 4],
       'at-field': [6, 4, 2, 0, -2, -1, 1, 3, 5],
       entry: [-2, 0, 2, 4, 3, 2, 1, 0, -1],
       lain: [0, -2, -3, 0, 3, 2, -1, -3, -2],
     };

     // Estado inicial de las bandas
     this.state.gains = [...this.presets.flat];
     this.state.activePreset = 'flat';
   }

   _buildUI() {
     // Panel principal
     this.panel = document.createElement('div');
      this.panel.className = 'eq-float-panel hidden';
     this.panel.style.position = 'fixed';
     this.panel.style.left = `${this.state.position.x}px`;
     this.panel.style.top = `${this.state.position.y}px`;
     this.panel.setAttribute('role', 'dialog');
     this.panel.setAttribute('aria-label', 'Ecualizador de audio');

      // Header
      const header = document.createElement('div');
     header.className = 'eq-float-header';
     header.innerHTML = `
       <span class="eq-float-title">MAGI // EQ-9</span>
       <button class="eq-float-close" aria-label="Cerrar ecualizador">✕</button>
     `;

     // Contenido principal
     const content = document.createElement('div');
     content.className = 'eq-float-content';
     content.innerHTML = `
       <div class="eq-float-presets" id="eqPresets"></div>
       <canvas class="eq-float-viz" id="eqViz" width="340" height="40"></canvas>
        <div class="eq-float-bands" id="eqBands"></div>
       <div class="eq-float-footer">
         <div class="eq-float-master-gain">
           <span>GAIN</span>
           <input type="range" id="eqMasterGain" min="0.5" max="2" step="0.01" value="1">
           <span id="eqMasterGainVal">0 dB</span>
         </div>
         <button class="eq-float-reset" id="eqReset">RESET</button>
       </div>
     `;

     // Ensamblar panel
     this.panel.appendChild(dragHandle);
     this.panel.appendChild(header);
     this.panel.appendChild(content);
     this.options.container.appendChild(this.panel);

     this._buildPresets();
     this._buildBands();
     this._updateViz();
   }

   _buildPresets() {
     const container = this.panel.querySelector('#eqPresets');
     Object.entries(this.presets).forEach(([name, gains]) => {
       const btn = document.createElement('button');
       btn.className = 'eq-float-preset';
       btn.dataset.preset = name;
       btn.textContent = name.toUpperCase();

       if (name === this.state.activePreset) {
         btn.classList.add('is-active');
       }

       btn.addEventListener('click', () => this.applyPreset(name, btn));
       container.appendChild(btn);
     });
   }

   _buildBands() {
     const container = this.panel.querySelector('#eqBands');
     container.innerHTML = '';

     this.eqBands.forEach((band, i) => {
       const bandEl = document.createElement('div');
       bandEl.className = 'eq-float-band';
       bandEl.dataset.index = i;

       const label = document.createElement('label');
       label.textContent = band.label + 'Hz';

       const slider = document.createElement('input');
       slider.type = 'range';
       slider.min = -12;
       slider.max = 12;
       slider.step = 0.5;
       slider.value = this.state.gains[i];

       const dB = document.createElement('span');
       dB.className = 'eq-float-dB';
       dB.textContent = this._formatDB(this.state.gains[i]);

       // Evento del slider
       slider.addEventListener('input', (e) => {
         this.state.gains[i] = parseFloat(e.target.value);
         dB.textContent = this._formatDB(this.state.gains[i]);
         this._clearPreset();
         this._updateAll();
       });

       // Hover sobre el band para mostrar dB
       bandEl.addEventListener('mouseenter', () => {
         dB.style.opacity = '1';
       });

       bandEl.addEventListener('mouseleave', () => {
         dB.style.opacity = '0';
       });

       bandEl.appendChild(label);
       bandEl.appendChild(slider);
       bandEl.appendChild(dB);
       container.appendChild(bandEl);
     });
   }

   _updateViz() {
     if (!this.panel) return;

     const canvas = this.panel.querySelector('#eqViz');
     if (!canvas) return;

     const ctx = canvas.getContext('2d');
     const W = canvas.width, H = canvas.height;

     // Curva de respuesta frecuencia/dB
     const minF = 20, maxF = 20000;
     const pts = [];

     for (let px = 0; px < W; px++) {
       const t = px / W;
       const freq = minF * Math.pow(maxF / minF, t);
       let db = 0;

       this.eqBands.forEach((band, i) => {
         const oct = Math.log2(freq / band.f);
         db += this.state.gains[i] * Math.exp(-oct * oct * 2.5);
       });

       const y = H / 2 - (db / 12) * (H / 2 - 4);
       pts.push([px, y]);
     }

     // Relleno
     const grad = ctx.createLinearGradient(0, 0, 0, H);
     grad.addColorStop(0, 'rgba(46, 213, 115, 0.18)');
     grad.addColorStop(1, 'rgba(0, 229, 255, 0.04)');
     ctx.beginPath();
     ctx.moveTo(pts[0][0], H);
     pts.forEach(([x, y]) => ctx.lineTo(x, y));
     ctx.lineTo(W, H);
     ctx.closePath();
     ctx.fillStyle = grad;
     ctx.fill();

     // Línea
     ctx.beginPath();
     ctx.moveTo(pts[0][0], pts[0][1]);
     pts.forEach(([x, y]) => ctx.lineTo(x, y));
     ctx.strokeStyle = 'rgba(46, 213, 115, 0.7)';
     ctx.lineWidth = 1.5;
     ctx.stroke();

     // Línea central (0 dB)
     ctx.beginPath();
     ctx.moveTo(0, H / 2);
     ctx.lineTo(W, H / 2);
     ctx.strokeStyle = 'rgba(255,255,255,0.08)';
     ctx.lineWidth = 1;
     ctx.stroke();

     // Programar próximo frame
     requestAnimationFrame(() => this._updateViz());
   }

   _clearPreset() {
     this.state.activePreset = null;
     this.panel.querySelectorAll('.eq-float-preset').forEach(b => {
       b.classList.remove('is-active');
     });
   }

   applyPreset(name, btn) {
     if (this.presets[name]) {
       this.state.gains = [...this.presets[name]];
       this.state.activePreset = name;

       // Actualizar sliders
       this.panel.querySelectorAll('.eq-float-band input[type="range"]').forEach((slider, i) => {
         slider.value = this.state.gains[i];
         const dB = slider.parentElement.querySelector('.eq-float-dB');
         if (dB) dB.textContent = this._formatDB(this.state.gains[i]);
       });

       // Actualizar botones de presets activos
       this.panel.querySelectorAll('.eq-float-preset').forEach(b => {
         b.classList.toggle('is-active', b === btn);
       });

       this._updateAll();
     }
   }

   _updateAll() {
     this._updateViz();
     this._updateAudioFilters();
     this._saveState();
   }

   _updateAudioFilters() {
     if (!this.state.filters || !this.state.destination) return;

     // Aplicar ganancia a cada filtro
     this.state.gains.forEach((gain, i) => {
       if (this.state.filters[i]) {
         this.state.filters[i].gain.value = gain;
       }
     });

     // Aplicar ganancia maestra
     if (this.state.masterGain !== 1) {
       // El masterGain es un NodeGain separado
       if (!this.state.masterGainNode) {
         this.state.masterGainNode = this.state.audioCtx.createGain();
         this.state.destination.disconnect();
         this.state.destination = this.state.audioCtx.createGain();
         this.state.destination.connect(this.state.audioCtx.destination);
         // Re-conectar los filtros al nuevo destino
         this.state.filters.forEach((filter, i) => {
           if (i === 0) {
             this.state.source.disconnect();
             this.state.source.connect(filter);
           } else {
             this.state.filters[i - 1].disconnect();
             this.state.filters[i - 1].connect(filter);
           }
         });
         this.state.filters[this.state.filters.length - 1].disconnect();
         this.state.filters[this.state.filters.length - 1].connect(this.state.destination);
         this.state.destination.connect(this.state.audioCtx.destination);
       }
       this.state.masterGainNode.gain.value = this.state.masterGain;
     }
   }

   _waitForAudioConnection() {
       const checkInterval = setInterval(() => {
         if (this.state.audioCtx) return;
         if (window.__evaPlayer && window.__evaPlayer._audioCtx) {
           this.state.audioCtx = window.__evaPlayer._audioCtx;
           clearInterval(checkInterval);
         }
       }, 100);
    }

     _bindEvents() {
      // Cerrar panel
      const closeBtn = this.panel.querySelector('.eq-float-close');
      closeBtn.addEventListener('click', () => this.hide());
      closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

      // Dragger — toda la header es arrastrable
      const dragHandle = this.panel.querySelector('.eq-float-header');
      dragHandle.addEventListener('pointerdown', (e) => this._startDrag(e));

     // Presets
     this.panel.querySelector('#eqPresets').addEventListener('click', (e) => {
       if (e.target.classList.contains('eq-float-preset')) {
         this.applyPreset(e.target.dataset.preset, e.target);
       }
     });

     // Slider del gain maestro
     const masterGainSlider = this.panel.querySelector('#eqMasterGain');
     masterGainSlider.addEventListener('input', (e) => {
       this.state.masterGain = parseFloat(e.target.value);
       const db = (20 * Math.log10(this.state.masterGain)).toFixed(1);
       this.panel.querySelector('#eqMasterGainVal').textContent = (db >= 0 ? '+' : '') + db + ' dB';
       this._updateAudioFilters();
       this._clearPreset();
     });

     // Reset
     const resetBtn = this.panel.querySelector('#eqReset');
     resetBtn.addEventListener('click', () => {
       this.applyPreset('flat', this.panel.querySelector('.eq-float-preset[data-preset="flat"]'));
       masterGainSlider.value = 1;
       this.state.masterGain = 1;
       this.panel.querySelector('#eqMasterGainVal').textContent = '0 dB';
     });

     // Escape key
     this._escapeHandler = (e) => {
       if (e.key === 'Escape' && this.state.isOpen) {
         this.hide();
       }
     };
     document.addEventListener('keydown', this._escapeHandler);
   }

   _startDrag(e) {
     if (e.pointerType === 'mouse' && e.button !== 0) return;

     this.state.isDragging = true;
     this.panel.classList.add('dragging');

     const rect = this.panel.getBoundingClientRect();
     this.state.dragOffset = {
       x: e.clientX - rect.left,
       y: e.clientY - rect.top
     };

     document.addEventListener('pointermove', this._onDrag);
     document.addEventListener('pointerup', this._endDrag);
     e.preventDefault();
   }

   _onDrag(e) {
     if (!this.state.isDragging) return;

     let x = e.clientX - this.state.dragOffset.x;
     let y = e.clientY - this.state.dragOffset.y;

     // Restricciones del viewport
     const maxX = window.innerWidth - this.panel.offsetWidth;
     const maxY = window.innerHeight - this.panel.offsetHeight;

     x = Math.max(0, Math.min(maxX, x));
     y = Math.max(0, Math.min(maxY, y));

     this.state.position.x = x;
     this.state.position.y = y;
     this.panel.style.left = `${x}px`;
     this.panel.style.top = `${y}px`;

     this._savePosition();
   }

   _endDrag() {
     this.state.isDragging = false;
     this.panel.classList.remove('dragging');
     document.removeEventListener('pointermove', this._onDrag);
     document.removeEventListener('pointerup', this._endDrag);
   }

   _saveState() {
     const key = 'eva-eq-float-state-v1';
     try {
       const state = {
         gains: this.state.gains,
         masterGain: this.state.masterGain,
         position: this.state.position,
         isOpen: this.state.isOpen,
         activePreset: this.state.activePreset
       };
       localStorage.setItem(key, JSON.stringify(state));
     } catch (e) {
       // localStorage no disponible
     }
   }

   _restoreState() {
     const key = 'eva-eq-float-state-v1';
     try {
       const saved = localStorage.getItem(key);
       if (saved) {
         const state = JSON.parse(saved);
         this.state.gains = state.gains || this.state.gains;
         this.state.masterGain = state.masterGain || 1;
         this.state.position = state.position || this.state.position;
         this.state.isOpen = state.isOpen || false;
         this.state.activePreset = state.activePreset;

         // Restaurar posición (clampear al viewport)
          const pw = this.panel.offsetWidth || 480;
          const ph = this.panel.offsetHeight || 300;
          const x = Math.max(0, Math.min(window.innerWidth - pw, this.state.position.x));
          const y = Math.max(0, Math.min(window.innerHeight - ph, this.state.position.y));
          this.state.position.x = x;
          this.state.position.y = y;
          this.panel.style.left = `${x}px`;
          this.panel.style.top = `${y}px`;
       }
     } catch (e) {
       // JSON parse error o versión antigua
     }
   }

   _savePosition() {
     const key = 'eva-eq-float-position-v1';
     try {
       localStorage.setItem(key, JSON.stringify(this.state.position));
     } catch (e) {
       // localStorage no disponible
     }
   }

   _restorePosition() {
     this._restoreState();
   }

   show() {
     this.state.isOpen = true;
     this.panel.classList.remove('hidden');
     this._updateAll();
   }

   hide() {
     this.state.isOpen = false;
     this.panel.classList.add('hidden');
     this._saveState();
   }

   toggle() {
     if (this.state.isOpen) {
       this.hide();
     } else {
       this.show();
     }
   }

   _formatDB(value) {
     const v = value >= 0 ? '+' + value.toFixed(1) : value.toFixed(1);
     return v + ' dB';
   }

   // Destruir componente
   destroy() {
     this.hide();
     if (this.panel && this.panel.parentNode) {
       this.panel.parentNode.removeChild(this.panel);
     }

     document.removeEventListener('keydown', this._escapeHandler);

     if (this.state.audioCtx) {
       this.state.audioCtx.close();
     }
   }
}