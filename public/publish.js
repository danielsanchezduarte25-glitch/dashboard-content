/* Dashboard Content — Publicar: subir archivos por partes, componer, programar y publicar en Instagram */
'use strict';
(() => {
  const PART = 4 * 1024 * 1024;
  const KIND_LABEL = { reel: 'Reel', image: 'Foto', carousel: 'Carrusel', story: 'Historia' };
  const STATUS = { draft: ['Borrador', ''], scheduled: ['Programado', 'warn'], publishing: ['Publicando…', 'warn'], published: ['Publicado', 'good'], error: ['Error', 'bad'] };
  let cur = null;          // item being edited { id, kind, media:[...], caption, scheduledAt, shareToFeed, thumbOffset, status }
  let filter = 'all';
  let pollT = null;
  window.pubCur = () => cur;
  const uid = () => 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  window.initPublish = async function () {
    if (!S.publish) await loadPublish();
    renderGate(); if (!cur) newPost(true); renderList();
    api('/api/publish', { method: 'POST', body: { action: 'tick' } }).then((r) => { S.publish = r; renderList(); startPollIfBusy(); }).catch(() => {});
  };
  async function loadPublish() { try { S.publish = await api('/api/publish'); } catch (e) { S.publish = { queue: [], canPublish: false }; toast(e.message); } }

  function renderGate() {
    const ig = S.me.instagram; const g = $('#pubGate');
    if (!ig.connected) { g.innerHTML = `<div class="setup"><span class="pill warn">Instagram sin conectar</span><button class="btn sm primary" onclick="connectInstagram()">Conectar Instagram</button></div>`; return; }
    if (ig.canPublish === false || S.publish?.canPublish === false) { g.innerHTML = `<div class="setup"><span class="pill warn">Tu conexión no tiene el permiso de publicar</span><span class="small">Volvé a conectar Instagram y aceptá “publicar contenido” (tarda 10 segundos).</span><button class="btn sm primary" onclick="connectInstagram()">Reconectar Instagram</button></div>`; return; }
    g.innerHTML = '';
  }

  window.newPost = function (silent) {
    cur = { id: uid(), kind: 'reel', media: [], caption: '', scheduledAt: null, shareToFeed: true, thumbOffset: null, status: 'draft' };
    renderComposer(); if (!silent) $('#pubComposer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.openPublishItem = function (id) {
    const it = (S.publish?.queue || []).find((x) => x.id === id); if (!it) return;
    cur = JSON.parse(JSON.stringify(it)); renderComposer();
  };

  function localDT(iso) { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
  function renderComposer() {
    const locked = cur.status === 'published' || cur.status === 'publishing';
    const isVideoKind = cur.kind === 'reel';
    const accept = cur.kind === 'reel' ? 'video/mp4,video/quicktime' : cur.kind === 'story' ? 'video/mp4,video/quicktime,image/*' : 'image/*';
    const multi = cur.kind === 'carousel';
    const media = cur.media.filter((m) => m.role !== 'cover'); const cover = cur.media.find((m) => m.role === 'cover');
    $('#pubComposer').innerHTML = `
      <div class="page-h" style="margin-bottom:12px"><div class="eyebrow">${cur.status === 'draft' && !S.publish?.queue.some((x) => x.id === cur.id) ? 'Nuevo post' : `Editando · ${KIND_LABEL[cur.kind]}`}</div>${cur.status !== 'draft' ? `<span class="pill ${STATUS[cur.status][1]}">${STATUS[cur.status][0]}</span>` : ''}</div>
      <div class="tabs" style="margin-bottom:14px">${Object.entries(KIND_LABEL).map(([k, l]) => `<button class="tab ${cur.kind === k ? 'active' : ''}" ${locked ? 'disabled' : ''} onclick="pubSetKind('${k}')">${l}</button>`).join('')}</div>
      <div class="dropzone ${locked ? 'locked' : ''}" id="pubDrop" ${locked ? '' : `onclick="document.getElementById('pubFile').click()"`}>
        <input type="file" id="pubFile" accept="${accept}" ${multi ? 'multiple' : ''} hidden onchange="pubAddFiles(this.files)">
        ${media.length ? `<div class="pub-media">${media.map((m, i) => `<div class="pm">${m.type.startsWith('video') ? `<video src="${m.url || `/media/${m.id}.mp4`}" muted playsinline preload="metadata"></video>` : `<img src="${m.url || `/media/${m.id}.jpg`}" alt="">`}<div class="pm-name">${esc(m.name)}${m.duration ? ` · ${Math.round(m.duration)}s` : ''}${m.w ? ` · ${m.w}×${m.h}` : ''}</div>${m.progress != null && m.progress < 100 ? `<div class="pm-bar"><i style="width:${m.progress}%"></i></div>` : ''}${locked ? '' : `<button class="iconbtn pm-x" onclick="event.stopPropagation();pubRemove('${m.id}')">${svgI.x}</button>`}</div>`).join('')}</div>` : `<div class="empty" style="padding:26px 10px"><p>${cur.kind === 'reel' ? 'Arrastrá tu video (MP4/MOV, vertical 9:16, 3 s a 15 min)' : cur.kind === 'carousel' ? 'Arrastrá de 2 a 10 fotos (JPG/PNG; se convierten a JPG)' : cur.kind === 'story' ? 'Arrastrá una foto o video vertical' : 'Arrastrá una foto (JPG/PNG)'}</p><span class="small">o hacé clic para elegir</span></div>`}
        ${multi && media.length && !locked ? '<div class="small" style="text-align:center;margin-top:6px">Clic para agregar más · orden = orden del carrusel</div>' : ''}
      </div>
      ${cur.kind !== 'story' ? `<label class="pub-field" style="margin-top:12px"><span class="eyebrow">Caption <span id="capCount" class="small">${cur.caption.length}/2200</span></span><textarea id="pubCaption" rows="6" ${locked ? 'disabled' : ''} placeholder="Gancho en la primera línea…&#10;&#10;Comentá PALABRA y te lo mando." oninput="pubCur().caption=this.value;document.getElementById('capCount').textContent=this.value.length+'/2200'">${esc(cur.caption)}</textarea></label>
      ${locked ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="pubBrief" placeholder="De qué trata (para la IA): p. ej. 3 errores al pautar sin marca" style="flex:1;min-width:200px"><button class="btn sm" ${S.me.config.hasAnthropic ? '' : 'disabled title="Falta ANTHROPIC_API_KEY"'} onclick="pubCaptionAI()">✦ Caption con IA</button></div>`}` : ''}
      ${isVideoKind ? `<div class="pub-opts"><label class="chk"><input type="checkbox" id="pubFeed" ${cur.shareToFeed !== false ? 'checked' : ''} ${locked ? 'disabled' : ''} onchange="pubCur().shareToFeed=this.checked">Mostrar también en el feed</label><label class="chk">Portada en el segundo <input type="number" min="0" step="1" style="width:70px" value="${cur.thumbOffset != null ? Math.round(cur.thumbOffset / 1000) : ''}" placeholder="auto" ${locked ? 'disabled' : ''} onchange="pubCur().thumbOffset=this.value===''?null:Number(this.value)*1000"></label></div>` : ''}
      <div class="pub-when">
        <label>Cuándo<select id="pubWhen" ${locked ? 'disabled' : ''} onchange="pubWhenChange(this.value)"><option value="now" ${!cur.scheduledAt ? 'selected' : ''}>Publicar ahora</option><option value="later" ${cur.scheduledAt ? 'selected' : ''}>Programar</option></select></label>
        <label id="pubDtWrap" ${cur.scheduledAt ? '' : 'hidden'}>Fecha y hora (Costa Rica)<input type="datetime-local" id="pubDt" value="${localDT(cur.scheduledAt)}" ${locked ? 'disabled' : ''} onchange="pubCur().scheduledAt=this.value?new Date(this.value).toISOString():null"></label>
      </div>
      ${cur.error ? `<div class="block" style="border-color:rgba(255,107,107,.4);color:#ffa6a6">⚠ ${esc(cur.error)}</div>` : ''}
      ${cur.status === 'published' ? `<div class="block">✓ Publicado ${cur.publishedAt ? new Date(cur.publishedAt).toLocaleString('es') : ''}${cur.permalink ? ` · <a href="${esc(cur.permalink)}" target="_blank" rel="noopener">Ver en Instagram</a>` : ''}</div>` : ''}
      <div class="pub-actions">
        ${locked ? `<button class="btn" onclick="newPost()">Nuevo post</button>` : `<button class="btn ghost" onclick="pubSave('draft')">Guardar borrador</button><button class="btn primary" id="pubGo" onclick="pubSave('go')">${cur.scheduledAt ? 'Programar' : 'Publicar ahora'}</button>`}
      </div>`;
    const dz = $('#pubDrop');
    if (dz && !locked) { dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); pubAddFiles(e.dataTransfer.files); }; }
  }
  window.pubSetKind = (k) => { if (cur.kind === k) return; if (cur.media.length && !confirm('Cambiar el tipo quita los archivos cargados. ¿Seguir?')) return; cur.media.forEach((m) => fetch('/api/media/upload?id=' + m.id, { method: 'DELETE' }).catch(() => {})); cur.media = []; cur.kind = k; renderComposer(); };
  window.pubWhenChange = (v) => { if (v === 'later') { const d = new Date(Date.now() + 3600 * 1000); d.setMinutes(0, 0, 0); cur.scheduledAt = cur.scheduledAt || d.toISOString(); } else cur.scheduledAt = null; renderComposer(); };
  window.pubRemove = (id) => { cur.media = cur.media.filter((m) => m.id !== id); fetch('/api/media/upload?id=' + id, { method: 'DELETE' }).catch(() => {}); renderComposer(); };

  // ---- files: validate → (convert to JPEG) → chunked upload ---------------
  window.pubAddFiles = async function (files) {
    const list = [...files]; if (!list.length) return;
    const max = cur.kind === 'carousel' ? 10 : 1;
    if (cur.kind !== 'carousel' && cur.media.filter((m) => m.role !== 'cover').length) cur.media = cur.media.filter((m) => m.role === 'cover');
    for (const f of list) {
      if (cur.media.filter((m) => m.role !== 'cover').length >= max) { toast(`Máximo ${max} archivo${max > 1 ? 's' : ''} para ${KIND_LABEL[cur.kind]}`); break; }
      try {
        const prepared = await prepare(f);
        const m = { id: uid().replace('p-', 'm-'), name: prepared.name, type: prepared.type, size: prepared.blob.size, w: prepared.w, h: prepared.h, duration: prepared.duration, url: URL.createObjectURL(prepared.blob), progress: 0 };
        cur.media.push(m); renderComposer();
        await upload(m, prepared.blob, (p) => { m.progress = p; const el = $(`#pubDrop .pm-bar i`); if (el) el.style.width = p + '%'; });
        m.progress = 100; renderComposer();
      } catch (e) { toast(e.message, 5000); cur.media = cur.media.filter((m) => m.progress === 100 || m.progress == null); renderComposer(); }
    }
  };
  async function prepare(f) {
    const isVideo = f.type.startsWith('video/');
    if (cur.kind === 'reel' && !isVideo) throw new Error('Un reel necesita un video MP4 o MOV.');
    if ((cur.kind === 'image' || cur.kind === 'carousel') && isVideo) throw new Error('Acá van fotos; para video usá Reel o Historia.');
    if (isVideo) {
      if (!/mp4|quicktime/.test(f.type)) throw new Error('Formato de video no soportado: usá MP4 o MOV (H.264 + AAC).');
      if (f.size > 300 * 1024 * 1024) throw new Error('El video pesa más de 300 MB. Exportalo más liviano.');
      const info = await videoInfo(f);
      if (info.duration < 3) throw new Error('El video dura menos de 3 segundos.');
      if (info.duration > 15 * 60) throw new Error('El video dura más de 15 minutos (límite de Instagram).');
      if (cur.kind === 'story' && info.duration > 60) throw new Error('Las historias duran máximo 60 s.');
      return { blob: f, name: f.name, type: f.type, w: info.w, h: info.h, duration: info.duration };
    }
    if (!f.type.startsWith('image/')) throw new Error('Archivo no soportado.');
    const img = await loadImage(f);
    const maxW = 1440; const scale = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) throw new Error('No se pudo convertir la imagen a JPG.');
    return { blob, name: f.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', w: c.width, h: c.height };
  }
  const loadImage = (f) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen (¿HEIC? exportala como JPG).')); i.src = URL.createObjectURL(f); });
  const videoInfo = (f) => new Promise((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => rej(new Error('No se pudo leer el video. Probá exportarlo como MP4 H.264.')); v.src = URL.createObjectURL(f); });
  async function upload(m, blob, onProgress) {
    const parts = Math.ceil(blob.size / PART);
    for (let i = 0; i < parts; i++) {
      const chunk = blob.slice(i * PART, Math.min(blob.size, (i + 1) * PART));
      const q = new URLSearchParams({ id: m.id, part: i, parts, name: m.name, type: m.type, size: blob.size });
      let ok = false, err = null;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try { const r = await fetch('/api/media/upload?' + q, { method: 'POST', body: chunk, headers: { 'content-type': 'application/octet-stream' } }); const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status); ok = true; }
        catch (e) { err = e; await new Promise((r) => setTimeout(r, 1200)); }
      }
      if (!ok) throw new Error('Falló la subida de ' + m.name + ': ' + err.message);
      onProgress(Math.round(((i + 1) / parts) * 100));
    }
  }

  window.pubCaptionAI = async function () {
    const brief = $('#pubBrief').value.trim(); const btn = event?.target; if (btn) { btn.disabled = true; btn.textContent = 'Escribiendo…'; }
    try { const r = await api('/api/publish', { method: 'POST', body: { action: 'caption', brief, kind: cur.kind } }); cur.caption = r.caption; renderComposer(); }
    catch (e) { toast(e.message, 5000); if (btn) { btn.disabled = false; btn.textContent = '✦ Caption con IA'; } }
  };

  window.pubSave = async function (mode) {
    if (!S.me.instagram.connected) return connectInstagram();
    const media = cur.media.filter((m) => m.role !== 'cover');
    if (mode === 'go') {
      if (!media.length) return toast('Subí primero el archivo.');
      if (media.some((m) => m.progress != null && m.progress < 100)) return toast('Esperá a que termine la subida.');
      if (cur.kind === 'carousel' && media.length < 2) return toast('Un carrusel necesita al menos 2 fotos.');
      if (cur.scheduledAt && new Date(cur.scheduledAt).getTime() < Date.now() - 60000) return toast('La fecha ya pasó; elegí “Publicar ahora” u otra hora.');
    }
    const item = { ...cur, media: cur.media.map(({ url, progress, ...m }) => m), status: mode === 'go' ? 'scheduled' : 'draft', scheduledAt: mode === 'go' ? (cur.scheduledAt || new Date().toISOString()) : cur.scheduledAt };
    const btn = $('#pubGo'); if (btn) { btn.disabled = true; btn.textContent = mode === 'go' ? (cur.scheduledAt ? 'Programando…' : 'Publicando…') : 'Guardando…'; }
    try {
      S.publish = await api('/api/publish', { method: 'POST', body: { action: 'save', item } });
      toast(mode === 'go' ? (cur.scheduledAt && new Date(cur.scheduledAt) > Date.now() + 60000 ? 'Programado ✓ (se publica solo a esa hora)' : 'Publicando en Instagram… (30–90 s)') : 'Borrador guardado');
      if (mode === 'go' && !(cur.scheduledAt && new Date(cur.scheduledAt) > Date.now() + 60000)) { cur = S.publish.queue.find((x) => x.id === cur.id) || cur; startPollIfBusy(); } else newPost(true);
      renderList(); if (S.events) renderCal?.();
    } catch (e) { toast(e.message, 6000); }
    renderComposer();
  };
  window.pubNow = async function (id) { try { S.publish = await api('/api/publish', { method: 'POST', body: { action: 'now', id } }); toast('Publicando en Instagram…'); renderList(); startPollIfBusy(); } catch (e) { toast(e.message, 5000); } };
  window.pubDelete = async function (id) { if (!confirm('¿Eliminar este post de la cola? (si ya se publicó, sigue en Instagram)')) return; try { S.publish = await api('/api/publish?id=' + id, { method: 'DELETE' }); if (cur?.id === id) newPost(true); renderList(); if (S.events) renderCal?.(); } catch (e) { toast(e.message); } };
  window.pubRetry = async function (id) { openPublishItem(id); cur.status = 'draft'; cur.error = null; renderComposer(); toast('Revisá el archivo/caption y volvé a publicar.'); };

  function startPollIfBusy() {
    clearInterval(pollT);
    const busy = () => (S.publish?.queue || []).some((x) => x.status === 'publishing' || (x.status === 'scheduled' && new Date(x.scheduledAt).getTime() <= Date.now() + 1000));
    if (!busy()) return;
    let n = 0;
    pollT = setInterval(async () => {
      n++; try { S.publish = await api('/api/publish'); } catch { return; }
      renderList(); if (cur) { const it = S.publish.queue.find((x) => x.id === cur.id); if (it && it.status !== cur.status) { cur = JSON.parse(JSON.stringify(it)); renderComposer(); if (it.status === 'published') toast('¡Publicado en Instagram! ✓', 5000); if (it.status === 'error') toast('Error al publicar: ' + it.error, 8000); } }
      if (!busy() || n > 80) { clearInterval(pollT); if (n > 80) toast('Sigue publicando; refrescá en un rato.'); if (S.me.instagram.connected) setTimeout(() => syncReels?.(false, { silent: true }), 4000); }
    }, 5000);
  }

  $('#pubTabs')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $$('#pubTabs button').forEach((x) => x.classList.toggle('active', x === b)); renderList(); });
  function renderList() {
    const q = (S.publish?.queue || []).filter((x) => filter === 'all' || x.status === filter || (filter === 'scheduled' && x.status === 'publishing') || (filter === 'published' && x.status === 'error'));
    if (!q.length) { $('#pubList').innerHTML = '<p class="sub">Nada por acá todavía.</p>'; return; }
    $('#pubList').innerHTML = q.map((x) => { const m = x.media?.[0]; const [lbl, cls] = STATUS[x.status] || ['', '']; const when = x.status === 'published' ? x.publishedAt : x.scheduledAt; return `<div class="pub-row ${cur?.id === x.id ? 'sel' : ''}" onclick="openPublishItem('${x.id}')"><div class="th" style="background:${gradFor(x.id)}">${m ? (m.type?.startsWith('video') ? `<video src="/media/${m.id}.mp4" muted preload="metadata"></video>` : `<img src="/media/${m.id}.jpg" alt="" loading="lazy">`) : ''}</div><div class="pub-info"><div class="pub-title">${esc((x.caption || '').split('\n')[0] || `(${KIND_LABEL[x.kind]} sin caption)`)}</div><div class="small">${KIND_LABEL[x.kind]}${x.media?.length > 1 ? ` · ${x.media.length} archivos` : ''} · ${when ? new Date(when).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : 'sin fecha'}${x.status === 'error' ? ` · <span style="color:#ffa6a6">${esc(x.error)}</span>` : ''}</div></div><span class="pill ${cls}">${lbl}</span><div class="acts" onclick="event.stopPropagation()">${x.status === 'published' && x.permalink ? `<a class="iconbtn" href="${esc(x.permalink)}" target="_blank" rel="noopener" title="Ver en Instagram">${svgI.ext}</a>` : ''}${x.status === 'draft' || x.status === 'scheduled' ? `<button class="iconbtn" title="Publicar ahora" onclick="pubNow('${x.id}')"><svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg></button>` : ''}${x.status === 'error' ? `<button class="iconbtn" title="Reintentar" onclick="pubRetry('${x.id}')"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg></button>` : ''}${x.status !== 'publishing' ? `<button class="iconbtn" title="Eliminar" onclick="pubDelete('${x.id}')">${svgI.trash}</button>` : ''}</div></div>`; }).join('');
  }
  // Expose for the calendar
  window.publishEventsForCalendar = () => (S.publish?.queue || []).filter((x) => x.scheduledAt && x.status !== 'published').map((x) => ({ id: 'pub-' + x.id, d: localDT(x.scheduledAt).slice(0, 10), time: localDT(x.scheduledAt).slice(11, 16), t: (x.status === 'publishing' ? '⏳ ' : '📤 ') + ((x.caption || '').split('\n')[0] || KIND_LABEL[x.kind]), k: 'pub', pubId: x.id }));
  window.loadPublishQuiet = async () => { if (!S.publish) await loadPublish(); };
})();
