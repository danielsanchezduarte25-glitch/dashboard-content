/* CODA Dashboard — Workspaces: un espacio por cliente con su propia contraseña y datos */
'use strict';
(() => {
  const COLORS = ['#ff4d8d', '#8b5cf6', '#3ecf8e', '#f5b84d', '#6aa4ff', '#ff8c5a', '#22c3c3'];
  const colorFor = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const initials = (n) => String(n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  // Sidebar box: owner gets a switcher, clients see their workspace name.
  window.renderWorkspaceBox = function () {
    const box = $('#wsBox'); const me = S.me; if (!box || !me) return;
    const cur = me.workspace || { id: 'main', name: 'Mi cuenta' };
    box.hidden = false;
    if (me.role === 'owner') {
      $('#navWorkspaces').hidden = false;
      const list = me.workspaces || [{ id: 'main', name: 'Mi cuenta' }];
      box.innerHTML = `<span class="dot" style="background:${cur.id === 'main' ? 'var(--accent)' : colorFor(cur.id)}"></span><select id="wsSelect" title="Cambiar de workspace">${list.map((w) => `<option value="${w.id}" ${w.id === cur.id ? 'selected' : ''}>${esc(w.name)}${w.handle ? ' · @' + esc(w.handle) : ''}</option>`).join('')}</select>`;
      $('#wsSelect').onchange = (e) => switchWorkspace(e.target.value);
    } else {
      $('#navWorkspaces').hidden = true;
      box.innerHTML = `<span class="dot" style="background:${colorFor(cur.id)}"></span><span class="lbl" title="Tu workspace">${esc(cur.name)}</span><span class="small">cliente</span>`;
    }
    if (me.role !== 'owner' && location.hash === '#workspaces') go('dashboard');
  };

  window.switchWorkspace = async function (id) {
    if (id === S.me.workspace?.id) return;
    try { await api('/api/workspaces', { method: 'POST', body: { action: 'switch', id } }); toast('Cambiando de workspace…'); safeLS('dc-view', 'dashboard'); location.href = '/'; }
    catch (e) { toast(e.message, 4000); renderWorkspaceBox(); }
  };

  window.initWorkspaces = async function () {
    if (S.me.role !== 'owner') return go('dashboard');
    try { S.wsList = (await api('/api/workspaces')).list || []; } catch (e) { toast(e.message); S.wsList = []; }
    renderList();
  };
  function renderList() {
    const cur = S.me.workspace?.id;
    const cards = [{ id: 'main', name: 'Mi cuenta', handle: S.me.profile?.username || '', own: true }, ...S.wsList].map((w) => `<div class="card wscard ${w.id === cur ? 'sel' : ''}" style="${w.id === cur ? 'border-color:var(--accent)' : ''}"><div class="hd"><div class="av" style="background:${w.own ? 'linear-gradient(135deg,#ff4d8d,#8b5cf6)' : colorFor(w.id)}">${initials(w.name)}</div><div style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</b><span class="small">${w.handle ? '@' + esc(w.handle) : w.own ? 'tu cuenta principal' : 'sin @ todavía'}</span></div>${w.id === cur ? '<span class="pill good" style="margin-left:auto">activo</span>' : ''}</div>
      ${w.own ? '<p class="small">Tus datos, tu Instagram y tu contraseña principal (APP_PASSWORD).</p>' : `<p class="small">Creado ${w.created ? fdate(w.created) : ''}. El cliente entra en <b>${location.host}</b> con su contraseña y solo ve este espacio.</p>`}
      <div class="acts">${w.id !== cur ? `<button class="btn sm primary" onclick="switchWorkspace('${w.id}')">Entrar</button>` : ''}${w.own ? '' : `<button class="btn sm" onclick="wsForm('${w.id}')">Editar</button><button class="btn sm ghost" onclick="wsAccess('${w.id}')">Datos de acceso</button><button class="iconbtn" title="Eliminar" onclick="wsDelete('${w.id}')">${svgI.trash}</button>`}</div></div>`).join('');
    $('#wsList').innerHTML = cards;
  }

  window.wsForm = function (id) {
    const w = (S.wsList || []).find((x) => x.id === id) || { name: '', handle: '' };
    openModal(`<h3>${id ? 'Editar cliente' : 'Nuevo cliente'}</h3><p class="sub" style="font-size:13px">${id ? 'Dejá la contraseña vacía para no cambiarla.' : 'Se crea un espacio vacío. Después, desde ese workspace, conectás el Instagram del cliente (él autoriza una sola vez) y la IA aprende su kit de marca.'}</p><div class="formgrid" style="margin-top:12px"><label style="grid-column:1/-1">Nombre del cliente o marca<input id="wsName" value="${esc(w.name)}" placeholder="Ej. La Cocina de Papá"></label><label>Usuario de Instagram<input id="wsHandle" value="${esc(w.handle || '')}" placeholder="@cuenta"></label><label>Contraseña del cliente<input id="wsPass" type="text" autocomplete="off" placeholder="${id ? '(sin cambios)' : 'mínimo 6 caracteres'}" value="${id ? '' : genPass()}"></label></div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;align-items:center"><span class="small">${id ? '' : 'Guardala: no se vuelve a mostrar.'}</span><button class="btn primary" onclick="wsSave('${id || ''}')">Guardar</button></div>`);
    setTimeout(() => $('#wsName')?.focus(), 50);
  };
  const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let p = ''; for (let i = 0; i < 10; i++) p += a[Math.floor(Math.random() * a.length)]; return p; };
  window.wsSave = async function (id) {
    const name = $('#wsName').value.trim(), handle = $('#wsHandle').value.trim(), password = $('#wsPass').value;
    if (!name) return toast('Ponele nombre');
    if (!id && password.length < 6) return toast('La contraseña necesita 6+ caracteres');
    try {
      const r = await api('/api/workspaces', { method: 'POST', body: { action: id ? 'update' : 'create', id, name, handle, password: password || undefined } });
      S.wsList = r.list; S.me.workspaces = [{ id: 'main', name: 'Mi cuenta', handle: '' }, ...r.list]; renderWorkspaceBox(); renderList(); closeModal();
      if (!id) wsAccess(r.workspace.id, password); else toast('Guardado');
    } catch (e) { toast(e.message, 5000); }
  };
  window.wsAccess = function (id, password) {
    const w = (S.wsList || []).find((x) => x.id === id); if (!w) return;
    const txt = `Acceso a tu dashboard CODA\nEnlace: ${location.origin}\nContraseña: ${password || '(la que te compartí; si la perdiste, te la reseteo)'}\n\nEntrás con esa contraseña y ves solo tu cuenta: métricas, top videos, ventas y publicaciones.`;
    openModal(`<h3>Datos de acceso · ${esc(w.name)}</h3><div class="block transc" style="margin-top:10px;white-space:pre-wrap">${esc(txt)}</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" onclick="copyText(${JSON.stringify(txt)})">⧉ Copiar para enviar</button>${password ? '' : `<button class="btn ghost" onclick="closeModal();wsForm('${id}')">Resetear contraseña</button>`}</div>`);
  };
  window.wsDelete = async function (id) {
    const w = (S.wsList || []).find((x) => x.id === id); if (!w) return;
    if (!confirm(`¿Eliminar el workspace de "${w.name}"? El cliente deja de poder entrar. Los datos quedan guardados por si lo volvés a crear.`)) return;
    try { const r = await api('/api/workspaces', { method: 'POST', body: { action: 'delete', id } }); S.wsList = r.list; S.me.workspaces = [{ id: 'main', name: 'Mi cuenta', handle: '' }, ...r.list]; renderWorkspaceBox(); renderList(); toast('Workspace eliminado'); } catch (e) { toast(e.message); }
  };
})();
