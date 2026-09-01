/* Dashboard Content — app core: auth, navigation, dashboard, instagram, inspiración, chat, calendario, ajustes */
'use strict';

/* ================= UTIL ================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n == null || Number.isNaN(n) ? 'N/A' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : '0.0') + '%';
const fdate = (d) => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd}/${+m}/${y}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const xfmt = (x) => x == null ? '—' : (x < 1 ? x.toFixed(2) : x.toFixed(1)) + '×';
const G = ['linear-gradient(160deg,#3a2a1f,#6b4a33 55%,#1b1a1f)', 'linear-gradient(160deg,#1e2b3a,#3b5a7a 55%,#141a22)', 'linear-gradient(160deg,#2b1f3a,#5a3b7a 55%,#16121e)', 'linear-gradient(160deg,#1f3a2e,#3b7a5a 55%,#121e18)', 'linear-gradient(160deg,#3a1f24,#7a3b45 55%,#1e1214)', 'linear-gradient(160deg,#2a2f1f,#5a6b3b 55%,#181a12)', 'linear-gradient(160deg,#1f2e3a,#2f6b7a 55%,#121a1e)', 'linear-gradient(160deg,#3a331f,#7a6b3b 55%,#1e1a12)'];
const gradFor = (id) => G[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % G.length];
const svgI = { eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>', heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z"/></svg>', msg: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>', cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>', save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>', ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>', trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>', x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' };

function toast(t, ms = 2600) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), ms); }
function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast('Copiado al portapapeles')).catch(() => toast('No se pudo copiar')); }
function download(name, content, type = 'text/plain') { const blob = content instanceof Blob ? content : new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
function openModal(html) { $('#modalBox').innerHTML = `<button class="iconbtn close" onclick="closeModal()">${svgI.x}</button>` + html; $('#modal').classList.add('open'); }
function closeModal() { $('#modal').classList.remove('open'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open'); }
function spinner(t = 'Cargando…') { return `<div class="empty"><span class="spin"></span><p>${esc(t)}</p></div>`; }
function empty(title, text, action = '') { return `<div class="empty"><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`; }

// Fetch wrapper: handles streamed JSON (keep-alive spaces), auth, and errors.
async function api(path, { method = 'GET', body, timeoutMs = 90000 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', signal: ctrl.signal });
  } catch (e) { clearTimeout(t); throw new Error(e.name === 'AbortError' ? 'La operación tardó demasiado.' : 'Sin conexión con el servidor.'); }
  clearTimeout(t);
  const text = (await res.text()).trim();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) || `HTTP ${res.status}` }; }
  if (res.status === 401 && !path.startsWith('/api/login')) { showLogin(); throw new Error('Sesión vencida. Entrá de nuevo.'); }
  if (!res.ok || data.error) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: data.status || res.status });
  return data;
}

/* ================= STATE ================= */
const S = { me: null, reels: null, bangers: null, chats: [], convId: null, events: null, goals: null, brand: null };

/* ================= AUTH & BOOT ================= */
function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); }
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#loginErr').textContent = '';
  try { await api('/api/login', { method: 'POST', body: { password: $('#pw').value } }); $('#pw').value = ''; await boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/login', { method: 'DELETE' }).catch(() => {}); location.reload(); });

async function boot() {
  const me = await api('/api/me');
  if (!me.authed) { showLogin(); if (!me.config.hasPassword) $('#loginErr').textContent = 'Falta configurar APP_PASSWORD en Netlify.'; return; }
  S.me = me; S.goals = me.goals; S.brand = me.brandkit;
  showApp();
  renderUser(); renderSetup();
  const p = new URLSearchParams(location.search);
  if (p.get('connected')) { toast('Instagram conectado. Sincronizando…'); history.replaceState({}, '', '/'); }
  if (p.get('ig_error')) { openModal(`<h3>No se pudo conectar Instagram</h3><p class="sub">${esc(p.get('ig_error'))}</p><p class="small">Revisá en Meta for Developers que la URL de redirección sea exactamente <code>${location.origin}/api/ig/callback</code> y que tu cuenta esté agregada como tester (docs/SETUP.md).</p>`); history.replaceState({}, '', '/'); }
  go(safeLS('dc-view') || 'dashboard');
  loadReels();
}

function renderUser() {
  const pr = S.me.profile;
  const name = pr?.name || S.brand?.owner || 'Creador';
  $('#userName').textContent = name;
  $('#userHandle').textContent = pr?.username ? '@' + pr.username : S.brand?.handle || '';
  const av = $('#avatar');
  if (pr?.profile_picture_url) av.innerHTML = `<img src="${esc(pr.profile_picture_url)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
  else av.textContent = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const h = new Date().getHours();
  $('#greet').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${name.split(' ')[0]}.`;
  $('#greetSub').textContent = `Resumen ejecutivo de Dashboard Content${pr?.username ? ' · @' + pr.username : ''}`;
}

function renderSetup() {
  const c = S.me.config, ig = S.me.instagram;
  const pills = [];
  if (!ig.connected) pills.push(`<span class="pill warn">Instagram sin conectar</span>`);
  if (!c.hasInstagramApp) pills.push(`<span class="pill warn" title="Agregá IG_APP_ID e IG_APP_SECRET en Netlify">Falta app de Meta</span>`);
  if (!c.hasAnthropic) pills.push(`<span class="pill warn" title="Agregá ANTHROPIC_API_KEY en Netlify">IA desactivada (falta ANTHROPIC_API_KEY)</span>`);
  if (!c.hasSupadata) pills.push(`<span class="pill warn">Transcripción desactivada (falta SUPADATA_API_KEY)</span>`);
  if (!c.hasApify) pills.push(`<span class="pill info" title="Opcional: APIFY_TOKEN habilita el escaneo automático de referentes">Escaneo automático: manual (por URL)</span>`);
  $('#setup').innerHTML = pills.length ? pills.join('') + `<button class="btn sm ghost" onclick="go('ajustes')">Configurar →</button>` : '';
}

function go(v) {
  if (!$('#view-' + v)) v = 'dashboard';
  $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
  safeLS('dc-view', v);
  if (v === 'inspiracion' && !S.bangers) loadBangers();
  if (v === 'chat' && !S.chatsLoaded) loadChats();
  if (v === 'calendario' && !S.events) loadEvents();
  if (v === 'ajustes') renderSettings();
  if (v === 'variantes') window.initVariants?.();
  if (v === 'historias') window.initStories?.();
}
function safeLS(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeModal(); } });

