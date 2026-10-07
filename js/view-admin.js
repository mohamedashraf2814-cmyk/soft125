/* SOFT STREAM — الإشعارات / الموظفون / الأدوار / سجل التدقيق / الإعدادات / النسخ الاحتياطي */
function auditTableHtml(list) {
  if (!list.length) return emptyState('history', 'لا توجد سجلات تدقيق', '');
  return `<table class="tbl"><thead><tr><th>التاريخ</th><th>المستخدم</th><th>الإجراء</th><th>الوحدة</th><th>المرجع</th><th>التفاصيل</th></tr></thead><tbody>
    ${list.map(a => `<tr>
      <td>${fmtDateTime(a.time)}</td><td>${esc(a.userName)}</td><td>${esc(a.action)}</td><td>${esc(a.module)}</td><td class="ltr">${esc(a.recordRef || '-')}</td>
      <td><button class="btn btn-sm" data-audit-detail="${a.id}">عرض</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}
function bindAuditActions(container) {
  qsa('[data-audit-detail]', container).forEach(b => b.addEventListener('click', () => {
    const a = DB.auditLogs.find(x => x.id === b.dataset.auditDetail);
    openModal({
      title: 'تفاصيل سجل التدقيق',
      body: `<div class="kv"><span>المستخدم</span><span>${esc(a.userName)}</span></div>
        <div class="kv"><span>الإجراء</span><span>${esc(a.action)}</span></div>
        <div class="kv"><span>الوحدة</span><span>${esc(a.module)}</span></div>
        <div class="kv"><span>المرجع</span><span class="ltr">${esc(a.recordRef || '-')}</span></div>
        <div class="kv"><span>عنوان IP</span><span class="ltr">${esc(a.ip)}</span></div>
        <div class="kv"><span>التاريخ</span><span>${fmtDateTime(a.time)}</span></div>
        ${a.oldValues ? `<div style="margin-top:10px"><div class="small bold">القيم القديمة</div><pre class="json">${esc(JSON.stringify(a.oldValues, null, 2))}</pre></div>` : ''}
        ${a.newValues ? `<div style="margin-top:10px"><div class="small bold">القيم الجديدة</div><pre class="json">${esc(JSON.stringify(a.newValues, null, 2))}</pre></div>` : ''}`,
      foot: `<button class="btn" data-close-modal>إغلاق</button>`,
    });
  }));
}

