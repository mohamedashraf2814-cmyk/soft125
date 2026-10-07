/* SOFT STREAM — الطلبات الخارجية */
function orderCardHtml(o) {
  const ec = getExternalCustomer(o.externalCustomerId);
  const pct = Orders.progress(o);
  return `<div class="card order-card card-pad" data-order-card="${o.id}" style="cursor:pointer">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="bold" style="font-size:16px">${esc(o.code)}</div><div class="muted small">${esc(ec?.name || '-')}</div></div>
      ${orderStatusBadge(o.status)}
    </div>
    <div class="amounts" style="margin-top:12px">
      <div><span>الهدف</span><b>${fmtMoney(o.target, false)}</b></div>
      <div><span>المحصل</span><b class="pos">${fmtMoney(o.collected, false)}</b></div>
      <div><span>المتبقي</span><b>${fmtMoney(Math.max(0, o.target - o.collected), false)}</b></div>
    </div>
    <div class="usage-line" style="margin-top:10px"><span>التقدم</span><span>${pct}%</span></div>
    <div class="progress"><i class="${pct >= 100 ? 'ok' : 'warn'}" style="width:${clamp(pct, 0, 100)}%"></i></div>
    <div class="muted small" style="margin-top:8px">الموعد النهائي: ${o.deadline ? fmtDate(o.deadline) : '-'} - ${esc(o.linkedTxnIds?.length || 0)} عملية مرتبطة</div>
  </div>`;
}

function viewOrdersList(params) {
  const status = params.get('status') || '';
  let list = DB.externalOrders.filter(o => !status || o.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الطلبات الخارجية' }])}
    ${pageHeader('الطلبات الخارجية', `${fmtNum(DB.externalOrders.length)} طلب - للعملاء والشركات خارج نطاق عمليات الصرافة العادية`, `<button class="btn btn-primary" id="btnNewOrder">${icon('plus')} طلب خارجي جديد</button>`)}
    <div class="card">
      <div class="filters"><div class="f"><label>الحالة</label><select class="select" id="fStatus"><option value="">الكل</option>${Object.entries(ORDER_STATUS_AR).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div><button class="btn" id="btnFilter">${icon('filter')} تطبيق</button></div>
      <div class="card-body">${list.length ? `<div class="grid g-auto">${list.map(orderCardHtml).join('')}</div>` : emptyState('box', 'لا توجد طلبات خارجية', '')}</div>
    </div>
  `;
  return {
    html,
    mount(container) {
      qsa('[data-order-card]', container).forEach(c => c.addEventListener('click', () => location.hash = `/orders/${c.dataset.orderCard}`));
      qs('#btnFilter', container).addEventListener('click', () => { const v = qs('#fStatus', container).value; location.hash = '/orders' + (v ? '?status=' + v : ''); });
      qs('#btnNewOrder', container).addEventListener('click', openNewOrderModal);
    }
  };
}

function openNewOrderModal() {
  openModal({
    title: 'طلب خارجي جديد', size: 'lg',
    body: `<div class="form-grid">
      <div class="field full"><label>العميل الخارجي <span class="req">*</span></label><select class="select" id="oCust">${DB.externalCustomers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>المبلغ المستهدف <span class="req">*</span></label><input class="input" type="number" id="oTarget" placeholder="0.00"></div>
      <div class="field"><label>نوع المبلغ</label>
        <div class="seg" id="oType"><label class="on" data-val="gross">إجمالي (Gross)</label><label data-val="net">صافي (Net)</label></div>
      </div>
      <div class="field"><label>الموعد النهائي</label><input class="input" type="date" id="oDeadline"></div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="oNotes"></textarea></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="oConfirm">إنشاء الطلب</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      let amountType = 'gross';
      qsa('#oType label', ov).forEach(l => l.addEventListener('click', () => { qsa('#oType label', ov).forEach(x => x.classList.remove('on')); l.classList.add('on'); amountType = l.dataset.val; }));
      qs('#oConfirm', ov).addEventListener('click', () => {
        const target = Number(qs('#oTarget', ov).value);
        if (!(target > 0)) { toast('أدخل مبلغاً مستهدفاً صحيحاً', 'err'); return; }
        const order = Orders.create({ externalCustomerId: qs('#oCust', ov).value, target, amountType, deadline: qs('#oDeadline', ov).value ? new Date(qs('#oDeadline', ov).value).toISOString() : null, notes: qs('#oNotes', ov).value.trim() });
        order.status = 'Open'; save();
        closeOverlay(); toast('تم إنشاء الطلب الخارجي'); location.hash = `/orders/${order.id}`;
      });
    }
  });
}

