/* CODA Dashboard — Reporte mensual para el cliente: genera la narrativa con IA y abre una página imprimible (PDF) */
'use strict';
(() => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mName = (ym) => { const [y, m] = ym.split('-'); return `${MESES[+m - 1][0].toUpperCase()}${MESES[+m - 1].slice(1)} ${y}`; };
  const n = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es'));
  const money = (v) => '₡' + Math.round(v || 0).toLocaleString('es');
  const delta = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs mes anterior` : 'sin mes anterior');
  const dcls = (a, b) => (!b ? 'flat' : a >= b ? 'up' : 'down');
  const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.openReportDialog = function () {
    const d = new Date(); const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const opts = []; for (let i = 0; i < 12; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); opts.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
    const def = d.getDate() < 8 ? opts[1] : cur;
    openModal(`<h3>Exportar reporte mensual</h3><p class="sub" style="font-size:13px">Genera un reporte listo para entregar al cliente: números del mes vs. el anterior, top reels, retención, pautado vs. orgánico, ventas (si las registraste) y un resumen ejecutivo con logros, aprendizajes y plan del próximo mes escrito por la IA. Se abre como página para guardar en PDF.</p>
    <div class="formgrid" style="margin-top:12px"><label>Mes<select id="rpMonth">${opts.map((o) => `<option value="${o}" ${o === def ? 'selected' : ''}>${mName(o)}</option>`).join('')}</select></label><label>Preparado por<input id="rpBy" value="${esc(S.me.role === 'owner' ? 'Daniel Sánchez · CODA' : 'CODA Dashboard')}"></label><label style="grid-column:1/-1">Nota para el cliente (opcional)<input id="rpNote" placeholder="Ej. Este mes probamos formato lista; en octubre empezamos con pauta."></label></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" onclick="exportReport(false)">Abrir sin IA (solo datos)</button><button class="btn primary" id="rpGo" onclick="exportReport(true)" ${S.me.config.hasAnthropic ? '' : 'disabled title="Falta ANTHROPIC_API_KEY"'}>✦ Generar con resumen IA</button></div>`);
  };

  window.exportReport = async function (withAI) {
    const month = $('#rpMonth').value, by = $('#rpBy').value.trim(), note = $('#rpNote').value.trim();
    const b = $('#rpGo'); if (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span> Generando (30–60 s)…'; }
    // Open the tab now (user gesture) so the browser does not block the popup.
    const win = window.open('', '_blank'); if (win) win.document.write('<title>Generando reporte…</title><p style="font-family:sans-serif;padding:40px">Generando el reporte, un momento…</p>');
    try {
      let res = await api('/api/report?month=' + month);
      if (withAI && !res.narrative) res = await api('/api/report', { method: 'POST', body: { month }, timeoutMs: 300000 });
      else if (withAI && res.narrative && !confirm('Ya hay un resumen IA para este mes. ¿Usarlo (Aceptar) o generar uno nuevo (Cancelar)?')) res = await api('/api/report', { method: 'POST', body: { month }, timeoutMs: 300000 });
      const html = renderReport(res.data, withAI ? res.narrative : null, { by, note });
      if (win) { win.document.open(); win.document.write(html); win.document.close(); } else download(`reporte-${month}.html`, html, 'text/html');
      closeModal(); toast('Reporte listo · en la pestaña nueva, Imprimir → Guardar como PDF');
    } catch (e) { toast(e.message, 6000); if (win) win.close(); if (b) { b.disabled = false; b.innerHTML = '✦ Generar con resumen IA'; } }
  };

  function renderReport(d, nar, { by, note }) {
    const c = d.current, p = d.previous, a = d.account;
    const kpi = (l, v, sub, cls = '') => `<div class="k"><div class="l">${l}</div><div class="v">${v}</div><div class="s ${cls}">${sub}</div></div>`;
    const maxV = Math.max(1, ...d.reels.map((r) => r.views || 0));
    const list = (arr) => (arr || []).map((x) => `<li>${E(x)}</li>`).join('');
    const logo = `${location.origin}/coda-logo.png`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${mName(d.month)} · ${E(a.handle || a.name)}</title>
<style>
:root{--ink:#14121d;--muted:#6b6880;--line:#e7e5f0;--accent:#7c3aed;--accent2:#ff4d8d;--good:#16a34a;--bad:#dc2626;--bg:#faf9fd}
*{box-sizing:border-box}body{margin:0;font-family:"DM Sans",-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);font-size:13px;line-height:1.5}
.page{max-width:900px;margin:0 auto;padding:36px 40px}
.top{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:2px solid var(--accent);padding-bottom:16px;margin-bottom:22px}
.top img{width:56px;height:56px;border-radius:14px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 10px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}
.sub{color:var(--muted);margin:0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.k{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff}.k .l{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.k .v{font-size:24px;font-weight:700;margin:2px 0}.k .s{font-size:11px;color:var(--muted)}.k .s.up{color:var(--good)}.k .s.down{color:var(--bad)}
.head{background:linear-gradient(135deg,#f3eefe,#fff0f6);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:14px}
.head .hl{font-size:18px;font-weight:700;margin:0 0 6px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:#f6f4fb}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:6px;background:#eee9f8;border-radius:3px;overflow:hidden;margin-top:3px}.bar i{display:block;height:100%;background:var(--accent)}
.tag{display:inline-block;font-size:10px;padding:1px 7px;border-radius:99px;background:#eee9f8;color:var(--accent)}.tag.p{background:#fff3d6;color:#9a6700}.tag.o{background:#e6f7ec;color:#15803d}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.box{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}.box h3{margin:0 0 8px;font-size:13px}
ul{margin:0;padding-left:18px}li{margin:4px 0}
.foot{margin-top:30px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;display:flex;justify-content:space-between}
.print{position:fixed;top:14px;right:14px;background:var(--accent);color:#fff;border:0;padding:10px 16px;border-radius:10px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(124,58,237,.35)}
@media print{.print{display:none}body{background:#fff}.page{padding:0}h2{break-after:avoid}table,.box,.k{break-inside:avoid}}
</style></head><body><button class="print" onclick="window.print()">Imprimir / Guardar PDF</button><div class="page">
<div class="top"><div><h1>Reporte de contenido · ${mName(d.month)}</h1><p class="sub">${E(a.name)} ${a.handle ? '· ' + E(a.handle) : ''} · Instagram · ${a.followers != null ? n(a.followers) + ' seguidores' : ''}</p></div><img src="${logo}" alt="CODA"></div>
${nar ? `<div class="head"><p class="hl">${E(nar.headline || '')}</p><p style="margin:0">${E(nar.summary || '')}</p></div>` : ''}
${note ? `<p style="background:#fff;border:1px solid var(--line);border-left:4px solid var(--accent2);padding:10px 14px;border-radius:10px"><b>Nota:</b> ${E(note)}</p>` : ''}
<h2>Números del mes</h2>
<div class="kpis">
${kpi('Reels publicados', c.count, p.count ? `mes anterior: ${p.count}` : 'sin mes anterior')}
${kpi('Vistas', n(c.views), delta(c.views, p.views), dcls(c.views, p.views))}
${kpi('Alcance', n(c.reach), delta(c.reach, p.reach), dcls(c.reach, p.reach))}
${kpi('Engagement', c.er + '%', p.er ? `mes anterior: ${p.er}%` : 'sin mes anterior', dcls(c.er, p.er))}
${kpi('Guardados', n(c.saves), delta(c.saves, p.saves), dcls(c.saves, p.saves))}
${kpi('Compartidos', n(c.shares), delta(c.shares, p.shares), dcls(c.shares, p.shares))}
${kpi('Retención media', c.retention != null ? c.retention + '%' : '—', c.avgWatch ? `${c.avgWatch.toFixed(1)} s vistos por reel en promedio` : 'sin dato de la API')}
${kpi('Seguidores', n(a.followers), a.followersDelta != null ? `${a.followersDelta >= 0 ? '+' : ''}${n(a.followersDelta)} en el mes` : 'histórico desde este mes', a.followersDelta > 0 ? 'up' : a.followersDelta < 0 ? 'down' : '')}
</div>
<p class="sub" style="margin-top:8px">${c.promoted ? `${c.promoted} de ${c.count} reels tuvieron promoción pagada (las vistas incluyen anuncios); el resto es 100 % orgánico.` : 'Todo el contenido del mes fue 100 % orgánico.'}${d.bestDow ? ` Mejor día para publicar: <b>${d.bestDow.day}</b> (${n(d.bestDow.avgViews)} vistas promedio).` : ''} Mediana histórica de la cuenta: ${n(a.median)} vistas por reel.</p>
<h2>Reels del mes</h2>
${d.reels.length ? `<table><thead><tr><th>#</th><th>Reel</th><th>Fecha</th><th class="n">Vistas</th><th class="n">vs mediana</th><th class="n">ER</th><th class="n">Guard.</th><th class="n">Comp.</th><th class="n">Retención</th><th>Tipo</th></tr></thead><tbody>${d.reels.map((r, i) => `<tr><td>${i + 1}</td><td><b>${E(r.title)}</b><div class="bar"><i style="width:${((r.views || 0) / maxV * 100).toFixed(1)}%"></i></div></td><td>${r.date ? r.date.slice(8, 10) + '/' + r.date.slice(5, 7) : ''}</td><td class="n">${n(r.views)}</td><td class="n">${r.x != null ? r.x + '×' : '—'}</td><td class="n">${r.er}%</td><td class="n">${n(r.saves)}</td><td class="n">${n(r.shares)}</td><td class="n">${r.retention != null ? r.retention + '%' : '—'}</td><td>${r.promoted ? '<span class="tag p">Pautado</span>' : '<span class="tag o">Orgánico</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No hay reels publicados en este mes.</p>'}
${d.top5 ? `<h2>Qué está funcionando (análisis IA de los mejores videos)</h2><div class="box"><p style="margin:0 0 8px">${E(d.top5.summary || '')}</p>${(d.top5.patterns || []).length ? `<ul>${list(d.top5.patterns)}</ul>` : ''}</div>
<div class="cols" style="margin-top:10px">${d.top5.items.slice(0, 4).map((it, i) => `<div class="box"><h3>${i + 1}. ${E(it.title)} <span class="tag">${n(it.views)} vistas · ${it.x}×</span></h3><p style="margin:0 0 6px"><b>Por qué funciona:</b> ${E(it.why || '')}</p><p style="margin:0"><b>Cómo repetirlo:</b> ${E(it.replicate || '')}</p></div>`).join('')}</div>` : ''}
${d.sales ? `<h2>Ventas atribuidas</h2><div class="kpis">${kpi('Ventas', d.sales.count, `${d.sales.units} unidades`)}${kpi('Ingresos', money(d.sales.revenue), '')}${kpi('Por anuncios', money(d.sales.byAd), d.sales.revenue ? Math.round(d.sales.byAd / d.sales.revenue * 100) + '% de los ingresos' : '')}${kpi('Orgánico', money(d.sales.organic), d.sales.revenue ? Math.round(d.sales.organic / d.sales.revenue * 100) + '% de los ingresos' : '')}</div>
<div class="cols" style="margin-top:10px"><div class="box"><h3>Productos más vendidos</h3><ul>${d.sales.topProducts.map((t) => `<li>${E(t.name)} — ${t.qty} u. · ${money(t.revenue)}</li>`).join('')}</ul></div><div class="box"><h3>Anuncios que más vendieron</h3>${d.sales.topAds.length ? `<ul>${d.sales.topAds.map((t) => `<li>${E(t.name)} — ${t.n} ventas · ${money(t.revenue)}</li>`).join('')}</ul>` : '<p class="sub" style="margin:0">Sin ventas atribuidas a anuncios este mes.</p>'}</div></div>` : ''}
${nar ? `<h2>Lectura del mes</h2><div class="cols"><div class="box"><h3>✅ Logros</h3><ul>${list(nar.wins)}</ul></div><div class="box"><h3>💡 Aprendizajes</h3><ul>${list(nar.learnings)}</ul></div><div class="box"><h3>🔧 Oportunidades de mejora</h3><ul>${list(nar.improve)}</ul></div><div class="box"><h3>🚀 Plan para el próximo mes</h3><ul>${list(nar.next)}</ul></div></div><p style="margin-top:14px;font-style:italic">${E(nar.closing || '')}</p>` : ''}
<div class="foot"><span>Preparado por ${E(by || 'CODA Dashboard')} · ${new Date().toLocaleDateString('es', { dateStyle: 'long' })}</span><span>Fuente: API oficial de Meta (Instagram Insights) + contadores públicos · CODA Dashboard</span></div>
</div></body></html>`;
  }
})();