function viewNotificationsPage() {
  const list = DB.notifications;
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الإشعارات' }])}
    ${pageHeader('الإشعارات', `${fmtNum(list.length)} إشعار - ${Notify.unreadCount()} غير مقروء`, `<button class="btn" id="btnMarkAll">تحديد الكل كمقروء</button>`)}
    <div class="card">
      ${list.length ? list.map(n => `<div class="notif ${n.read ? '' : 'unread'}" data-notif="${n.id}" data-link="${n.link || ''}">
        <div class="n-ico lvl-${n.level}">${icon(n.level === 'danger' || n.level === 'critical' ? 'alertCircle' : n.level === 'warning' ? 'alertTriangle' : n.level === 'success' ? 'checkCircle' : 'info')}</div>
        <div><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div><div class="n-time">${relTime(n.time)}</div></div>
      </div>`).join('') : emptyState('bell', 'لا توجد إشعارات', '')}
    </div>
  `;
  return {
    html,
    mount(container) {
      qs('#btnMarkAll', container).addEventListener('click', () => { Notify.markAllRead(); toast('تم تحديد الكل كمقروء'); routeChanged(); });
      qsa('[data-notif]', container).forEach(n => n.addEventListener('click', () => { Notify.markRead(n.dataset.notif); if (n.dataset.link) location.hash = n.dataset.link.replace('#', ''); else routeChanged(); }));
    }
  };
}

/* ---------------- Employees ---------------- */
function viewEmployees() {
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الموظفون' }])}
    ${pageHeader('الموظفون', `${fmtNum(DB.employees.length)} موظف`, `<button class="btn btn-primary" id="btnNewEmp">${icon('plus')} إضافة موظف</button>`)}
    <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${DB.employees.map(e => `<tr>
        <td class="bold">${esc(e.name)}</td><td class="ltr">${esc(e.email)}</td>
        <td><select class="select" style="height:32px" data-role-select="${e.id}">${DB.roles.map(r => `<option value="${r.id}" ${e.roleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></td>
        <td>${statusBadge(e.status, e.status === 'نشط' ? 'ok' : 'muted')}</td>
        <td><button class="btn btn-sm" data-toggle-emp="${e.id}">${e.status === 'نشط' ? 'إيقاف' : 'تفعيل'}</button></td>
      </tr>`).join('')}
    </tbody></table></div></div>
  `;
  return {
    html,
    mount(container) {
      qsa('[data-role-select]', container).forEach(s => s.addEventListener('change', () => {
        const emp = getEmployee(s.dataset.roleSelect); const old = emp.roleId; emp.roleId = s.value;
        Audit.log({ action: 'تم تعديل دور موظف', module: 'الموظفون', recordRef: emp.name, oldValues: { roleId: old }, newValues: { roleId: emp.roleId } });
        save(); toast('تم تحديث الدور'); if (emp.id === DB.currentUserId) { renderUserChip(); renderNav(); }
      }));
      qsa('[data-toggle-emp]', container).forEach(b => b.addEventListener('click', () => {
        const emp = getEmployee(b.dataset.toggleEmp); emp.status = emp.status === 'نشط' ? 'موقوف' : 'نشط';
        Audit.log({ action: 'تم تغيير حالة موظف', module: 'الموظفون', recordRef: emp.name, newValues: { status: emp.status } });
        save(); routeChanged();
      }));
      qs('#btnNewEmp', container).addEventListener('click', openNewEmployeeModal);
    }
  };
}
function openNewEmployeeModal() {
  openModal({
    title: 'إضافة موظف جديد',
    body: `<div class="form-grid">
      <div class="field full"><label>الاسم <span class="req">*</span></label><input class="input" id="eName"></div>
      <div class="field full"><label>البريد الإلكتروني <span class="req">*</span></label><input class="input ltr" id="eEmail"></div>
      <div class="field full"><label>الدور</label><select class="select" id="eRole">${DB.roles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
    </div>`,
    foot: `<button class="btn btn-primary" id="eConfirm">إضافة</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => qs('#eConfirm', ov).addEventListener('click', () => {
      const name = qs('#eName', ov).value.trim(); const email = qs('#eEmail', ov).value.trim();
      if (!name || !email) { toast('أدخل الاسم والبريد الإلكتروني', 'err'); return; }
      const emp = { id: uid('emp'), name, email, roleId: qs('#eRole', ov).value, status: 'نشط', createdAt: new Date().toISOString() };
      DB.employees.push(emp); Audit.log({ action: 'تم إنشاء موظف جديد', module: 'الموظفون', recordRef: emp.name, newValues: emp }); save();
      closeOverlay(); toast('تم إضافة الموظف'); routeChanged();
    })
  });
}

