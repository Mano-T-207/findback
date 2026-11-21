/* FindBack – campus lost-and-found prototype. Data lives in this browser's LocalStorage only. */
const KEY = 'findback_items';
const CATS = ['Electronics','Books & Notes','ID & Cards','Bags','Keys','Clothing','Accessories','Other'];
const LOCS = ['Main Library','Canteen','Admin Block','CSE Block','ECE Block','Mechanical Block','Auditorium','Sports Ground','Hostel','Parking Area','Bus Stop'];
const ICON = {'Electronics':'📱','Books & Notes':'📚','ID & Cards':'🪪','Bags':'🎒','Keys':'🔑','Clothing':'🧥','Accessories':'⌚','Other':'📦'};
const STOP = new Set(['the','and','with','near','for','has','was','its','have','left','found','lost','small','one']);
let items = [], claims = [], editId = null, openId = null, isAdmin = false;
const CKEY = 'findback_claims', ADMIN_PIN = 'admin123', SLOTS = ['10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
try { isAdmin = sessionStorage.getItem('fb_admin') === '1'; } catch (e) {}
function loadClaims() { try { const d = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(d) ? d : []; } catch (e) { return []; } }
function saveClaims() { try { localStorage.setItem(CKEY, JSON.stringify(claims)); return true; } catch (e) { return false; } }

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const cls = s => s.toLowerCase().replace(/\s+/g, '-');

/* ---------- Storage ---------- */
function seed() {
  const mk = (i, type, name, category, location, ago, description, status) =>
    ({ id: 's' + i, type, status: status || type, name, category, location, date: daysAgo(ago), description, contact: 'demo', image: '', own: false, claims: 0, created: Date.now() - i * 1000 });
  return [
    mk(1,'Lost','Black Wireless Earbuds','Electronics','CSE Block',2,'Black earbuds with charging case, small scratch on the lid'),
    mk(2,'Found','Wireless Earbuds Case','Electronics','CSE Block',1,'Black earbud charging case with scratched lid found near the lab'),
    mk(3,'Lost','Blue Water Bottle','Other','Canteen',3,'Blue steel bottle with a sticker of a mountain'),
    mk(4,'Found','Student ID Card','ID & Cards','Main Library',1,'College ID card in a green holder, found on reading table'),
    mk(5,'Lost','Physics Notebook','Books & Notes','Main Library',4,'Spiral notebook with a red cover and name written inside'),
    mk(6,'Found','Car Keys with Red Keychain','Keys','Parking Area',2,'Two keys on a red keychain near the entrance'),
    mk(7,'Lost','Grey Laptop Backpack','Bags','Auditorium',2,'Grey backpack with a laptop sleeve and a black zip'),
    mk(8,'Found','Grey Backpack','Bags','Auditorium',1,'Grey bag with laptop sleeve left on a seat after the event'),
    mk(9,'Lost','Scientific Calculator','Electronics','ECE Block',9,'Casio calculator with initials on the back','Returned')
  ];
}
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(d) ? d : null; } catch (e) { return null; } }
/* Returns false when storage is full or blocked */
function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); return true; } catch (e) { return false; } }

/* ---------- Matching (rule-based) ---------- */
const words = t => new Set(String(t).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
/* Share of words in common, relative to the shorter text (0 to 1) */
function overlap(a, b) {
  const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size);
}
/* Score 0-100: category 30, name 30, description 20, location 10, date 10 */
function score(a, b) {
  let s = 0;
  if (a.category === b.category) s += 30;
  s += Math.round(overlap(a.name, b.name) * 30);
  s += Math.round(overlap(a.description, b.description) * 20);
  if (a.location === b.location) s += 10;
  const d = Math.abs(new Date(a.date) - new Date(b.date)) / 864e5;
  s += d <= 3 ? 10 : d <= 7 ? 5 : 0;
  return Math.min(s, 100);
}
const strength = s => s >= 65 ? 'Strong' : s >= 45 ? 'Medium' : 'Weak';
/* Short reasons shown with each match */
function why(a, b) {
  const r = [];
  if (a.category === b.category) r.push('same category');
  if (overlap(a.name, b.name) > 0) r.push('similar name');
  if (overlap(a.description, b.description) > 0) r.push('similar description');
  if (a.location === b.location) r.push('same location');
  if (Math.abs(new Date(a.date) - new Date(b.date)) / 864e5 <= 3) r.push('dates close');
  return r.length ? 'Why: ' + r.join(', ') : '';
}
/* Top 3 opposite-type, non-returned items scoring 30 or more */
function matchesFor(it) {
  if (it.status === 'Returned') return [];
  return items.filter(o => o.type !== it.type && o.status !== 'Returned')
    .map(o => ({ item: o, s: score(it, o) })).filter(m => m.s >= 30)
    .sort((x, y) => y.s - x.s).slice(0, 3);
}

