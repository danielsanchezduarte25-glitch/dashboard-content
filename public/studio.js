/* Dashboard Content — studio: Historias (stories editor + PNG/ZIP export) and Variantes (ffmpeg.wasm) */
'use strict';

/* ================= LOCAL IMAGE STORE (IndexedDB) =================
   Uploaded photos stay in this browser; the server only stores a reference. */
const IDB = {
  db: null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open('dc-images', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('img', 'readwrite'); tx.objectStore('img').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('img').objectStore('img').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
  async keys() { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('img').objectStore('img').getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
};
const urlCache = new Map();
async function bgSrc(bg) { // returns a CSS background value + an <img>-loadable src (or null)
  if (!bg) return { css: '#222', src: null };
  if (bg.type === 'gradient') return { css: bg.css, src: null, stops: bg.stops };
  if (bg.type === 'url') return { css: `url("${bg.value}") center/cover`, src: bg.value };
  if (bg.type === 'local') { if (!urlCache.has(bg.id)) { const b = await IDB.get(bg.id); urlCache.set(bg.id, b ? URL.createObjectURL(b) : null); } const u = urlCache.get(bg.id); return { css: u ? `url("${u}") center/cover` : 'repeating-linear-gradient(45deg,#222 0 10px,#2a2a2a 10px 20px)', src: u, missing: !u }; }
  return { css: '#222', src: null };
}

/* ================= HISTORIAS ================= */
const LIBG = [['#4a6b8a', '#b8d4e8'], ['#0f1f3d', '#3d6bb3'], ['#eae2d6', '#8a7a6b'], ['#f2f2f2', '#a9a9a9'], ['#1a1a1a', '#3a3a3a'], ['#f7a072', '#ff4d8d'], ['#2b2d42', '#8d99ae'], ['#ffd166', '#ef8354'], ['#14213d', '#fca311'], ['#e0fbfc', '#3d5a80'], ['#606c38', '#283618'], ['#0c0d10', '#ff4d8d']].map((s) => ({ type: 'gradient', stops: s, css: `linear-gradient(180deg,${s[0]},${s[1]})` }));
const ST = { seqs: null, seqIdx: 0, slideIdx: 0, sel: null, mode: 'move', snap: true, guides: false, dirty: false, inited: false };
const cur = () => ST.seqs[ST.seqIdx].slides[ST.slideIdx];
const newSlide = (bg) => ({ bg: bg || LIBG[Math.floor(Math.random() * LIBG.length)], dim: 30, layers: [], drawing: null });

window.initStories = async function () {
  if (ST.inited) return; ST.inited = true;
  try { ST.seqs = (await api('/api/data?key=sequences')).value; } catch { ST.seqs = null; }
  if (!ST.seqs || !ST.seqs.length) ST.seqs = [{ name: 'Nueva secuencia', slides: [newSlide(LIBG[0]), newSlide(LIBG[1]), newSlide(LIBG[2]), newSlide(LIBG[5])] }];
  renderLib(); renderSeqs(); renderStory(); bindStoryEvents();
  if (S.me?.config?.googleClientId) { $('#driveBtn').style.display = ''; $('#driveNote').innerHTML = '<i></i>Google Drive conectado · elegí fotos desde tu Drive'; }
};

function renderSeqs() {
  $('#seqList').innerHTML = ST.seqs.map((s, i) => `<div class="seq ${i === ST.seqIdx ? 'active' : ''}" onclick="selectSeq(${i})"><div><b>${esc(s.name)}</b><small>${s.slides.length} slides</small></div><button class="iconbtn" title="Duplicar" onclick="event.stopPropagation();dupSeq(${i})"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button><button class="iconbtn" title="Eliminar" onclick="event.stopPropagation();delSeq(${i})">${svgI.trash}</button></div>`).join('');
  $('#seqName').value = ST.seqs[ST.seqIdx].name;
}
function selectSeq(i) { ST.seqIdx = i; ST.slideIdx = 0; ST.sel = null; renderSeqs(); renderStory(); }
function dupSeq(i) { const c = JSON.parse(JSON.stringify(ST.seqs[i])); c.name += ' (copia)'; ST.seqs.push(c); renderSeqs(); persistSeqs(); }
function delSeq(i) { if (!confirm('¿Eliminar esta secuencia?')) return; ST.seqs.splice(i, 1); if (!ST.seqs.length) ST.seqs.push({ name: 'Nueva secuencia', slides: [newSlide()] }); ST.seqIdx = Math.max(0, Math.min(i, ST.seqs.length - 1)); ST.slideIdx = 0; renderSeqs(); renderStory(); persistSeqs(); }
function newSeq() { ST.seqs.push({ name: 'Nueva secuencia', slides: [newSlide()] }); ST.seqIdx = ST.seqs.length - 1; ST.slideIdx = 0; ST.sel = null; renderSeqs(); renderStory(); }
function saveSeq() { ST.seqs[ST.seqIdx].name = $('#seqName').value.trim() || 'Sin nombre'; renderSeqs(); persistSeqs(true); }
async function persistSeqs(announce) {
  try { await api('/api/data?key=sequences', { method: 'PUT', body: { value: ST.seqs } }); $('#draftNote').textContent = 'Guardado · ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); if (announce) toast('Secuencia guardada'); }
  catch (e) { toast('No se pudo guardar: ' + e.message, 4000); }
}

async function renderStory() {
  const s = cur(); const story = $('#story'); story.querySelectorAll('.layer').forEach((l) => l.remove());
  const b = await bgSrc(s.bg);
  $('#storyBg').style.background = b.css; $('#storyBg').style.backgroundSize = 'cover'; $('#storyBg').style.backgroundPosition = 'center';
  $('#storyDim').style.opacity = (s.dim / 100).toFixed(2); $('#bright').value = s.dim; $('#brightVal').textContent = s.dim + '%'; $('#slideIdx').textContent = ST.slideIdx + 1;
  s.layers.forEach((l, i) => { const d = document.createElement('div'); d.className = 'layer ' + l.cls + (i === ST.sel ? ' sel' : ''); d.textContent = l.t; d.style.left = l.x + 'px'; d.style.top = l.y + 'px'; if (l.w) d.style.width = l.w + 'px'; d.dataset.i = i; story.appendChild(d); });
  $('#layerText').value = ST.sel != null && s.layers[ST.sel] ? s.layers[ST.sel].t : '';
  const c = $('#drawLayer'); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); if (s.drawing) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0); im.src = s.drawing; }
  const thumbs = await Promise.all(ST.seqs[ST.seqIdx].slides.map((sl) => bgSrc(sl.bg)));
  $('#filmstrip').innerHTML = thumbs.map((t, i) => `<button class="${i === ST.slideIdx ? 'active' : ''}" onclick="ST.slideIdx=${i};ST.sel=null;renderStory()" title="Slide ${i + 1}"><i style="background:${t.css};background-size:cover"></i><span>${i + 1}</span></button>`).join('') + `<button class="add" title="Agregar slide" onclick="ST.seqs[ST.seqIdx].slides.push(newSlide());ST.slideIdx=ST.seqs[ST.seqIdx].slides.length-1;renderStory()">+</button>` + (ST.seqs[ST.seqIdx].slides.length > 1 ? `<button class="add" title="Eliminar slide" onclick="delSlide()">−</button>` : '');
  $('#gv').classList.toggle('on', ST.guides); $('#gh').classList.toggle('on', ST.guides);
  if (b.missing) toast('Esta foto está guardada en otro navegador; volvé a subirla.', 3500);
}
function delSlide() { ST.seqs[ST.seqIdx].slides.splice(ST.slideIdx, 1); ST.slideIdx = Math.max(0, ST.slideIdx - 1); ST.sel = null; renderStory(); }
async function renderLib() {
  const local = await IDB.keys().catch(() => []);
  const localBtns = await Promise.all(local.slice(-12).reverse().map(async (id) => { const b = await bgSrc({ type: 'local', id }); return `<button style="background:${b.css}" onclick="setBg({type:'local',id:'${id}'})" aria-label="Foto subida"></button>`; }));
  $('#lib').innerHTML = localBtns.join('') + LIBG.map((g, i) => `<button style="background:${g.css}" onclick="setBg(LIBG[${i}])" aria-label="Fondo"></button>`).join('');
}
function setBg(bg) { cur().bg = bg; renderStory(); }
function randomBg() { setBg(LIBG[Math.floor(Math.random() * LIBG.length)]); }
function applyBgUrl() { const u = $('#bgUrl').value.trim(); if (!u) return; setBg({ type: 'url', value: u }); toast('Fondo aplicado (si la imagen no aparece, el sitio de origen no permite usarla)'); }
async function storeImageFile(file) {
  // Downscale to 1080×1920 max so exports are sharp but storage stays small.
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1080 / img.width, 1920 / img.height); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88)); const id = 'img-' + Date.now().toString(36);
  await IDB.put(id, blob); return id;
}
function addLayer(cls) { cur().layers.push({ cls, t: cls === 'chatbox' ? 'Hola! ¿Cuánto cuesta el plan mensual?' : 'Nuevo texto', x: 40, y: 200 }); ST.sel = cur().layers.length - 1; renderStory(); }
function delLayer() { if (ST.sel == null) return; cur().layers.splice(ST.sel, 1); ST.sel = null; renderStory(); }
function dupLayer() { if (ST.sel == null) return; const l = { ...cur().layers[ST.sel], y: cur().layers[ST.sel].y + 30 }; cur().layers.push(l); ST.sel = cur().layers.length - 1; renderStory(); }
function clearDrawing() { cur().drawing = null; renderStory(); }

