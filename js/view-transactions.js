/* SOFT STREAM — العمليات */
function txnTableHtml(list, opts = {}) {
  if (!list.length) return emptyState('list', 'لا توجد عمليات', 'لم يتم العثور على عمليات مطابقة لعوامل التصفية');
  return `<table class="tbl"><thead><tr>
    <th>الكود</th><th>النوع</th><th>العميل</th><th>مزود الخدمة</th><th>الحساب</th><th>المبلغ</th><th>الصافي</th><th>الحالة</th><th>التاريخ</th>
  </tr></thead><tbody>
    ${list.map(t => `<tr class="click ${t.status === 'cancelled' ? 'r-cancel' : ''}" data-txn-row="${t.id}">
      <td class="ltr">${esc(t.code)}</td>
      <td>${txnTypeBadge(t.type)}</td>
      <td>${esc(getCustomer(t.customerId)?.name || '-')}</td>
      <td>${providerTag(t.providerId)}</td>
      <td>${esc(getAccount(t.accountId)?.name || '-')}</td>
      <td class="num amt">${fmtMoney(t.amount)}</td>
      <td class="num">${fmtMoney(t.netAmount)}</td>
      <td>${txnStatusBadge(t.status)}</td>
      <td>${fmtDateTime(t.createdAt)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
function bindTxnTableRowClicks(container) {
  qsa('[data-txn-row]', container).forEach(r => r.addEventListener('click', () => location.hash = `/transactions/${r.dataset.txnRow}`));
}

function viewTxnList(params) {
  let list = DB.transactions.slice();
  const type = params.get('type') || '';
  const provider = params.get('provider') || '';
  const accountId = params.get('account') || '';
  const customerId = params.get('customer') || '';
  const status = params.get('status') || '';
  const orderId = params.get('order') || '';
  const q = params.get('q') || '';

  if (type) list = list.filter(t => t.type === type);
  if (provider) list = list.filter(t => t.providerId === provider);
  if (accountId) list = list.filter(t => t.accountId === accountId);
  if (customerId) list = list.filter(t => t.customerId === customerId);
  if (status) list = list.filter(t => t.status === status);
  if (orderId) list = list.filter(t => t.externalOrderId === orderId);
  if (q) list = list.filter(t => t.code.toLowerCase().includes(q.toLowerCase()) || (getCustomer(t.customerId)?.name || '').includes(q));
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const { rows, page, pages, total } = paginate(list, Number(params.get('page')) || 1, 15);
  const totalAmount = sumBy(list, t => t.amount);

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'العمليات' }])}
    ${pageHeader('العمليات', `${fmtNum(total)} عملية - إجمالي القيمة ${fmtMoney(totalAmount)}`, `<a href="#/new-transaction" class="btn btn-primary">${icon('plusCircle')} عملية جديدة</a> <button class="btn" id="btnExport">${icon('download')} تصدير Excel</button> <button class="btn" id="btnPrint">${icon('print')} طباعة</button>`)}
    <div class="card">
      <div class="filters">
        <div class="f wide"><label>بحث</label><input class="input" id="fq" value="${esc(q)}" placeholder="كود العملية أو اسم العميل"></div>
        <div class="f"><label>النوع</label><select class="select" id="fType"><option value="">الكل</option>${Object.entries(TXN_TYPE_AR).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="f"><label>مزود الخدمة</label><select class="select" id="fProvider"><option value="">الكل</option>${DB.providers.map(p => `<option value="${p.id}" ${provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="f"><label>الحساب</label><select class="select" id="fAccount"><option value="">الكل</option>${DB.accounts.map(a => `<option value="${a.id}" ${accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="f"><label>الحالة</label><select class="select" id="fStatus"><option value="">الكل</option>${Object.entries(TXN_STATUS_AR).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <button class="btn" id="btnFilter">${icon('filter')} تطبيق</button>
      </div>
      <div class="table-wrap">${txnTableHtml(rows)}</div>
      ${pagerHtml(page, pages, total, 'عملية')}
    </div>
  `;
  return {
    html,
    mount(container) {
      bindTxnTableRowClicks(container);
      const apply = (overridePage) => {
        const sp = new URLSearchParams();
        const v = id => qs('#' + id, container).value;
        if (v('fq').trim()) sp.set('q', v('fq').trim());
        if (v('fType')) sp.set('type', v('fType'));
        if (v('fProvider')) sp.set('provider', v('fProvider'));
        if (v('fAccount')) sp.set('account', v('fAccount'));
        if (v('fStatus')) sp.set('status', v('fStatus'));
        if (orderId) sp.set('order', orderId);
        if (overridePage) sp.set('page', overridePage);
        location.hash = '/transactions' + (sp.toString() ? '?' + sp.toString() : '');
      };
      qs('#btnFilter', container).addEventListener('click', () => apply());
      qsa('[data-page]', container).forEach(b => b.addEventListener('click', () => { if (!b.disabled) apply(b.dataset.page); }));
      qs('#btnPrint', container).addEventListener('click', () => window.print());
      qs('#btnExport', container).addEventListener('click', () => exportCsv(rows.map(t => ({
        الكود: t.code, النوع: TXN_TYPE_AR[t.type], العميل: getCustomer(t.customerId)?.name || '', المزود: getProvider(t.providerId)?.name || '',
        الحساب: getAccount(t.accountId)?.name || '', المبلغ: t.amount, العمولة: t.commissionAmount, الرسوم: t.feeAmount, الصافي: t.netAmount, الحالة: TXN_STATUS_AR[t.status], التاريخ: fmtDateTime(t.createdAt),
      })), 'العمليات'));
    }
  };
}

function exportCsv(rows, filename) {
  if (!rows.length) { toast('لا توجد بيانات للتصدير', 'warn'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
  toast('تم تصدير الملف بنجاح');
}

function viewTxnDetails(id) {
  const t = getTxn(id);
  if (!t) return { html: emptyState('alertCircle', 'العملية غير موجودة', '', '<a href="#/transactions" class="btn btn-primary">عودة للعمليات</a>') };
  const customer = getCustomer(t.customerId); const acc = getAccount(t.accountId); const provider = getProvider(t.providerId);
  const order = t.externalOrderId ? getOrder(t.externalOrderId) : null;
  const canCancel = Permissions.can('overrides') && t.status === 'completed';

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'العمليات', href: '#/transactions' }, { label: t.code }])}
    ${pageHeader(t.code, `${TXN_TYPE_AR[t.type]} - ${fmtDateTime(t.createdAt)}`, `
      ${txnStatusBadge(t.status)}
      ${canCancel ? `<button class="btn btn-danger" id="btnCancelTxn">${icon('trash')} إلغاء العملية</button>` : ''}
      <button class="btn" onclick="window.print()">${icon('print')} طباعة</button>
    `)}

    <div class="grid g-2">
      <div class="card card-pad">
        <div class="section-title">بيانات العملية</div>
        <div class="kv"><span>النوع</span><span>${txnTypeBadge(t.type)}</span></div>
        <div class="kv"><span>العميل</span><span><a href="#/customers/${t.customerId}">${esc(customer?.name || '-')}</a></span></div>
        <div class="kv"><span>مزود الخدمة</span><span>${providerTag(t.providerId)}</span></div>
        <div class="kv"><span>الحساب</span><span><a href="#/accounts/${t.accountId}">${esc(acc?.name || '-')}</a></span></div>
        ${t.destAccountId ? `<div class="kv"><span>الحساب المستقبل</span><span><a href="#/accounts/${t.destAccountId}">${esc(getAccount(t.destAccountId)?.name || '-')}</a></span></div>` : ''}
        ${t.type === 'transfer' ? `<div class="kv"><span>المستفيد</span><span>${esc(t.beneficiaryName)} - ${esc(t.beneficiaryPhone)}</span></div>` : `<div class="kv"><span>رقم العميل</span><span class="ltr">${esc(t.beneficiaryPhone)}</span></div>`}
        <div class="kv"><span>الموظف المنفذ</span><span>${esc(t.employeeName)}</span></div>
        ${order ? `<div class="kv"><span>الطلب الخارجي</span><span><a href="#/orders/${order.id}">${esc(order.code)}</a></span></div>` : ''}
        ${t.proofName ? `<div class="kv"><span>الإثبات</span><span>${esc(t.proofName)}</span></div>` : ''}
        ${t.notes ? `<div class="kv"><span>ملاحظات</span><span>${esc(t.notes)}</span></div>` : ''}
        <div class="kv"><span>تاريخ الإنشاء</span><span>${fmtDateTime(t.createdAt)}</span></div>
        <div class="kv"><span>آخر تحديث</span><span>${fmtDateTime(t.updatedAt)}</span></div>
        ${t.status === 'cancelled' ? `<div class="alert a-danger" style="margin-top:12px">${icon('alertCircle')}<div><div class="alert-title">عملية ملغاة</div>السبب: ${esc(t.cancelReason)}<br>بتاريخ ${fmtDateTime(t.cancelledAt)}</div></div>` : ''}
        ${t.overrideUsed ? `<div class="alert a-warn" style="margin-top:12px">${icon('alertTriangle')}<div>تم تنفيذ هذه العملية بتجاوز الحد بإذن مدير. السبب: ${esc(t.overrideReason)}</div></div>` : ''}
      </div>
      <div class="card card-pad">
        <div class="section-title">المبلغ والخصومات</div>
        <div class="kv"><span>المبلغ الإجمالي</span><span>${fmtMoney(t.amount)}</span></div>
        <div class="kv"><span>العمولة (${t.commissionRate}%)</span><span>${fmtMoney(t.commissionAmount)}</span></div>
        <div class="kv"><span>رسوم المزود</span><span>${fmtMoney(t.feeAmount)}</span></div>
        <div class="kv total"><span>الصافي</span><span>${fmtMoney(t.netAmount)}</span></div>
        <div class="section-title" style="margin-top:20px">تأثير الحساب</div>
        <div class="formula"><div class="term"><small>الرصيد قبل</small>${fmtMoney(t.balanceBefore)}</div><span class="op">←</span><div class="term" style="background:var(--primary-50);border-color:var(--primary)"><small>الرصيد بعد</small>${fmtMoney(t.balanceAfter)}</div></div>
      </div>
    </div>
  `;
  return {
    html,
    mount(container) {
      qs('#btnCancelTxn', container)?.addEventListener('click', () => {
        confirmDialog({
          title: 'إلغاء العملية', message: `سيتم إلغاء العملية ${t.code} وعكس الحركة المالية على الحساب. هذا الإجراء لا يمكن التراجع عنه.`,
          reasonRequired: true, reasonLabel: 'سبب الإلغاء', confirmText: 'تأكيد الإلغاء',
          onConfirm: (reason) => { Txns.cancel(t.id, reason, currentUser().id); toast('تم إلغاء العملية وعكس الحركة المالية'); routeChanged(); },
        });
      });
    }
  };
}