/* ================= DATA: REELS ================= */
async function loadReels() {
  $('#dashBody').innerHTML = spinner('Cargando tus reels…');
  try { S.reels = await api('/api/reels'); } catch (e) { $('#dashBody').innerHTML = empty('No se pudo cargar', esc(e.message)); return; }
  renderDashboard(); renderReels(); window.onReelsLoaded?.();
}
async function syncReels(full = false) {
  if (!S.me.instagram.connected) return connectInstagram();
  const btn = $('#syncBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sincronizando…';
  try {
    const r = await api('/api/ig/sync' + (full ? '?full=1' : ''), { method: 'POST', timeoutMs: 120000 });
    toast(`${r.count} reels sincronizados · métricas privadas actualizadas`);
    S.me = await api('/api/me'); renderUser(); renderSetup();
    await loadReels();
  } catch (e) { toast(e.message, 5000); if (e.status === 401) { S.me.instagram.connected = false; renderSetup(); } }
  btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>Sincronizar';
}
$('#syncBtn').addEventListener('click', () => syncReels(false));
function connectInstagram() {
  if (!S.me.config.hasInstagramApp) { go('ajustes'); toast('Primero configurá la app de Meta (IG_APP_ID / IG_APP_SECRET).', 4000); return; }
  location.href = '/api/ig/auth';
}

/* ================= DASHBOARD ================= */
function renderDashboard() {
  const d = S.reels; const k = d.kpis; const goals = S.goals || d.goals;
  if (!S.me.instagram.connected && !d.reels.length) {
    $('#dashBody').innerHTML = empty('Conectá tu Instagram', 'Con tu cuenta Creator conectada, acá vas a ver seguidores, reach, guardados y engagement de todos tus reels, con métricas privadas de la API oficial de Meta.', `<button class="btn primary" onclick="connectInstagram()">Conectar Instagram</button>`);
    return;
  }
  if (!d.reels.length) { $('#dashBody').innerHTML = empty('Todavía no hay reels sincronizados', 'Tocá “Sincronizar” para traer tus reels y sus métricas.', `<button class="btn primary" onclick="syncReels()">Sincronizar ahora</button>`); return; }
  $('#syncedAt').textContent = d.profile?.synced_at ? 'Última sincronización: ' + new Date(d.profile.synced_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const delta = (v, suffix = '% vs mes pasado') => v == null ? '<span class="vs">sin mes anterior</span>' : `${v > 0 ? '+' : ''}${v}${suffix}`;
  const cls = (v) => (v == null ? '' : v >= 0 ? 'up' : 'down');
  const kp = [
    { l: 'Seguidores', v: fmt(k.followers), d: k.followersDelta == null ? '<span class="vs">histórico desde hoy</span>' : `${k.followersDelta >= 0 ? '+' : ''}${k.followersDelta} <span class="vs">últimos 30 días</span>`, c: cls(k.followersDelta ?? 0), ic: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>' },
    { l: 'Reach total', v: fmt(k.reachTotal), d: delta(k.reachDelta), c: cls(k.reachDelta), ic: svgI.eye },
    { l: 'Total guardados', v: fmt(k.savesTotal), d: delta(k.savesDelta), c: cls(k.savesDelta), ic: svgI.save },
    { l: 'Engagement rate', v: k.er.toFixed(1) + '%', d: '<span class="vs">promedio por reel</span>', c: 'up', ic: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>' },
    { l: 'Reels publicados', v: k.reelsPublished, d: `${k.reelsThisMonth} este mes · ${delta(k.reelsDelta, '%')}`, c: cls(k.reelsDelta), ic: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>' },
    { l: 'Mediana de vistas', v: fmt(k.medianViews), d: '<span class="vs">referencia para el ×</span>', c: 'up', ic: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>' },
    { l: 'Compartidos', v: fmt(k.sharesTotal), d: delta(k.sharesDelta), c: cls(k.sharesDelta), ic: '<svg viewBox="0 0 24 24"><path d="M4 12v8h16v-8M12 3v13M8 7l4-4 4 4"/></svg>' },
    { l: 'Mejor horario', v: k.bestHour || '—', d: '<span class="vs">hora local con más reach</span>', c: 'up', ic: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
  ];
  const monthName = (ym) => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+ym.slice(5, 7) - 1];
  const gl = [
    { l: 'Seguidores Instagram', a: k.followers || 0, b: goals.followers, n: `Faltan ${fmt(Math.max(0, goals.followers - (k.followers || 0)))}` },
    { l: 'Views orgánicas (total)', a: k.viewsTotal, b: goals.views, n: 'Suma de vistas de todos los reels' },
    { l: 'Reels publicados este mes', a: k.reelsThisMonth, b: goals.reelsPerMonth, n: `Ritmo objetivo: ${Math.round(goals.reelsPerMonth / 4)} por semana` },
    { l: 'Guardados por reel (promedio)', a: k.avgSaves, b: goals.savesPerReel, n: 'Los formatos de lista suelen duplicar el promedio' },
  ];
  const rec = d.reels.slice(0, 8);
  $('#dashBody').innerHTML = `
  <div class="grid kpis">${kp.map((x) => `<div class="card kpi"><div class="eyebrow">${x.l}${x.ic}</div><div class="num">${x.v}</div><div class="delta ${x.c}">${x.d}</div></div>`).join('')}</div>
  <div class="grid row2" style="margin-top:14px">
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div><div class="eyebrow">Reach mes a mes</div><h2 style="margin-top:4px">Alcance de los reels por mes de publicación</h2></div><span class="pill">${monthName(d.monthly[0].month)} – ${monthName(d.monthly[d.monthly.length - 1].month)}</span></div><svg class="chart" id="reachChart" viewBox="0 0 640 260" preserveAspectRatio="none"></svg></div>
    <div class="card"><div class="eyebrow">Objetivos del mes</div><h2 style="margin-top:4px">${new Date().toLocaleString('es', { month: 'long' }).replace(/^./, (c) => c.toUpperCase())}</h2>${gl.map((g) => `<div class="goal"><div class="lbl"><span>${g.l}</span><span>${fmt(g.a)} / ${fmt(g.b)}</span></div><div class="bar"><i style="width:${Math.min(100, g.b ? g.a / g.b * 100 : 0).toFixed(1)}%"></i></div><small>${pct(g.a, g.b)} del objetivo · ${g.n}</small></div>`).join('')}<div style="margin-top:12px"><button class="btn sm ghost" onclick="go('ajustes')">Editar objetivos →</button></div></div>
  </div>
  <div class="card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div><div class="eyebrow">Últimos reels</div><h2 style="margin-top:4px">Rendimiento reciente</h2></div><button class="btn sm ghost" onclick="go('instagram')">Ver todos →</button></div>
  <div style="overflow-x:auto"><table><thead><tr><th>Reel</th><th>Fecha</th><th class="num">Vistas</th><th class="num">Reach</th><th class="num">Guardados</th><th class="num">ER</th><th class="num">vs mediana</th><th>IA</th></tr></thead><tbody>${rec.map((r) => `<tr style="cursor:pointer" onclick="openReel('${r.id}')"><td><div class="mini"><div class="th" style="background:${gradFor(r.id)}">${r.thumbnail_url ? `<img src="${esc(r.thumbnail_url)}" alt="" loading="lazy" style="border-radius:5px">` : ''}</div><span style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${esc(r.title)}</span></div></td><td style="color:var(--muted)">${fdate(r.date)}</td><td class="num">${fmt(r.views)}</td><td class="num">${fmt(r.reach)}</td><td class="num">${fmt(r.saves)}</td><td class="num">${r.er.toFixed(2)}%</td><td class="num"><span class="pill ${r.x >= 1 ? 'good' : 'bad'}">${xfmt(r.x)}</span></td><td>${r.analyzed ? '<span class="pill good">✓</span>' : '<span class="pill">—</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  renderChart(d.monthly);
}

function renderChart(monthly) {
  const svg = $('#reachChart'); if (!svg) return;
  const W = 640, H = 260, pl = 52, pr = 16, pt = 18, pb = 30;
  const vals = monthly.map((m) => m.reach || 0);
  const max = Math.max(1, ...vals) * 1.15;
  const xs = (i) => pl + (W - pl - pr) * i / Math.max(1, monthly.length - 1), ys = (v) => pt + (H - pt - pb) * (1 - v / max);
  const step = niceStep(max / 4); const ticks = []; for (let t = 0; t <= max; t += step) ticks.push(t);
  const pts = vals.map((v, i) => [xs(i), ys(v)]);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const peak = vals.indexOf(Math.max(...vals));
  const mn = (ym) => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+ym.slice(5, 7) - 1];
  svg.innerHTML = `<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d8d" stop-opacity=".28"/><stop offset="1" stop-color="#ff4d8d" stop-opacity="0"/></linearGradient></defs>
  ${ticks.map((t) => `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${pl - 8}" y="${ys(t) + 3}" text-anchor="end">${fmt(t)}</text>`).join('')}
  <path class="area" d="${path} L${pts[pts.length - 1][0]} ${ys(0)} L${pts[0][0]} ${ys(0)}Z"/><path class="series" d="${path}"/>
  ${monthly.map((m, i) => `<text x="${xs(i)}" y="${H - 10}" text-anchor="middle">${mn(m.month)}</text>`).join('')}
  ${pts.map((p, i) => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="${i === peak ? 5 : 3.5}"/>`).join('')}
  ${vals[peak] ? `<text x="${pts[peak][0]}" y="${pts[peak][1] - 12}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${fmt(vals[peak])}</text>` : ''}
  <line class="crosshair" id="ch" x1="0" x2="0" y1="${pt}" y2="${H - pb}" style="display:none"/>`;
  const tip = $('#tip');
  svg.onmousemove = (e) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W; let i = Math.round((x - pl) / ((W - pl - pr) / Math.max(1, monthly.length - 1))); i = Math.max(0, Math.min(monthly.length - 1, i)); const ch = $('#ch'); ch.style.display = ''; ch.setAttribute('x1', xs(i)); ch.setAttribute('x2', xs(i)); tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY - 10 + 'px'; tip.innerHTML = `${mn(monthly[i].month)} ${monthly[i].month.slice(0, 4)}<br><b>${(monthly[i].reach || 0).toLocaleString('es')}</b> reach · ${monthly[i].reels} reels`; };
  svg.onmouseleave = () => { tip.style.display = 'none'; $('#ch').style.display = 'none'; };
}
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

/* ================= INSTAGRAM ================= */
let reelFilter = 'all', reelQuery = '';
function reelCard(r) {
  const cls = r.er >= 3 ? 'hi' : r.er < 1 ? 'lo' : '';
  return `<button class="reel" onclick="openReel('${r.id}')" aria-label="${esc(r.title)}"><div class="bgp" style="background:${gradFor(r.id)}">${r.thumbnail_url ? `<img src="${esc(r.thumbnail_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>${r.analyzed ? '<span class="badge">IA</span>' : ''}<div class="caption">${esc(r.title)}</div><div class="meta"><span><b>${fmt(r.views)}</b> vistas</span><span class="er ${cls}">${r.er.toFixed(2)}% ER</span></div></button>`;
}
function renderReels() {
  const d = S.reels; if (!d) return;
  let list = [...d.reels]; const q = reelQuery.toLowerCase();
  if (q) list = list.filter((r) => (r.caption + ' ' + r.title).toLowerCase().includes(q));
  if (reelFilter === 'recent') list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  if (reelFilter === 'views') list.sort((a, b) => (b.views || 0) - (a.views || 0));
  if (reelFilter === 'er') list.sort((a, b) => b.er - a.er);
  if (reelFilter === 'analyzed') list = list.filter((r) => r.analyzed);
  $('#reelCount').textContent = d.reels.length;
  $('#reelGrid').innerHTML = list.length ? list.map(reelCard).join('') : (d.reels.length ? '<p class="sub">Ningún reel coincide.</p>' : empty('Sin reels', 'Conectá Instagram y sincronizá para ver tus reels acá.', `<button class="btn primary" onclick="syncReels()">Sincronizar</button>`));
}
$('#reelTabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; $$('#reelTabs .tab').forEach((t) => t.classList.remove('active')); b.classList.add('active'); reelFilter = b.dataset.f; renderReels(); });
$('#reelSearch').addEventListener('input', (e) => { reelQuery = e.target.value; renderReels(); });

async function openReel(id) {
  const r = S.reels?.reels.find((x) => x.id === id); if (!r) return;
  $('#drawer').innerHTML = `<button class="iconbtn close" onclick="closeDrawer()">${svgI.x}</button>
  <div class="dhead"><div class="th" style="background:${gradFor(r.id)}">${r.thumbnail_url ? `<img src="${esc(r.thumbnail_url)}" alt="" style="border-radius:8px">` : ''}</div><div><h3>${esc(r.title)}</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill">${fdate(r.date)}</span><span class="pill ${r.x >= 1 ? 'good' : 'bad'}">${xfmt(r.x)} tu mediana de vistas</span></div></div></div>
  <div class="stat3"><div class="stat"><div class="eyebrow">Views</div><div class="v">${r.views == null ? 'N/A' : r.views.toLocaleString('es')}</div></div><div class="stat"><div class="eyebrow">Likes</div><div class="v">${r.likes ?? 0}</div></div><div class="stat"><div class="eyebrow">Comments</div><div class="v">${r.comments ?? 0}</div></div></div>
  <div class="eyebrow" style="margin-bottom:8px">Métricas privadas (Meta API oficial)</div>
  <div class="stat4"><div class="stat"><div class="eyebrow">Reach</div><div class="v">${r.reach == null ? 'N/A' : r.reach.toLocaleString('es')}</div></div><div class="stat"><div class="eyebrow">Saves</div><div class="v">${r.saves ?? 'N/A'}</div></div><div class="stat"><div class="eyebrow">Shares</div><div class="v">${r.shares ?? 'N/A'}</div></div><div class="stat"><div class="eyebrow">ER %</div><div class="v">${r.er.toFixed(2)}%</div></div></div>
  <a class="btn" style="width:100%;justify-content:center" href="${esc(r.permalink)}" target="_blank" rel="noopener">${svgI.ext}Ver en Instagram</a>
  ${r.caption ? `<div class="ai"><div class="hd"><span class="eyebrow">Caption</span><button class="btn sm ghost" onclick="copyText(S.reels.reels.find(x=>x.id==='${r.id}').caption)">⧉ Copiar</button></div><div class="block transc">${esc(r.caption)}</div></div>` : ''}
  <div class="ai"><div class="hd"><span class="eyebrow"><svg viewBox="0 0 24 24"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/></svg>Análisis IA</span><div style="display:flex;gap:6px;flex-wrap:wrap" id="aiActions"></div></div><div id="aiBlocks">${spinner('Buscando análisis guardado…')}</div></div>
  <div class="ai"><div class="hd"><span class="eyebrow">Transcripción</span><div style="display:flex;gap:6px" id="trActions"></div></div><div id="trBlock"></div></div>`;
  $('#drawer').classList.add('open'); $('#overlay').classList.add('open');
  try { const d = await api('/api/analyze?id=' + id); renderAnalysis(r, d.analysis, d.transcript); }
  catch (e) { $('#aiBlocks').innerHTML = `<div class="block">${esc(e.message)}</div>`; }
}
function renderAnalysis(r, a, t) {
  const ai = S.me.config.hasAnthropic;
  $('#aiActions').innerHTML = `${a ? `<button class="btn sm ghost" onclick="downloadAnalysis('${r.id}')">Descargar</button>` : ''}<button class="btn sm ${a ? '' : 'primary'}" ${ai ? '' : 'disabled title="Falta ANTHROPIC_API_KEY"'} onclick="runAnalysis('${r.id}',${!!a})">${a ? 'Regenerar' : '✦ Analizar con IA'}</button>`;
  $('#aiBlocks').innerHTML = a ? aiBlocks(a) : `<div class="block">${ai ? 'Todavía no analizaste este reel. La IA usa la transcripción, el caption, las métricas y tu kit de marca.' : 'Agregá ANTHROPIC_API_KEY en Netlify para activar el análisis IA.'}</div>`;
  $('#trActions').innerHTML = `<button class="btn sm ghost" ${S.me.config.hasSupadata ? '' : 'disabled title="Falta SUPADATA_API_KEY"'} onclick="transcribe('${r.id}')">${t?.text ? 'Re-transcribir' : 'Transcribir'}</button><button class="btn sm ghost" onclick="manualTranscript('${r.id}')">Pegar texto</button>${t?.text ? `<button class="btn sm ghost" onclick="copyText(document.getElementById('trText').textContent)">⧉ Copiar</button>` : ''}`;
  $('#trBlock').innerHTML = t?.text ? `<div class="block transc" id="trText">${esc(t.text)}</div><div class="small" style="margin-top:4px">Fuente: ${t.source === 'manual' ? 'pegada a mano' : 'Supadata'} · ${t.at ? new Date(t.at).toLocaleDateString('es') : ''}</div>` : `<div class="block">${t?.error ? 'No se pudo transcribir: ' + esc(t.error) : 'Sin transcripción todavía.'}</div>`;
}
function aiBlocks(a) {
  return `<div class="block"><span class="n">1</span><b>HOOK:</b> ${esc(a.hook)}</div><div class="block"><span class="n">2</span><b>RETENCIÓN:</b> ${esc(a.retention)}</div><div class="block"><span class="n">3</span><b>CTA Y CONVERSIÓN:</b> ${esc(a.cta)}</div><div class="block improve"><div class="t"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>Puntos de mejora</div>${esc(a.improve)}</div>${a.score != null ? `<div class="small">Score ${a.score}/100 · palabra clave sugerida: <b>${esc(a.keyword || '—')}</b> · ${a.hadTranscript ? 'con transcripción' : 'sin transcripción'} · ${new Date(a.at).toLocaleDateString('es')}</div>` : ''}`;
}
async function runAnalysis(id, force) {
  $('#aiBlocks').innerHTML = '<div class="block"><span class="typing"><i></i><i></i><i></i></span> Transcribiendo y analizando con Claude… (15–40 s)</div>';
  try { const d = await api('/api/analyze', { method: 'POST', body: { id, force }, timeoutMs: 120000 }); const r = S.reels.reels.find((x) => x.id === id); r.analyzed = true; renderAnalysis(r, d.analysis, d.transcript); renderReels(); toast('Análisis listo'); }
  catch (e) { $('#aiBlocks').innerHTML = `<div class="block">${esc(e.message)}</div>`; renderAnalysis(S.reels.reels.find((x) => x.id === id), null, null); $('#aiBlocks').innerHTML = `<div class="block improve"><div class="t">Error</div>${esc(e.message)}</div>`; }
}
async function transcribe(id) {
  $('#trBlock').innerHTML = '<div class="block"><span class="typing"><i></i><i></i><i></i></span> Transcribiendo con Supadata…</div>';
  try { const d = await api('/api/analyze', { method: 'POST', body: { id, transcribe: true, transcribeOnly: true }, timeoutMs: 120000 }); const a = (await api('/api/analyze?id=' + id)).analysis; renderAnalysis(S.reels.reels.find((x) => x.id === id), a, d.transcript); }
  catch (e) { $('#trBlock').innerHTML = `<div class="block">${esc(e.message)}</div>`; }
}
function manualTranscript(id) {
  openModal(`<h3>Pegar transcripción</h3><p class="sub" style="font-size:13px">Copiá el texto desde CapCut / Premiere / Instagram y pegalo acá. Se usa para el análisis IA.</p><textarea class="textarea" id="manualTr" style="min-height:160px;margin-top:10px"></textarea><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn primary" onclick="saveManualTranscript('${id}')">Guardar</button></div>`);
}
async function saveManualTranscript(id) {
  const text = $('#manualTr').value.trim(); if (!text) return;
  closeModal();
  try { const d = await api('/api/analyze', { method: 'POST', body: { id, transcript: text, transcribeOnly: true } }); const a = (await api('/api/analyze?id=' + id)).analysis; renderAnalysis(S.reels.reels.find((x) => x.id === id), a, d.transcript); toast('Transcripción guardada'); } catch (e) { toast(e.message, 4000); }
}
async function downloadAnalysis(id) {
  const r = S.reels.reels.find((x) => x.id === id); const d = await api('/api/analyze?id=' + id); const a = d.analysis;
  download(`analisis-${r.date}-${r.id}.md`, `# ${r.title}\n\n${r.permalink}\nFecha: ${r.date} · Views ${r.views} · Reach ${r.reach} · Saves ${r.saves} · Shares ${r.shares ?? 'N/A'} · ER ${r.er.toFixed(2)}%\n\n## Hook\n${a.hook}\n\n## Retención\n${a.retention}\n\n## CTA y conversión\n${a.cta}\n\n## Puntos de mejora\n${a.improve}\n\n## Transcripción\n${d.transcript?.text || '(sin transcripción)'}\n`, 'text/markdown');
}

/* ================= INSPIRACIÓN ================= */
let bangerSort = 'x';
async function loadBangers() {
  $('#bangerGrid').innerHTML = spinner('Cargando…');
  try { S.bangers = await api('/api/bangers'); } catch (e) { $('#bangerGrid').innerHTML = empty('Error', esc(e.message)); return; }
  renderRefs(); renderBangers(); renderScanLog();
}
function renderRefs() {
  const refs = S.bangers.refs;
  $('#refChips').innerHTML = refs.map((a) => `<span class="chip">${esc(a)}<button title="Quitar" onclick="removeRef('${esc(a)}')">×</button></span>`).join('') + `<span class="chip add"><input placeholder="@cuenta" onkeydown="if(event.key==='Enter'){addRef(this.value);this.value=''}"><button onclick="const i=this.previousElementSibling;addRef(i.value);i.value=''">+</button></span>`;
  $('#scanBtn').title = S.bangers.providers.apify ? '' : 'Sin APIFY_TOKEN el escaneo automático no está disponible; usá “Agregar reels por URL”.';
}
async function saveRefs(refs) { try { S.bangers = { ...S.bangers, ...(await api('/api/bangers', { method: 'POST', body: { action: 'refs', refs } })) }; renderRefs(); } catch (e) { toast(e.message, 4000); } }
function addRef(v) { v = v.trim(); if (!v) return; if (!v.startsWith('@')) v = '@' + v; if (!S.bangers.refs.includes(v)) saveRefs([...S.bangers.refs, v]); }
function removeRef(a) { saveRefs(S.bangers.refs.filter((x) => x !== a)); }
function renderScanLog() {
  const log = S.bangers.scanlog || []; if (!log.length) { $('#scanStatus').innerHTML = ''; return; }
  const ok = log.filter((l) => l.ok);
  $('#scanStatus').innerHTML = `<span>Último escaneo ${new Date(log[0].at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · ${ok.length}/${log.length} cuentas · ${ok.reduce((a, l) => a + (l.bangers || 0), 0)} bangers nuevos</span>${log.filter((l) => !l.ok).map((l) => `<span class="pill bad" title="${esc(l.error)}">${esc(l.account)} ✕</span>`).join('')}`;
}
$('#scanBtn').addEventListener('click', async () => {
  if (!S.bangers.providers.apify) return openModal(`<h3>Escaneo automático de referentes</h3><p class="sub" style="font-size:13px">Instagram no permite leer los reels de otras cuentas con tu token de Creator. Para escanear cuentas completas el dashboard usa <b>Apify</b> (Instagram Reel Scraper, tiene plan gratuito): creá una cuenta en apify.com, copiá tu token y agregalo en Netlify como <code>APIFY_TOKEN</code>.</p><p class="sub" style="font-size:13px">Sin eso, funciona el modo manual: pegá los links de los reels que veas rindiendo en “Agregar reels por URL” y el sistema lee sus métricas y calcula el score.</p>`);
  const b = $('#scanBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Escaneando…'; $('#scanStatus').innerHTML = `<span>Escaneando ${S.bangers.refs.length} cuentas (últimos 30 reels cada una)…</span><div class="bar"><i style="width:40%"></i></div>`;
  try { S.bangers = { ...S.bangers, ...(await api('/api/bangers', { method: 'POST', body: { action: 'scan' }, timeoutMs: 150000 })) }; renderBangers(); renderScanLog(); toast('Escaneo completo'); }
  catch (e) { toast(e.message, 5000); renderScanLog(); }
  b.disabled = false; b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Escanear referentes';
});
$('#investBtn').addEventListener('click', async () => {
  const acc = $('#investInput').value.trim(); if (!acc) return;
  if (!S.bangers.providers.apify) return $('#scanBtn').click();
  $('#investOut').innerHTML = spinner(`Analizando ${acc}…`);
  try { const r = await api('/api/bangers', { method: 'POST', body: { action: 'investigate', account: acc }, timeoutMs: 150000 }); $('#investOut').innerHTML = `<div class="small">${r.videos} reels leídos · mediana ${fmt(r.median)} vistas · ${r.bangers.length} bangers</div><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${(r.all || []).slice(0, 10).map((v) => `<div class="block" style="margin:0;display:flex;justify-content:space-between;gap:8px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.hook)}</span><span class="x" style="font-family:var(--mono);font-size:11px;white-space:nowrap">${fmt(v.views)} · ${xfmt(v.x)} · score ${v.score}</span></div>`).join('')}</div><div style="margin-top:8px"><button class="btn sm" onclick="addRef('${esc(acc)}')">Guardar como referente</button></div>`; }
  catch (e) { $('#investOut').innerHTML = `<div class="block">${esc(e.message)}</div>`; }
});
$('#urlsBtn').addEventListener('click', async () => {
  const urls = $('#urlsInput').value.split(/\s+/).filter(Boolean); if (!urls.length) return;
  const b = $('#urlsBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
  try { const r = await api('/api/bangers', { method: 'POST', body: { action: 'urls', urls }, timeoutMs: 150000 }); S.bangers = { ...S.bangers, refs: r.refs, bangers: r.bangers, scanlog: r.scanlog }; renderBangers(); $('#urlsInput').value = ''; toast(`${r.added.length} reels agregados${r.skipped.length ? ` · ${r.skipped.length} no se pudieron leer` : ''}`); }
  catch (e) { toast(e.message, 5000); }
  b.disabled = false; b.textContent = 'Agregar';
});
$('#bangerSort').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; $$('#bangerSort .tab').forEach((t) => t.classList.remove('active')); b.classList.add('active'); bangerSort = b.dataset.s; renderBangers(); });
function renderBangers() {
  let l = [...(S.bangers.bangers || [])];
  if (bangerSort !== 'all') l = l.filter((b) => b.score == null || b.score >= 80); // score null = sin mediana todavía
  if (bangerSort === 'x') l.sort((a, b) => (b.x || 0) - (a.x || 0));
  if (bangerSort === 'views' || bangerSort === 'all') l.sort((a, b) => (b.views || 0) - (a.views || 0));
  if (bangerSort === 'date') l.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!l.length) { $('#bangerGrid').innerHTML = empty('Sin bangers todavía', S.bangers.bangers?.length ? 'Ningún video supera el umbral (score ≥ 80). Mirá “Todos” para ver los que sí leíste.' : 'Escaneá tus referentes o pegá URLs de reels para empezar a detectar qué está funcionando.'); return; }
  $('#bangerGrid').innerHTML = l.map((b) => `<div class="card banger"><div class="th" style="background:${gradFor(b.url || b.id)}">${b.thumbnail ? `<img src="${esc(b.thumbnail)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="score" title="${b.score == null ? 'Sin score: agregá 3+ reels de esta cuenta para calcular su mediana' : 'Score viral'}">${b.score ?? '?'}</span></div><div><div class="who"><b>${esc(b.account)}</b>${b.x != null ? `<span class="x">${xfmt(b.x)} su mediana</span>` : '<span class="pill" title="Agregá 3 o más reels de la misma cuenta">sin mediana aún</span>'}</div><p>→ ${esc(b.hook)}</p><div class="nums"><span>${svgI.eye}${fmt(b.views)}</span><span>${svgI.heart}${fmt(b.likes)}</span><span>${svgI.msg}${fmt(b.comments)}</span><span>${svgI.cal}${fdate(b.date)}</span></div><div class="acts"><button class="btn sm primary" ${S.me.config.hasAnthropic ? '' : 'disabled title="Falta ANTHROPIC_API_KEY"'} onclick="adaptBanger('${b.id}')">✦ ${b.adapted ? 'Ver adaptación' : 'Adaptar a mi marca'}</button><button class="iconbtn" title="Transcripción" onclick="bangerTranscript('${b.id}')"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></button><a class="iconbtn" title="Abrir original" href="${esc(b.url)}" target="_blank" rel="noopener">${svgI.ext}</a><button class="iconbtn" title="Quitar" onclick="deleteBanger('${b.id}')">${svgI.trash}</button></div></div></div>`).join('');
}
async function deleteBanger(id) { try { const r = await fetch('/api/bangers?id=' + id, { method: 'DELETE' }); S.bangers = { ...S.bangers, ...(await r.json()) }; renderBangers(); } catch (e) { toast(e.message); } }
async function bangerTranscript(id) {
  openModal(`<h3>Transcripción</h3><div id="btr">${spinner('Transcribiendo con Supadata…')}</div>`);
  try { const r = await api('/api/bangers', { method: 'POST', body: { action: 'transcript', id }, timeoutMs: 120000 }); $('#btr').innerHTML = `<div class="block transc" style="max-height:400px">${esc(r.transcript || '(vacía)')}</div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm" onclick="copyText(${JSON.stringify(r.transcript || '')})">⧉ Copiar</button></div>`; }
  catch (e) { $('#btr').innerHTML = `<div class="block">${esc(e.message)}</div>`; }
}
async function adaptBanger(id) {
  const b = S.bangers.bangers.find((x) => x.id === id);
  const render = (a) => `<h3>Adaptación a tu marca</h3><p class="sub" style="font-size:13px">Basado en el video de <b style="font-family:var(--mono);color:var(--ink)">${esc(b.account)}</b>${b.x ? ` (${xfmt(b.x)} su mediana)` : ''}, reescrito con tu kit de marca.</p>
  <div class="script"><span class="lab">Por qué funcionó el original</span>${esc(a.why)}<span class="lab">Hook (0–3 s)</span><b>${esc(a.hook)}</b> — texto en pantalla: <i>${esc(a.onscreen)}</i><span class="lab">Desarrollo (3–25 s)</span>${esc(a.body)}<span class="lab">CTA</span><b>${esc(a.cta)}</b><span class="lab">Publicación</span>${esc(a.publish)}</div>
  <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" onclick="copyText(document.querySelector('#modalBox .script').innerText)">⧉ Copiar guion</button><button class="btn" onclick="closeModal();quickEvent({title:${JSON.stringify(a.title || b.hook.slice(0, 40))},kind:'reel'})">Mandar al calendario</button><button class="btn primary" onclick="closeModal();go('chat');chatSeed(${JSON.stringify('Convertí este guion en una versión final de 30-35 segundos para grabar, en prosa natural: ' + (a.hook || '') + ' / ' + (a.body || '') + ' / ' + (a.cta || ''))})">Seguir en AI Chat</button><button class="btn ghost" onclick="adaptBanger('${id}',true)">Regenerar</button></div>`;
  if (b.adapted && !arguments[1]) return openModal(render(b.adapted));
  openModal(`<h3>Adaptación a tu marca</h3>${spinner('Claude está reescribiendo el video con tu kit de marca…')}`);
  try { const r = await api('/api/bangers', { method: 'POST', body: { action: 'adapt', id }, timeoutMs: 120000 }); b.adapted = r.adapted; openModal(render(r.adapted)); renderBangers(); }
  catch (e) { openModal(`<h3>No se pudo adaptar</h3><div class="block">${esc(e.message)}</div>`); }
}

/* ================= AI CHAT ================= */
const SUGG = ['¿Cuál fue mi mejor hook del mes y por qué?', 'Armame 3 ideas de reels para esta semana con mis datos', '¿A qué hora me conviene publicar?', 'Resumí mis números del último mes en 5 líneas'];
async function loadChats() {
  try { S.chats = (await api('/api/chat')).conversations; S.chatsLoaded = true; } catch (e) { toast(e.message); }
  if (!S.convId && S.chats[0]) S.convId = S.chats[0].id;
  renderConvs(); renderMsgs();
}
function renderConvs() { $('#convList').innerHTML = `<button class="btn" onclick="newConv()">+ Nueva conversación</button>` + S.chats.map((c) => `<button class="conv ${c.id === S.convId ? 'active' : ''}" onclick="S.convId='${c.id}';renderConvs();renderMsgs()">${svgI.msg}<span>${esc(c.title)}</span></button>`).join(''); }
function renderMsgs() {
  const m = $('#msgs'); const c = S.chats.find((x) => x.id === S.convId);
  if (!c) { m.innerHTML = `<div class="msg ai">${S.me.config.hasAnthropic ? `Hola${S.me.profile?.name ? ', ' + S.me.profile.name.split(' ')[0] : ''}. Conozco tu kit de marca y tus reels sincronizados. ¿Qué armamos hoy?` : 'Agregá ANTHROPIC_API_KEY en Netlify para activar el chat.'}</div>`; }
  else m.innerHTML = c.messages.map((x) => x.role === 'user' ? `<div class="msg me">${esc(x.content)}</div>` : `<div class="msg ai">${md(x.content)}<div class="copy"><button class="btn sm ghost" onclick="copyText(this.closest('.msg').innerText)">⧉ Copiar</button></div></div>`).join('');
  m.scrollTop = m.scrollHeight;
  $('#sugg').innerHTML = SUGG.map((s) => `<button onclick="chatSeed(${JSON.stringify(s)})">${s}</button>`).join('');
}
function newConv() { S.convId = null; renderConvs(); renderMsgs(); $('#chatInput').focus(); }
function chatSeed(t) { $('#chatInput').value = t; sendChat(); }
async function sendChat() {
  const i = $('#chatInput'); const t = i.value.trim(); if (!t) return;
  if (!S.me.config.hasAnthropic) return toast('Falta ANTHROPIC_API_KEY en Netlify.', 4000);
  i.value = '';
  const m = $('#msgs'); m.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(t)}</div><div class="msg ai" id="typing"><span class="typing"><i></i><i></i><i></i></span></div>`); m.scrollTop = m.scrollHeight;
  try {
    const r = await api('/api/chat', { method: 'POST', body: { convId: S.convId, message: t }, timeoutMs: 120000 });
    const idx = S.chats.findIndex((c) => c.id === r.conversation.id); if (idx >= 0) S.chats[idx] = r.conversation; else S.chats.unshift(r.conversation);
    S.convId = r.conversation.id; renderConvs(); renderMsgs();
  } catch (e) { $('#typing')?.remove(); m.insertAdjacentHTML('beforeend', `<div class="msg ai">⚠ ${esc(e.message)}</div>`); }
}
$('#sendBtn').addEventListener('click', sendChat);
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
// Minimal markdown → HTML (headings, bold/italic, code, lists, quotes, paragraphs)
function md(src) {
  const lines = esc(src).split('\n'); let out = '', list = null;
  const inline = (s) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<i>$2</i>').replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<i>$2</i>');
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^#{1,3} /.test(l)) { close(); const lvl = l.match(/^#+/)[0].length; out += `<h${lvl + 1}>${inline(l.replace(/^#+ /, ''))}</h${lvl + 1}>`; continue; }
    if (/^&gt; /.test(l)) { close(); out += `<blockquote>${inline(l.slice(5))}</blockquote>`; continue; }
    if (/^(\d+)[.)] /.test(l)) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(l.replace(/^\d+[.)] /, ''))}</li>`; continue; }
    if (/^[-*•] /.test(l)) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(l.slice(2))}</li>`; continue; }
    if (/^---+$/.test(l)) { close(); out += '<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">'; continue; }
    if (!l.trim()) { close(); continue; }
    close(); out += `<p>${inline(l)}</p>`;
  }
  close(); return out;
}

/* ================= CALENDARIO ================= */
let calY = new Date().getFullYear(), calM = new Date().getMonth();
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
async function loadEvents() { try { S.events = (await api('/api/data?key=events')).value || []; } catch (e) { S.events = []; toast(e.message); } renderCal(); }
async function saveEvents() { try { await api('/api/data?key=events', { method: 'PUT', body: { value: S.events } }); } catch (e) { toast('No se guardó el calendario: ' + e.message, 4000); } }
function shiftMonth(n) { calM += n; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } renderCal(); }
function renderCal() {
  const ev = S.events || []; const published = (S.reels?.reels || []).map((r) => ({ id: 'ig-' + r.id, d: r.date, t: r.title, k: 'done', time: r.timestamp ? new Date(r.timestamp).toTimeString().slice(0, 5) : '' }));
  const all = [...ev, ...published];
  $('#calTitle').textContent = MESES[calM] + ' ' + calY;
  const first = new Date(calY, calM, 1); const start = (first.getDay() + 6) % 7; const days = new Date(calY, calM + 1, 0).getDate(); const prevDays = new Date(calY, calM, 0).getDate(); const tod = today();
  let h = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => `<div class="dow">${d}</div>`).join('');
  const cells = []; for (let i = start - 1; i >= 0; i--) cells.push({ d: prevDays - i, out: true }); for (let d = 1; d <= days; d++) cells.push({ d }); let nx = 1; while (cells.length % 7) cells.push({ d: nx++, out: true });
  h += cells.map((c) => { const key = c.out ? null : `${calY}-${String(calM + 1).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`; const evs = key ? all.filter((e) => e.d === key).sort((a, b) => (a.time || '').localeCompare(b.time || '')) : []; return `<div class="day ${c.out ? 'out' : ''} ${key === tod ? 'today' : ''}"><div class="d"><span>${c.d}</span>${evs.length > 3 ? `<span>+${evs.length - 3}</span>` : ''}</div>${evs.slice(0, 3).map((e) => `<div class="ev k-${e.k}" title="${esc(e.t)}" onclick="event.stopPropagation();${e.k === 'done' ? `openReel('${e.id.slice(3)}')` : `editEvent('${e.id}')`}">${e.time ? `<span style="color:var(--muted);font-family:var(--mono);font-size:10px">${e.time}</span> ` : ''}${esc(e.t)}</div>`).join('')}${key ? `<button class="add" onclick="quickEvent({date:'${key}'})">+ agendar</button>` : ''}</div>`; }).join('');
  $('#cal').innerHTML = h;
  const in7 = new Date(); in7.setDate(in7.getDate() + 7); const lim = in7.toISOString().slice(0, 10);
  const up = ev.filter((e) => e.d >= tod && e.d <= lim).sort((a, b) => (a.d + a.time).localeCompare(b.d + b.time));
  $('#upnext').innerHTML = up.length ? `<table><tbody>${up.map((e) => `<tr style="cursor:pointer" onclick="editEvent('${e.id}')"><td style="width:90px;color:var(--muted);font-family:var(--mono);font-size:12px">${fdate(e.d)}</td><td><span class="ev k-${e.k}" style="display:inline-block">${esc(e.t)}</span></td><td class="num" style="color:var(--muted)">${e.time || ''}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">Nada agendado en los próximos 7 días.</p>';
}
function quickEvent({ date, title = '', kind = 'reel', notes = '' } = {}) {
  const d = date || today();
  openModal(`<h3>Agendar</h3><div class="formgrid" style="margin-top:12px"><label>Título<input id="evT" value="${esc(title)}"></label><label>Tipo<select id="evK"><option value="reel" ${kind === 'reel' ? 'selected' : ''}>Reel</option><option value="story" ${kind === 'story' ? 'selected' : ''}>Story</option><option value="test" ${kind === 'test' ? 'selected' : ''}>Variante de prueba</option></select></label><label>Fecha<input type="date" id="evD" value="${d}"></label><label>Hora<input type="time" id="evH" value="19:00"></label><label class="full">Notas / guion<textarea id="evN" rows="3">${esc(notes)}</textarea></label></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" onclick="createEvent()">Guardar</button></div>`);
  setTimeout(() => $('#evT')?.focus(), 50);
}
function createEvent(id) {
  const t = $('#evT').value.trim(); if (!t) return toast('Ponele un título');
  const e = { id: id || ('ev-' + Date.now().toString(36)), t, k: $('#evK').value, d: $('#evD').value, time: $('#evH').value, n: $('#evN').value };
  S.events = S.events || []; const i = S.events.findIndex((x) => x.id === e.id); if (i >= 0) S.events[i] = e; else S.events.push(e);
  closeModal(); renderCal(); saveEvents(); toast('Agendado');
}
function editEvent(id) {
  const e = (S.events || []).find((x) => x.id === id); if (!e) return;
  quickEvent({ date: e.d, title: e.t, kind: e.k, notes: e.n || '' });
  $('#evH').value = e.time || '19:00';
  $('#modalBox .btn.primary').setAttribute('onclick', `createEvent('${id}')`);
  $('#modalBox .btn.primary').insertAdjacentHTML('beforebegin', `<button class="btn" onclick="deleteEvent('${id}')">Eliminar</button>`);
}
function deleteEvent(id) { S.events = S.events.filter((x) => x.id !== id); closeModal(); renderCal(); saveEvents(); }
window.addEventToCalendar = (title, kind, offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); const key = d.toISOString().slice(0, 10); S.events = S.events || []; S.events.push({ id: 'ev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: title, k: kind, d: key, time: '19:00' }); saveEvents(); if (S.events) renderCal(); return key; };

/* ================= AJUSTES ================= */
function renderSettings() {
  const c = S.me.config, ig = S.me.instagram, pr = S.me.profile;
  const row = (ok, label, detail, action = '') => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)"><div><div style="display:flex;align-items:center;gap:8px"><span class="pill ${ok ? 'good' : 'warn'}">${ok ? '✓' : '!'}</span><b>${label}</b></div><div class="small" style="margin-top:3px">${detail}</div></div>${action}</div>`;
  $('#connBody').innerHTML =
    row(ig.connected, 'Instagram (API oficial de Meta)', ig.connected ? `Conectado como @${esc(pr?.username || '')} · token válido hasta ${new Date(ig.obtained_at + ig.expires_in * 1000).toLocaleDateString('es')} (se renueva solo)` : c.hasInstagramApp ? 'App configurada. Falta autorizar tu cuenta.' : 'Creá la app en developers.facebook.com y agregá IG_APP_ID / IG_APP_SECRET en Netlify (ver guía).', ig.connected ? `<div style="display:flex;gap:6px"><button class="btn sm" onclick="syncReels(true)">Resincronizar todo</button><button class="btn sm ghost" onclick="disconnectIG()">Desconectar</button></div>` : `<button class="btn sm primary" onclick="connectInstagram()">Conectar Instagram</button>`) +
    row(c.hasAnthropic, 'Anthropic (Claude)', c.hasAnthropic ? 'Análisis IA, chat y adaptación de bangers activos.' : 'Agregá ANTHROPIC_API_KEY en Netlify → Site configuration → Environment variables.') +
    row(c.hasSupadata, 'Supadata (transcripción)', c.hasSupadata ? 'Transcripción automática de reels y bangers activa.' : 'Agregá SUPADATA_API_KEY.') +
    row(c.hasApify, 'Apify (escaneo de referentes)', c.hasApify ? 'Escaneo automático de cuentas activo.' : 'Opcional. Sin APIFY_TOKEN, agregá bangers por URL.') +
    row(!!c.googleClientId, 'Google Drive (fondos de historias)', c.googleClientId ? 'Selector de Drive activo.' : 'Opcional. GOOGLE_CLIENT_ID + GOOGLE_API_KEY habilitan elegir fotos desde Drive.') +
    `<p class="small" style="margin-top:10px">Después de cambiar variables en Netlify hacé <b>Deploys → Trigger deploy</b> para que tomen efecto.</p>`;
  const g = S.goals; $('#gFollowers').value = g.followers; $('#gViews').value = g.views; $('#gReels').value = g.reelsPerMonth; $('#gSaves').value = g.savesPerReel;
  const b = S.brand; $('#bOwner').value = b.owner || ''; $('#bHandle').value = b.handle || ''; $('#bPositioning').value = b.positioning || ''; $('#bAudience').value = b.audience || ''; $('#bTone').value = b.tone || ''; $('#bPillars').value = (b.pillars || []).join('\n'); $('#bCta').value = b.ctaStyle || ''; $('#bAvoid').value = (b.avoid || []).join('\n');
}
async function disconnectIG() { if (!confirm('¿Desconectar Instagram? Los reels sincronizados se conservan.')) return; await api('/api/ig/sync', { method: 'DELETE' }); S.me.instagram = { connected: false }; renderSetup(); renderSettings(); }
$('#saveGoals').addEventListener('click', async () => { S.goals = { followers: +$('#gFollowers').value, views: +$('#gViews').value, reelsPerMonth: +$('#gReels').value, savesPerReel: +$('#gSaves').value }; try { await api('/api/data?key=goals', { method: 'PUT', body: { value: S.goals } }); toast('Objetivos guardados'); if (S.reels) renderDashboard(); } catch (e) { toast(e.message); } });
$('#saveBrand').addEventListener('click', async () => { S.brand = { owner: $('#bOwner').value, handle: $('#bHandle').value, positioning: $('#bPositioning').value, audience: $('#bAudience').value, tone: $('#bTone').value, pillars: $('#bPillars').value.split('\n').map((s) => s.trim()).filter(Boolean), ctaStyle: $('#bCta').value, avoid: $('#bAvoid').value.split('\n').map((s) => s.trim()).filter(Boolean) }; try { await api('/api/data?key=brandkit', { method: 'PUT', body: { value: S.brand } }); toast('Kit de marca guardado'); renderUser(); } catch (e) { toast(e.message); } });

boot().catch((e) => { showLogin(); $('#loginErr').textContent = e.message; });