function bindStoryEvents() {
  $('#bright').addEventListener('input', (e) => { cur().dim = +e.target.value; $('#storyDim').style.opacity = e.target.value / 100; $('#brightVal').textContent = e.target.value + '%'; });
  $('#bgFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; const id = await storeImageFile(f); setBg({ type: 'local', id }); renderLib(); e.target.value = ''; });
  $('#layerText').addEventListener('input', (e) => { if (ST.sel == null) return; cur().layers[ST.sel].t = e.target.value; const el = $('#story .layer.sel'); if (el) el.textContent = e.target.value; });
  $('#seqName').addEventListener('change', () => { ST.seqs[ST.seqIdx].name = $('#seqName').value; renderSeqs(); });
  $('#edMode').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; const m = b.dataset.m; if (m === 'guides') { ST.guides = !ST.guides; b.classList.toggle('active', ST.guides); renderStory(); return; } if (m === 'snap') { ST.snap = !ST.snap; b.classList.toggle('active', ST.snap); return; } ST.mode = m; $$('#edMode .tab[data-m=move],#edMode .tab[data-m=draw]').forEach((t) => t.classList.toggle('active', t.dataset.m === m)); $('#drawLayer').style.pointerEvents = m === 'draw' ? 'auto' : 'none'; });
  $('#driveBtn').addEventListener('click', openDrivePicker);
  const story = $('#story'); let drag = null;
  story.addEventListener('pointerdown', (e) => { const l = e.target.closest('.layer'); if (!l || ST.mode !== 'move') return; ST.sel = +l.dataset.i; story.querySelectorAll('.layer').forEach((x) => x.classList.remove('sel')); l.classList.add('sel'); $('#layerText').value = cur().layers[ST.sel].t; const r = story.getBoundingClientRect(); drag = { l, ox: e.clientX - r.left - l.offsetLeft, oy: e.clientY - r.top - l.offsetTop }; l.setPointerCapture(e.pointerId); });
  story.addEventListener('pointermove', (e) => { if (!drag) return; const r = story.getBoundingClientRect(); let x = e.clientX - r.left - drag.ox, y = e.clientY - r.top - drag.oy; const w = drag.l.offsetWidth, h = drag.l.offsetHeight; if (ST.snap && !e.altKey) { const cx = 135 - w / 2, cy = 240 - h / 2; if (Math.abs(x - cx) < 8) x = cx; if (Math.abs(y - cy) < 8) y = cy; if (Math.abs(x - 14) < 8) x = 14; if (Math.abs(x - (256 - w)) < 8) x = 256 - w; } x = Math.max(0, Math.min(270 - w, x)); y = Math.max(0, Math.min(480 - h, y)); drag.l.style.left = x + 'px'; drag.l.style.top = y + 'px'; const L = cur().layers[ST.sel]; L.x = Math.round(x); L.y = Math.round(y); });
  story.addEventListener('pointerup', () => { drag = null; });
  const c = $('#drawLayer'), ctx = c.getContext('2d'); let dr = false; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#ff4d8d';
  c.addEventListener('pointerdown', (e) => { dr = true; const r = c.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); });
  c.addEventListener('pointermove', (e) => { if (!dr) return; const r = c.getBoundingClientRect(); ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); });
  const endDraw = () => { if (!dr) return; dr = false; cur().drawing = c.toDataURL('image/png'); };
  c.addEventListener('pointerup', endDraw); c.addEventListener('pointerleave', endDraw);
  document.addEventListener('keydown', (e) => { if (!$('#view-historias').classList.contains('active') || ST.sel == null || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; const s = e.shiftKey ? 10 : 1; const L = cur().layers[ST.sel]; if (!L) return; if (e.key === 'ArrowLeft') L.x -= s; else if (e.key === 'ArrowRight') L.x += s; else if (e.key === 'ArrowUp') L.y -= s; else if (e.key === 'ArrowDown') L.y += s; else if (e.key === 'Delete' || e.key === 'Backspace') { delLayer(); return; } else return; e.preventDefault(); renderStory(); });
}