/* ---------------- Roles ---------------- */
const PERMISSION_MODULES = [
  ['accounts', 'الحسابات'], ['transactions', 'العمليات'], ['customers', 'العملاء'], ['orders', 'الطلبات الخارجية'],
  ['settlements', 'التسويات'], ['expenses', 'المصروفات'], ['revenues', 'الإيرادات'], ['reports', 'التقارير'],
  ['overrides', 'تجاوز الحدود والصلاحيات'], ['employees', 'الموظفون'], ['settings', 'الإعدادات'], ['audit', 'سجل التدقيق'],
];
function viewRoles() {
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الأدوار والصلاحيات' }])}
    ${pageHeader('الأدوار والصلاحيات', 'تحديد صلاحيات كل دور للوصول إلى وحدات النظام')}
    <div class="perm-grid">
      ${DB.roles.map(r => `<div class="perm-grp">
        <h4><span>${esc(r.name)}</span>${r.permissions.all ? statusBadge('كل الصلاحيات', 'dark') : ''}</h4>
        ${!r.permissions.all ? PERMISSION_MODULES.map(([k, l]) => `<label class="check"><input type="checkbox" data-role="${r.id}" data-mod="${k}" ${r.permissions[k] ? 'checked' : ''}> ${l}</label>`).join('') : '<div class="muted small">هذا الدور يمتلك وصولاً كاملاً لجميع وحدات النظام.</div>'}
      </div>`).join('')}
    </div>
  `;
  return {
    html,
    mount(container) {
      qsa('[data-role]', container).forEach(cb => cb.addEventListener('change', () => {
        const role = getRole(cb.dataset.role); role.permissions[cb.dataset.mod] = cb.checked;
        Audit.log({ action: 'تم تعديل صلاحيات دور', module: 'الأدوار والصلاحيات', recordRef: role.name, newValues: { [cb.dataset.mod]: cb.checked } });
        save(); toast('تم تحديث الصلاحيات'); renderNav();
      }));
    }
  };
}

/* ---------------- Audit log page ---------------- */
function viewAudit(params) {
  const q = (params.get('q') || '').trim();
  let list = DB.auditLogs.filter(a => !q || a.action.includes(q) || (a.recordRef || '').toLowerCase().includes(q.toLowerCase()) || a.userName.includes(q));
  const { rows, page, pages, total } = paginate(list, Number(params.get('page')) || 1, 20);
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'سجل التدقيق' }])}
    ${pageHeader('سجل التدقيق', `${fmtNum(DB.auditLogs.length)} سجل - يوثّق جميع الإجراءات الحساسة في النظام`)}
    <div class="card">
      <div class="filters"><div class="f wide"><label>بحث</label><input class="input" id="fq" value="${esc(q)}" placeholder="الإجراء، المرجع، أو اسم المستخدم"></div><button class="btn" id="btnFilter">${icon('filter')} تطبيق</button></div>
      <div class="table-wrap">${auditTableHtml(rows)}</div>
      ${pagerHtml(page, pages, total, 'سجل')}
    </div>
  `;
  return {
    html,
    mount(container) {
      bindAuditActions(container);
      qs('#btnFilter', container).addEventListener('click', () => { const v = qs('#fq', container).value.trim(); location.hash = '/audit' + (v ? '?q=' + encodeURIComponent(v) : ''); });
      qsa('[data-page]', container).forEach(b => b.addEventListener('click', () => { if (!b.disabled) { const sp = new URLSearchParams(); if (q) sp.set('q', q); sp.set('page', b.dataset.page); location.hash = '/audit?' + sp.toString(); } }));
    }
  };
}

