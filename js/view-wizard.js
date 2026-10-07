/* SOFT STREAM — معالج العملية الجديدة (تحويل / سحب / إيداع) */
let WZ = null;
const WZ_STEPS = [
  'نوع العملية', 'العميل', 'مزود الخدمة', 'الحساب', 'تفاصيل العملية',
  'المبلغ', 'العمولة والرسوم', 'الطلب الخارجي', 'الإثبات', 'المراجعة', 'إتمام العملية',
];

function startWizard(preset = {}) {
  WZ = {
    step: 1, type: preset.type || null,
    customerMode: 'existing', customerId: null, newCustomer: { name: '', phone: '' },
    providerId: null, accountId: preset.accountId || null, destAccountId: null,
    beneficiaryName: '', beneficiaryPhone: '', settlementMethod: 'نقدي',
    amount: '', linkOrder: 'no', externalOrderId: null,
    proofName: null, proofSkipped: false, notes: '',
    override: false, overrideReason: '', resultTxnId: null,
  };
  if (WZ.accountId) { const acc = getAccount(WZ.accountId); if (acc) WZ.providerId = acc.providerId; }
  if (location.hash === '#/new-transaction') routeChanged(); else location.hash = '/new-transaction';
}

function wzMaxReachable() {
  // how far the user is allowed to jump based on completed data
  let max = 1;
  if (WZ.type) max = 2;
  if (WZ.type && (WZ.customerId || (WZ.newCustomer.name && WZ.newCustomer.phone))) max = 3;
  if (max >= 3 && WZ.providerId) max = 4;
  if (max >= 4 && WZ.accountId) max = 5;
  if (max >= 5 && wzStep5Valid()) max = 6;
  if (max >= 6 && Number(WZ.amount) > 0) max = 7;
  if (max >= 7) max = 8;
  if (max >= 8 && (WZ.linkOrder === 'no' || WZ.externalOrderId)) max = 9;
  if (max >= 9 && (WZ.proofName || WZ.proofSkipped)) max = 10;
  if (max >= 10) max = 11;
  return max;
}
function wzStep5Valid() {
  if (WZ.type === 'transfer') return !!(WZ.beneficiaryName && WZ.beneficiaryPhone);
  if (WZ.type === 'withdrawal') return !!WZ.beneficiaryPhone;
  if (WZ.type === 'deposit') return !!WZ.beneficiaryPhone;
  return false;
}

function viewWizard() {
  if (!WZ) startWizard();
  const maxReach = wzMaxReachable();
  if (WZ.step > maxReach + 1) WZ.step = maxReach;

  const stepperHtml = `<div class="stepper">${WZ_STEPS.map((label, i) => {
    const n = i + 1;
    const cls = n === WZ.step ? 'cur' : n < WZ.step ? 'done' : n <= maxReach ? 'reach' : '';
    return `<div class="step ${cls}" data-goto="${n}"><span class="n">${n < WZ.step ? icon('check') : n}</span><span>${label}</span></div>`;
  }).join('')}</div>`;

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'عملية جديدة' }, { label: WZ_STEPS[WZ.step - 1] }])}
    ${pageHeader('عملية جديدة', 'اتبع الخطوات لإكمال العملية المالية بالترتيب')}
    ${stepperHtml}
    <div class="wiz">
      <div class="card wiz-main">
        <div class="card-body" id="wizBody">${wzStepBody()}</div>
        ${WZ.step < 11 ? `<div class="wiz-foot">
          <button class="btn btn-lg btn-primary" id="wzNext">${WZ.step === 10 ? 'إتمام العملية' : 'التالي ←'}</button>
          <button class="btn btn-lg" id="wzPrev" ${WZ.step === 1 ? 'disabled' : ''}>→ السابق</button>
        </div>` : ''}
      </div>
      ${WZ.step < 11 ? `<div class="wiz-side card card-pad">
        <div class="card-title" style="margin-bottom:10px">ملخص العملية</div>
        ${wzSideSummary()}
      </div>` : ''}
    </div>
  `;
  return { html, mount(container) { wzBindStep(container); wzBindNav(container); } };
}

function wzSideSummary() {
  const customer = WZ.customerId ? getCustomer(WZ.customerId) : null;
  const account = WZ.accountId ? getAccount(WZ.accountId) : null;
  const provider = WZ.providerId ? getProvider(WZ.providerId) : null;
  const fee = (WZ.providerId && Number(WZ.amount) > 0) ? Fees.compute(WZ.providerId, WZ.amount) : null;
  const rows = [
    ['نوع العملية', WZ.type ? TXN_TYPE_AR[WZ.type] : '-'],
    ['العميل', customer ? customer.name : (WZ.newCustomer.name || '-')],
    ['مزود الخدمة', provider ? provider.name : '-'],
    ['الحساب', account ? `${account.name}` : '-'],
  ];
  if (WZ.type === 'transfer') rows.push(['المستفيد', WZ.beneficiaryName || '-']);
  rows.push(['المبلغ', Number(WZ.amount) > 0 ? fmtMoney(WZ.amount) : '-']);
  if (fee) { rows.push(['العمولة', fmtMoney(fee.commissionAmount)]); rows.push(['رسوم المزود', fmtMoney(fee.feeAmount)]); rows.push(['الصافي', fmtMoney(fee.netAmount)]); }
  if (WZ.externalOrderId) rows.push(['الطلب الخارجي', getOrder(WZ.externalOrderId)?.code || '-']);
  return rows.map(([k, v]) => `<div class="summary-line"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
}