// ---- Export: every slide → PNG 1080×1920, zipped ----
const LAYER_STYLE = { blue: { bg: '#1f6feb', fg: '#fff', size: 44, weight: 700, pad: 24, radius: 16 }, white: { bg: '#ffffff', fg: '#0c0d10', size: 44, weight: 700, pad: 24, radius: 16 }, black: { bg: '#0c0d10', fg: '#fff', size: 44, weight: 700, pad: 24, radius: 16 }, plain: { bg: null, fg: '#fff', size: 48, weight: 700, pad: 0, radius: 0, shadow: true }, chatbox: { bg: 'rgba(255,255,255,.92)', fg: '#0c0d10', size: 38, weight: 500, pad: 32, radius: 40 } };
function wrapText(ctx, text, maxW) { const out = []; for (const para of String(text).split('\n')) { const words = para.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
async function renderSlidePNG(slide) {
  const W = 1080, H = 1920, k = W / 270; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const b = await bgSrc(slide.bg);
  if (b.stops) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, b.stops[0]); g.addColorStop(1, b.stops[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (b.src) { try { const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = b.src; }); const s = Math.max(W / img.width, H / img.height); const w = img.width * s, h = img.height * s; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); } catch { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H); toast('Una imagen externa no pudo exportarse (bloqueo CORS). Subila desde la PC.', 4000); } }
  else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = `rgba(0,0,0,${(slide.dim || 0) / 100})`; ctx.fillRect(0, 0, W, H);
  if (slide.drawing) { const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = slide.drawing; }); if (im) ctx.drawImage(im, 0, 0, W, H); }
  for (const l of slide.layers) {
    const st = LAYER_STYLE[l.cls] || LAYER_STYLE.white; ctx.font = `${st.weight} ${st.size}px "DM Sans", system-ui, sans-serif`; ctx.textBaseline = 'top';
    const maxW = (l.cls === 'chatbox' ? 0.6 * 270 : 0.78 * 270) * k - st.pad * 2; const lines = wrapText(ctx, l.t, maxW); const lh = st.size * 1.25;
    const tw = Math.min(maxW, Math.max(...lines.map((s) => ctx.measureText(s).width))); const x = l.x * k, y = l.y * k; const bw = tw + st.pad * 2, bh = lines.length * lh + st.pad * 2;
    if (st.bg) { ctx.fillStyle = st.bg; roundRect(ctx, x, y, bw, bh, st.radius); ctx.fill(); }
    ctx.fillStyle = st.fg; if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3; }
    lines.forEach((s, i) => ctx.fillText(s, x + st.pad, y + st.pad + i * lh)); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function exportZip() {
  const seq = ST.seqs[ST.seqIdx]; toast(`Exportando ${seq.slides.length} slides a 1080×1920…`);
  try { await document.fonts?.load('700 44px "DM Sans"'); } catch {}
  const zip = new JSZip(); const folder = zip.folder(seq.name.replace(/[^\w\- ]+/g, '').trim() || 'stories');
  for (let i = 0; i < seq.slides.length; i++) folder.file(`story-${String(i + 1).padStart(2, '0')}.png`, await renderSlidePNG(seq.slides[i]));
  const blob = await zip.generateAsync({ type: 'blob' }); download(`${(seq.name || 'stories').replace(/[^\w\- ]+/g, '').trim() || 'stories'}.zip`, blob, 'application/zip'); toast('ZIP listo: PNG 1080×1920 por slide');
}

