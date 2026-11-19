/* FindBack – campus lost-and-found prototype. Data lives in this browser's LocalStorage only. */
const KEY = 'findback_items';
const CATS = ['Electronics','Books & Notes','ID & Cards','Bags','Keys','Clothing','Accessories','Other'];
const LOCS = ['Main Library','Canteen','Admin Block','CSE Block','ECE Block','Mechanical Block','Auditorium','Sports Ground','Hostel','Parking Area','Bus Stop'];
const ICON = {'Electronics':'📱','Books & Notes':'📚','ID & Cards':'🪪','Bags':'🎒','Keys':'🔑','Clothing':'🧥','Accessories':'⌚','Other':'📦'};
const STOP = new Set(['the','and','with','near','for','has','was','its','have','left','found','lost','small','one']);
let items = [], editId = null, openId = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const cls = s => s.toLowerCase().replace(' ', '-');

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
}
/* ---------- Router: every page and popup gets its own address (#browse, #home/item/s1 ...)
   so the browser Back button moves between pages instead of leaving the site ---------- */
const VIEWS = ['home', 'browse', 'lost', 'found'];
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
  f.elements.date.max = daysAgo(0);
  if (item) ['name', 'category', 'description', 'date', 'location', 'contact'].forEach(k => f.elements[k].value = item[k]);
  if (item) f.elements.showContact.checked = !!item.showContact;
  show('report');
}
/* Shrinks the photo so LocalStorage (about 5 MB) is not filled quickly */
function readImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(); r.onload = () => {
      const img = new Image(); img.onerror = () => rej();
      img.onload = () => {
        const k = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.6));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
async function submitForm(e) {
  e.preventDefault();
  const f = e.target, type = f.dataset.type, errs = [], v = n => f.elements[n].value.trim();
  if (v('name').length < 2) errs.push('Enter an item name (at least 2 characters).');
  if (!v('category')) errs.push('Choose a category.');
  if (!v('date')) errs.push('Choose a date.'); else if (v('date') > daysAgo(0)) errs.push('The date cannot be in the future.');
  if (!v('location')) errs.push('Choose a location.');
  if (!/^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s-]{8,15})$/.test(v('contact'))) errs.push('Enter a valid email or phone number.');
  const file = f.elements.image.files[0];
  if (file && (!file.type.startsWith('image/') || file.size > 5e6)) errs.push('Upload an image file under 5 MB.');
  const box = $('#formErr');
  if (errs.length) { box.innerHTML = '<ul>' + errs.map(x => `<li>${x}</li>`).join('') + '</ul>'; box.hidden = false; return toast('Please fix the errors in the form.', true); }
  box.hidden = true;
  let image; try { image = file ? await readImage(file) : null; } catch (x) { return toast('Could not read that image. Try another file.', true); }
  const data = { name: v('name'), category: v('category'), description: v('description'), date: v('date'), location: v('location'), contact: v('contact'), showContact: f.elements.showContact.checked };
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
  <dt>Contact</dt><dd>${i.showContact ? esc(i.contact) : '🔒 Hidden by the reporter. Send a request below.'}</dd></dl>
  ${(i.claimList || []).length ? `<div class="box"><h4>Requests received</h4>${i.claimList.map(c => `<p class="muted"><b>${esc(c.name)}</b>: ${esc(c.msg)}</p>`).join('')}</div>` : ''}
  <div class="box"><h4>Possible matches</h4><p class="muted">Automatic suggestions from similar reports. Nothing to save here. Open one to check it.</p>
  ${ms.length ? ms.map(m => `<div class="pair"><span>${esc(m.item.name)} (${m.item.type})<br><span class="strength">${strength(m.s)} • ${m.s}%</span></span><button class="btn ghost small" data-open="${m.item.id}">View</button></div>`).join('') : '<p class="muted">No similar reports yet.</p>'}</div>
  <div class="box"><h4>Mark progress</h4><p class="muted">Change this when something happens: Possible Match (you think the item was found) or Returned (the owner got it back). Then press Save status.</p><div class="row"><select id="statusSel">${['Lost', 'Found', 'Possible Match', 'Returned'].map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <button class="btn primary small" data-act="status">Save status</button></div></div>
  <form id="claimForm" class="box"><h4>${i.type === 'Found' ? 'Claim this item' : 'Send a message to the owner'}</h4><p class="muted">Prototype: requests are saved in this browser only.</p>
  <label>Your name<input name="cname" maxlength="60"></label>
  <label>${i.type === 'Found' ? 'Describe something only the owner would know' : 'Message (for example: I found your item, please contact me)'}<textarea name="cmsg" rows="2" maxlength="200"></textarea></label>
  <button class="btn primary small" type="submit">Send request</button></form>
  ${i.own ? `<div class="row" style="margin-top:.9rem"><button class="btn ghost small" data-act="edit">Edit report</button><button class="btn danger small" data-act="delete">Delete report</button></div>` : '<p class="muted">Sample reports cannot be edited or deleted.</p>'}`;
  $('#modal').classList.add('open');
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
  const i = items.find(x => x.id === openId); if (!i) return;
  if (a.dataset.act === 'status') { i.status = $('#statusSel').value; save() ? toast('Status saved.') : toast('Could not save.', true); refresh(); }
  if (a.dataset.act === 'edit') { lastBase = null; go(`${i.type.toLowerCase()}/edit/${i.id}`, true); }
  if (a.dataset.act === 'delete' && confirm('Delete this report? This cannot be undone.')) { items = items.filter(x => x !== i); save(); closeDetails(); hideModal(); toast('Report deleted.'); renderHome(); renderBrowse(); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'claimForm') return;
  e.preventDefault(); const f = e.target, i = items.find(x => x.id === openId);
  if (f.elements.cname.value.trim().length < 2 || f.elements.cmsg.value.trim().length < 5) return toast('Enter your name and a short message.', true);
  (i.claimList = i.claimList || []).push({ name: f.elements.cname.value.trim(), msg: f.elements.cmsg.value.trim() }); save();
  toast('Request saved. It now shows under Requests received on this report.'); openDetails(openId);
});
$('#form').addEventListener('submit', submitForm);
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
history.replaceState({ d: (history.state && history.state.d) || 0 }, '', location.href);
route();