function wzStepBody() {
  switch (WZ.step) {
    case 1: return wzStep1();
    case 2: return wzStep2();
    case 3: return wzStep3();
    case 4: return wzStep4();
    case 5: return wzStep5();
    case 6: return wzStep6();
    case 7: return wzStep7();
    case 8: return wzStep8();
    case 9: return wzStep9();
    case 10: return wzStep10();
    case 11: return wzStep11();
    default: return '';
  }
}

function wzStep1() {
  const cards = [
    { k: 'transfer', ico: 'arrowSwap', cls: 't-transfer', title: 'تحويل', desc: 'تحويل أموال لمستفيد خارجي أو حساب داخلي آخر' },
    { k: 'withdrawal', ico: 'arrowDown', cls: 't-withdrawal', title: 'سحب', desc: 'سحب نقدي للعميل من أحد الحسابات التشغيلية' },
    { k: 'deposit', ico: 'arrowUp', cls: 't-deposit', title: 'إيداع', desc: 'إيداع مبلغ من العميل داخل أحد الحسابات' },
  ];
  return `<div class="wiz-q">اختر نوع العملية</div><div class="wiz-qs">حدد نوع العملية المالية المطلوب تنفيذها لبدء سير العمل.</div>
  <div class="grid g-3">${cards.map(c => `
    <button class="box big ${c.cls} ${WZ.type === c.k ? 'selected' : ''}" data-type="${c.k}">
      <div class="box-ico">${icon(c.ico)}</div>
      <div><div class="box-title">${c.title}</div><div class="box-desc">${c.desc}</div></div>
    </button>`).join('')}</div>`;
}

