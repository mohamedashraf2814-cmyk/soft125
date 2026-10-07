/* SOFT STREAM — الأرقام والحسابات */
function accountCardHtml(acc) {
  const dPct = Accounts.dailyPct(acc);
  const tone = usageTone(dPct);
  return `<div class="card acc-card" data-acc-card="${acc.id}">
    <div class="card-pad" style="padding-bottom:0">
      <div class="top">
        <div><div class="code">${esc(acc.code)}</div><div class="name">${esc(acc.name)}</div><div class="phone ltr">${esc(acc.phone)}</div></div>
        ${providerTag(acc.providerId)}
      </div>
      <div style="margin-top:10px">
        <div class="bal">${fmtMoney(acc.currentBalance)}</div>
        <div class="muted small">الرصيد الحالي</div>
      </div>
      <div class="rows" style="margin-top:10px">
        <div><span>الحد اليومي</span><span>${fmtMoney(acc.dailyLimit, false)}</span></div>
        <div><span>المستخدم</span><span>${fmtMoney(acc.dailyUsed, false)}</span></div>
        <div><span>المتاح اليوم</span><span>${fmtMoney(Math.max(0, acc.dailyLimit - acc.dailyUsed), false)}</span></div>
        <div><span>الحالة</span><span>${accountStatusBadge(acc.status)}</span></div>
      </div>
      <div style="margin-top:8px">
        <div class="usage-line"><span>نسبة الاستخدام اليومي</span><span>${dPct}%</span></div>
        <div class="progress"><i class="${tone}" style="width:${clamp(dPct, 0, 100)}%"></i></div>
      </div>
    </div>
    <div class="acc-card acts card-pad" style="padding-top:10px">
      <button class="btn btn-sm" data-acc-detail="${acc.id}">التفاصيل</button>
      <button class="btn btn-sm btn-success" data-acc-add="${acc.id}">إضافة رصيد</button>
      <button class="btn btn-sm btn-primary" data-acc-txn="${acc.id}">حركة جديدة</button>
    </div>
  </div>`;
}

function bindAccountCardActions(container) {
  qsa('[data-acc-detail], [data-acc-card]', container).forEach(el2 => {
    el2.addEventListener('click', (e) => {
      if (e.target.closest('[data-acc-add],[data-acc-txn]')) return;
      const id = el2.dataset.accDetail || el2.dataset.accCard;
      location.hash = `/accounts/${id}`;
    });
  });
  qsa('[data-acc-add]', container).forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openAddBalanceModal(b.dataset.accAdd); }));
  qsa('[data-acc-txn]', container).forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); startWizard({ accountId: b.dataset.accTxn }); }));
}

