/* SOFT STREAM — التسويات / المصروفات / الإيرادات / الأرباح والمالية */
function settlementTableHtml(list) {
  if (!list.length) return emptyState('scale', 'لا توجد تسويات', '');
  return `<table class="tbl"><thead><tr><th>الكود</th><th>الحساب</th><th>المتوقع</th><th>الفعلي</th><th>الفرق</th><th>الحالة</th><th>الموافقة</th><th>التاريخ</th></tr></thead><tbody>
    ${list.map(s => `<tr>
      <td class="ltr">${esc(s.code)}</td><td>${esc(getAccount(s.accountId)?.name || '-')}</td>
      <td class="num">${fmtMoney(s.expected)}</td><td class="num">${fmtMoney(s.actual)}</td>
      <td class="num ${s.difference < 0 ? 'neg' : s.difference > 0 ? 'pos' : ''}">${fmtMoney(s.difference)}</td>
      <td>${statusBadge(s.status === 'Matched' ? 'مطابقة' : 'يوجد فرق', s.status === 'Matched' ? 'ok' : 'warn')}</td>
      <td>${s.approved ? statusBadge('معتمدة', 'ok') : (Permissions.can('overrides') ? `<button class="btn btn-sm" data-approve-settle="${s.id}">موافقة المدير</button>` : statusBadge('بانتظار الموافقة', 'muted'))}</td>
      <td>${fmtDate(s.createdAt)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
function bindSettlementActions(container) {
  qsa('[data-approve-settle]', container).forEach(b => b.addEventListener('click', () => { Settlements.approve(b.dataset.approveSettle); toast('تمت الموافقة على التسوية'); routeChanged(); }));
}

function openSettlementModal(accountId) {
  const acc = accountId ? getAccount(accountId) : null;
  openModal({
    title: 'تسوية جديدة', size: 'lg',
    body: `<div class="form-grid">
      <div class="field full"><label>الحساب <span class="req">*</span></label>
        <select class="select" id="sAccount">${DB.accounts.map(a => `<option value="${a.id}" ${acc && acc.id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>المبلغ المتوقع <span class="req">*</span></label><input class="input" type="number" id="sExpected" value="${acc ? acc.currentBalance : ''}"></div>
      <div class="field"><label>المبلغ الفعلي <span class="req">*</span></label><input class="input" type="number" id="sActual"></div>
      <div class="field full"><label>سبب الفرق (إن وجد)</label><input class="input" id="sReasonDiff" placeholder="مثال: فرق في عد النقدية"></div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="sNotes"></textarea></div>
    </div>
    <div id="sPreview" class="small text-2" style="margin-top:8px"></div>`,
    foot: `<button class="btn btn-primary" id="sConfirm">حفظ التسوية</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      const preview = () => {
        const e = Number(qs('#sExpected', ov).value) || 0, a = Number(qs('#sActual', ov).value) || 0;
        qs('#sPreview', ov).innerHTML = `الفرق: <b class="${a - e < 0 ? 'neg' : a - e > 0 ? 'pos' : ''}">${fmtMoney(a - e)}</b> - ${a - e === 0 ? 'مطابقة' : 'يوجد فرق يتطلب مراجعة'}`;
      };
      qs('#sExpected', ov).addEventListener('input', preview); qs('#sActual', ov).addEventListener('input', preview); preview();
      qs('#sConfirm', ov).addEventListener('click', () => {
        const expected = Number(qs('#sExpected', ov).value), actual = Number(qs('#sActual', ov).value);
        if (!(expected >= 0) || qs('#sActual', ov).value === '') { toast('أدخل المبلغ المتوقع والفعلي', 'err'); return; }
        Settlements.create({ accountId: qs('#sAccount', ov).value, expected, actual, notes: qs('#sNotes', ov).value.trim(), reasonDiff: qs('#sReasonDiff', ov).value.trim() });
        closeOverlay(); toast('تم حفظ التسوية'); routeChanged();
      });
    }
  });
}

function viewSettlements() {
  const list = DB.settlements.slice();
  const mismatches = list.filter(s => s.status === 'Mismatch').length;
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'التسويات' }])}
    ${pageHeader('التسويات', `${fmtNum(list.length)} تسوية - ${mismatches} بها فرق يحتاج مراجعة`, Permissions.can('settlements') ? `<button class="btn btn-primary" id="btnNewSettle">${icon('plus')} تسوية جديدة</button>` : '')}
    <div class="card"><div class="table-wrap">${settlementTableHtml(list)}</div></div>
  `;
  return { html, mount(container) { bindSettlementActions(container); qs('#btnNewSettle', container)?.addEventListener('click', () => openSettlementModal()); } };
}

/* ---------------- Expenses ---------------- */
function viewExpenses() {
  const list = DB.expenses.slice();
  const total = sumBy(list, e => e.amount);
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'المصروفات' }])}
    ${pageHeader('المصروفات', `${fmtNum(list.length)} مصروف - إجمالي ${fmtMoney(total)}`, Permissions.can('expenses') ? `<button class="btn btn-primary" id="btnNewExpense">${icon('plus')} مصروف جديد</button>` : '')}
    <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>الفئة</th><th>المبلغ</th><th>الحساب</th><th>التاريخ</th><th>ملاحظات</th></tr></thead><tbody>
      ${list.length ? list.map(e => `<tr><td class="ltr">${esc(e.code)}</td><td>${esc(e.category)}</td><td class="num neg">${fmtMoney(e.amount)}</td><td>${esc(getAccount(e.accountId)?.name || '-')}</td><td>${fmtDate(e.date)}</td><td class="wrap">${esc(e.notes || '-')}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('minus', 'لا توجد مصروفات', '')}</td></tr>`}
    </tbody></table></div></div>
  `;
  return { html, mount(container) { qs('#btnNewExpense', container)?.addEventListener('click', openNewExpenseModal); } };
}
function openNewExpenseModal() {
  openModal({
    title: 'مصروف جديد',
    body: `<div class="form-grid">
      <div class="field full"><label>الفئة <span class="req">*</span></label><input class="input" id="exCat" placeholder="مثال: إيجار، رواتب، صيانة"></div>
      <div class="field"><label>المبلغ <span class="req">*</span></label><input class="input" type="number" id="exAmount"></div>
      <div class="field"><label>التاريخ</label><input class="input" type="date" id="exDate" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field full"><label>الحساب (اختياري)</label><select class="select" id="exAccount"><option value="">بدون ربط بحساب</option>${DB.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="exNotes"></textarea></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="exConfirm">حفظ المصروف</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => qs('#exConfirm', ov).addEventListener('click', () => {
      const category = qs('#exCat', ov).value.trim(); const amount = Number(qs('#exAmount', ov).value);
      if (!category || !(amount > 0)) { toast('أدخل الفئة والمبلغ بشكل صحيح', 'err'); return; }
      try {
        Finance.addExpense({ category, amount, date: new Date(qs('#exDate', ov).value).toISOString(), accountId: qs('#exAccount', ov).value || null, notes: qs('#exNotes', ov).value.trim() });
        closeOverlay(); toast('تم تسجيل المصروف'); routeChanged();
      } catch (err) { toast('تعذر تسجيل المصروف - تحقق من رصيد الحساب', 'err'); }
    })
  });
}

/* ---------------- Revenues ---------------- */
function viewRevenues() {
  const list = DB.revenues.slice();
  const total = sumBy(list, r => r.amount);
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الإيرادات' }])}
    ${pageHeader('الإيرادات', `${fmtNum(list.length)} إيراد - إجمالي ${fmtMoney(total)}`, Permissions.can('revenues') ? `<button class="btn btn-primary" id="btnNewRevenue">${icon('plus')} إيراد جديد</button>` : '')}
    <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>المصدر</th><th>المبلغ</th><th>الحساب</th><th>التاريخ</th><th>ملاحظات</th></tr></thead><tbody>
      ${list.length ? list.map(r => `<tr><td class="ltr">${esc(r.code)}</td><td>${esc(r.source)}</td><td class="num pos">${fmtMoney(r.amount)}</td><td>${esc(getAccount(r.accountId)?.name || '-')}</td><td>${fmtDate(r.date)}</td><td class="wrap">${esc(r.notes || '-')}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('plusCircle', 'لا توجد إيرادات', '')}</td></tr>`}
    </tbody></table></div></div>
  `;
  return { html, mount(container) { qs('#btnNewRevenue', container)?.addEventListener('click', openNewRevenueModal); } };
}
function openNewRevenueModal() {
  openModal({
    title: 'إيراد جديد',
    body: `<div class="form-grid">
      <div class="field full"><label>المصدر <span class="req">*</span></label><input class="input" id="rvSource" placeholder="مثال: عمولة شريك"></div>
      <div class="field"><label>المبلغ <span class="req">*</span></label><input class="input" type="number" id="rvAmount"></div>
      <div class="field"><label>التاريخ</label><input class="input" type="date" id="rvDate" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field full"><label>الحساب (اختياري)</label><select class="select" id="rvAccount"><option value="">بدون ربط بحساب</option>${DB.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="rvNotes"></textarea></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="rvConfirm">حفظ الإيراد</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => qs('#rvConfirm', ov).addEventListener('click', () => {
      const source = qs('#rvSource', ov).value.trim(); const amount = Number(qs('#rvAmount', ov).value);
      if (!source || !(amount > 0)) { toast('أدخل المصدر والمبلغ بشكل صحيح', 'err'); return; }
      Finance.addRevenue({ source, amount, date: new Date(qs('#rvDate', ov).value).toISOString(), accountId: qs('#rvAccount', ov).value || null, notes: qs('#rvNotes', ov).value.trim() });
      closeOverlay(); toast('تم تسجيل الإيراد'); routeChanged();
    })
  });
}

/* ---------------- Profit & Finance ---------------- */
function viewProfit() {
  const range = location.hash.includes('?') ? new URLSearchParams(location.hash.split('?')[1]).get('range') || 'month' : 'month';
  const now = new Date();
  let from = null;
  if (range === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  else if (range === 'week') from = daysAgoDate(7).toISOString();
  else if (range === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  else if (range === 'year') from = new Date(now.getFullYear(), 0, 1).toISOString();
  const p = Profit.compute({ from });
  const rangeLabels = { today: 'اليوم', week: 'هذا الأسبوع', month: 'هذا الشهر', year: 'هذا العام', all: 'كل الفترات' };

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الأرباح والمالية' }])}
    ${pageHeader('الأرباح والمالية', 'صافي الربح = عمولات النظام + إيرادات أخرى − رسوم المزودين − المصروفات')}
    <div class="seg section" id="rangeSeg">
      ${Object.entries(rangeLabels).map(([k, v]) => `<label class="${range === k ? 'on' : ''}" data-val="${k}">${v}</label>`).join('')}
    </div>
    <div class="kpis section">
      <div class="kpi"><div class="lbl">${icon('percent')} عمولات النظام</div><div class="val pos">${fmtMoney(p.commissions)}</div></div>
      <div class="kpi"><div class="lbl">${icon('plusCircle')} إيرادات أخرى</div><div class="val pos">${fmtMoney(p.revenues)}</div></div>
      <div class="kpi"><div class="lbl">${icon('minus')} رسوم المزودين</div><div class="val neg">${fmtMoney(p.providerFees)}</div></div>
      <div class="kpi"><div class="lbl">${icon('minus')} المصروفات</div><div class="val neg">${fmtMoney(p.expenses)}</div></div>
      <div class="kpi hl"><div class="lbl">${icon('trend')} صافي الربح</div><div class="val ${p.netProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(p.netProfit)}</div></div>
    </div>
    <div class="card card-pad section">
      <div class="section-title">معادلة الربح - ${rangeLabels[range]}</div>
      <div class="formula" style="flex-wrap:wrap">
        <div class="term"><small>عمولات النظام</small>${fmtMoney(p.commissions)}</div><span class="op">+</span>
        <div class="term"><small>إيرادات أخرى</small>${fmtMoney(p.revenues)}</div><span class="op">−</span>
        <div class="term"><small>رسوم المزودين</small>${fmtMoney(p.providerFees)}</div><span class="op">−</span>
        <div class="term"><small>المصروفات</small>${fmtMoney(p.expenses)}</div><span class="op">=</span>
        <div class="term" style="background:var(--primary-50);border-color:var(--primary)"><small>صافي الربح</small>${fmtMoney(p.netProfit)}</div>
      </div>
      <div class="muted small" style="margin-top:10px">محسوب على ${fmtNum(p.txnCount)} عملية مكتملة خلال الفترة المحددة.</div>
    </div>
  `;
  return {
    html,
    mount(container) {
      qsa('#rangeSeg label', container).forEach(l => l.addEventListener('click', () => location.hash = '/profit?range=' + l.dataset.val));
    }
  };
}