function wzStep2() {
  const customers = DB.customers;
  return `<div class="wiz-q">بيانات العميل</div><div class="wiz-qs">اختر عميلاً حالياً أو أضف عميلاً جديداً.</div>
  <div class="seg" id="custMode" style="margin-bottom:16px">
    <label class="${WZ.customerMode === 'existing' ? 'on' : ''}" data-val="existing">عميل حالي</label>
    <label class="${WZ.customerMode === 'new' ? 'on' : ''}" data-val="new">عميل جديد</label>
  </div>
  <div id="custExisting" class="${WZ.customerMode === 'existing' ? '' : 'hidden'}">
    <div class="field full"><label>اختر العميل</label>
      <select class="select" id="custSelect">
        <option value="">— اختر —</option>
        ${customers.map(c => `<option value="${c.id}" ${WZ.customerId === c.id ? 'selected' : ''}>${esc(c.name)} - ${esc(c.phone)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="custNew" class="${WZ.customerMode === 'new' ? '' : 'hidden'}">
    <div class="form-grid">
      <div class="field"><label>اسم العميل <span class="req">*</span></label><input class="input" id="newCustName" value="${esc(WZ.newCustomer.name)}" placeholder="اسم العميل الكامل"></div>
      <div class="field"><label>رقم الهاتف <span class="req">*</span></label><input class="input ltr" id="newCustPhone" value="${esc(WZ.newCustomer.phone)}" placeholder="01000000000"></div>
    </div>
  </div>
  <div class="ferr hidden" id="custErr">يرجى اختيار عميل أو إدخال بيانات عميل جديد كاملة</div>`;
}

function wzStep3() {
  return `<div class="wiz-q">مزود الخدمة</div><div class="wiz-qs">حدد مزود الخدمة المستخدم في تنفيذ العملية.</div>
  <div class="grid g-3">${DB.providers.map(p => `
    <button class="box ${WZ.providerId === p.id ? 'selected' : ''}" data-provider="${p.id}">
      <div class="box-ico">${icon('wallet')}</div>
      <div><div class="box-title">${esc(p.name)}</div><div class="box-desc">عمولة النظام ${Fees.commissionRate(p.id)}%</div></div>
    </button>`).join('')}</div>`;
}

function wzStep4() {
  const accs = DB.accounts.filter(a => !WZ.providerId || a.providerId === WZ.providerId).filter(a => a.status === 'نشط');
  return `<div class="wiz-q">اختر الحساب</div><div class="wiz-qs">الحسابات النشطة التابعة لمزود الخدمة المحدد.</div>
  <div class="grid g-auto-sm">${accs.map(a => `
    <button class="box ${WZ.accountId === a.id ? 'selected' : ''}" data-account="${a.id}" style="padding:14px">
      <div class="top" style="display:flex;justify-content:space-between;width:100%"><span class="bold">${esc(a.name)}</span>${providerTag(a.providerId)}</div>
      <div class="phone ltr small muted">${esc(a.phone)}</div>
      <div class="box-meta"><span>الرصيد المتاح</span><span class="bold">${fmtMoney(Accounts.available(a))}</span></div>
    </button>`).join('') || emptyState('wallet', 'لا توجد حسابات نشطة لهذا المزود', '')}</div>`;
}

function wzStep5() {
  if (WZ.type === 'transfer') {
    const otherAccs = DB.accounts.filter(a => a.id !== WZ.accountId && a.status === 'نشط');
    return `<div class="wiz-q">تفاصيل التحويل</div><div class="wiz-qs">أدخل بيانات المستفيد من التحويل.</div>
    <div class="form-grid">
      <div class="field"><label>اسم المستفيد <span class="req">*</span></label><input class="input" id="benName" value="${esc(WZ.beneficiaryName)}" placeholder="اسم المستفيد"></div>
      <div class="field"><label>رقم هاتف/حساب المستفيد <span class="req">*</span></label><input class="input ltr" id="benPhone" value="${esc(WZ.beneficiaryPhone)}" placeholder="01000000000"></div>
      <div class="field full">
        <label class="check"><input type="checkbox" id="internalToggle" ${WZ.destAccountId ? 'checked' : ''}> تحويل داخلي إلى أحد حسابات النظام (يتم إنشاء حركتين مرتبطتين بنفس المرجع)</label>
      </div>
      <div class="field full ${WZ.destAccountId || '' ? '' : ''}" id="destWrap" style="${WZ.destAccountId ? '' : 'display:none'}">
        <label>الحساب المستقبل</label>
        <select class="select" id="destAccount">
          <option value="">— اختر —</option>
          ${otherAccs.map(a => `<option value="${a.id}" ${WZ.destAccountId === a.id ? 'selected' : ''}>${esc(a.name)} - ${esc(a.phone)}</option>`).join('')}
        </select>
      </div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="txnNotes" placeholder="ملاحظات إضافية">${esc(WZ.notes)}</textarea></div>
    </div>`;
  }
  if (WZ.type === 'withdrawal') {
    return `<div class="wiz-q">تفاصيل السحب</div><div class="wiz-qs">أدخل بيانات مرجع العميل وطريقة التسوية.</div>
    <div class="form-grid">
      <div class="field"><label>رقم هاتف/مرجع العميل <span class="req">*</span></label><input class="input ltr" id="benPhone" value="${esc(WZ.beneficiaryPhone)}" placeholder="01000000000"></div>
      <div class="field"><label>طريقة التسوية</label><select class="select" id="settleMethod">${['نقدي', 'تحويل بنكي', 'أخرى'].map(s => `<option ${WZ.settlementMethod === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="txnNotes" placeholder="ملاحظات إضافية">${esc(WZ.notes)}</textarea></div>
    </div>`;
  }
  return `<div class="wiz-q">تفاصيل الإيداع</div><div class="wiz-qs">أدخل رقم هاتف/حساب العميل المودِع.</div>
  <div class="form-grid">
    <div class="field"><label>رقم هاتف/حساب العميل <span class="req">*</span></label><input class="input ltr" id="benPhone" value="${esc(WZ.beneficiaryPhone)}" placeholder="01000000000"></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="txnNotes" placeholder="ملاحظات إضافية">${esc(WZ.notes)}</textarea></div>
  </div>`;
}

function wzStep6() {
  const acc = getAccount(WZ.accountId);
  const amount = Number(WZ.amount) || 0;
  const cap = acc ? Accounts.checkCapacity(acc, amount, { override: WZ.override }) : null;
  const canOverride = Permissions.can('overrides');
  return `<div class="wiz-q">المبلغ</div><div class="wiz-qs">الرصيد المتاح في الحساب المحدد: <b>${fmtMoney(Accounts.available(acc))}</b></div>
  <div class="field full"><label>المبلغ (ج.م) <span class="req">*</span></label><input class="input input-lg ltr" type="number" min="1" id="amountInput" value="${WZ.amount}" placeholder="0.00"></div>
  <div id="capAlert" style="margin-top:14px">${amount > 0 && cap && !cap.ok ? wzCapacityAlert(cap, canOverride) : ''}</div>
  ${amount > 0 && cap && !cap.ok && (cap.limitDaily || cap.limitMonthly) && canOverride && !cap.reasons.some(r => r.includes('غير كافٍ')) ? `
  <div class="field full" style="margin-top:10px">
    <label class="check"><input type="checkbox" id="overrideCheck" ${WZ.override ? 'checked' : ''}> تجاوز الحد بإذن مدير/مشرف (يتطلب سبباً ويُسجَّل في سجل التدقيق)</label>
    <div id="overrideReasonWrap" style="${WZ.override ? '' : 'display:none'};margin-top:8px"><textarea class="textarea" id="overrideReason" placeholder="سبب التجاوز">${esc(WZ.overrideReason)}</textarea></div>
  </div>` : ''}
  <div class="usage-line" style="margin-top:18px"><span>الحد اليومي المتبقي</span><span>${fmtMoney(Math.max(0, acc.dailyLimit - acc.dailyUsed))}</span></div>
  <div class="progress"><i class="${usageTone(Accounts.dailyPct(acc))}" style="width:${clamp(Accounts.dailyPct(acc), 0, 100)}%"></i></div>`;
}
function wzCapacityAlert(cap, canOverride) {
  if (cap.reasons.some(r => r.includes('غير كافٍ'))) {
    return `<div class="alert a-danger">${icon('alertCircle')}<div><div class="alert-title">لا يمكن تنفيذ العملية، الرصيد المتاح غير كافٍ.</div>
      <div class="calc-table"><span>الرصيد المتاح</span><b>${fmtMoney(cap.avail)}</b><span>المبلغ المطلوب</span><b>${fmtMoney(Number(WZ.amount))}</b><span>الفرق</span><b>${fmtMoney(cap.shortfall)}</b></div></div></div>`;
  }
  return `<div class="alert a-warn">${icon('alertTriangle')}<div><div class="alert-title">العملية تتجاوز الحد المسموح لهذا الحساب.</div>
    ${canOverride ? 'يمكنك تفعيل التجاوز بإذن مدير مع توضيح السبب.' : 'يتطلب هذا التجاوز إذن مدير أو مشرف مخوَّل.'}</div></div>`;
}

function wzStep7() {
  const fee = Fees.compute(WZ.providerId, Number(WZ.amount) || 0);
  const provider = getProvider(WZ.providerId);
  return `<div class="wiz-q">العمولة ورسوم المزود</div><div class="wiz-qs">يتم حساب العمولة والرسوم تلقائياً حسب إعدادات النظام الحالية ويتم حفظها كبيانات ثابتة لهذه العملية.</div>
  <div class="formula" style="margin-bottom:18px">
    <div class="term"><small>المبلغ</small>${fmtMoney(fee.amount)}</div>
    <span class="op">−</span>
    <div class="term"><small>العمولة ${fee.commissionRate}%</small>${fmtMoney(fee.commissionAmount)}</div>
    <span class="op">−</span>
    <div class="term"><small>رسوم ${esc(provider?.name || '')}</small>${fmtMoney(fee.feeAmount)}</div>
    <span class="op">=</span>
    <div class="term" style="background:var(--primary-50);border-color:var(--primary)"><small>الصافي</small>${fmtMoney(fee.netAmount)}</div>
  </div>
  <div class="kv"><span>عمولة النظام</span><span>${fee.commissionRate}% = ${fmtMoney(fee.commissionAmount)}</span></div>
  <div class="kv"><span>رسوم المزود</span><span>${fmtMoney(fee.feeAmount)}</span></div>
  <div class="kv total"><span>إجمالي الخصومات</span><span>${fmtMoney(fee.totalDeductions)}</span></div>
  <div class="alert a-info" style="margin-top:14px">${icon('info')}<div>يتم تثبيت نسب العمولة والرسوم كلقطة تاريخية لحظة إنشاء العملية، ولن تتأثر بأي تعديل لاحق على إعدادات النظام.</div></div>`;
}

function wzStep8() {
  const open = DB.externalOrders.filter(o => !['Completed', 'Cancelled', 'Expired'].includes(o.status));
  return `<div class="wiz-q">ربط العملية بطلب خارجي؟</div><div class="wiz-qs">يمكن ربط هذه العملية بطلب تجميع خاص بعميل خارجي.</div>
  <div class="seg" id="linkOrderSeg" style="margin-bottom:16px">
    <label class="${WZ.linkOrder === 'no' ? 'on' : ''}" data-val="no">لا</label>
    <label class="${WZ.linkOrder === 'yes' ? 'on' : ''}" data-val="yes">نعم</label>
  </div>
  <div id="orderList" class="${WZ.linkOrder === 'yes' ? '' : 'hidden'}">
    <div class="grid g-auto">${open.map(o => {
      const ec = getExternalCustomer(o.externalCustomerId);
      const pct = Orders.progress(o);
      return `<button class="box order-card ${WZ.externalOrderId === o.id ? 'selected' : ''}" data-order="${o.id}" style="text-align:right">
        <div style="display:flex;justify-content:space-between;width:100%"><span class="bold">${esc(o.code)}</span>${orderStatusBadge(o.status)}</div>
        <div class="muted small">${esc(ec?.name || '-')}</div>
        <div class="amounts" style="margin-top:8px"><div><span>الهدف</span><b>${fmtMoney(o.target, false)}</b></div><div><span>المحصل</span><b>${fmtMoney(o.collected, false)}</b></div><div><span>المتبقي</span><b>${fmtMoney(Math.max(0, o.target - o.collected), false)}</b></div></div>
        <div class="progress" style="margin-top:8px;width:100%"><i style="width:${clamp(pct, 0, 100)}%"></i></div>
      </button>`;
    }).join('') || emptyState('box', 'لا توجد طلبات خارجية مفتوحة حالياً', '')}</div>
  </div>`;
}

function wzStep9() {
  return `<div class="wiz-q">إثبات العملية</div><div class="wiz-qs">أرفق صورة أو ملف إثبات العملية (اختياري في بيئة العرض التجريبي).</div>
  <div class="dropzone" id="dropZone">${icon('upload')}<div class="bold" style="margin-top:8px">اسحب الملف هنا أو اضغط للاختيار</div><div class="small muted">JPG, PNG, PDF</div>
  <input type="file" id="proofInput" class="hidden" accept="image/*,.pdf"></div>
  <div id="proofPreview" style="margin-top:12px">${WZ.proofName ? `<div class="file-chip">${icon('file')}<div><div class="bold small">${esc(WZ.proofName)}</div></div></div>` : ''}</div>
  <label class="check" style="margin-top:14px"><input type="checkbox" id="skipProof" ${WZ.proofSkipped ? 'checked' : ''}> لا يوجد إثبات متاح لهذه العملية</label>`;
}

function wzStep10() {
  const customer = WZ.customerId ? getCustomer(WZ.customerId) : null;
  const acc = getAccount(WZ.accountId);
  const fee = Fees.compute(WZ.providerId, Number(WZ.amount) || 0);
  const order = WZ.externalOrderId ? getOrder(WZ.externalOrderId) : null;
  return `<div class="wiz-q">مراجعة العملية</div><div class="wiz-qs">تأكد من صحة البيانات قبل إتمام العملية نهائياً.</div>
  <div class="review-sec"><div class="rh">بيانات العملية<button class="btn btn-sm btn-ghost" data-goto="1">${icon('edit')} تعديل</button></div>
    <div class="rb">
      <div class="kv"><span>نوع العملية</span><span>${TXN_TYPE_AR[WZ.type]}</span></div>
      <div class="kv"><span>العميل</span><span>${esc(customer ? customer.name : WZ.newCustomer.name)}</span></div>
      <div class="kv"><span>مزود الخدمة</span><span>${esc(getProvider(WZ.providerId).name)}</span></div>
      <div class="kv"><span>الحساب</span><span>${esc(acc.name)}</span></div>
      ${WZ.type === 'transfer' ? `<div class="kv"><span>المستفيد</span><span>${esc(WZ.beneficiaryName)} - ${esc(WZ.beneficiaryPhone)}</span></div>` : `<div class="kv"><span>رقم العميل</span><span class="ltr">${esc(WZ.beneficiaryPhone)}</span></div>`}
    </div></div>
  <div class="review-sec"><div class="rh">المبلغ والخصومات<button class="btn btn-sm btn-ghost" data-goto="6">${icon('edit')} تعديل</button></div>
    <div class="rb">
      <div class="kv"><span>المبلغ</span><span>${fmtMoney(fee.amount)}</span></div>
      <div class="kv"><span>العمولة (${fee.commissionRate}%)</span><span>${fmtMoney(fee.commissionAmount)}</span></div>
      <div class="kv"><span>رسوم المزود</span><span>${fmtMoney(fee.feeAmount)}</span></div>
      <div class="kv total"><span>الصافي</span><span>${fmtMoney(fee.netAmount)}</span></div>
    </div></div>
  ${order ? `<div class="review-sec"><div class="rh">الطلب الخارجي<button class="btn btn-sm btn-ghost" data-goto="8">${icon('edit')} تعديل</button></div><div class="rb"><div class="kv"><span>الطلب</span><span>${esc(order.code)}</span></div></div></div>` : ''}
  <div class="review-sec"><div class="rh">الإثبات والملاحظات<button class="btn btn-sm btn-ghost" data-goto="9">${icon('edit')} تعديل</button></div>
    <div class="rb"><div class="kv"><span>الإثبات</span><span>${WZ.proofName ? esc(WZ.proofName) : 'غير مرفق'}</span></div>${WZ.notes ? `<div class="kv"><span>ملاحظات</span><span>${esc(WZ.notes)}</span></div>` : ''}</div></div>
  ${WZ.override ? `<div class="alert a-warn">${icon('alertTriangle')}<div>تم تفعيل تجاوز الحد بإذن مدير. السبب: ${esc(WZ.overrideReason)}</div></div>` : ''}`;
}

function wzStep11() {
  if (!WZ.resultTxnId) return emptyState('alertCircle', 'لم يتم إنشاء العملية', '');
  const txn = getTxn(WZ.resultTxnId);
  const acc = getAccount(txn.accountId);
  const changes = [
    `تم تحديث رصيد الحساب ${acc.name} إلى ${fmtMoney(acc.currentBalance)}`,
    `تم إنشاء حركة في دفتر الأستاذ للحساب`,
    txn.externalOrderId ? `تم تحديث تقدم الطلب الخارجي ${getOrder(txn.externalOrderId).code}` : null,
    `تم تحديث سجل العميل والإحصائيات`,
    `تم تحديث لوحة التحكم والتقارير`,
    `تم إنشاء سجل تدقيق للعملية`,
  ].filter(Boolean);
  return `<div class="done-hero">
    <div class="ok-ico">${icon('checkCircle')}</div>
    <h2>تمت العملية بنجاح</h2>
    <p class="text-2">رقم العملية: <b class="ltr">${esc(txn.code)}</b></p>
    <div class="formula" style="justify-content:center;margin:20px 0">
      <div class="term"><small>قبل</small>${fmtMoney(txn.balanceBefore)}</div><span class="op">←</span>
      <div class="term" style="background:var(--primary-50);border-color:var(--primary)"><small>بعد</small>${fmtMoney(txn.balanceAfter)}</div>
    </div>
  </div>
  <div class="change-list" style="max-width:520px;margin:0 auto 20px">${changes.map(c => `<div class="change">${icon('checkCircle')}<span>${esc(c)}</span></div>`).join('')}</div>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary" id="wzAnother">${icon('plusCircle')} عملية جديدة</button>
    <a class="btn" href="#/transactions/${txn.id}">عرض تفاصيل العملية</a>
    <a class="btn" href="#/accounts/${acc.id}">الذهاب إلى الحساب</a>
  </div>`;
}

/* ---------------- binding ---------------- */
function wzBindStep(container) {
  qsa('[data-type]', container).forEach(b => b.addEventListener('click', () => { WZ.type = b.dataset.type; routeChanged(); }));
  qsa('[data-provider]', container).forEach(b => b.addEventListener('click', () => { WZ.providerId = b.dataset.provider; WZ.accountId = null; routeChanged(); }));
  qsa('[data-account]', container).forEach(b => b.addEventListener('click', () => { WZ.accountId = b.dataset.account; routeChanged(); }));
  qsa('[data-order]', container).forEach(b => b.addEventListener('click', () => { WZ.externalOrderId = b.dataset.order; routeChanged(); }));
  qsa('[data-goto]', container).forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.goto);
    if (n <= wzMaxReachable()) { WZ.step = n; routeChanged(); }
  }));

  if (WZ.step === 2) {
    qsa('#custMode label', container).forEach(l => l.addEventListener('click', () => {
      WZ.customerMode = l.dataset.val; routeChanged();
    }));
    qs('#custSelect', container)?.addEventListener('change', (e) => { WZ.customerId = e.target.value; });
    qs('#newCustName', container)?.addEventListener('input', (e) => { WZ.newCustomer.name = e.target.value; });
    qs('#newCustPhone', container)?.addEventListener('input', (e) => { WZ.newCustomer.phone = e.target.value; });
  }
  if (WZ.step === 5) {
    if (WZ.type === 'transfer') {
      qs('#benName', container)?.addEventListener('input', e => WZ.beneficiaryName = e.target.value);
      qs('#benPhone', container)?.addEventListener('input', e => WZ.beneficiaryPhone = e.target.value);
      qs('#internalToggle', container)?.addEventListener('change', (e) => {
        qs('#destWrap', container).style.display = e.target.checked ? '' : 'none';
        if (!e.target.checked) WZ.destAccountId = null;
      });
      qs('#destAccount', container)?.addEventListener('change', e => WZ.destAccountId = e.target.value || null);
    } else {
      qs('#benPhone', container)?.addEventListener('input', e => WZ.beneficiaryPhone = e.target.value);
      qs('#settleMethod', container)?.addEventListener('change', e => WZ.settlementMethod = e.target.value);
    }
    qs('#txnNotes', container)?.addEventListener('input', e => WZ.notes = e.target.value);
  }
  if (WZ.step === 6) {
    qs('#amountInput', container)?.addEventListener('input', (e) => { WZ.amount = e.target.value; routeChanged(); });
    qs('#overrideCheck', container)?.addEventListener('change', (e) => { WZ.override = e.target.checked; routeChanged(); });
    qs('#overrideReason', container)?.addEventListener('input', e => WZ.overrideReason = e.target.value);
  }
  if (WZ.step === 8) {
    qsa('#linkOrderSeg label', container).forEach(l => l.addEventListener('click', () => { WZ.linkOrder = l.dataset.val; if (WZ.linkOrder === 'no') WZ.externalOrderId = null; routeChanged(); }));
  }
  if (WZ.step === 9) {
    const dz = qs('#dropZone', container); const input = qs('#proofInput', container);
    dz?.addEventListener('click', () => input.click());
    input?.addEventListener('change', () => { if (input.files[0]) { WZ.proofName = input.files[0].name; WZ.proofSkipped = false; routeChanged(); } });
    qs('#skipProof', container)?.addEventListener('change', (e) => { WZ.proofSkipped = e.target.checked; if (e.target.checked) WZ.proofName = null; routeChanged(); });
  }
  if (WZ.step === 11) {
    qs('#wzAnother', container)?.addEventListener('click', () => startWizard());
  }
}

