const state = { view: 'overview', data: {}, api: localStorage.getItem('lajuBetolApi') || 'http://127.0.0.1:3000', token: localStorage.getItem('lajuBetolAdminToken') || '' };
const app = document.querySelector('#app');

async function api(path, options = {}) {
  const response = await fetch(`${state.api}${path}`, { headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }, ...options });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `API error ${response.status}`);
  return body?.data;
}

async function signIn() {
  const email = prompt('Admin email', 'admin@lajubetol.app');
  const password = prompt('Admin password', 'admin');
  if (!email || !password) return;
  const body = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!body.user.roles.includes('admin') && !body.user.roles.includes('operator')) throw new Error('This account does not have an admin role');
  state.token = body.token;
  localStorage.setItem('lajuBetolAdminToken', state.token);
  await refresh();
}

async function refresh() {
  try {
    state.data.dashboard = await api('/api/admin/dashboard');
    state.data.catalog = await api('/api/admin/catalog/merchants');
    state.data.products = await api('/api/admin/catalog/products');
    state.data.orders = await api('/api/admin/operations/orders');
    state.data.travel = await api('/api/admin/operations/travel');
    state.data.support = await api('/api/admin/operations/support');
    state.data.payments = await api('/api/admin/operations/payments');
    state.data.customers = await api('/api/admin/operations/customers');
    document.querySelector('#last-sync').textContent = `Synced ${new Date().toLocaleTimeString()}`;
    render();
  } catch (error) {
    state.data.error = error.message;
    render();
  }
}

function render() {
  const title = state.view[0].toUpperCase() + state.view.slice(1);
  document.querySelector('#page-title').textContent = title;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === state.view));
  if (state.data.error && !state.token) return renderLogin();
  const views = { overview: renderOverview, catalog: renderCatalog, orders: renderOrders, travel: renderTravel, support: renderSupport, payments: renderPayments, customers: renderCustomers };
  app.innerHTML = (views[state.view] || renderOverview)();
  bindActions();
}

function renderLogin() {
  app.innerHTML = `<section class="panel empty"><h2>Admin login required</h2><p>${escapeHtml(state.data.error || 'Connect to the local backend to continue.')}</p><button class="button" data-action="login">Sign in as admin</button></section>`;
  bindActions();
}

function renderOverview() {
  const c = state.data.dashboard?.counts || {};
  return `<section class="hero"><div><h2>Make every operation feel lighter.</h2><p>Manage Laju Betol from one calm workspace. Catalog, orders, support, and payments share the same local API.</p></div><button class="button" data-action="login">Switch admin</button></section><section class="stats">${stat('Customers', c.users ?? '—', 'registered accounts')}${stat('Merchants', c.merchants ?? '—', 'active catalog sources')}${stat('Open orders', c.openOrders ?? '—', 'need attention')}${stat('Pending payments', c.pendingPayments ?? '—', 'mock settlement queue')}</section><section class="grid-2"><div class="panel"><h3>Operations pulse</h3><div class="list"><div class="list-row"><span>Support conversations</span><strong>${c.openSupportThreads ?? 0} open</strong></div><div class="list-row"><span>Products in catalog</span><strong>${c.products ?? 0}</strong></div><div class="list-row"><span>API mode</span><span class="badge">Local mock</span></div></div></div><div class="panel"><h3>Quick start</h3><p class="muted">Use Catalog to publish a merchant and product. Then watch customer orders arrive under Orders.</p><button class="button ghost" data-view="catalog">Open catalog</button></div></section>`;
}

function renderCatalog() {
  const merchants = state.data.catalog || [];
  return `<div class="toolbar"><div><h2>Catalog</h2><span class="muted">${merchants.length} merchants · ${state.data.products?.length || 0} products</span></div><button class="button" data-action="new-merchant">+ Add merchant</button></div><div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Category</th><th>Status</th><th>Action</th></tr></thead><tbody>${merchants.map((m) => `<tr><td><strong>${escapeHtml(m.name)}</strong><br><span class="muted">${escapeHtml(m.description)}</span></td><td>${escapeHtml(m.category)}</td><td><span class="badge ${m.isOpen ? '' : 'orange'}">${m.isOpen ? 'Open' : 'Archived'}</span></td><td><button class="button ghost" data-action="toggle-merchant" data-id="${m.id}" data-open="${m.isOpen}">${m.isOpen ? 'Archive' : 'Reopen'}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderOrders() { return renderOperations('Orders', state.data.orders || [], ['id', 'customerName', 'status', 'totalCents'], 'order'); }
function renderTravel() { return renderOperations('Travel', state.data.travel || [], ['id', 'customerName', 'pickup', 'destination', 'status'], 'travel'); }
function renderSupport() { return renderOperations('Support', state.data.support || [], ['id', 'customerName', 'subject', 'status'], 'support'); }
function renderPayments() { return renderOperations('Payments', state.data.payments || [], ['id', 'customerName', 'method', 'status', 'amountCents'], 'payment'); }
function renderCustomers() { return renderOperations('Customers', state.data.customers || [], ['id', 'email', 'displayName', 'phone'], 'customer'); }

function renderOperations(title, rows, columns, type) {
  return `<div class="toolbar"><div><h2>${title}</h2><span class="muted">Live data from the local backend</span></div><span class="badge">${rows.length} records</span></div><div class="table-wrap">${rows.length ? `<table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${formatCell(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty">No records yet.</div>'}</div>`;
}

function stat(label, value, note) { return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`; }
function formatCell(value) { if (value === null || value === undefined) return '<span class="muted">—</span>'; if (typeof value === 'number' && value > 100) return `$${(value / 100).toFixed(2)}`; return escapeHtml(String(value)); }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

function bindActions() {
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; render(); }));
  document.querySelectorAll('[data-action="login"]').forEach((button) => button.addEventListener('click', () => signIn().catch(showError)));
  document.querySelectorAll('[data-action="toggle-merchant"]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/admin/catalog/merchants/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ isOpen: button.dataset.open !== 'true' }) }); await refresh(); } catch (error) { showError(error); } }));
  document.querySelectorAll('[data-action="new-merchant"]').forEach((button) => button.addEventListener('click', async () => { const name = prompt('Merchant name'); if (!name) return; try { await api('/api/admin/catalog/merchants/ignored', { method: 'POST', body: JSON.stringify({ name, description: 'New merchant', category: 'service' }) }); await refresh(); } catch (error) { showError(error); } }));
}
function showError(error) { state.data.error = error.message; render(); }

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; render(); }));
document.querySelector('#refresh').addEventListener('click', () => refresh().catch(showError));
refresh();