function openAddBalanceModal(accountId, mode = 'add', initialDirection = 'increase') {
  const acc = getAccount(accountId);
  openModal({
    title: mode === 'add' ? 'إضافة رصيد' : (initialDirection === 'decrease' ? 'خصم رصيد' : 'تعديل الرصيد'),
    body: `
      <div class="field full" style="margin-bottom:12px"><label>الحساب</label>
        <div class="kv" style="border:1px solid var(--border);border-radius:9px;padding:10px 14px"><span>${esc(acc.name)} - ${esc(acc.code)}</span><span>${fmtMoney(acc.currentBalance)}</span></div>
      </div>
      ${mode === 'adjust' ? `
      <div class="field full" style="margin-bottom:12px"><label>نوع التعديل</label>
        <div class="seg" id="adjDir">
          <label class="${initialDirection === 'increase' ? 'on' : ''}" data-val="increase">زيادة الرصيد</label>
          <label class="${initialDirection === 'decrease' ? 'on' : ''}" data-val="decrease">خصم من الرصيد</label>
        </div>
      </div>` : ''}
      <div class="form-grid">
        <div class="field full"><label>المبلغ <span class="req">*</span></label><input class="input" type="number" min="1" id="mAmount" placeholder="0.00"><div class="ferr hidden" id="eAmount">أدخل مبلغاً صحيحاً</div></div>
        <div class="field full"><label>السبب <span class="req">*</span></label><input class="input" id="mReason" placeholder="سبب العملية"><div class="ferr hidden" id="eReason">السبب مطلوب</div></div>
        <div class="field full"><label>ملاحظات</label><textarea class="textarea" id="mNotes" placeholder="ملاحظات إضافية (اختياري)"></textarea></div>
      </div>
      <div id="mPreview" class="small text-2" style="margin-top:10px"></div>
      <div id="mAlert"></div>
    `,
    foot: `<button class="btn btn-primary" id="mConfirm">تأكيد العملية</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      let direction = initialDirection;
      const preview = () => {
        const amt = Number(qs('#mAmount', ov).value) || 0;
        const after = direction === 'increase' ? acc.currentBalance + amt : acc.currentBalance - amt;
        qs('#mPreview', ov).innerHTML = amt ? `${fmtMoney(acc.currentBalance)} ${direction === 'increase' ? '+' : '-'} ${fmtMoney(amt)} = <b>${fmtMoney(after)}</b>` : '';
      };
      qs('#mAmount', ov).addEventListener('input', preview);
      if (mode === 'adjust') {
        qsa('#adjDir label', ov).forEach(l => l.addEventListener('click', () => {
          qsa('#adjDir label', ov).forEach(x => x.classList.remove('on')); l.classList.add('on'); direction = l.dataset.val; preview();
        }));
      }
      qs('#mConfirm', ov).addEventListener('click', () => {
        const amount = Number(qs('#mAmount', ov).value);
        const reason = qs('#mReason', ov).value.trim();
        let ok = true;
        qs('#eAmount', ov).classList.toggle('hidden', !!(amount > 0)); if (!(amount > 0)) { qs('#mAmount', ov).classList.add('err'); ok = false; }
        qs('#eReason', ov).classList.toggle('hidden', !!reason); if (!reason) { qs('#mReason', ov).classList.add('err'); ok = false; }
        if (!ok) return;
        const notes = qs('#mNotes', ov).value.trim();
        try {
          if (mode === 'add') Accounts.addBalance(acc.id, amount, reason, notes);
          else Accounts.adjust(acc.id, direction, amount, reason, notes);
          closeOverlay();
          toast(`الرصيد الجديد: ${fmtMoney(acc.currentBalance)}`, 'ok', 'تمت العملية بنجاح');
          routeChanged();
        } catch (err) {
          if (err.message === 'INSUFFICIENT_BALANCE') {
            qs('#mAlert', ov).innerHTML = `<div class="alert a-danger" style="margin-top:10px">${icon('alertCircle')}<div><div class="alert-title">لا يمكن تنفيذ العملية، الرصيد المتاح غير كافٍ.</div>
              <div class="calc-table"><span>الرصيد المتاح</span><b>${fmtMoney(err.avail)}</b><span>المبلغ المطلوب</span><b>${fmtMoney(err.requested)}</b><span>الفرق</span><b>${fmtMoney(err.requested - err.avail)}</b></div></div></div>`;
          } else { toast(err.message, 'err'); }
        }
      });
    }
  });
}

function viewAccountsList(params) {
  const accounts = DB.accounts;
  const q = (params.get('q') || '').trim();
  const provider = params.get('provider') || '';
  const status = params.get('status') || '';
  let list = accounts.filter(a =>
    (!q || a.name.includes(q) || a.phone.includes(q) || a.code.toLowerCase().includes(q.toLowerCase())) &&
    (!provider || a.providerId === provider) && (!status || a.status === status));

  const totalBalance = sumBy(accounts, a => a.currentBalance);
  const highest = accounts.reduce((a, b) => (b.currentBalance > (a?.currentBalance ?? -1) ? b : a), null);
  const lowest = accounts.reduce((a, b) => (b.currentBalance < (a?.currentBalance ?? Infinity) ? b : a), null);
  const nearLimit = accounts.filter(a => Accounts.dailyPct(a) >= 80).length;
  const inactiveCount = accounts.filter(a => a.status !== 'نشط').length;

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الأرقام والحسابات' }])}
    ${pageHeader('الأرقام والحسابات', `${fmtNum(accounts.length)} حساب تشغيلي مرتبط بمحافظ ومزودي الخدمة`, Permissions.can('accounts') ? `<button class="btn btn-primary" id="btnNewAccount">${icon('plus')} إضافة حساب جديد</button>` : '')}

    <div class="kpis section">
      <div class="kpi"><div class="lbl">إجمالي الأرصدة</div><div class="val">${fmtMoney(totalBalance)}</div></div>
      <div class="kpi"><div class="lbl">أعلى رصيد</div><div class="val">${fmtMoney(highest?.currentBalance || 0)}</div><div class="hint">${esc(highest?.name || '')}</div></div>
      <div class="kpi"><div class="lbl">أدنى رصيد</div><div class="val">${fmtMoney(lowest?.currentBalance || 0)}</div><div class="hint">${esc(lowest?.name || '')}</div></div>
      <div class="kpi"><div class="lbl">قريبة من الحد</div><div class="val ${nearLimit ? 'neg' : ''}">${nearLimit}</div></div>
      <div class="kpi"><div class="lbl">غير نشطة</div><div class="val">${inactiveCount}</div></div>
    </div>

    <div class="card">
      <div class="filters">
        <div class="f wide"><label>بحث</label><input class="input" id="fq" value="${esc(q)}" placeholder="كود، اسم، أو رقم الحساب"></div>
        <div class="f"><label>مزود الخدمة</label><select class="select" id="fProvider">
          <option value="">الكل</option>${DB.providers.map(p => `<option value="${p.id}" ${provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></div>
        <div class="f"><label>الحالة</label><select class="select" id="fStatus">
          <option value="">الكل</option>${['نشط', 'معلق', 'مغلق'].map(s => `<option ${status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <button class="btn" id="btnFilter">${icon('filter')} تطبيق</button>
      </div>
      <div class="card-body">
        ${list.length ? `<div class="grid g-auto">${list.map(accountCardHtml).join('')}</div>` : emptyState('wallet', 'لا توجد حسابات مطابقة', 'جرّب تعديل عوامل التصفية')}
      </div>
    </div>
  `;
  return {
    html,
    mount(container) {
      bindAccountCardActions(container);
      const apply = () => {
        const sp = new URLSearchParams();
        if (qs('#fq', container).value.trim()) sp.set('q', qs('#fq', container).value.trim());
        if (qs('#fProvider', container).value) sp.set('provider', qs('#fProvider', container).value);
        if (qs('#fStatus', container).value) sp.set('status', qs('#fStatus', container).value);
        location.hash = '/accounts' + (sp.toString() ? '?' + sp.toString() : '');
      };
      qs('#btnFilter', container).addEventListener('click', apply);
      qs('#fq', container).addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
      if (qs('#btnNewAccount', container)) qs('#btnNewAccount', container).addEventListener('click', openNewAccountModal);
    }
  };
}

function openNewAccountModal() {
  openModal({
    title: 'إضافة حساب جديد', size: 'lg',
    body: `<div class="form-grid">
      <div class="field"><label>اسم الحساب <span class="req">*</span></label><input class="input" id="nName" placeholder="مثال: حساب 31"></div>
      <div class="field"><label>رقم الهاتف / الحساب <span class="req">*</span></label><input class="input ltr" id="nPhone" placeholder="01000000000"></div>
      <div class="field"><label>مزود الخدمة <span class="req">*</span></label><select class="select" id="nProvider">${DB.providers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>نوع الحساب</label><select class="select" id="nType"><option>محفظة</option><option>بطاقة</option></select></div>
      <div class="field"><label>الرصيد الافتتاحي</label><input class="input" type="number" id="nOpening" value="0"></div>
      <div class="field"><label>الحد اليومي</label><input class="input" type="number" id="nDaily" value="${DB.settings.accountDefaults.dailyLimit}"></div>
      <div class="field"><label>الحد الشهري</label><input class="input" type="number" id="nMonthly" value="${DB.settings.accountDefaults.monthlyLimit}"></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="nConfirm">إنشاء الحساب</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      qs('#nConfirm', ov).addEventListener('click', () => {
        const name = qs('#nName', ov).value.trim(); const phone = qs('#nPhone', ov).value.trim();
        if (!name || !phone) { toast('يرجى إدخال اسم الحساب ورقم الهاتف', 'err'); return; }
        const acc = Accounts.createAccount({
          name, phone, providerId: qs('#nProvider', ov).value, type: qs('#nType', ov).value,
          openingBalance: qs('#nOpening', ov).value, dailyLimit: qs('#nDaily', ov).value, monthlyLimit: qs('#nMonthly', ov).value,
        });
        closeOverlay(); toast('تم إنشاء الحساب بنجاح'); location.hash = `/accounts/${acc.id}`;
      });
    }
  });
}

/* ---------------- Account details ---------------- */
function viewAccountDetails(id) {
  const acc = getAccount(id);
  if (!acc) return { html: emptyState('alertCircle', 'الحساب غير موجود', 'تحقق من الرابط وحاول مرة أخرى', '<a href="#/accounts" class="btn btn-primary">عودة للحسابات</a>') };
  const tab = (new URLSearchParams(location.hash.split('?')[1] || '')).get('tab') || 'overview';
  const totals = Accounts.totalsFor(id);
  const txns = DB.transactions.filter(t => t.accountId === id || t.destAccountId === id);
  const movements = DB.movements.filter(m => m.accountId === id);
  const settlements = DB.settlements.filter(s => s.accountId === id);
  const audits = DB.auditLogs.filter(a => a.recordRef === acc.code);
  const dPct = Accounts.dailyPct(acc), mPct = Accounts.monthlyPct(acc);

  const tabs = [
    ['overview', 'نظرة عامة'], ['ledger', 'حركة الرصيد'], ['transactions', 'العمليات'],
    ['limits', 'الحدود'], ['settlements', 'التسويات'], ['audit', 'سجل التدقيق'],
  ];

  let body = '';
  if (tab === 'overview') {
    body = `
      <div class="hero">
        <div class="hero-bal">
          <div>
            <div class="lbl">الرصيد الحالي</div>
            <div class="big">${fmtMoney(acc.currentBalance)}</div>
          </div>
          <div class="sub">
            <div><span>الرصيد المتاح</span><b>${fmtMoney(Accounts.available(acc))}</b></div>
            <div><span>الرصيد المحجوز</span><b>${fmtMoney(acc.reservedBalance)}</b></div>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div class="breakdown">
            <div><span>الرصيد الافتتاحي</span><b>${fmtMoney(totals.opening)}</b></div>
            <div><span>إجمالي الإيداعات</span><b class="pos">${fmtMoney(totals.deposits)}</b></div>
            <div><span>إجمالي السحوبات</span><b class="neg">${fmtMoney(totals.withdrawals)}</b></div>
            <div><span>تحويلات خارجة</span><b class="neg">${fmtMoney(totals.transfersOut)}</b></div>
            <div><span>تحويلات داخلة</span><b class="pos">${fmtMoney(totals.transfersIn)}</b></div>
            <div><span>التعديلات</span><b>${fmtMoney(totals.adjustments)}</b></div>
          </div>
        </div>
      </div>
      <div class="grid g-2">
        <div class="card card-pad">
          <div class="section-title">بيانات الحساب</div>
          <div class="kv"><span>الكود الداخلي</span><span>${esc(acc.code)}</span></div>
          <div class="kv"><span>رقم الهاتف/الحساب</span><span class="ltr">${esc(acc.phone)}</span></div>
          <div class="kv"><span>مزود الخدمة</span><span>${providerTag(acc.providerId)}</span></div>
          <div class="kv"><span>نوع الحساب</span><span>${esc(acc.type)}</span></div>
          <div class="kv"><span>الحالة</span><span>${accountStatusBadge(acc.status)}</span></div>
          <div class="kv"><span>تاريخ الإنشاء</span><span>${fmtDate(acc.createdAt)}</span></div>
          <div class="kv"><span>آخر نشاط</span><span>${relTime(acc.lastActivityAt)}</span></div>
        </div>
        <div class="card card-pad">
          <div class="section-title">الحدود الحالية</div>
          <div class="usage-line"><span>الحد اليومي - ${fmtMoney(acc.dailyUsed, false)} / ${fmtMoney(acc.dailyLimit, false)}</span><span>${dPct}%</span></div>
          <div class="progress lg"><i class="${usageTone(dPct)}" style="width:${clamp(dPct, 0, 100)}%"></i></div>
          <div class="usage-line" style="margin-top:14px"><span>الحد الشهري - ${fmtMoney(acc.monthlyUsed, false)} / ${fmtMoney(acc.monthlyLimit, false)}</span><span>${mPct}%</span></div>
          <div class="progress lg"><i class="${usageTone(mPct)}" style="width:${clamp(mPct, 0, 100)}%"></i></div>
          ${dPct >= 80 ? `<div class="alert ${dPct >= 100 ? 'a-danger' : dPct >= 90 ? 'a-danger' : 'a-warn'}" style="margin-top:14px">${icon('alertTriangle')}<div>${dPct >= 100 ? 'تم تجاوز الحد اليومي المسموح لهذا الحساب.' : dPct >= 90 ? 'تحذير حرج: الاستخدام تجاوز 90% من الحد اليومي.' : 'تنبيه: الاستخدام تجاوز 80% من الحد اليومي.'}</div></div>` : ''}
        </div>
      </div>`;
  } else if (tab === 'ledger') {
    body = `<div class="card">
      <div class="card-head"><div class="card-title">حركة الرصيد (${fmtNum(movements.length)})</div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>نوع الحركة</th><th>المرجع</th><th>المبلغ</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>السبب</th><th>المستخدم</th></tr></thead><tbody>
        ${movements.length ? movements.map(m => `<tr>
          <td>${fmtDateTime(m.createdAt)}</td>
          <td>${statusBadge(MOVE_LABELS[m.type] || m.type, m.amount >= 0 ? 'ok' : 'danger')}</td>
          <td class="ltr">${esc(m.reference || '-')}</td>
          <td class="num ${m.amount >= 0 ? 'pos' : 'neg'}">${m.amount >= 0 ? '+' : ''}${fmtMoney(m.amount)}</td>
          <td class="num">${fmtMoney(m.balanceBefore)}</td><td class="num">${fmtMoney(m.balanceAfter)}</td>
          <td class="wrap">${esc(m.reason || '-')}</td><td>${esc(m.userName || '-')}</td>
        </tr>`).join('') : `<tr><td colspan="8">${emptyState('history', 'لا توجد حركات', '')}</td></tr>`}
      </tbody></table></div>
    </div>`;
  } else if (tab === 'transactions') {
    body = `<div class="card">
      <div class="card-head"><div class="card-title">العمليات على هذا الحساب (${fmtNum(txns.length)})</div></div>
      <div class="table-wrap">${txnTableHtml(txns)}</div>
    </div>`;
  } else if (tab === 'limits') {
    body = `<div class="card card-pad">
      <div class="section-title">إدارة الحدود</div>
      <div class="form-grid">
        <div class="field"><label>الحد اليومي</label><input class="input" id="lDaily" type="number" value="${acc.dailyLimit}"></div>
        <div class="field"><label>الحد الشهري</label><input class="input" id="lMonthly" type="number" value="${acc.monthlyLimit}"></div>
      </div>
      <button class="btn btn-primary" id="btnSaveLimits" style="margin-top:10px">${icon('check')} حفظ الحدود</button>
      <div class="section" style="margin-top:22px">
        <div class="usage-line"><span>الاستخدام اليومي</span><span>${fmtMoney(acc.dailyUsed, false)} / ${fmtMoney(acc.dailyLimit, false)} (${dPct}%)</span></div>
        <div class="progress lg"><i class="${usageTone(dPct)}" style="width:${clamp(dPct, 0, 100)}%"></i></div>
        <div class="usage-line" style="margin-top:14px"><span>الاستخدام الشهري</span><span>${fmtMoney(acc.monthlyUsed, false)} / ${fmtMoney(acc.monthlyLimit, false)} (${mPct}%)</span></div>
        <div class="progress lg"><i class="${usageTone(mPct)}" style="width:${clamp(mPct, 0, 100)}%"></i></div>
      </div>
    </div>`;
  } else if (tab === 'settlements') {
    body = `<div class="card">
      <div class="card-head"><div class="card-title">تسويات الحساب (${settlements.length})</div>${Permissions.can('settlements') ? `<button class="btn btn-sm btn-primary" id="btnNewSettle">${icon('plus')} تسوية جديدة</button>` : ''}</div>
      <div class="table-wrap">${settlementTableHtml(settlements)}</div>
    </div>`;
  } else if (tab === 'audit') {
    body = `<div class="card">
      <div class="card-head"><div class="card-title">سجل التدقيق الخاص بالحساب</div></div>
      <div class="table-wrap">${auditTableHtml(audits)}</div>
    </div>`;
  }

  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الأرقام والحسابات', href: '#/accounts' }, { label: acc.name }])}
    ${pageHeader(acc.name, `${acc.code} - ${acc.phone}`, `
      <button class="btn btn-success" id="btnAddBal">${icon('plus')} إضافة رصيد</button>
      <button class="btn btn-danger" id="btnSubBal">${icon('minus')} خصم رصيد</button>
      <button class="btn btn-primary" id="btnNewTxn">${icon('plusCircle')} حركة جديدة</button>
      <button class="btn" id="btnEditAcc">${icon('edit')} تعديل الحساب</button>
    `)}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/accounts/${id}?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${body}
  `;
  return {
    html,
    mount(container) {
      qs('#btnAddBal', container)?.addEventListener('click', () => openAddBalanceModal(id, 'add'));
      qs('#btnSubBal', container)?.addEventListener('click', () => openAddBalanceModal(id, 'adjust', 'decrease'));
      qs('#btnNewTxn', container)?.addEventListener('click', () => startWizard({ accountId: id }));
      qs('#btnEditAcc', container)?.addEventListener('click', () => openEditAccountModal(id));
      qs('#btnSaveLimits', container)?.addEventListener('click', () => {
        const oldV = { dailyLimit: acc.dailyLimit, monthlyLimit: acc.monthlyLimit };
        acc.dailyLimit = Number(qs('#lDaily', container).value) || acc.dailyLimit;
        acc.monthlyLimit = Number(qs('#lMonthly', container).value) || acc.monthlyLimit;
        Audit.log({ action: 'تم تعديل حدود الحساب', module: 'الأرقام والحسابات', recordRef: acc.code, oldValues: oldV, newValues: { dailyLimit: acc.dailyLimit, monthlyLimit: acc.monthlyLimit } });
        save(); toast('تم حفظ الحدود'); routeChanged();
      });
      qs('#btnNewSettle', container)?.addEventListener('click', () => openSettlementModal(id));
      bindTxnTableRowClicks(container);
      bindSettlementActions(container);
    }
  };
}

function openEditAccountModal(id) {
  const acc = getAccount(id);
  openModal({
    title: 'تعديل الحساب',
    body: `<div class="form-grid">
      <div class="field full"><label>اسم الحساب</label><input class="input" id="eName" value="${esc(acc.name)}"></div>
      <div class="field"><label>رقم الهاتف/الحساب</label><input class="input ltr" id="ePhone" value="${esc(acc.phone)}"></div>
      <div class="field"><label>الحالة</label><select class="select" id="eStatus">${['نشط', 'معلق', 'مغلق'].map(s => `<option ${acc.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="eConfirm">حفظ التعديلات</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      qs('#eConfirm', ov).addEventListener('click', () => {
        const oldV = { name: acc.name, phone: acc.phone, status: acc.status };
        acc.name = qs('#eName', ov).value.trim() || acc.name;
        acc.phone = qs('#ePhone', ov).value.trim() || acc.phone;
        acc.status = qs('#eStatus', ov).value;
        Audit.log({ action: 'تم تعديل بيانات الحساب', module: 'الأرقام والحسابات', recordRef: acc.code, oldValues: oldV, newValues: { name: acc.name, phone: acc.phone, status: acc.status } });
        save(); closeOverlay(); toast('تم حفظ التعديلات'); routeChanged();
      });
    }
  });
}