/* ---------- Views ---------- */
function show(v, keepScroll) {
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.id === v));
  $('#menu').classList.remove('open'); if (!keepScroll) window.scrollTo(0, 0);
  if (v === 'home') renderHome();
  if (v === 'browse') renderBrowse();
  if (v === 'requests') renderRequests();
  if (v === 'admin') renderAdmin();
}
/* ---------- Router: every page and popup gets its own address (#browse, #home/item/s1 ...)
   so the browser Back button moves between pages instead of leaving the site ---------- */
const VIEWS = ['home', 'browse', 'lost', 'found', 'requests', 'admin'];
let lastBase = null;
/* Go to a page. replace = true swaps the current history entry instead of adding one */
function go(path, replace) {
  const d = /\/item\//.test(path) ? ((history.state && history.state.d) || 0) + 1 : 0;
  history[replace ? 'replaceState' : 'pushState']({ d }, '', '#' + path);
  route();
}
function route() {
  let [v, k, id] = location.hash.slice(1).split('/');
  if (!VIEWS.includes(v)) { v = 'home'; k = id = undefined; }
  const base = k === 'edit' ? `${v}/edit/${id}` : v;
  if (base !== lastBase) {
    lastBase = base;
    if (v === 'lost' || v === 'found') {
      const type = v === 'lost' ? 'Lost' : 'Found';
      const it = k === 'edit' ? items.find(x => x.id === id && x.own) : null;
      openForm(type, it);
    } else show(v);
  } else if (v === 'home' || v === 'browse') show(v, true);
  if (k === 'item' && items.some(x => x.id === id)) openDetails(id); else hideModal();
}
window.addEventListener('popstate', route);
function card(i) {
  return `<article class="card"><div class="thumb">${i.image ? `<img src="${i.image}" alt="${esc(i.name)}">` : ICON[i.category] || '📦'}</div>
  <div class="body"><span class="badge ${cls(i.status)}">${i.status}</span><h3>${esc(i.name)}</h3>
  <div class="meta">${esc(i.category)} • ${esc(i.date)} • ${esc(i.location)}</div>
  <p>${esc((i.description || 'No description added').slice(0, 80))}</p>
  <button class="btn ghost small" data-open="${i.id}">View details</button></div></article>`;
}
function renderHome() {
  const n = f => items.filter(f).length;
  $('#stats').innerHTML = [['Lost items', n(i => i.type === 'Lost')], ['Found items', n(i => i.type === 'Found')], ['Returned', n(i => i.status === 'Returned')]]
    .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#recent').innerHTML = [...items].sort((a, b) => b.created - a.created).slice(0, 3).map(card).join('');
}
function renderBrowse() {
  const q = $('#fq').value.trim().toLowerCase(), c = $('#fc').value, s = $('#fs').value, d = $('#fd').value, l = $('#fl').value;
  const res = items.filter(i => (!q || i.name.toLowerCase().includes(q)) && (!c || i.category === c) && (!s || i.status === s) && (!d || i.date === d) && (!l || i.location === l))
    .sort((a, b) => b.created - a.created);
  $('#list').innerHTML = res.map(card).join('');
  $('#empty').hidden = res.length > 0;
  $('#clearSamples').hidden = !items.some(i => !i.own);
  $('#count').textContent = `${res.length} of ${items.length} items`;
  // Suggested matches: best pair for each open lost item (45+ only)
  const pairs = items.filter(i => i.type === 'Lost').map(i => ({ i, m: matchesFor(i)[0] })).filter(p => p.m && p.m.s >= 45);
  $('#pairs').innerHTML = pairs.length ? pairs.map(p => `<div class="pair"><span><b>${esc(p.i.name)}</b> (lost) ↔ <b>${esc(p.m.item.name)}</b> (found)</span>
    <span><span class="strength">${strength(p.m.s)} • ${p.m.s}%</span> <button class="btn ghost small" data-open="${p.i.id}">Review</button></span></div>`).join('')
    : '<div class="empty">No strong suggestions yet. Report more items to see matches.</div>';
}
function refresh() { renderHome(); renderBrowse(); if (openId) openDetails(openId); }