function viewOrderDetails(id) {
  const o = getOrder(id);
  if (!o) return { html: emptyState('alertCircle', 'الطلب غير موجود', '', '<a href="#/orders" class="btn btn-primary">عودة للطلبات</a>') };
  const ec = getExternalCustomer(o.externalCustomerId);
  const linked = DB.transactions.filter(t => (o.linkedTxnIds || []).includes(t.id));
  const pct = Orders.progress(o);
  const canCancel = !['Completed', 'Cancelled'].includes(o.status);

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الطلبات الخارجية', href: '#/orders' }, { label: o.code }])}
    ${pageHeader(o.code, esc(ec?.name || ''), `
      ${orderStatusBadge(o.status)}
      <a href="#/transactions?order=${o.id}" class="btn">${icon('list')} العمليات المرتبطة</a>
      ${canCancel ? `<button class="btn btn-danger" id="btnCancelOrder">${icon('trash')} إلغاء الطلب</button>` : ''}
    `)}

    <div class="grid g-2">
      <div class="card card-pad">
        <div class="section-title">تقدّم التجميع</div>
        <div class="formula" style="margin-bottom:14px">
          <div class="term"><small>الهدف</small>${fmtMoney(o.target)}</div><span class="op">←</span>
          <div class="term" style="background:var(--primary-50);border-color:var(--primary)"><small>المحصل</small>${fmtMoney(o.collected)}</div>
        </div>
        <div class="usage-line"><span>نسبة الإكمال</span><span>${pct}%</span></div>
        <div class="progress lg"><i class="${pct >= 100 ? 'ok' : 'warn'}" style="width:${clamp(pct, 0, 100)}%"></i></div>
        <div class="kv" style="margin-top:14px"><span>المتبقي</span><span>${fmtMoney(Math.max(0, o.target - o.collected))}</span></div>
        <div class="kv"><span>نوع المبلغ</span><span>${o.amountType === 'gross' ? 'إجمالي (Gross)' : 'صافي (Net)'}</span></div>
        <div class="kv"><span>الموعد النهائي</span><span>${o.deadline ? fmtDate(o.deadline) : '-'}</span></div>
        <div class="kv"><span>تاريخ الإنشاء</span><span>${fmtDate(o.createdAt)}</span></div>
        ${o.notes ? `<div class="kv"><span>ملاحظات</span><span>${esc(o.notes)}</span></div>` : ''}
      </div>
      <div class="card card-pad">
        <div class="section-title">العميل الخارجي</div>
        <div class="kv"><span>الاسم</span><span>${esc(ec?.name || '-')}</span></div>
        <div class="kv"><span>الهاتف</span><span class="ltr">${esc(ec?.phone || '-')}</span></div>
        <div class="kv"><span>الشركة</span><span>${esc(ec?.company || '-')}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">العمليات المرتبطة (${linked.length})</div>
      <div class="card"><div class="table-wrap">${txnTableHtml(linked)}</div></div>
    </div>
  `;
  return {
    html,
    mount(container) {
      bindTxnTableRowClicks(container);
      qs('#btnCancelOrder', container)?.addEventListener('click', () => {
        confirmDialog({
          title: 'إلغاء الطلب الخارجي', message: `سيتم إلغاء الطلب ${o.code}. العمليات المرتبطة لن تُلغى تلقائياً.`,
          reasonRequired: true, confirmText: 'تأكيد الإلغاء',
          onConfirm: (reason) => { o.status = 'Cancelled'; o.notes = (o.notes ? o.notes + ' | ' : '') + 'سبب الإلغاء: ' + reason; Audit.log({ action: 'تم إلغاء طلب خارجي', module: 'الطلبات الخارجية', recordRef: o.code, newValues: { reason } }); save(); toast('تم إلغاء الطلب'); routeChanged(); },
        });
      });
    }
  };
}