function wzBindNav(container) {
  qs('#wzPrev', container)?.addEventListener('click', () => { if (WZ.step > 1) { WZ.step--; routeChanged(); } });
  qs('#wzNext', container)?.addEventListener('click', () => wzGoNext(container));
}

function wzGoNext(container) {
  const s = WZ.step;
  if (s === 1) { if (!WZ.type) return toast('اختر نوع العملية للمتابعة', 'err'); }
  if (s === 2) {
    if (WZ.customerMode === 'existing') {
      if (!WZ.customerId) { qs('#custErr', container)?.classList.remove('hidden'); return; }
    } else {
      if (!WZ.newCustomer.name || !WZ.newCustomer.phone) { qs('#custErr', container)?.classList.remove('hidden'); return; }
      const c = { id: uid('cust'), code: nextCode('cust', 'CUS'), name: WZ.newCustomer.name, phone: WZ.newCustomer.phone, createdAt: new Date().toISOString() };
      DB.customers.push(c); Audit.log({ action: 'تم إنشاء عميل جديد', module: 'العملاء', recordRef: c.code, newValues: c }); save();
      WZ.customerId = c.id; WZ.customerMode = 'existing';
      toast('تم إنشاء العميل بنجاح');
    }
  }
  if (s === 3) { if (!WZ.providerId) return toast('اختر مزود الخدمة للمتابعة', 'err'); }
  if (s === 4) { if (!WZ.accountId) return toast('اختر الحساب للمتابعة', 'err'); }
  if (s === 5) { if (!wzStep5Valid()) return toast('يرجى استكمال الحقول المطلوبة', 'err'); }
  if (s === 6) {
    const amount = Number(WZ.amount);
    if (!(amount > 0)) return toast('أدخل مبلغاً صحيحاً أكبر من صفر', 'err');
    const acc = getAccount(WZ.accountId);
    const cap = Accounts.checkCapacity(acc, amount, { override: WZ.override });
    if (!cap.ok) {
      if ((cap.limitDaily || cap.limitMonthly) && Permissions.can('overrides') && WZ.override) {
        if (!WZ.overrideReason.trim()) return toast('أدخل سبب تجاوز الحد', 'err');
      } else {
        return toast(cap.reasons[0] || 'لا يمكن المتابعة', 'err');
      }
    }
  }
  if (s === 8) { if (WZ.linkOrder === 'yes' && !WZ.externalOrderId) return toast('اختر الطلب الخارجي للمتابعة', 'err'); }
  if (s === 9) { if (!WZ.proofName && !WZ.proofSkipped) return toast('أرفق إثباتاً أو أكّد عدم توفره', 'err'); }

  if (s === 10) { // final submit
    try {
      const txn = Txns.create({
        type: WZ.type, customerId: WZ.customerId, providerId: WZ.providerId, accountId: WZ.accountId,
        destAccountId: WZ.destAccountId, beneficiaryName: WZ.beneficiaryName, beneficiaryPhone: WZ.beneficiaryPhone,
        amount: WZ.amount, externalOrderId: WZ.externalOrderId, proofName: WZ.proofName, notes: WZ.notes,
      }, { override: WZ.override, overrideReason: WZ.overrideReason });
      WZ.resultTxnId = txn.id; WZ.step = 11;
      toast(`رقم العملية ${txn.code}`, 'ok', 'تمت العملية بنجاح');
      routeChanged();
    } catch (err) {
      toast(err.cap?.reasons?.[0] || 'تعذر إتمام العملية', 'err');
    }
    return;
  }
  WZ.step++; routeChanged();
}