// ---- Google Drive picker (optional; needs GOOGLE_CLIENT_ID + GOOGLE_API_KEY) ----
let gToken = null;
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function openDrivePicker() {
  const { googleClientId, googleApiKey } = S.me.config;
  try { await loadScript('https://apis.google.com/js/api.js'); await loadScript('https://accounts.google.com/gsi/client'); } catch { return toast('No se pudo cargar Google Picker'); }
  await new Promise((r) => gapi.load('picker', r));
  const tc = google.accounts.oauth2.initTokenClient({ client_id: googleClientId, scope: 'https://www.googleapis.com/auth/drive.readonly', callback: (t) => { gToken = t.access_token; showPicker(); } });
  if (gToken) showPicker(); else tc.requestAccessToken();
  function showPicker() {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES).setIncludeFolders(true);
    new google.picker.PickerBuilder().addView(view).setOAuthToken(gToken).setDeveloperKey(googleApiKey || undefined).setCallback(async (d) => {
      if (d.action !== google.picker.Action.PICKED) return;
      for (const f of d.docs) { try { const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: 'Bearer ' + gToken } }); const blob = await res.blob(); const id = await storeImageFile(new File([blob], f.name, { type: blob.type })); setBg({ type: 'local', id }); renderLib(); } catch (e) { toast('No se pudo descargar de Drive: ' + e.message); } }
    }).build().setVisible(true);
  }
}