/* ---------- Report form ---------- */
function openForm(type, item) {
  editId = item ? item.id : null;
  const f = $('#form'); f.reset(); $('#formErr').hidden = true; f.dataset.type = type;
  $('#formTitle').textContent = (item ? 'Edit ' : 'Report ') + type.toLowerCase() + ' item';
  $('#dateLbl').textContent = type === 'Lost' ? 'Date lost' : 'Date found';
  $('#locLbl').textContent = type === 'Lost' ? 'Location last seen' : 'Location found';
  $('#submitBtn').textContent = item ? 'Save changes' : 'Submit report';
  $('#formNote').textContent = type === 'Lost' ? 'Describe your item clearly. When it is found, claim it with proof and the admin will book your pickup slot. Your contact stays private.' : 'Please hand the item to the Admin Desk. The admin keeps it safe and returns it only after checking the owner\'s proof. Your contact stays private.';
  f.elements.date.max = type === 'Lost' ? daysAgo(0) : '';
  if (item) ['name', 'category', 'description', 'date', 'location', 'contact'].forEach(k => f.elements[k].value = item[k]);
  show('report');
}
/* Any photo size works: it is shrunk to a small copy so browser storage is not filled */
function readImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.6));
    };
    img.src = url;
  });
}
async function submitForm(e) {
  e.preventDefault();
  const f = e.target, type = f.dataset.type, errs = [], v = n => f.elements[n].value.trim();
  if (v('name').length < 2) errs.push('Enter an item name (at least 2 characters).');
  if (!v('category')) errs.push('Choose a category.');
  if (!v('date')) errs.push('Choose a date.'); else if (type === 'Lost' && v('date') > daysAgo(0)) errs.push('The date lost cannot be in the future.');
  if (!v('location')) errs.push('Choose a location.');
  if (!/^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s-]{8,15})$/.test(v('contact'))) errs.push('Enter a valid email or phone number.');
  const file = f.elements.image.files[0] || f.elements.camera.files[0];
  if (file && !file.type.startsWith('image/')) errs.push('Please choose an image file (photo).');
  const box = $('#formErr');
  if (errs.length) { box.innerHTML = '<ul>' + errs.map(x => `<li>${x}</li>`).join('') + '</ul>'; box.hidden = false; return toast('Please fix the errors in the form.', true); }
  box.hidden = true;
  let image; try { image = file ? await readImage(file) : null; } catch (x) { return toast('Could not read that image. Try another file.', true); }
  const data = { name: v('name'), category: v('category'), description: v('description'), date: v('date'), location: v('location'), contact: v('contact') };
  const backup = JSON.stringify(items);
  if (editId) { const it = items.find(i => i.id === editId); Object.assign(it, data); if (image) it.image = image; }
  else items.push({ ...data, id: 'u' + Date.now(), type, status: type, image: image || '', own: true, claims: 0, created: Date.now() });
  if (!save()) { items = JSON.parse(backup); return toast('Browser storage is full. Try a smaller image or delete old reports.', true); }
  toast(editId ? 'Report updated.' : 'Report submitted.'); editId = null; lastBase = null; go('browse', true);
}

