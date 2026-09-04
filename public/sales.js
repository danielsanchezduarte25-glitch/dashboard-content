/* Dashboard Content — Ventas: productos con stock, registro de ventas y atribución (anuncio / orgánico) */
'use strict';
(() => {
  const V = { products: null, sales: null, ads: null, range: 30 };
  const money = (n) => '₡' + Math.round(n || 0).toLocaleString('es');
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const SOURCES = { ad: 'Anuncio', organic: 'Orgánico', referral: 'Referido', other: 'Otro' };
  const pf = (p, o) => `<option value="${p.id}" ${o === p.id ? 'selected' : ''}>${esc(p.name)}${p.price ? ` · ${money(p.price)}` : ''}</option>`;

  async function load(key) { try { return (await api('/api/data?key=' + key)).value || []; } catch (e) { toast(e.message); return []; } }
  async function save(key, value) { try { await api('/api/data?key=' + key, { method: 'PUT', body: { value } }); } catch (e) { toast('No se guardó: ' + e.message, 4000); } }

  window.initSales = async function () {
    if (!V.products) [V.products, V.sales, V.ads] = await Promise.all([load('products'), load('sales'), load('ads')]);
    render();
  };
  $('#salesRange')?.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; $$('#salesRange .tab').forEach((t) => t.classList.toggle('active', t === b)); V.range = b.dataset.r === 'all' ? null : +b.dataset.r; render(); });

  // Ads = manual ads + reels detected as promoted (auto)
  function allAds() {
    const promoted = (S.reels?.reels || []).filter((r) => r.promoted).map((r) => ({ id: 'reel-' + r.id, name: r.title.slice(0, 60), auto: true, permalink: r.permalink }));
    return [...V.ads, ...promoted.filter((p) => !V.ads.some((a) => a.id === p.id))];
  }
  const adName = (id) => allAds().find((a) => a.id === id)?.name || '(anuncio borrado)';
  const inRange = (s) => !V.range || new Date(s.date).getTime() >= Date.now() - V.range * 86400000;

  function render() {
    const sales = V.sales.filter(inRange).sort((a, b) => b.date.localeCompare(a.date));
    const revenue = sales.reduce((a, s) => a + s.total, 0), units = sales.reduce((a, s) => a + s.qty, 0);
    const bySrc = {}; for (const s of sales) { const k = s.source === 'ad' ? 'ad' : s.source === 'organic' ? 'organic' : 'other'; bySrc[k] = bySrc[k] || { n: 0, rev: 0 }; bySrc[k].n++; bySrc[k].rev += s.total; }
    const adShare = revenue ? Math.round((bySrc.ad?.rev || 0) / revenue * 100) : 0;
    const low = V.products.filter((p) => p.stock != null && p.stock <= (p.minStock ?? 3)).length;
    const cost = sales.reduce((a, s) => a + (s.cost || 0) * s.qty, 0);
    const spend = allAds().reduce((a, ad) => a + (ad.spend || 0), 0);
    $('#salesKpis').innerHTML = [
      { l: 'Ingresos', v: money(revenue), d: `${sales.length} ventas · ${units} unidades` },
      { l: 'Por anuncios', v: money(bySrc.ad?.rev || 0), d: `${adShare}% de los ingresos · ${bySrc.ad?.n || 0} ventas` },
      { l: 'Orgánico', v: money(bySrc.organic?.rev || 0), d: `${revenue ? Math.round((bySrc.organic?.rev || 0) / revenue * 100) : 0}% · ${bySrc.organic?.n || 0} ventas` },
      { l: 'Margen estimado', v: cost || spend ? money(revenue - cost - spend) : '—', d: cost || spend ? `costo ${money(cost)} · pauta ${money(spend)}` : 'Cargá costo por producto y gasto por anuncio' },
      { l: 'Stock bajo', v: low, d: low ? 'productos por reponer' : 'todo en orden', warn: low > 0 },
    ].map((k) => `<div class="card kpi"><div class="eyebrow">${k.l}</div><div class="num" style="${k.warn ? 'color:#ffa6a6' : ''}">${k.v}</div><div class="delta"><span class="vs">${k.d}</span></div></div>`).join('');

    // daily bars (last N days or all)
    const days = V.range || Math.max(14, Math.ceil((Date.now() - Math.min(...V.sales.map((s) => new Date(s.date).getTime()), Date.now())) / 86400000) + 1);
    const nd = Math.min(days, 90); const byDay = {};
    for (let i = nd - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); byDay[d.toISOString().slice(0, 10)] = { ad: 0, org: 0 }; }
    for (const s of V.sales) { const k = s.date.slice(0, 10); if (byDay[k]) { if (s.source === 'ad') byDay[k].ad += s.total; else byDay[k].org += s.total; } }
    const max = Math.max(1, ...Object.values(byDay).map((v) => v.ad + v.org));
    const keys = Object.keys(byDay); const every = nd > 31 ? 7 : nd > 14 ? 3 : 1;
    $('#salesChart').innerHTML = keys.map((k, i) => { const v = byDay[k]; return `<div class="b" title="${fdate(k)}: ${money(v.ad + v.org)} (anuncios ${money(v.ad)} · orgánico ${money(v.org)})"><div class="stack"><i style="height:${(v.ad / max * 100).toFixed(1)}%"></i><i class="org" style="height:${(v.org / max * 100).toFixed(1)}%"></i></div><span>${i % every === 0 ? k.slice(8, 10) + '/' + k.slice(5, 7) : ''}</span></div>`; }).join('');
    $('#salesChartNote').innerHTML = `<span class="legend-dot" style="background:var(--accent)"></span>Anuncios <span class="legend-dot" style="background:var(--good);margin-left:10px"></span>Orgánico y otros`;

    // sources: by ad + organic + other
    const byAd = {}; for (const s of sales) if (s.source === 'ad') { byAd[s.adId] = byAd[s.adId] || { n: 0, rev: 0 }; byAd[s.adId].n++; byAd[s.adId].rev += s.total; }
    const rows = [...Object.entries(byAd).map(([id, v]) => ({ lbl: '📣 ' + adName(id), cls: '', ...v })), { lbl: '🌱 Orgánico', cls: 'org', n: bySrc.organic?.n || 0, rev: bySrc.organic?.rev || 0 }, { lbl: 'Referidos / otros', cls: 'oth', n: bySrc.other?.n || 0, rev: bySrc.other?.rev || 0 }].sort((a, b) => b.rev - a.rev);
    $('#salesSources').innerHTML = sales.length ? rows.map((r) => `<div class="srcrow"><span class="lbl" title="${esc(r.lbl)}">${esc(r.lbl)}</span><div class="trk"><i class="${r.cls}" style="width:${revenue ? (r.rev / revenue * 100).toFixed(1) : 0}%"></i></div><span class="num">${money(r.rev)} · ${r.n}</span></div>`).join('') : '<p class="sub">Registrá tu primera venta para ver de dónde vienen.</p>';

    // products
    const soldBy = {}; for (const s of sales) { soldBy[s.productId] = (soldBy[s.productId] || 0) + s.qty; }
    $('#salesProducts').innerHTML = V.products.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Stock</th><th class="num">Vendidos</th><th></th></tr></thead><tbody>${V.products.map((p) => { const st = p.stock == null ? '—' : p.stock; const cls = p.stock == null ? '' : p.stock <= 0 ? 'out' : p.stock <= (p.minStock ?? 3) ? 'low' : ''; return `<tr><td><b>${esc(p.name)}</b>${p.sku ? `<div class="small">${esc(p.sku)}</div>` : ''}</td><td class="num">${money(p.price)}</td><td class="num stock ${cls}">${st}${cls === 'out' ? ' · agotado' : cls === 'low' ? ' · bajo' : ''}</td><td class="num">${soldBy[p.id] || 0}</td><td style="white-space:nowrap"><button class="btn sm ghost" onclick="salesRestock('${p.id}')">+ stock</button> <button class="iconbtn" title="Editar" onclick="salesProductForm('${p.id}')"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/></svg></button><button class="iconbtn" title="Eliminar" onclick="salesDeleteProduct('${p.id}')">${svgI.trash}</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub">Agregá tus productos con precio y stock inicial.</p>';

    // ads
    const ads = allAds();
    $('#salesAds').innerHTML = ads.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Anuncio</th><th class="num">Ventas</th><th class="num">Ingresos</th><th class="num">Gasto</th><th></th></tr></thead><tbody>${ads.map((a) => { const v = byAd[a.id] || { n: 0, rev: 0 }; return `<tr><td><b>${esc(a.name)}</b>${a.auto ? ' <span class="pill" title="Detectado como reel pautado">auto</span>' : ''}${a.permalink ? ` <a href="${esc(a.permalink)}" target="_blank" rel="noopener" class="small">ver</a>` : ''}</td><td class="num">${v.n}</td><td class="num">${money(v.rev)}</td><td class="num">${a.spend ? money(a.spend) + (v.rev ? ` <span class="small">(${(v.rev / a.spend).toFixed(1)}×)</span>` : '') : '—'}</td><td style="white-space:nowrap"><button class="iconbtn" title="Editar" onclick="salesAdForm('${a.id}')"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/></svg></button>${a.auto ? '' : `<button class="iconbtn" title="Eliminar" onclick="salesDeleteAd('${a.id}')">${svgI.trash}</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub">Agregá tus anuncios (o se detectan solos los reels pautados) para atribuir ventas.</p>';

    // list
    $('#salesList').innerHTML = sales.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Cant.</th><th class="num">Total</th><th>Origen</th><th>Cliente / nota</th><th></th></tr></thead><tbody>${sales.slice(0, 200).map((s) => `<tr><td style="color:var(--muted);font-family:var(--mono);font-size:12px">${fdate(s.date)}</td><td>${esc(V.products.find((p) => p.id === s.productId)?.name || s.productName || '—')}</td><td class="num">${s.qty}</td><td class="num">${money(s.total)}</td><td>${s.source === 'ad' ? `<span class="pill warn">📣 ${esc(adName(s.adId))}</span>` : s.source === 'organic' ? '<span class="pill good">🌱 Orgánico</span>' : `<span class="pill">${SOURCES[s.source] || 'Otro'}</span>`}</td><td class="small">${esc(s.customer || '')}${s.note ? ` · ${esc(s.note)}` : ''}</td><td><button class="iconbtn" title="Eliminar (devuelve el stock)" onclick="salesDeleteSale('${s.id}')">${svgI.trash}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Todavía no hay ventas en este período.</p>';
  }

  // ---- forms -------------------------------------------------------------
  window.salesProductForm = function (id) {
    const p = V.products.find((x) => x.id === id) || { name: '', price: '', cost: '', stock: '', minStock: 3, sku: '' };
    openModal(`<h3>${id ? 'Editar producto' : 'Nuevo producto'}</h3><div class="formgrid" style="margin-top:12px"><label class="full" style="grid-column:1/-1">Nombre<input id="spName" value="${esc(p.name)}" placeholder="Ej. Curso de Reels, Suplemento X"></label><label>Precio de venta (₡)<input id="spPrice" type="number" min="0" value="${p.price}"></label><label>Costo unitario (₡, opcional)<input id="spCost" type="number" min="0" value="${p.cost ?? ''}"></label><label>Stock actual<input id="spStock" type="number" min="0" value="${p.stock ?? ''}" placeholder="vacío = sin control de stock"></label><label>Avisar cuando quede ≤<input id="spMin" type="number" min="0" value="${p.minStock ?? 3}"></label><label>SKU / código (opcional)<input id="spSku" value="${esc(p.sku || '')}"></label></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" onclick="salesSaveProduct('${id || ''}')">Guardar</button></div>`);
    setTimeout(() => $('#spName')?.focus(), 50);
  };
  window.salesSaveProduct = async function (id) {
    const name = $('#spName').value.trim(); if (!name) return toast('Ponele nombre al producto');
    const stockV = $('#spStock').value;
    const p = { id: id || uid('pr-'), name, price: +$('#spPrice').value || 0, cost: $('#spCost').value === '' ? null : +$('#spCost').value, stock: stockV === '' ? null : +stockV, minStock: +$('#spMin').value || 0, sku: $('#spSku').value.trim() };
    const i = V.products.findIndex((x) => x.id === p.id); if (i >= 0) V.products[i] = { ...V.products[i], ...p }; else V.products.push(p);
    closeModal(); render(); await save('products', V.products); toast('Producto guardado');
  };
  window.salesRestock = async function (id) {
    const p = V.products.find((x) => x.id === id); if (!p) return;
    const v = prompt(`¿Cuántas unidades de "${p.name}" entran?`, '10'); if (v == null) return;
    p.stock = (p.stock || 0) + (+v || 0); render(); await save('products', V.products);
  };
  window.salesDeleteProduct = async function (id) { if (!confirm('¿Eliminar el producto? Las ventas registradas se conservan.')) return; V.products = V.products.filter((x) => x.id !== id); render(); await save('products', V.products); };

  window.salesAdForm = function (id) {
    const a = allAds().find((x) => x.id === id) || { name: '', platform: 'Instagram', spend: '', link: '' };
    openModal(`<h3>${id ? 'Editar anuncio' : 'Nuevo anuncio'}</h3><p class="sub" style="font-size:13px">Cada anuncio o campaña que corrés. Los reels pautados se agregan solos; acá podés ponerles el gasto.</p><div class="formgrid" style="margin-top:12px"><label style="grid-column:1/-1">Nombre<input id="saName" value="${esc(a.name)}" placeholder="Ej. Reel Testimonio – Set 2026"></label><label>Plataforma<select id="saPlat">${['Instagram', 'Facebook', 'TikTok', 'Google', 'Otro'].map((x) => `<option ${a.platform === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Gasto total (₡, opcional)<input id="saSpend" type="number" min="0" value="${a.spend ?? ''}"></label><label style="grid-column:1/-1">Link (opcional)<input id="saLink" value="${esc(a.link || a.permalink || '')}"></label></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" onclick="salesSaveAd('${id || ''}')">Guardar</button></div>`);
    setTimeout(() => $('#saName')?.focus(), 50);
  };
  window.salesSaveAd = async function (id) {
    const name = $('#saName').value.trim(); if (!name) return toast('Ponele nombre al anuncio');
    const auto = allAds().find((x) => x.id === id && x.auto);
    const a = { id: id || uid('ad-'), name, platform: $('#saPlat').value, spend: $('#saSpend').value === '' ? null : +$('#saSpend').value, link: $('#saLink').value.trim(), permalink: auto?.permalink, auto: !!auto };
    const i = V.ads.findIndex((x) => x.id === a.id); if (i >= 0) V.ads[i] = { ...V.ads[i], ...a }; else V.ads.push(a);
    closeModal(); render(); await save('ads', V.ads); toast('Anuncio guardado');
  };
  window.salesDeleteAd = async function (id) { if (!confirm('¿Eliminar el anuncio? Las ventas atribuidas quedan como "anuncio borrado".')) return; V.ads = V.ads.filter((x) => x.id !== id); render(); await save('ads', V.ads); };

  window.salesSaleForm = function () {
    if (!V.products.length) { toast('Primero agregá un producto'); return salesProductForm(); }
    const ads = allAds(); const p0 = V.products[0];
    openModal(`<h3>Registrar venta</h3><div class="formgrid" style="margin-top:12px">
      <label style="grid-column:1/-1">Producto<select id="ssProd" onchange="salesSyncPrice()">${V.products.map((p) => pf(p)).join('')}</select></label>
      <label>Cantidad<input id="ssQty" type="number" min="1" value="1" oninput="salesSyncPrice(true)"></label>
      <label>Total cobrado (₡)<input id="ssTotal" type="number" min="0" value="${p0.price || ''}"></label>
      <label>Fecha<input id="ssDate" type="date" value="${today()}"></label>
      <label>¿De dónde vino?<select id="ssSrc" onchange="document.getElementById('ssAdWrap').hidden=this.value!=='ad'"><option value="ad">📣 Vino por un anuncio</option><option value="organic">🌱 Orgánico (contenido / perfil)</option><option value="referral">Referido / recomendación</option><option value="other">Otro</option></select></label>
      <label id="ssAdWrap" style="grid-column:1/-1">¿Cuál anuncio?<select id="ssAd">${ads.length ? ads.map((a) => `<option value="${a.id}">${esc(a.name)}${a.auto ? ' (reel pautado)' : ''}</option>`).join('') : '<option value="">(no hay anuncios cargados — agregalo con el botón "Anuncio")</option>'}</select></label>
      <label>Cliente (opcional)<input id="ssCust" placeholder="Nombre o @usuario"></label>
      <label>Nota (opcional)<input id="ssNote" placeholder="Ej. pagó por SINPE"></label>
    </div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" onclick="salesSaveSale()">Guardar venta</button></div>`);
  };
  window.salesSyncPrice = function (qtyOnly) {
    const p = V.products.find((x) => x.id === $('#ssProd').value); const q = Math.max(1, +$('#ssQty').value || 1);
    if (p) $('#ssTotal').value = (p.price || 0) * q;
  };
  window.salesSaveSale = async function () {
    const p = V.products.find((x) => x.id === $('#ssProd').value); if (!p) return;
    const qty = Math.max(1, +$('#ssQty').value || 1); const src = $('#ssSrc').value;
    if (src === 'ad' && !$('#ssAd').value) return toast('Elegí el anuncio o cambiá el origen');
    const s = { id: uid('s-'), date: $('#ssDate').value || today(), productId: p.id, productName: p.name, qty, total: +$('#ssTotal').value || 0, cost: p.cost ?? 0, source: src, adId: src === 'ad' ? $('#ssAd').value : null, customer: $('#ssCust').value.trim(), note: $('#ssNote').value.trim(), created: new Date().toISOString() };
    V.sales.push(s);
    if (p.stock != null) p.stock = Math.max(0, p.stock - qty);
    closeModal(); render();
    await Promise.all([save('sales', V.sales), save('products', V.products)]);
    toast(p.stock != null && p.stock <= (p.minStock ?? 3) ? `Venta registrada · ¡quedan ${p.stock} de ${p.name}!` : 'Venta registrada');
  };
  window.salesDeleteSale = async function (id) {
    const s = V.sales.find((x) => x.id === id); if (!s || !confirm('¿Eliminar esta venta? El stock se devuelve.')) return;
    V.sales = V.sales.filter((x) => x.id !== id);
    const p = V.products.find((x) => x.id === s.productId); if (p && p.stock != null) p.stock += s.qty;
    render(); await Promise.all([save('sales', V.sales), save('products', V.products)]);
  };
  window.salesExport = function () {
    const rows = [['fecha', 'producto', 'cantidad', 'total', 'origen', 'anuncio', 'cliente', 'nota'], ...V.sales.map((s) => [s.date, s.productName, s.qty, s.total, SOURCES[s.source] || s.source, s.source === 'ad' ? adName(s.adId) : '', s.customer || '', s.note || ''])];
    download('ventas.csv', rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
})();
