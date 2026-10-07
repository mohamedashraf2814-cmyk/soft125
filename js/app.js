/* SOFT STREAM — app shell, router, global search, notifications, user menu */
const NAV_MAIN = [
  { href: '#/dashboard', label: 'الرئيسية', icon: 'home', mod: 'dashboard' },
  { href: '#/accounts', label: 'الأرقام والحسابات', icon: 'wallet', mod: 'accounts' },
  { href: '#/customers', label: 'العملاء', icon: 'users', mod: 'customers' },
  { href: '#/new-transaction', label: 'عملية جديدة', icon: 'plusCircle', mod: 'transactions', cta: true },
  { href: '#/transactions', label: 'العمليات', icon: 'list', mod: 'transactions' },
  { href: '#/orders', label: 'الطلبات الخارجية', icon: 'box', mod: 'orders' },
  { href: '#/settlements', label: 'التسويات', icon: 'scale', mod: 'settlements' },
  { href: '#/expenses', label: 'المصروفات', icon: 'minus', mod: 'expenses' },
  { href: '#/revenues', label: 'الإيرادات', icon: 'plusCircle', mod: 'revenues' },
  { href: '#/profit', label: 'الأرباح والمالية', icon: 'trend', mod: 'reports' },
  { href: '#/reports', label: 'التقارير', icon: 'doc', mod: 'reports' },
  { href: '#/notifications', label: 'الإشعارات', icon: 'bell', mod: 'dashboard', badge: 'notif' },
];
const NAV_ADMIN = [
  { href: '#/employees', label: 'الموظفون', icon: 'users', mod: 'employees' },
  { href: '#/roles', label: 'الأدوار والصلاحيات', icon: 'shield', mod: 'employees' },
  { href: '#/audit', label: 'سجل التدقيق', icon: 'history', mod: 'audit' },
  { href: '#/settings', label: 'الإعدادات', icon: 'settings', mod: 'settings' },
  { href: '#/backup', label: 'النسخ الاحتياطي', icon: 'database', mod: 'settings' },
];

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="sidebar">
      <div class="brand">
        <div class="brand-name">SOFT <span>STREAM</span></div>
        <div class="brand-sub">SYSTEM PROVIDED BY SOFT STREAM</div>
      </div>
      <nav class="nav" id="navMain"></nav>
      <nav class="nav" id="navAdmin"></nav>
      <div class="sidebar-foot">SYSTEM PROVIDED BY SOFT STREAM<br>© 2026 Soft Stream</div>
    </div>
    <div class="main">
      <div class="topbar">
        <button class="icon-btn menu-btn" id="btnMenu">${icon('menu')}</button>
        <div class="search-box">
          <input type="text" id="globalSearch" placeholder="بحث: عميل، رقم هاتف، عملية، حساب، طلب خارجي، موظف..." autocomplete="off">
          ${icon('search')}
          <div id="searchResults"></div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="btnNotif" title="الإشعارات">${icon('bell')}<span class="dot hidden" id="notifDot">0</span></button>
          <div class="user-chip" id="userChip">
            <div class="avatar" id="userAvatar">A</div>
            <div><div class="nm" id="userName">-</div><div class="rl" id="userRole">-</div></div>
            ${icon('chevDown')}
          </div>
        </div>
      </div>
      <div class="view" id="view"></div>
      <div class="footer">
        <div><b>SYSTEM PROVIDED BY SOFT STREAM</b></div>
        <div>© 2026 Soft Stream. All Rights Reserved.</div>
      </div>
    </div>
    <div class="toasts" id="toasts"></div>
  `;
  renderNav();
  renderUserChip();
  bindShellEvents();
}

function renderNav() {
  const buildItem = (it) => {
    if (!Permissions.can(it.mod) && it.mod !== 'dashboard') return '';
    const badge = it.badge === 'notif' ? Notify.unreadCount() : 0;
    return `<a href="${it.href}" data-navlink class="${it.cta ? 'cta' : ''}">
      <span class="ico">${icon(it.icon)}</span><span>${esc(it.label)}</span>
      ${badge > 0 ? `<span class="count">${badge}</span>` : ''}
    </a>`;
  };
  qs('#navMain').innerHTML = NAV_MAIN.map(buildItem).join('');
  const adminVisible = NAV_ADMIN.some(it => Permissions.can(it.mod));
  qs('#navAdmin').innerHTML = adminVisible
    ? `<div class="nav-group">الإدارة</div>${NAV_ADMIN.map(buildItem).join('')}`
    : '';
  markActiveNav();
}
function markActiveNav() {
  const path = location.hash.split('?')[0] || '#/dashboard';
  qsa('[data-navlink]').forEach(a => {
    const base = a.getAttribute('href');
    a.classList.toggle('active', path === base || (base !== '#/dashboard' && path.startsWith(base)));
  });
}
function renderUserChip() {
  const u = currentUser(); const role = getRole(u.roleId);
  qs('#userAvatar').textContent = u.name.trim().charAt(0);
  qs('#userName').textContent = u.name;
  qs('#userRole').textContent = role ? role.name : '';
}

function bindShellEvents() {
  qs('#btnMenu').addEventListener('click', () => qs('.app').classList.toggle('nav-open'));
  document.addEventListener('click', (e) => {
    if (qs('.app').classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#btnMenu')) {
      qs('.app').classList.remove('nav-open');
    }
  });
  document.body.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-navlink]');
    if (nav) qs('.app').classList.remove('nav-open');
  });

  // global search
  const input = qs('#globalSearch'); const results = qs('#searchResults');
  const runSearch = debounce(() => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; results.classList.remove('search-pop'); return; }
    results.className = 'search-pop';
    results.innerHTML = globalSearch(q);
  }, 150);
  input.addEventListener('input', runSearch);
  input.addEventListener('focus', runSearch);
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-box')) { results.innerHTML = ''; results.className = ''; } });

  qs('#btnNotif').addEventListener('click', openNotifPanel);

  qs('#userChip').addEventListener('click', openUserMenu);
}

function globalSearch(q) {
  q = q.toLowerCase();
  const sections = [];
  const matchCustomers = DB.customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.code.toLowerCase().includes(q)).slice(0, 5);
  if (matchCustomers.length) sections.push(`<div class="grp">العملاء</div>` + matchCustomers.map(c => `<a href="#/customers/${c.id}"><span>${esc(c.name)}</span><span class="ltr muted">${esc(c.phone)}</span></a>`).join(''));
  const matchAccounts = DB.accounts.filter(a => a.name.includes(q) || a.phone.includes(q) || a.code.toLowerCase().includes(q)).slice(0, 5);
  if (matchAccounts.length) sections.push(`<div class="grp">الحسابات</div>` + matchAccounts.map(a => `<a href="#/accounts/${a.id}"><span>${esc(a.name)}</span><span class="ltr muted">${esc(a.phone)}</span></a>`).join(''));
  const matchTxns = DB.transactions.filter(t => t.code.toLowerCase().includes(q)).slice(0, 5);
  if (matchTxns.length) sections.push(`<div class="grp">العمليات</div>` + matchTxns.map(t => `<a href="#/transactions/${t.id}"><span>${esc(t.code)}</span><span class="muted">${esc(fmtMoney(t.amount))}</span></a>`).join(''));
  const matchOrders = DB.externalOrders.filter(o => o.code.toLowerCase().includes(q)).slice(0, 5);
  if (matchOrders.length) sections.push(`<div class="grp">الطلبات الخارجية</div>` + matchOrders.map(o => `<a href="#/orders/${o.id}"><span>${esc(o.code)}</span><span class="muted">${orderStatusBadge(o.status)}</span></a>`).join(''));
  const matchEmp = DB.employees.filter(e => e.name.includes(q)).slice(0, 5);
  if (matchEmp.length) sections.push(`<div class="grp">الموظفون</div>` + matchEmp.map(e => `<a href="#/employees"><span>${esc(e.name)}</span></a>`).join(''));
  if (!sections.length) return emptyState('search', 'لا توجد نتائج', 'جرّب كلمة بحث أخرى');
  return sections.join('');
}

function openNotifPanel() {
  const list = DB.notifications.slice(0, 30);
  openDrawer({
    title: 'الإشعارات',
    body: list.length ? list.map(n => `
      <div class="notif ${n.read ? '' : 'unread'}" data-notif="${n.id}" data-link="${n.link || ''}">
        <div class="n-ico lvl-${n.level}">${icon(n.level === 'danger' || n.level === 'critical' ? 'alertCircle' : n.level === 'warning' ? 'alertTriangle' : n.level === 'success' ? 'checkCircle' : 'info')}</div>
        <div><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div><div class="n-time">${relTime(n.time)}</div></div>
      </div>`).join('') : emptyState('bell', 'لا توجد إشعارات', 'ستظهر هنا جميع تنبيهات النظام'),
    foot: `<button class="btn" id="markAllRead">تحديد الكل كمقروء</button>`,
    onMount: (ov) => {
      qs('#markAllRead', ov).addEventListener('click', () => { Notify.markAllRead(); renderNav(); closeOverlay(); toast('تم تحديد جميع الإشعارات كمقروءة'); });
      qsa('[data-notif]', ov).forEach(n => n.addEventListener('click', () => {
        Notify.markRead(n.dataset.notif); renderNav();
        const link = n.dataset.link;
        closeOverlay();
        if (link) location.hash = link.replace('#', '');
      }));
    }
  });
}

function openUserMenu() {
  const options = DB.employees.map(e => `<button class="btn ${e.id === DB.currentUserId ? 'btn-primary' : ''}" data-switch-user="${e.id}" style="width:100%;justify-content:flex-start;margin-bottom:6px">${esc(e.name)} <span class="muted small" style="margin-inline-start:auto">${esc(getRole(e.roleId)?.name || '')}</span></button>`).join('');
  openModal({
    title: 'تبديل المستخدم (عرض الصلاحيات)', size: 'sm',
    body: `<p class="text-2 small">هذا خيار تجريبي لمعاينة النظام بصلاحيات مختلفة.</p>${options}`,
    onMount: (ov) => {
      qsa('[data-switch-user]', ov).forEach(b => b.addEventListener('click', () => {
        DB.currentUserId = b.dataset.switchUser; save();
        closeOverlay(); renderUserChip(); renderNav(); routeChanged();
        toast(`تم التبديل إلى ${currentUser().name}`);
      }));
    }
  });
}

/* ======================= Router ======================= */
const ROUTES = [
  { re: /^dashboard\/?$/, view: () => viewDashboard() },
  { re: /^accounts\/?$/, view: (_, p) => viewAccountsList(p) },
  { re: /^accounts\/([^/]+)\/?$/, view: (m) => viewAccountDetails(m[1]) },
  { re: /^customers\/?$/, view: (_, p) => viewCustomersList(p) },
  { re: /^customers\/([^/]+)\/?$/, view: (m) => viewCustomerDetails(m[1]) },
  { re: /^new-transaction\/?$/, view: () => viewWizard() },
  { re: /^transactions\/?$/, view: (_, p) => viewTxnList(p) },
  { re: /^transactions\/([^/]+)\/?$/, view: (m) => viewTxnDetails(m[1]) },
  { re: /^orders\/?$/, view: (_, p) => viewOrdersList(p) },
  { re: /^orders\/([^/]+)\/?$/, view: (m) => viewOrderDetails(m[1]) },
  { re: /^settlements\/?$/, view: () => viewSettlements() },
  { re: /^expenses\/?$/, view: () => viewExpenses() },
  { re: /^revenues\/?$/, view: () => viewRevenues() },
  { re: /^profit\/?$/, view: () => viewProfit() },
  { re: /^reports\/?$/, view: () => viewReportsCenter() },
  { re: /^reports\/([^/]+)\/?$/, view: (m) => viewReportDetail(m[1]) },
  { re: /^notifications\/?$/, view: () => viewNotificationsPage() },
  { re: /^employees\/?$/, view: () => viewEmployees() },
  { re: /^roles\/?$/, view: () => viewRoles() },
  { re: /^audit\/?$/, view: (_, p) => viewAudit(p) },
  { re: /^settings\/?$/, view: () => viewSettings() },
  { re: /^settings\/([^/]+)\/?$/, view: (m) => viewSettings(m[1]) },
  { re: /^backup\/?$/, view: () => viewBackup() },
];

function parseHash() {
  let h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, query] = h.split('?');
  return { path, params: new URLSearchParams(query || '') };
}

function routeChanged() {
  const { path, params } = parseHash();
  let matched = null, match = null;
  for (const r of ROUTES) { const m = path.match(r.re); if (m) { matched = r; match = m; break; } }
  const view = qs('#view');
  try {
    const result = matched ? matched.view(match, params) : viewDashboard();
    view.innerHTML = result.html;
    if (result.mount) result.mount(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="error-state">${icon('alertCircle')}<h3>حدث خطأ غير متوقع</h3><p class="text-2">${esc(err.message)}</p><button class="btn btn-primary" onclick="location.hash='#/dashboard'">العودة للرئيسية</button></div>`;
  }
  markActiveNav();
  renderNav();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', routeChanged);
window.addEventListener('DOMContentLoaded', () => {
  loadDB();
  renderShell();
  if (!location.hash) location.hash = '#/dashboard';
  routeChanged();
});