/* ---------- Details modal ---------- */
function openDetails(id) {
  const i = items.find(x => x.id === id); if (!i) return; openId = id;
  const ms = matchesFor(i);
  $('#modalBody').innerHTML = `<div class="detail-img">${i.image ? `<img src="${i.image}" alt="">` : ICON[i.category] || '📦'}</div>
  <span class="badge ${cls(i.status)}">${i.status}</span><h2>${esc(i.name)}</h2>
  <dl><dt>Category</dt><dd>${esc(i.category)}</dd><dt>Date</dt><dd>${esc(i.date)}</dd>
  <dt>Location</dt><dd>${esc(i.location)}</dd><dt>Description</dt><dd>${esc(i.description || 'No description added')}</dd>
  ${isAdmin ? `<dt>Contact (admin only)</dt><dd>${esc(i.contact)}</dd>` : ''}</dl>
  <div class="box"><h4>Possible matches (${ms.length})</h4><p class="muted">${i.type === 'Lost' ? 'Found items that look like this lost item.' : 'Lost items that look like this found item.'} These are suggestions only, not confirmed.</p>
  ${ms.length ? ms.map(m => `<div class="pair"><span><b>${esc(m.item.name)}</b> (${m.item.type}, ${esc(m.item.location)})<br><span class="strength">${strength(m.s)} match • ${m.s}%</span><br><span class="muted">${why(i, m.item)}</span></span><button class="btn ghost small" data-open="${m.item.id}">View match</button></div>`).join('') : '<p class="muted">No matches yet. Check again when more items are reported.</p>'}</div>
  ${actionBox(i)}
  ${i.own ? `<div class="row" style="margin-top:.9rem"><button class="btn ghost small" data-act="edit">Edit report</button><button class="btn danger small" data-act="delete">Delete report</button></div>` : ''}`;
  $('#modal').classList.add('open');
}
/* What the person can do in the details window depends on the item and who is looking */
function actionBox(i) {
  if (i.status === 'Returned') return '<div class="box"><b>✅ This item has been returned to its owner.</b></div>';
  if (i.type === 'Lost') return i.own ? '<div class="box"><h4>Waiting for a match</h4><p class="muted">When your item appears under Found, open it and claim it with proof.</p></div>'
    : '<div class="box"><h4>Found this item?</h4><p class="muted">Hand it to the Admin Desk and report it as Found. The admin checks the owner\'s proof and returns it safely.</p><button class="btn primary small" data-view="found">Report as found</button></div>';
  if (i.own) return '<div class="box"><h4>You found this item</h4><p class="muted">Keep it at the Admin Desk. The admin verifies the owner and updates the status. Your contact stays private.</p></div>';
  if (i.status === 'Ready for Pickup') return '<div class="box"><b>A pickup slot is already booked for this item.</b></div>';
  return `<form id="claimForm" class="box"><h4>This is mine: claim it with proof</h4><p class="muted">The admin reviews your proof and books a pickup slot at the Admin Desk. Your contact goes only to the admin.</p>
  <label>Your name<input name="cname" maxlength="60"></label>
  <label>Your phone or email<input name="ccontact" maxlength="60"></label>
  <label>Proof (colour, marks, contents, purchase details)<textarea name="cproof" rows="2" maxlength="300"></textarea></label>
  <label>Proof photo (optional): choose from gallery or files<input name="cimage" type="file" accept="image/*"></label>
  <label>Or take a proof photo now with your camera<input name="ccamera" type="file" accept="image/*" capture="environment"></label>
  <button class="btn primary small" type="submit">Send claim to admin</button></form>`;
}
/* My Requests: claims made in this browser, with status and pickup slot */
function renderRequests() {
  const L = [...claims].sort((a, b) => b.created - a.created);
  $('#reqList').innerHTML = L.length ? L.map(x => { const it = items.find(i => i.id === x.itemId) || { name: '(deleted item)' };
    return `<div class="pair"><span><b>${esc(it.name)}</b><br><span class="muted">Proof: ${esc(x.proof.slice(0, 80))}</span>${x.slot ? `<br><b>Pickup: ${esc(x.slot.date)} at ${esc(x.slot.time)}, Admin Desk.</b> Bring your college ID.` : ''}${x.note ? `<br><span class="muted">Admin note: ${esc(x.note)}</span>` : ''}</span><span class="badge ${cls(x.status)}">${x.status}</span></div>`; }).join('')
    : '<div class="empty">No claims yet. Open a Found item and press "This is mine".</div>';
}
/* Admin desk: review proof, approve with a pickup slot, reject, or mark returned */
function renderAdmin() {
  const box = $('#adminBox');
  if (!isAdmin) { box.innerHTML = `<form id="adminLogin" class="box"><h4>Admin login</h4><p class="muted">Prototype demo PIN: ${ADMIN_PIN}. The full version will use a real admin account.</p><label>PIN<input name="pin" type="password"></label><button class="btn primary small" type="submit">Login</button></form>`; return; }
  const sec = (t, st) => { const L = claims.filter(c => st.includes(c.status)).sort((a, b) => b.created - a.created); return `<h3>${t} (${L.length})</h3>` + (L.length ? L.map(adminCard).join('') : '<p class="muted">Nothing here.</p>'); };
  box.innerHTML = '<div class="row"><button class="btn ghost small" data-act="adm-out">Logout</button></div>' + sec('Claims to review', ['Under review']) + sec('Pickups scheduled', ['Approved']) + sec('Completed', ['Returned', 'Rejected']);
}
function adminCard(c) {
  const it = items.find(i => i.id === c.itemId); if (!it) return '';
  return `<div class="box"><span class="badge ${cls(c.status)}">${c.status}</span> <b>${esc(it.name)}</b> (${it.type}, ${esc(it.location)}, ${esc(it.date)})
  <p class="muted">Reporter contact: ${esc(it.contact)}<br>Claimant: ${esc(c.name)} (${esc(c.contact)})<br>Proof: ${esc(c.proof)}</p>${c.image ? `<img src="${c.image}" alt="Proof" style="max-width:160px;border-radius:8px">` : ''}
  ${c.status === 'Under review' ? `<div class="row"><input type="date" id="sd-${c.id}" min="${daysAgo(0)}" style="width:auto"><select id="st-${c.id}">${SLOTS.map(t => `<option>${t}</option>`).join('')}</select></div>
  <div class="row" style="margin-top:.5rem"><button class="btn primary small" data-act="adm-approve" data-cid="${c.id}">Approve and book slot</button><button class="btn danger small" data-act="adm-reject" data-cid="${c.id}">Reject</button></div>` : ''}
  ${c.status === 'Approved' ? `<p class="muted"><b>Slot: ${esc(c.slot.date)} at ${esc(c.slot.time)}</b></p><button class="btn primary small" data-act="adm-return" data-cid="${c.id}">Verified in person: mark Returned</button>` : ''}
  ${c.note ? `<p class="muted">Note: ${esc(c.note)}</p>` : ''}</div>`;
}
function adminAction(act, cid) {
  const c = claims.find(x => x.id === cid), it = c && items.find(i => i.id === c.itemId); if (!c || !it) return;
  if (act === 'adm-approve') {
    const date = $('#sd-' + cid).value, time = $('#st-' + cid).value;
    if (!date || date < daysAgo(0)) return toast('Choose a pickup date (today or later).', true);
    if (claims.some(x => x.status === 'Approved' && x.slot.date === date && x.slot.time === time)) return toast('That slot is already booked. Choose another.', true);
    c.status = 'Approved'; c.slot = { date, time }; it.status = 'Ready for Pickup';
    claims.filter(x => x !== c && x.itemId === it.id && x.status === 'Under review').forEach(x => { x.status = 'Rejected'; x.note = 'Another claim was approved for this item.'; });
  }
  if (act === 'adm-reject') {
    const why = prompt('Reason for rejecting (the claimant will see it):'); if (why === null) return;
    c.status = 'Rejected'; c.note = why || 'Proof was not sufficient.';
    if (!claims.some(x => x.itemId === it.id && ['Under review', 'Approved'].includes(x.status))) it.status = it.type;
  }
  if (act === 'adm-return') { c.status = 'Returned'; it.status = 'Returned'; }
  save(); saveClaims(); toast('Updated.'); renderAdmin(); renderHome(); renderBrowse();
}
function hideModal() { $('#modal').classList.remove('open'); openId = null; }
/* Closing the popup steps back past every popup page we opened, or just drops it from the address */
function closeDetails() {
  if (!openId) return;
  const d = (history.state && history.state.d) || 0;
  if (d > 0) history.go(-d);
  else go(lastBase && !lastBase.includes('/edit/') ? lastBase : 'home', true);
}
function viewDetails(id) { go(`${lastBase && VIEWS.includes(lastBase) ? lastBase : 'home'}/item/${id}`); }
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.className = '', 2800);
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]');
  if (nav) { e.preventDefault(); const v = nav.dataset.view; if (v === lastBase && !openId) { $('#menu').classList.remove('open'); return window.scrollTo(0, 0); } lastBase = null; return go(v); }
  const o = e.target.closest('[data-open]'); if (o) return viewDetails(o.dataset.open);
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'adm-out') { isAdmin = false; try { sessionStorage.removeItem('fb_admin'); } catch (x) {} return renderAdmin(); }
  if (a.dataset.act.startsWith('adm-')) return adminAction(a.dataset.act, a.dataset.cid);
  const i = items.find(x => x.id === openId); if (!i) return;
  if (a.dataset.act === 'status') { i.status = $('#statusSel').value; save() ? toast('Status saved.') : toast('Could not save.', true); refresh(); }
  if (a.dataset.act === 'edit') { lastBase = null; go(`${i.type.toLowerCase()}/edit/${i.id}`, true); }
  if (a.dataset.act === 'delete' && confirm('Delete this report? This cannot be undone.')) { items = items.filter(x => x !== i); save(); closeDetails(); hideModal(); toast('Report deleted.'); renderHome(); renderBrowse(); }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'adminLogin') { e.preventDefault(); if (f.elements.pin.value === ADMIN_PIN) { isAdmin = true; try { sessionStorage.setItem('fb_admin', '1'); } catch (x) {} toast('Admin mode on.'); renderAdmin(); } else toast('Wrong PIN.', true); return; }
  if (f.id !== 'claimForm') return;
  e.preventDefault(); const it = items.find(x => x.id === openId), E = f.elements, g = n => E[n].value.trim();
  if (g('cname').length < 2 || g('cproof').length < 10) return toast('Enter your name and a proof description (at least 10 characters).', true);
  if (!/^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s-]{8,15})$/.test(g('ccontact'))) return toast('Enter a valid phone number or email.', true);
  let image = ''; const file = E.cimage.files[0] || E.ccamera.files[0];
  if (file) { if (!file.type.startsWith('image/')) return toast('Please choose an image file (photo).', true); try { image = await readImage(file); } catch (x) { return toast('Could not read the proof image.', true); } }
  const old = it.status;
  claims.push({ id: 'c' + Date.now(), itemId: it.id, name: g('cname'), contact: g('ccontact'), proof: g('cproof'), image, status: 'Under review', slot: null, note: '', created: Date.now() });
  if (it.status === 'Found') it.status = 'Claim Pending';
  if (!saveClaims() || !save()) { claims.pop(); it.status = old; return toast('Browser storage is full. Try a smaller proof image.', true); }
  toast('Claim sent to the admin for review.'); go('requests');
});
$('#form').addEventListener('submit', submitForm);
/* Only one photo source is used: choosing one clears the other */
['image', 'camera'].forEach((n, k, a) => $('#form').elements[n].addEventListener('change', e => { if (e.target.files.length) $('#form').elements[a[1 - k]].value = ''; }));
$('#menuBtn').addEventListener('click', () => $('#menu').classList.toggle('open'));
$('#closeModal').addEventListener('click', closeDetails);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeDetails(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetails(); });
['#fq', '#fc', '#fs', '#fd', '#fl'].forEach(s => $(s).addEventListener('input', renderBrowse));
$('#clearSamples').addEventListener('click', () => { if (confirm('Remove all sample reports? Your own reports stay.')) { items = items.filter(i => i.own); save(); toast('Sample reports removed.'); refresh(); } });
$('#clear').addEventListener('click', () => { ['#fq', '#fc', '#fs', '#fd', '#fl'].forEach(s => $(s).value = ''); renderBrowse(); });

/* ---------- Start ---------- */
const opts = (arr, first) => (first ? `<option value="">${first}</option>` : '<option value="">Select...</option>') + arr.map(x => `<option>${x}</option>`).join('');
$('#fc').innerHTML = opts(CATS, 'All categories'); $('#fl').innerHTML = opts(LOCS, 'All locations');
$('#form').elements.category.innerHTML = opts(CATS); $('#form').elements.location.innerHTML = opts(LOCS);
items = load();
if (!items) { items = seed(); save(); }
claims = loadClaims();
history.replaceState({ d: (history.state && history.state.d) || 0 }, '', location.href);
route();
