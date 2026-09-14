/* CODA Dashboard — Insights & estrategia: página dedicada dentro del Dashboard.
   Qué funcionó, por qué, ángulos ganadores, hooks, frases con retención, recomendaciones y la estrategia del mes. */
'use strict';
(() => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mName = (ym) => { const [y, m] = ym.split('-'); return `${MESES[+m - 1][0].toUpperCase()}${MESES[+m - 1].slice(1)} ${y}`; };
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const I = (S.ins = S.ins || { month: null, data: null, loading: false });

  window.dashTab = function (t) {
    $$('#dashTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    $('#dashBody').hidden = t !== 'resumen'; $('#insightsBody').hidden = t !== 'insights';
    safeLS('dc-dashtab', t);
    if (t === 'insights') initInsights();
  };
  // Restore the tab when the dashboard is (re)rendered.
  window.onReelsLoaded = ((prev) => function () { prev?.(); if (safeLS('dc-dashtab') === 'insights') dashTab('insights'); })(window.onReelsLoaded);

  window.initInsights = async function () {
    if (!I.month) { const d = new Date(); I.month = d.getDate() < 8 ? ym(new Date(d.getFullYear(), d.getMonth() - 1, 1)) : ym(d); }
    await loadInsights();
  };
  async function loadInsights() {
    const el = $('#insightsBody'); if (!el) return;
    if (!I.data) el.innerHTML = spinner('Cargando insights…');
    try { I.data = await api('/api/insights?month=' + I.month); } catch (e) { el.innerHTML = empty('No se pudo cargar', esc(e.message)); return; }
    render();
  }
  window.insMonth = function (v) { I.month = v; I.data = null; loadInsights(); };
  window.runInsights = async function () {
    if (I.loading) return; I.loading = true; render();
    try { const r = await api('/api/insights', { method: 'POST', body: { month: I.month }, timeoutMs: 600000 }); I.data = { ...(I.data || {}), stored: r }; toast('Insights generados ✓'); }
    catch (e) { toast(e.message, 6000); }
    I.loading = false; render();
  };

  const months = () => { const d = new Date(); const o = []; for (let i = 0; i < 12; i++) o.push(ym(new Date(d.getFullYear(), d.getMonth() - i, 1))); return o; };
  const sec = (title, sub, body, extra = '') => `<div class="card ins-sec ${extra}"><div class="eyebrow">${title}</div>${sub ? `<h2 style="margin-top:4px">${sub}</h2>` : ''}${body}</div>`;
  const li = (arr, f) => (arr || []).map(f).join('');

  function render() {
    const el = $('#insightsBody'); if (!el) return;
    const d = I.data || {}; const s = d.stored; const st = d.stats || {};
    const canAI = S.me?.config?.hasAnthropic;
    const btn = `<button class="btn ${s ? '' : 'primary'}" id="insBtn" onclick="runInsights()" ${!canAI ? 'disabled title="Falta ANTHROPIC_API_KEY"' : ''} ${I.loading ? 'disabled' : ''}>${I.loading ? '<span class="spin"></span> Transcribiendo y analizando (2–4 min)…' : '✦ ' + (s ? 'Volver a generar' : 'Generar insights y estrategia')}</button>`;
    const head = `<div class="ins-head"><div><div class="eyebrow">Insights &amp; estrategia</div><h2 style="margin-top:4px">${s ? esc(s.analysis?.headline || 'Lectura del período') : 'Qué funcionó, por qué y qué hacer el mes que viene'}</h2><p class="sub" style="font-size:13px;margin-top:4px">${s ? `Generado ${new Date(s.generatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · período ${esc(s.period)}${s.widened ? ' (ampliado porque el mes tenía pocos reels)' : ''} · ${s.stats.transcripts} transcripciones usadas` : 'La IA lee las métricas y transcripciones de tus reels del mes, explica qué funcionó y por qué, saca los ángulos, hooks y frases que mejor retienen, y arma la estrategia del mes siguiente.'}</p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select id="insMonth" onchange="insMonth(this.value)">${months().map((o) => `<option value="${o}" ${o === I.month ? 'selected' : ''}>${mName(o)}</option>`).join('')}</select>${btn}</div></div>`;
    const kp = [['Reels', st.count ?? '—'], ['Vistas', fmt(st.views)], ['ER medio', st.er != null ? st.er + '%' : '—'], ['Retención media', st.retention != null ? st.retention + '%' : `n/d`], ['Guardados', fmt(st.saves)], ['Compartidos', fmt(st.shares)], ['Pautados', st.promoted ?? 0]];
    const kpis = `<div class="grid kpis ins-kpis">${kp.map(([l, v]) => `<div class="card kpi"><div class="eyebrow">${l}</div><div class="num" style="font-size:22px">${v}</div></div>`).join('')}</div>${st.widened ? `<p class="small" style="margin:6px 0 0">${esc(mName(I.month))} tiene menos de 3 reels: los números y el análisis usan ${esc(st.period)}.</p>` : ''}`;
    if (!s) {
      el.innerHTML = head + kpis + `<div class="card" style="margin-top:14px">${empty('Todavía no hay insights para ' + mName(I.month), (st.count || 0) >= 3 || (st.total || 0) >= 3 ? 'Tocá “Generar insights y estrategia”. Tarda 2–4 minutos porque transcribe los reels que faltan y hace dos pasadas de análisis.' : 'Sincronizá al menos 3 reels primero.', canAI ? '' : '<span class="pill warn">Falta ANTHROPIC_API_KEY</span>')}</div>`;
      return;
    }
    const a = s.analysis || {}, g = s.strategy || {};
    const reelLink = (title) => { const r = (s.reels || []).find((x) => x.title === title); return r ? ` <a class="small" href="${esc(r.permalink)}" target="_blank" rel="noopener">↗</a>` : ''; };
    const html = head + kpis + `
    <div class="ins-grid" style="margin-top:14px">
      ${sec('¿Qué funcionó?', 'Los reels que movieron la aguja', `<div class="ins-list">${li(a.worked, (w) => `<div class="ins-item"><b>${esc(w.title)}${reelLink(w.title)}</b><span class="pill good">${esc(w.metric || '')}</span><p>${esc(w.reason || '')}</p></div>`)}</div>`)}
      ${sec('¿Por qué funcionó?', 'El patrón de fondo', `<p class="ins-p">${esc(a.why || '')}</p>${a.stop?.length ? `<div class="eyebrow" style="margin-top:12px">Conviene dejar de hacer</div><ul class="ins-ul">${li(a.stop, (x) => `<li>${esc(x)}</li>`)}</ul>` : ''}`)}
      ${sec('Ángulos ganadores', 'Desde dónde contar las cosas', `<div class="ins-list">${li(a.angles, (x) => `<div class="ins-item"><b>${esc(x.angle)}</b><p><span class="small">Evidencia:</span> ${esc(x.evidence || '')}</p><p><span class="small">Cómo usarlo:</span> ${esc(x.howToUse || '')}</p></div>`)}</div>`)}
      ${sec('Hooks funcionales', 'Los primeros 3 segundos que retienen', `<div class="ins-list">${li(a.hooks, (h) => `<div class="ins-item"><div class="ins-quote">“${esc(h.hook)}”<button class="btn sm ghost" onclick="copyText(${JSON.stringify(h.hook || '')})">⧉</button></div><span class="small">${esc(h.reel || '')}${reelLink(h.reel)}</span><p>${esc(h.why || '')}</p>${h.formula ? `<code class="ins-code">${esc(h.formula)}</code>` : ''}</div>`)}</div>`)}
      ${sec('Frases con mejor retención', 'Lo que sostiene la atención y dispara guardados', `<div class="ins-list">${li(a.phrases, (p) => `<div class="ins-item"><div class="ins-quote">“${esc(p.phrase)}”<button class="btn sm ghost" onclick="copyText(${JSON.stringify(p.phrase || '')})">⧉</button></div><span class="small">${esc(p.reel || '')}${reelLink(p.reel)}</span><p>${esc(p.why || '')}</p></div>`)}</div>`)}
      ${sec('Recomendaciones', 'Qué ajustar ya', `<div class="ins-list">${li(a.recommendations, (r, i) => `<div class="ins-item"><b><span class="ins-n">${i + 1}</span>${esc(r.title)}</b><p>${esc(r.detail || '')}</p></div>`)}</div>`)}
    </div>
    <div class="card ins-strat" style="margin-top:18px">
      <div class="ins-head" style="margin-bottom:6px"><div><div class="eyebrow">Estrategia del mes · ${esc(mName(s.nextMonth || I.month))}</div><h2 style="margin-top:4px">${esc(g.objective || 'Plan del mes')}</h2><p class="ins-p" style="margin-top:6px">${esc(g.thesis || '')}</p></div><button class="btn sm ghost" onclick="copyText(${JSON.stringify(strategyText(s))})">⧉ Copiar estrategia</button></div>
      <div class="ins-grid">
        ${sec('Pilares y peso', '', `<div class="ins-list">${li(g.pillars, (p) => `<div class="ins-item"><b>${esc(p.name)} <span class="pill">${esc(p.share || '')}</span></b><p>${esc(p.why || '')}</p>${p.angles?.length ? `<div class="patterns" style="margin:6px 0 0">${li(p.angles, (x) => `<span class="pill good">${esc(x)}</span>`)}</div>` : ''}</div>`)}</div>`, 'sub')}
        ${sec('Cadencia y formatos', '', `<p class="ins-p">${esc(g.cadence || '')}</p><div class="ins-list" style="margin-top:8px">${li(g.formats, (f) => `<div class="ins-item"><b>${esc(f.format)}</b><p>${esc(f.when || '')} <span class="small">→ ${esc(f.target || '')}</span></p></div>`)}</div>`, 'sub')}
        ${sec('KPIs del mes', '', `<div class="ins-list">${li(g.kpis, (k) => `<div class="ins-item"><b>${esc(k.name)} <span class="pill good">${esc(k.target || '')}</span></b><p>${esc(k.why || '')}</p></div>`)}</div>${g.paid ? `<div class="eyebrow" style="margin-top:12px">Pauta</div><p class="ins-p">${esc(g.paid)}</p>` : ''}`, 'sub')}
        ${sec('Hooks a repetir · qué evitar', '', `<ul class="ins-ul">${li(g.hooksToRepeat, (x) => `<li>${esc(x)}</li>`)}</ul>${g.avoid?.length ? `<div class="eyebrow" style="margin-top:12px">Evitar</div><ul class="ins-ul bad">${li(g.avoid, (x) => `<li>${esc(x)}</li>`)}</ul>` : ''}`, 'sub')}
      </div>
      <div class="eyebrow" style="margin-top:16px">Calendario de ideas · semana a semana</div>
      <div class="ins-weeks">${li(g.weeks, (w) => `<div class="ins-week"><div class="wk">Semana ${w.week}</div><b>${esc(w.focus || '')}</b>${li(w.ideas, (id) => `<div class="idea"><b>${esc(id.title)}</b><div class="ins-quote">“${esc(id.hook || '')}”<button class="btn sm ghost" onclick="copyText(${JSON.stringify(id.hook || '')})">⧉</button></div><div class="patterns" style="margin:4px 0 0">${id.angle ? `<span class="pill">${esc(id.angle)}</span>` : ''}${id.format ? `<span class="pill">${esc(id.format)}</span>` : ''}${id.cta ? `<span class="pill good">CTA: ${esc(id.cta)}</span>` : ''}</div></div>`)}</div>`)}</div>
    </div>`;
    el.innerHTML = html;
  }

  function strategyText(s) {
    const g = s.strategy || {};
    return [`ESTRATEGIA ${mName(s.nextMonth || s.month)} — basada en ${s.period}`, `Objetivo: ${g.objective || ''}`, g.thesis || '', '', 'PILARES', ...(g.pillars || []).map((p) => `- ${p.name} (${p.share}): ${p.why}`), '', `CADENCIA: ${g.cadence || ''}`, '', 'KPIs', ...(g.kpis || []).map((k) => `- ${k.name}: ${k.target}`), '', 'SEMANAS', ...(g.weeks || []).flatMap((w) => [`Semana ${w.week} — ${w.focus}`, ...(w.ideas || []).map((i) => `  • ${i.title} | Hook: "${i.hook}" | ${i.format || ''} | CTA: ${i.cta || ''}`)]), '', 'HOOKS A REPETIR', ...(g.hooksToRepeat || []).map((x) => `- ${x}`), '', 'EVITAR', ...(g.avoid || []).map((x) => `- ${x}`), g.paid ? `\nPAUTA: ${g.paid}` : ''].join('\n');
  }
})();
