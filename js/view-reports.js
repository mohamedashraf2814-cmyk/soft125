/* SOFT STREAM — مركز التقارير */
const REPORT_DEFS = {
  transactions: { title: 'تقرير العمليات', icon: 'list', cols: ['الكود', 'النوع', 'العميل', 'المزود', 'الحساب', 'المبلغ', 'الصافي', 'الحالة', 'التاريخ'], rows: () => DB.transactions.map(t => [t.code, TXN_TYPE_AR[t.type], getCustomer(t.customerId)?.name, getProvider(t.providerId)?.name, getAccount(t.accountId)?.name, fmtMoney(t.amount), fmtMoney(t.netAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  transfers: { title: 'تقرير التحويلات', icon: 'arrowSwap', cols: ['الكود', 'العميل', 'المستفيد', 'المزود', 'المبلغ', 'الصافي', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.type === 'transfer').map(t => [t.code, getCustomer(t.customerId)?.name, t.beneficiaryName, getProvider(t.providerId)?.name, fmtMoney(t.amount), fmtMoney(t.netAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  withdrawals: { title: 'تقرير السحوبات', icon: 'arrowDown', cols: ['الكود', 'العميل', 'المزود', 'المبلغ', 'الصافي', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.type === 'withdrawal').map(t => [t.code, getCustomer(t.customerId)?.name, getProvider(t.providerId)?.name, fmtMoney(t.amount), fmtMoney(t.netAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  deposits: { title: 'تقرير الإيداعات', icon: 'arrowUp', cols: ['الكود', 'العميل', 'المزود', 'المبلغ', 'الصافي', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.type === 'deposit').map(t => [t.code, getCustomer(t.customerId)?.name, getProvider(t.providerId)?.name, fmtMoney(t.amount), fmtMoney(t.netAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  customers: { title: 'تقرير العملاء', icon: 'users', cols: ['الكود', 'الاسم', 'الهاتف', 'عدد العمليات', 'إجمالي القيمة'], rows: () => DB.customers.map(c => { const s = Txns.customerStats(c.id); return [c.code, c.name, c.phone, s.count, fmtMoney(s.total)]; }) },
  accounts: { title: 'تقرير الحسابات', icon: 'wallet', cols: ['الكود', 'الاسم', 'المزود', 'الرصيد الحالي', 'الحالة'], rows: () => DB.accounts.map(a => [a.code, a.name, getProvider(a.providerId)?.name, fmtMoney(a.currentBalance), a.status]) },
  'account-balances': { title: 'تقرير أرصدة الحسابات', icon: 'wallet', cols: ['الحساب', 'الهاتف', 'المزود', 'افتتاحي', 'إيداعات', 'سحوبات', 'تحويلات داخلة', 'تحويلات خارجة', 'تعديلات', 'الرصيد الحالي'], rows: () => DB.accounts.map(a => { const t = Accounts.totalsFor(a.id); return [a.name, a.phone, getProvider(a.providerId)?.name, fmtMoney(t.opening), fmtMoney(t.deposits), fmtMoney(t.withdrawals), fmtMoney(t.transfersIn), fmtMoney(t.transfersOut), fmtMoney(t.adjustments), fmtMoney(a.currentBalance)]; }) },
  'account-movements': { title: 'تقرير حركة الحسابات', icon: 'history', cols: ['التاريخ', 'الحساب', 'نوع الحركة', 'المرجع', 'المبلغ', 'قبل', 'بعد', 'المستخدم'], rows: () => DB.movements.map(m => [fmtDateTime(m.createdAt), getAccount(m.accountId)?.name, MOVE_LABELS[m.type] || m.type, m.reference, fmtMoney(m.amount), fmtMoney(m.balanceBefore), fmtMoney(m.balanceAfter), m.userName]) },
  vodafone: { title: 'تقرير Vodafone Cash', icon: 'wallet', cols: ['الكود', 'النوع', 'العميل', 'المبلغ', 'العمولة', 'الرسوم', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.providerId === 'vf').map(t => [t.code, TXN_TYPE_AR[t.type], getCustomer(t.customerId)?.name, fmtMoney(t.amount), fmtMoney(t.commissionAmount), fmtMoney(t.feeAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  instapay: { title: 'تقرير InstaPay', icon: 'wallet', cols: ['الكود', 'النوع', 'العميل', 'المبلغ', 'العمولة', 'الرسوم', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.providerId === 'ip').map(t => [t.code, TXN_TYPE_AR[t.type], getCustomer(t.customerId)?.name, fmtMoney(t.amount), fmtMoney(t.commissionAmount), fmtMoney(t.feeAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  mastercard: { title: 'تقرير MasterCard', icon: 'wallet', cols: ['الكود', 'النوع', 'العميل', 'المبلغ', 'العمولة', 'الرسوم', 'الحالة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.providerId === 'mc').map(t => [t.code, TXN_TYPE_AR[t.type], getCustomer(t.customerId)?.name, fmtMoney(t.amount), fmtMoney(t.commissionAmount), fmtMoney(t.feeAmount), TXN_STATUS_AR[t.status], fmtDateTime(t.createdAt)]) },
  commissions: { title: 'تقرير العمولات', icon: 'percent', cols: ['الكود', 'المزود', 'المبلغ', 'النسبة', 'قيمة العمولة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.status !== 'cancelled').map(t => [t.code, getProvider(t.providerId)?.name, fmtMoney(t.amount), t.commissionRate + '%', fmtMoney(t.commissionAmount), fmtDateTime(t.createdAt)]) },
  'provider-fees': { title: 'تقرير رسوم المزودين', icon: 'minus', cols: ['الكود', 'المزود', 'المبلغ', 'رسوم المزود', 'التاريخ'], rows: () => DB.transactions.filter(t => t.status !== 'cancelled').map(t => [t.code, getProvider(t.providerId)?.name, fmtMoney(t.amount), fmtMoney(t.feeAmount), fmtDateTime(t.createdAt)]) },
  profit: { title: 'تقرير الأرباح', icon: 'trend', cols: ['الفترة', 'العمولات', 'الرسوم', 'الإيرادات', 'المصروفات', 'صافي الربح'], rows: () => { const p = Profit.compute({}); return [['كل الفترات', fmtMoney(p.commissions), fmtMoney(p.providerFees), fmtMoney(p.revenues), fmtMoney(p.expenses), fmtMoney(p.netProfit)]]; } },
  expenses: { title: 'تقرير المصروفات', icon: 'minus', cols: ['الكود', 'الفئة', 'المبلغ', 'الحساب', 'التاريخ'], rows: () => DB.expenses.map(e => [e.code, e.category, fmtMoney(e.amount), getAccount(e.accountId)?.name || '-', fmtDate(e.date)]) },
  revenues: { title: 'تقرير الإيرادات', icon: 'plusCircle', cols: ['الكود', 'المصدر', 'المبلغ', 'الحساب', 'التاريخ'], rows: () => DB.revenues.map(r => [r.code, r.source, fmtMoney(r.amount), getAccount(r.accountId)?.name || '-', fmtDate(r.date)]) },
  settlements: { title: 'تقرير التسويات', icon: 'scale', cols: ['الكود', 'الحساب', 'المتوقع', 'الفعلي', 'الفرق', 'الحالة'], rows: () => DB.settlements.map(s => [s.code, getAccount(s.accountId)?.name, fmtMoney(s.expected), fmtMoney(s.actual), fmtMoney(s.difference), s.status === 'Matched' ? 'مطابقة' : 'يوجد فرق']) },
  'external-orders': { title: 'تقرير الطلبات الخارجية', icon: 'box', cols: ['الكود', 'العميل الخارجي', 'الهدف', 'المحصل', 'الحالة'], rows: () => DB.externalOrders.map(o => [o.code, getExternalCustomer(o.externalCustomerId)?.name, fmtMoney(o.target), fmtMoney(o.collected), ORDER_STATUS_AR[o.status]]) },
  limits: { title: 'تقرير الحدود', icon: 'alertTriangle', cols: ['الحساب', 'الحد اليومي', 'المستخدم', 'النسبة%', 'الحد الشهري', 'المستخدم الشهري', 'النسبة%'], rows: () => DB.accounts.map(a => [a.name, fmtMoney(a.dailyLimit), fmtMoney(a.dailyUsed), Accounts.dailyPct(a), fmtMoney(a.monthlyLimit), fmtMoney(a.monthlyUsed), Accounts.monthlyPct(a)]) },
  cancelled: { title: 'تقرير العمليات الملغاة', icon: 'trash', cols: ['الكود', 'النوع', 'المبلغ', 'السبب', 'بواسطة', 'التاريخ'], rows: () => DB.transactions.filter(t => t.status === 'cancelled').map(t => [t.code, TXN_TYPE_AR[t.type], fmtMoney(t.amount), t.cancelReason, getEmployee(t.cancelledBy)?.name, fmtDateTime(t.cancelledAt)]) },
  employees: { title: 'تقرير الموظفين', icon: 'users', cols: ['الاسم', 'البريد', 'الدور', 'الحالة'], rows: () => DB.employees.map(e => [e.name, e.email, getRole(e.roleId)?.name, e.status]) },
};
const REPORT_GROUPS = [
  ['العمليات', ['transactions', 'transfers', 'withdrawals', 'deposits', 'cancelled']],
  ['العملاء والحسابات', ['customers', 'accounts', 'account-balances', 'account-movements', 'limits']],
  ['مزودو الخدمة', ['vodafone', 'instapay', 'mastercard']],
  ['المالية', ['commissions', 'provider-fees', 'profit', 'expenses', 'revenues', 'settlements']],
  ['أخرى', ['external-orders', 'employees']],
];

function viewReportsCenter() {
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'مركز التقارير' }])}
    ${pageHeader('مركز التقارير', 'جميع التقارير التفصيلية للنظام مع إمكانية التصفية والتصدير والطباعة')}
    ${REPORT_GROUPS.map(([group, slugs]) => `
      <div class="section">
        <div class="section-title">${group}</div>
        <div class="grid g-auto-sm">
          ${slugs.map(slug => { const d = REPORT_DEFS[slug]; return `<a href="#/reports/${slug}" class="box" style="padding:16px">
            <div class="box-ico">${icon(d.icon)}</div>
            <div><div class="box-title" style="font-size:15px">${d.title}</div><div class="box-desc">${fmtNum(d.rows().length)} سجل</div></div>
          </a>`; }).join('')}
        </div>
      </div>`).join('')}
  `;
  return { html };
}

function viewReportDetail(slug) {
  const def = REPORT_DEFS[slug];
  if (!def) return { html: emptyState('alertCircle', 'تقرير غير موجود', '', '<a href="#/reports" class="btn btn-primary">عودة لمركز التقارير</a>') };
  const rows = def.rows();
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'مركز التقارير', href: '#/reports' }, { label: def.title }])}
    ${pageHeader(def.title, `${fmtNum(rows.length)} سجل`, `
      <button class="btn" id="btnExportCsv">${icon('download')} تصدير Excel</button>
      <button class="btn" id="btnExportPdf">${icon('pdfFile')} تصدير PDF</button>
      <button class="btn" id="btnPrintRpt">${icon('print')} طباعة</button>
    `)}
    <div class="card">
      <div class="table-wrap"><table class="tbl"><thead><tr>${def.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${rows.length ? rows.map(r => `<tr>${r.map(v => `<td>${esc(v ?? '-')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${def.cols.length}">${emptyState('doc', 'لا توجد بيانات', '')}</td></tr>`}
      </tbody></table></div>
    </div>
  `;
  return {
    html,
    mount(container) {
      qs('#btnPrintRpt', container).addEventListener('click', () => window.print());
      qs('#btnExportPdf', container).addEventListener('click', () => { toast('سيتم فتح نافذة الطباعة لحفظ التقرير كملف PDF'); window.print(); });
      qs('#btnExportCsv', container).addEventListener('click', () => {
        const objRows = rows.map(r => { const o = {}; def.cols.forEach((c, i) => o[c] = r[i]); return o; });
        exportCsv(objRows, def.title);
      });
    }
  };
}
