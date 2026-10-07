/* SOFT STREAM — Dashboard */
function svgBarChart(data, { height = 140, color = 'var(--primary)' } = {}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const w = 100 / data.length;
  const bars = data.map((d, i) => {
    const h = Math.max(2, (d.value / max) * (height - 28));
    const x = i * w;
    return `<g>
      <rect x="${x + w * 0.18}%" y="${height - 20 - h}" width="${w * 0.64}%" height="${h}" rx="3" fill="${color}"></rect>
      <text x="${x + w / 2}%" y="${height - 5}" text-anchor="middle">${esc(d.label)}</text>
    </g>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 400 ${height}" preserveAspectRatio="none" style="height:${height}px">
    <line x1="0" y1="${height - 20}" x2="400" y2="${height - 20}" class="axis-line"></line>
    ${bars}
  </svg></div>`;
}
function hbarList(items, totalOverride) {
  const total = totalOverride || Math.max(1, ...items.map(i => i.value));
  return items.map(i => `<div class="hbar">
    <span class="muted">${esc(i.label)}</span>
    <span class="track"><i style="width:${clamp((i.value / total) * 100, 0, 100)}%;background:${i.color || 'var(--primary)'}"></i></span>
    <span class="bold num">${i.display || fmtMoney(i.value)}</span>
  </div>`).join('');
}

function viewDashboard() {
  const accounts = DB.accounts;
  const totalBalance = sumBy(accounts, a => a.currentBalance);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTxns = DB.transactions.filter(t => new Date(t.createdAt) >= todayStart && t.status !== 'cancelled');
  const byType = t => todayTxns.filter(x => x.type === t);
  const profitToday = Profit.compute({ from: todayStart.toISOString() });
  const profitMonth = Profit.compute({ from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() });

  const nearLimit = accounts.filter(a => Accounts.dailyPct(a) >= 80).length;
  const inactive = accounts.filter(a => a.status !== 'نشط').length;
  const highest = accounts.reduce((a, b) => (b.currentBalance > (a?.currentBalance ?? -1) ? b : a), null);
  const lowest = accounts.reduce((a, b) => (b.currentBalance < (a?.currentBalance ?? Infinity) ? b : a), null);

  // last 14 days volume
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgoDate(i);
    const key = todayKey(d);
    const count = DB.transactions.filter(t => t.status !== 'cancelled' && todayKey(new Date(t.createdAt)) === key).length;
    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: count });
  }
  const byProvider = DB.providers.map(p => ({ label: p.name, value: sumBy(DB.transactions.filter(t => t.providerId === p.id && t.status !== 'cancelled'), t => t.amount), color: p.id === 'vf' ? '#e34948' : p.id === 'ip' ? '#4a3aa7' : '#eda100' }));

  const txTypeCards = [
    { key: 'transfer', label: 'تحويل', desc: 'عرض وتتبع عمليات التحويل', cls: 't-transfer', ico: 'arrowSwap', count: byType('transfer').length, total: sumBy(byType('transfer'), t => t.amount) },
    { key: 'withdrawal', label: 'سحب', desc: 'عرض وتتبع عمليات السحب', cls: 't-withdrawal', ico: 'arrowDown', count: byType('withdrawal').length, total: sumBy(byType('withdrawal'), t => t.amount) },
    { key: 'deposit', label: 'إيداع', desc: 'عرض وتتبع عمليات الإيداع', cls: 't-deposit', ico: 'arrowUp', count: byType('deposit').length, total: sumBy(byType('deposit'), t => t.amount) },
  ];

  const html = `
    ${pageHeader('الرئيسية', `نظرة عامة على العمليات المالية - ${fmtDate(new Date())}`, `<a href="#/new-transaction" class="btn btn-primary">${icon('plusCircle')} عملية جديدة</a>`)}

    <div class="section">
      <div class="kpis">
        <a href="#/accounts" class="kpi"><div class="lbl">${icon('wallet', '')} إجمالي الحسابات</div><div class="val">${fmtNum(accounts.length)}</div><div class="hint">حساب تشغيلي</div></a>
        <a href="#/accounts" class="kpi hl"><div class="lbl">${icon('database')} إجمالي الأرصدة</div><div class="val">${fmtMoney(totalBalance)}</div></a>
        <a href="#/transactions" class="kpi"><div class="lbl">${icon('activity')} عمليات اليوم</div><div class="val">${fmtNum(todayTxns.length)}</div><div class="hint">${fmtMoney(sumBy(todayTxns, t => t.amount))}</div></a>
        <a href="#/profit" class="kpi"><div class="lbl">${icon('percent')} عمولات النظام (اليوم)</div><div class="val">${fmtMoney(profitToday.commissions)}</div></a>
        <a href="#/profit" class="kpi"><div class="lbl">${icon('minus')} رسوم المزودين (اليوم)</div><div class="val">${fmtMoney(profitToday.providerFees)}</div></a>
        <a href="#/profit" class="kpi"><div class="lbl">${icon('trend')} صافي الربح (الشهر)</div><div class="val ${profitMonth.netProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(profitMonth.netProfit)}</div></a>
      </div>
    </div>

    <div class="section">
      <div class="section-title">عملية جديدة بحسب النوع</div>
      <div class="grid g-3">
        ${txTypeCards.map(c => `
        <a href="#/transactions?type=${c.key}" class="box ${c.cls}">
          <div class="box-ico">${icon(c.ico)}</div>
          <div><div class="box-title">${c.label}</div><div class="box-desc">${c.desc}</div></div>
          <div class="box-meta"><span>عمليات اليوم: ${c.count}</span><span class="bold">${fmtMoney(c.total)}</span></div>
        </a>`).join('')}
      </div>
    </div>

    <div class="split section">
      <div class="card">
        <div class="card-head"><div class="card-title">حركة العمليات - آخر 14 يوم</div><a href="#/reports/transactions" class="btn btn-sm">عرض التقرير</a></div>
        <div class="card-body">${svgBarChart(days)}</div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">التوزيع حسب مزود الخدمة</div></div>
        <div class="card-body">${hbarList(byProvider)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">ملخص الحسابات <a href="#/accounts" class="btn btn-sm btn-ghost">إدارة الحسابات ${icon('chevLeft')}</a></div>
      <div class="kpis">
        <div class="kpi"><div class="lbl">أعلى رصيد</div><div class="val">${fmtMoney(highest?.currentBalance || 0)}</div><div class="hint">${esc(highest?.name || '-')}</div></div>
        <div class="kpi"><div class="lbl">أدنى رصيد</div><div class="val">${fmtMoney(lowest?.currentBalance || 0)}</div><div class="hint">${esc(lowest?.name || '-')}</div></div>
        <div class="kpi"><div class="lbl">حسابات قريبة من الحد</div><div class="val ${nearLimit ? 'neg' : ''}">${nearLimit}</div><div class="hint">80% فأكثر من الحد اليومي</div></div>
        <div class="kpi"><div class="lbl">حسابات غير نشطة</div><div class="val">${inactive}</div><div class="hint">معلقة أو مغلقة</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">أحدث الإشعارات <a href="#/notifications" class="btn btn-sm btn-ghost">عرض الكل ${icon('chevLeft')}</a></div>
      <div class="card">
        ${DB.notifications.slice(0, 5).map(n => `
          <div class="notif ${n.read ? '' : 'unread'}" data-link="${n.link || ''}">
            <div class="n-ico lvl-${n.level}">${icon(n.level === 'danger' || n.level === 'critical' ? 'alertCircle' : n.level === 'warning' ? 'alertTriangle' : n.level === 'success' ? 'checkCircle' : 'info')}</div>
            <div><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div><div class="n-time">${relTime(n.time)}</div></div>
          </div>`).join('') || emptyState('bell', 'لا توجد إشعارات', '')}
      </div>
    </div>
  `;
  return {
    html,
    mount(container) {
      qsa('.notif[data-link]', container).forEach(n => n.addEventListener('click', () => { if (n.dataset.link) location.hash = n.dataset.link.replace('#', ''); }));
    }
  };
}