/* ---------------- Settings ---------------- */
const SETTINGS_CARDS = [
  ['commission', 'نسب العمولة', 'percent'], ['fees', 'رسوم المزودين', 'minus'], ['account-defaults', 'إعدادات الحسابات الافتراضية', 'wallet'],
  ['notifications', 'إعدادات الإشعارات', 'bell'], ['system', 'إعدادات النظام', 'settings'],
];
function viewSettings(section) {
  if (!section) {
    const html = `
      ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الإعدادات' }])}
      ${pageHeader('الإعدادات', 'إدارة إعدادات النظام العامة')}
      <div class="grid g-auto-sm">
        ${SETTINGS_CARDS.map(([k, l, ic]) => `<a href="#/settings/${k}" class="box" style="padding:18px"><div class="box-ico">${icon(ic)}</div><div class="box-title" style="font-size:15px">${l}</div></a>`).join('')}
        <a href="#/employees" class="box" style="padding:18px"><div class="box-ico">${icon('users')}</div><div class="box-title" style="font-size:15px">المستخدمون</div></a>
        <a href="#/roles" class="box" style="padding:18px"><div class="box-ico">${icon('shield')}</div><div class="box-title" style="font-size:15px">الأدوار والصلاحيات</div></a>
        <a href="#/backup" class="box" style="padding:18px"><div class="box-ico">${icon('database')}</div><div class="box-title" style="font-size:15px">النسخ الاحتياطي</div></a>
      </div>`;
    return { html };
  }
  const crumbItems = [{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الإعدادات', href: '#/settings' }, { label: SETTINGS_CARDS.find(c => c[0] === section)?.[1] || section }];
  let body = '';
  if (section === 'commission') {
    body = `<div class="card card-pad"><div class="section-title">نسب عمولة النظام</div>
      <div class="form-grid">${DB.providers.map(p => `<div class="field"><label>${esc(p.name)} (%)</label><input class="input" type="number" step="0.1" data-comm="${p.id}" value="${DB.settings.commissionRules[p.id]?.rate ?? 0}"></div>`).join('')}</div>
      <button class="btn btn-primary" id="btnSaveComm" style="margin-top:12px">${icon('check')} حفظ النسب</button></div>`;
  } else if (section === 'fees') {
    body = `<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>المزود</th><th>النوع</th><th>القيمة</th><th>الحد الأدنى</th><th>الحد الأقصى</th><th>مفعّل</th></tr></thead><tbody>
      ${DB.settings.providerFeeRules.map(r => `<tr>
        <td>${esc(getProvider(r.providerId)?.name)}</td>
        <td><select class="select" style="height:32px" data-fee-mode="${r.id}"><option value="percent" ${r.mode === 'percent' ? 'selected' : ''}>نسبة %</option><option value="fixed" ${r.mode === 'fixed' ? 'selected' : ''}>ثابت</option></select></td>
        <td><input class="input" style="height:32px;width:100px" type="number" data-fee-value="${r.id}" value="${r.value}"></td>
        <td><input class="input" style="height:32px;width:90px" type="number" data-fee-min="${r.id}" value="${r.min}"></td>
        <td><input class="input" style="height:32px;width:90px" type="number" data-fee-max="${r.id}" value="${r.max}"></td>
        <td><label class="check"><input type="checkbox" data-fee-enabled="${r.id}" ${r.enabled ? 'checked' : ''}></label></td>
      </tr>`).join('')}
    </tbody></table></div><div class="card-pad"><button class="btn btn-primary" id="btnSaveFees">${icon('check')} حفظ رسوم المزودين</button></div></div>`;
  } else if (section === 'account-defaults') {
    body = `<div class="card card-pad"><div class="section-title">القيم الافتراضية للحسابات الجديدة</div>
      <div class="form-grid">
        <div class="field"><label>الحد اليومي الافتراضي</label><input class="input" type="number" id="defDaily" value="${DB.settings.accountDefaults.dailyLimit}"></div>
        <div class="field"><label>الحد الشهري الافتراضي</label><input class="input" type="number" id="defMonthly" value="${DB.settings.accountDefaults.monthlyLimit}"></div>
      </div>
      <button class="btn btn-primary" id="btnSaveDefaults" style="margin-top:12px">${icon('check')} حفظ</button></div>`;
  } else if (section === 'notifications') {
    body = `<div class="card card-pad"><div class="section-title">حدود تنبيهات الاستخدام</div>
      <div class="form-grid">
        <div class="field"><label>نسبة التنبيه (%)</label><input class="input" type="number" id="thWarn" value="${DB.settings.notifyThresholds.warn}"></div>
        <div class="field"><label>نسبة التحذير الحرج (%)</label><input class="input" type="number" id="thCrit" value="${DB.settings.notifyThresholds.crit}"></div>
        <div class="field"><label>نسبة بلوغ الحد (%)</label><input class="input" type="number" id="thLimit" value="${DB.settings.notifyThresholds.limit}"></div>
      </div>
      <button class="btn btn-primary" id="btnSaveTh" style="margin-top:12px">${icon('check')} حفظ</button></div>`;
  } else if (section === 'system') {
    body = `<div class="card card-pad"><div class="section-title">معلومات النظام</div>
      <div class="kv"><span>اسم النظام</span><span class="ltr">SOFT STREAM</span></div>
      <div class="kv"><span>عدد الحسابات</span><span>${fmtNum(DB.accounts.length)}</span></div>
      <div class="kv"><span>عدد المستخدمين</span><span>${fmtNum(DB.employees.length)}</span></div>
      <div class="kv"><span>الإصدار</span><span class="ltr">1.0.0</span></div>
      <button class="btn btn-danger" id="btnResetDemo" style="margin-top:16px">${icon('trash')} إعادة تهيئة البيانات التجريبية</button></div>`;
  }
  return {
    html: `${crumbs(crumbItems)}${pageHeader(SETTINGS_CARDS.find(c => c[0] === section)?.[1] || section, '')}${body}`,
    mount(container) {
      qs('#btnSaveComm', container)?.addEventListener('click', () => {
        qsa('[data-comm]', container).forEach(i => { DB.settings.commissionRules[i.dataset.comm] = { rate: Number(i.value), updatedAt: new Date().toISOString(), updatedBy: currentUser().name }; });
        Audit.log({ action: 'تم تعديل نسب العمولة', module: 'الإعدادات', recordRef: 'Commission Rules', newValues: DB.settings.commissionRules });
        Notify.push({ level: 'info', title: 'تم تعديل نسب العمولة', body: 'تم تحديث إعدادات نسب العمولة من قسم الإعدادات.' });
        save(); toast('تم حفظ نسب العمولة');
      });
      qs('#btnSaveFees', container)?.addEventListener('click', () => {
        DB.settings.providerFeeRules.forEach(r => {
          r.mode = qs(`[data-fee-mode="${r.id}"]`, container).value;
          r.value = Number(qs(`[data-fee-value="${r.id}"]`, container).value);
          r.min = Number(qs(`[data-fee-min="${r.id}"]`, container).value);
          r.max = Number(qs(`[data-fee-max="${r.id}"]`, container).value);
          r.enabled = qs(`[data-fee-enabled="${r.id}"]`, container).checked;
        });
        Audit.log({ action: 'تم تعديل رسوم المزودين', module: 'الإعدادات', recordRef: 'Provider Fee Rules', newValues: DB.settings.providerFeeRules });
        Notify.push({ level: 'info', title: 'تم تعديل رسوم المزودين', body: 'تم تحديث قواعد رسوم مزودي الخدمة.' });
        save(); toast('تم حفظ رسوم المزودين');
      });
      qs('#btnSaveDefaults', container)?.addEventListener('click', () => {
        DB.settings.accountDefaults.dailyLimit = Number(qs('#defDaily', container).value);
        DB.settings.accountDefaults.monthlyLimit = Number(qs('#defMonthly', container).value);
        save(); toast('تم حفظ الإعدادات الافتراضية');
      });
      qs('#btnSaveTh', container)?.addEventListener('click', () => {
        DB.settings.notifyThresholds = { warn: Number(qs('#thWarn', container).value), crit: Number(qs('#thCrit', container).value), limit: Number(qs('#thLimit', container).value) };
        save(); toast('تم حفظ إعدادات التنبيهات');
      });
      qs('#btnResetDemo', container)?.addEventListener('click', () => {
        confirmDialog({
          title: 'إعادة تهيئة البيانات', message: 'سيتم حذف جميع البيانات الحالية واستعادة البيانات التجريبية الأصلية. هل أنت متأكد؟',
          confirmText: 'تأكيد إعادة التهيئة', onConfirm: () => { resetDemo(); toast('تمت إعادة تهيئة البيانات'); renderUserChip(); renderNav(); location.hash = '/dashboard'; routeChanged(); },
        });
      });
    }
  };
}

/* ---------------- Backup ---------------- */
function viewBackup() {
  const html = `
    ${crumbs([{ label: 'الرئيسية', href: '#/dashboard' }, { label: 'الإعدادات', href: '#/settings' }, { label: 'النسخ الاحتياطي' }])}
    ${pageHeader('النسخ الاحتياطي', 'إدارة نسخ البيانات الاحتياطية للنظام', `<button class="btn btn-primary" id="btnBackupNow">${icon('database')} إنشاء نسخة الآن</button> <button class="btn" id="btnExportAll">${icon('download')} تنزيل نسخة كاملة JSON</button>`)}
    <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الحجم</th><th>بواسطة</th><th></th></tr></thead><tbody>
      ${DB.settings.backups.map(b => `<tr><td>${fmtDateTime(b.createdAt)}</td><td>${esc(b.size)}</td><td>${esc(b.by)}</td><td><button class="btn btn-sm">استعادة</button></td></tr>`).join('')}
    </tbody></table></div></div>
  `;
  return {
    html,
    mount(container) {
      qs('#btnBackupNow', container).addEventListener('click', () => {
        DB.settings.backups.unshift({ id: uid('bk'), createdAt: new Date().toISOString(), size: ((JSON.stringify(DB).length) / 1024).toFixed(1) + ' KB', by: currentUser().name });
        Audit.log({ action: 'تم إنشاء نسخة احتياطية', module: 'النسخ الاحتياطي', recordRef: '-' });
        save(); toast('تم إنشاء نسخة احتياطية بنجاح'); routeChanged();
      });
      qs('#btnExportAll', container).addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'softstream-backup.json'; a.click();
      });
    }
  };
}