/* ================= VARIANTES (ffmpeg.wasm) ================= */
const VR = { inited: false, file: null, ffmpeg: null, loading: null, base: null, results: [] };
const SPEEDS = [0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 1.0, 1.02, 1.04, 1.06, 1.08, 1.10];
const ZOOMS = [1.00, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08, 1.10, 1.12, 1.15, 1.18, 1.20];
window.initVariants = function () {
  if (VR.inited) { renderBaseSel(); return; } VR.inited = true;
  renderBaseSel(); renderTextRows(); updateAdvLabels();
  $('#nVarRange').addEventListener('input', () => { $('#nVar').textContent = $('#nVarRange').value; renderTextRows(); });
  $('#advBtn').addEventListener('click', () => { const a = $('#adv'); a.style.display = a.style.display === 'none' ? 'grid' : 'none'; });
  ['spd', 'zoom', 'con', 'sat', 'tmp', 'trim'].forEach((id) => $('#' + id).addEventListener('input', updateAdvLabels));
  $('#baseSel').addEventListener('change', () => { VR.base = S.reels?.reels.find((r) => r.id === $('#baseSel').value) || null; renderBaseInfo(); });
  const dz = $('#dropzone'); dz.addEventListener('click', () => $('#videoFile').click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) setVideo(f); });
  $('#videoFile').addEventListener('change', (e) => { if (e.target.files[0]) setVideo(e.target.files[0]); });
  $('#genBtn').addEventListener('click', genVariants);
};
window.onReelsLoaded = () => { if (VR.inited) renderBaseSel(); };
function renderBaseSel() {
  const reels = S.reels?.reels || []; const sel = $('#baseSel');
  sel.innerHTML = `<option value="">Video subido (sin reel asociado)</option>` + reels.map((r) => `<option value="${r.id}">${esc(r.title.slice(0, 60))} · ${fmt(r.views)} vistas</option>`).join('');
  if (VR.base) sel.value = VR.base.id; renderBaseInfo();
}
function renderBaseInfo() {
  const r = VR.base; $('#baseTitle').textContent = r ? r.title : (VR.file ? VR.file.name : 'Elegí un reel o subí un MP4');
  $('#baseInfo').textContent = r ? `Publicado ${fdate(r.date)} · ${fmt(r.views)} vistas · ER ${r.er.toFixed(2)}% · subí el MP4 original para re-editarlo` : 'Fuente: archivo local · el MP4 lo subís desde tu PC (Instagram no permite descargarlo por API).';
  const a = $('#baseLink'); if (r) { a.href = r.permalink; a.style.display = ''; } else a.style.display = 'none';
}
function setVideo(f) { VR.file = f; $('#videoInfo').textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`; $('#dropzone').textContent = `✓ ${f.name} (clic para cambiar)`; renderBaseInfo(); }
function updateAdvLabels() {
  const v = (id) => +$('#' + id).value;
  $('#spdLbl').textContent = `${SPEEDS[Math.max(0, 7 - v('spd'))].toFixed(2)}× – ${SPEEDS[Math.min(12, 7 + v('spd'))].toFixed(2)}×`;
  $('#zoomLbl').textContent = `100% – ${Math.round(ZOOMS[v('zoom')] * 100)}%`;
  $('#conLbl').textContent = `±${(v('con') / 100).toFixed(2)}`; $('#satLbl').textContent = `±${(v('sat') / 100).toFixed(2)}`; $('#tmpLbl').textContent = `±${(v('tmp') / 100).toFixed(2)} (cálido/frío)`; $('#trimLbl').textContent = `0 – ${(v('trim') / 10).toFixed(1)} s`;
}
function renderTextRows() {
  const n = +$('#nVarRange').value; const ex = ['Ej. Nadie te lo dice, pero…', 'Sin texto', 'Ej. Esto me ahorró 6 h/semana', 'Ej. Cosa #1 que hacés mal', 'Ej. Mirá esto antes de contratar'];
  const prev = $$('#textRows input').map((i) => i.value);
  $('#textRows').innerHTML = Array.from({ length: n }, (_, i) => `<div class="textrow"><span class="idx">#${i + 1}</span><input placeholder="${ex[i] || 'Texto en pantalla…'}" id="vt${i}" value="${esc(prev[i] || '')}"><select id="vp${i}"><option value="top">Arriba</option><option value="mid">Centro</option><option value="bot">Abajo</option></select></div>`).join('');
}
const rnd = (a, b) => a + Math.random() * (b - a);
function planVariants() {
  const n = +$('#nVarRange').value; const v = (id) => +$('#' + id).value;
  return Array.from({ length: n }, (_, i) => {
    const sIdx = Math.round(rnd(Math.max(0, 7 - v('spd')), Math.min(12, 7 + v('spd')))); const zIdx = Math.round(rnd(0, v('zoom')));
    return { i: i + 1, speed: SPEEDS[sIdx], zoom: ZOOMS[zIdx], contrast: +(rnd(-v('con'), v('con')) / 100).toFixed(2), sat: +(rnd(-v('sat'), v('sat')) / 100).toFixed(2), temp: +(rnd(-v('tmp'), v('tmp')) / 100).toFixed(2), trim: +(rnd(0, v('trim') / 10)).toFixed(1), text: ($('#vt' + i)?.value || '').trim(), pos: $('#vp' + i)?.value || 'top' };
  });
}
async function loadFFmpeg() {
  if (VR.ffmpeg) return VR.ffmpeg;
  if (!VR.loading) VR.loading = (async () => {
    await loadScript('/vendor/ffmpeg.js');
    const ff = new FFmpegWASM.FFmpeg();
    ff.on('log', ({ message }) => { if (/error/i.test(message)) console.warn(message); });
    ff.on('progress', ({ progress }) => { const p = $('#ffProgress i'); if (p) p.style.width = Math.min(100, Math.round(progress * 100)) + '%'; });
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    const toBlob = async (u, type) => URL.createObjectURL(new Blob([await (await fetch(u)).arrayBuffer()], { type }));
    $('#ffStatus').textContent = 'Descargando motor de video (≈30 MB, solo la primera vez)…';
    await ff.load({ coreURL: await toBlob(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlob(`${base}/ffmpeg-core.wasm`, 'application/wasm') });
    VR.ffmpeg = ff; return ff;
  })();
  return VR.loading;
}
function textOverlayPNG(text, pos) {
  const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  ctx.font = '700 56px "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'top'; const lines = wrapText(ctx, text, W * 0.8 - 64); const lh = 70; const tw = Math.max(...lines.map((s) => ctx.measureText(s).width)); const bw = tw + 64, bh = lines.length * lh + 48;
  const x = (W - bw) / 2, y = pos === 'top' ? 200 : pos === 'mid' ? (H - bh) / 2 : H - bh - 320;
  ctx.fillStyle = '#fff'; roundRect(ctx, x, y, bw, bh, 18); ctx.fill(); ctx.fillStyle = '#0c0d10'; lines.forEach((s, i) => ctx.fillText(s, x + 32, y + 24 + i * lh));
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function genVariants() {
  if (!VR.file) { toast('Primero subí el MP4 del reel (arrastralo al recuadro).', 4000); $('#dropzone').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const plan = planVariants(); const btn = $('#genBtn'); btn.disabled = true; $('#ffProgress').style.display = ''; VR.results = [];
  $('#variantGrid').innerHTML = plan.map((v) => variantCard(v, null)).join('');
  try {
    const ff = await loadFFmpeg();
    const inName = 'in.' + (VR.file.name.split('.').pop() || 'mp4').toLowerCase();
    await ff.writeFile(inName, new Uint8Array(await VR.file.arrayBuffer()));
    const fast = VR.file.size > 25 * 1048576; // big files → 720p output to keep render times sane
    for (const v of plan) {
      $('#ffStatus').textContent = `Renderizando variante ${v.i}/${plan.length}… (velocidad ${v.speed}×, zoom ${Math.round(v.zoom * 100)}%)`; $('#ffProgress i').style.width = '0%';
      const vf = [`setpts=PTS/${v.speed}`, `scale=trunc(iw*${v.zoom}/2)*2:trunc(ih*${v.zoom}/2)*2`, `crop=trunc(iw/${v.zoom}/2)*2:trunc(ih/${v.zoom}/2)*2`, `eq=contrast=${(1 + v.contrast).toFixed(2)}:saturation=${(1 + v.sat).toFixed(2)}`, `colorbalance=rs=${v.temp}:bs=${-v.temp}`, fast ? 'scale=-2:1280' : null].filter(Boolean).join(',');
      const af = `atempo=${v.speed}`; const out = `v${v.i}.mp4`; const args = ['-y'];
      if (v.trim > 0) args.push('-ss', String(v.trim));
      args.push('-i', inName);
      if (v.text) { await ff.writeFile(`t${v.i}.png`, new Uint8Array(await (await textOverlayPNG(v.text, v.pos)).arrayBuffer())); args.push('-i', `t${v.i}.png`, '-filter_complex', `[0:v]${vf}[v];[1:v][v]scale2ref[t][v2];[v2][t]overlay=0:0:format=auto[out]`, '-map', '[out]', '-map', '0:a?'); }
      else args.push('-vf', vf);
      args.push('-af', af, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);
      const code = await ff.exec(args);
      if (code !== 0) throw new Error(`ffmpeg devolvió código ${code} en la variante ${v.i}`);
      const data = await ff.readFile(out); const blob = new Blob([data.buffer], { type: 'video/mp4' }); const url = URL.createObjectURL(blob);
      VR.results.push({ ...v, url, size: blob.size }); await ff.deleteFile(out).catch(() => {});
      const card = $(`#var-${v.i}`); if (card) card.outerHTML = variantCard(v, url, blob.size);
    }
    $('#ffStatus').textContent = `Listo: ${plan.length} variantes renderizadas en tu navegador.`; toast(`${plan.length} variantes generadas`);
  } catch (e) { $('#ffStatus').textContent = 'Error: ' + e.message; toast(e.message, 6000); console.error(e); }
  btn.disabled = false; $('#ffProgress').style.display = 'none';
}
function variantCard(v, url, size) {
  const pos = v.pos === 'top' ? 'top' : v.pos === 'mid' ? 'mid' : 'bot';
  return `<div class="card variant" id="var-${v.i}">${url ? `<video src="${url}" controls muted playsinline preload="metadata"></video>` : `<div class="vth"><div class="inner" style="background:${gradFor(v.i)};display:grid;place-items:center"><span class="spin"></span></div>${v.text ? `<div class="txt ${pos}">${esc(v.text)}</div>` : ''}<span class="tag">V${v.i}</span></div>`}
  <dl><dt>Velocidad</dt><dd>${v.speed.toFixed(2)}×</dd><dt>Zoom</dt><dd>${Math.round(v.zoom * 100)}%</dd><dt>Contraste</dt><dd>${v.contrast > 0 ? '+' : ''}${v.contrast}</dd><dt>Saturación</dt><dd>${v.sat > 0 ? '+' : ''}${v.sat}</dd><dt>Temp.</dt><dd>${v.temp > 0 ? '+' : ''}${v.temp}</dd><dt>Recorte</dt><dd>${v.trim}s</dd>${v.text ? `<dt>Texto</dt><dd style="text-align:right;white-space:normal">${esc(v.text)}</dd>` : ''}${size ? `<dt>Tamaño</dt><dd>${(size / 1048576).toFixed(1)} MB</dd>` : ''}</dl>
  ${url ? `<a class="btn sm" href="${url}" download="variante-${v.i}.mp4" style="justify-content:center;width:100%;margin-top:10px">⬇ Descargar MP4</a><button class="btn sm" onclick="sendVariantToCal(${v.i},this)">${svgI.cal}Mandar al calendario</button>` : `<button class="btn sm" disabled>${svgI.cal}Mandar al calendario</button>`}</div>`;
}
function sendVariantToCal(i, btn) {
  const base = VR.base ? VR.base.title : (VR.file?.name || 'video'); const key = window.addEventToCalendar(`Variante V${i} · ${base.slice(0, 40)}`, 'test', i * 2);
  btn.classList.add('sent'); btn.innerHTML = '✓ Agendada ' + fdate(key); btn.disabled = true; toast(`V${i} agendada para el ${fdate(key)} a las 19:00`);
}
