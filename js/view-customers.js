/* SOFT STREAM — العملاء */
function viewCustomersList(params) {
  const q = (params.get('q') || '').trim();
  let list = DB.customers.filter(c => !q || c.name.includes(q) || c.phone.includes(q) || c.code.toLowerCase().includes(q.toLowerCase()));
  const withStats = list.map(c => ({ c, stats: Txns.customerStats(c.id) })).sort((a, b) => new Date(b.c.createdAt) - new Date(a.c.createdAt));
  const { rows, page, pages, total } = paginate(withStats, Number(params.get('page')) || 1, 12);

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'العملاء' }])}
    ${pageHeader('العملاء', `${fmtNum(DB.customers.length)} عميل مسجل في النظام`, `<button class="btn btn-primary" id="btnNewCust">${icon('plus')} إضافة عميل</button>`)}
    <div class="card">
      <div class="filters"><div class="f wide"><label>بحث</label><input class="input" id="fq" value="${esc(q)}" placeholder="اسم أو رقم هاتف أو كود العميل"></div><button class="btn" id="btnFilter">${icon('filter')} تطبيق</button></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف</th><th>عدد العمليات</th><th>إجمالي القيمة</th><th>آخر عملية</th></tr></thead><tbody>
        ${rows.length ? rows.map(({ c, stats }) => `<tr class="click" data-cust-row="${c.id}">
          <td class="ltr">${esc(c.code)}</td><td class="bold">${esc(c.name)}</td><td class="ltr">${esc(c.phone)}</td>
          <td class="num">${fmtNum(stats.count)}</td><td class="num">${fmtMoney(stats.total)}</td>
          <td>${stats.last ? fmtDateTime(stats.last.createdAt) : '-'}</td>
        </tr>`).join('') : `<tr><td colspan="6">${emptyState('users', 'لا يوجد عملاء', '')}</td></tr>`}
      </tbody></table></div>
      ${pagerHtml(page, pages, total, 'عميل')}
    </div>
  `;
  return {
    html,
    mount(container) {
      qsa('[data-cust-row]', container).forEach(r => r.addEventListener('click', () => location.hash = `/customers/${r.dataset.custRow}`));
      qs('#btnFilter', container).addEventListener('click', () => { const v = qs('#fq', container).value.trim(); location.hash = '/customers' + (v ? '?q=' + encodeURIComponent(v) : ''); });
      qsa('[data-page]', container).forEach(b => b.addEventListener('click', () => { if (!b.disabled) { const sp = new URLSearchParams(); if (q) sp.set('q', q); sp.set('page', b.dataset.page); location.hash = '/customers?' + sp.toString(); } }));
      qs('#btnNewCust', container).addEventListener('click', openNewCustomerModal);
    }
  };
}

function openNewCustomerModal() {
  openModal({
    title: 'إضافة عميل جديد',
    body: `<div class="form-grid">
      <div class="field full"><label>اسم العميل <span class="req">*</span></label><input class="input" id="ncName" placeholder="الاسم الكامل"></div>
      <div class="field full"><label>رقم الهاتف <span class="req">*</span></label><input class="input ltr" id="ncPhone" placeholder="01000000000"></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="ncConfirm">إضافة العميل</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => qs('#ncConfirm', ov).addEventListener('click', () => {
      const name = qs('#ncName', ov).value.trim(); const phone = qs('#ncPhone', ov).value.trim();
      if (!name || !phone) { toast('يرجى إدخال جميع الحقول', 'err'); return; }
      const c = { id: uid('cust'), code: nextCode('cust', 'CUS'), name, phone, createdAt: new Date().toISOString() };
      DB.customers.push(c); Audit.log({ action: 'تم إنشاء عميل جديد', module: 'العملاء', recordRef: c.code, newValues: c }); save();
      closeOverlay(); toast('تم إضافة العميل بنجاح'); location.hash = `/customers/${c.id}`;
    })
  });
}

function viewCustomerDetails(id) {
  const c = getCustomer(id);
  if (!c) return { html: emptyState('alertCircle', 'العميل غير موجود', '', '<a href="#/customers" class="btn btn-primary">عودة للعملاء</a>') };
  const tab = (new URLSearchParams(location.hash.split('?')[1] || '')).get('tab') || 'overview';
  const all = DB.transactions.filter(t => t.customerId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const stats = Txns.customerStats(id);
  const tabs = [['overview', 'نظرة عامة'], ['transactions', 'العمليات'], ['transfers', 'التحويلات'], ['withdrawals', 'السحوبات'], ['deposits', 'الإيداعات'], ['summary', 'الملخص المالي'], ['activity', 'النشاط']];

  let body = '';
  if (tab === 'overview' || tab === 'summary') {
    body = `<div class="kpis section">
      <div class="kpi"><div class="lbl">عدد العمليات</div><div class="val">${fmtNum(stats.count)}</div></div>
      <div class="kpi hl"><div class="lbl">إجمالي القيمة</div><div class="val">${fmtMoney(stats.total)}</div></div>
      <div class="kpi"><div class="lbl">إجمالي التحويلات</div><div class="val">${fmtMoney(stats.transferTotal)}</div></div>
      <div class="kpi"><div class="lbl">إجمالي السحوبات</div><div class="val">${fmtMoney(stats.withdrawalTotal)}</div></div>
      <div class="kpi"><div class="lbl">إجمالي الإيداعات</div><div class="val">${fmtMoney(stats.depositTotal)}</div></div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">آخر العمليات</div></div><div class="table-wrap">${txnTableHtml(all.slice(0, 8))}</div></div>`;
  } else if (tab === 'transactions') body = `<div class="card"><div class="table-wrap">${txnTableHtml(all)}</div></div>`;
  else if (tab === 'transfers') body = `<div class="card"><div class="table-wrap">${txnTableHtml(all.filter(t => t.type === 'transfer'))}</div></div>`;
  else if (tab === 'withdrawals') body = `<div class="card"><div class="table-wrap">${txnTableHtml(all.filter(t => t.type === 'withdrawal'))}</div></div>`;
  else if (tab === 'deposits') body = `<div class="card"><div class="table-wrap">${txnTableHtml(all.filter(t => t.type === 'deposit'))}</div></div>`;
  else if (tab === 'activity') {
    const logs = DB.auditLogs.filter(a => a.newValues && JSON.stringify(a.newValues).includes(id)).slice(0, 30);
    body = `<div class="card"><div class="table-wrap">${auditTableHtml(logs)}</div></div>`;
  }

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'العملاء', href: '#/customers' }, { label: c.name }])}
    ${pageHeader(c.name, `${c.code} - ${c.phone}`, `<a href="#/new-transaction" class="btn btn-primary" id="btnNewTxnForCust">${icon('plusCircle')} عملية جديدة لهذا العميل</a>`)}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/customers/${id}?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${body}
  `;
  return {
    html,
    mount(container) {
      bindTxnTableRowClicks(container);
      qs('#btnNewTxnForCust', container)?.addEventListener('click', (e) => { e.preventDefault(); startWizard({}); WZ.customerId = id; WZ.customerMode = 'existing'; });
    }
  };
}
