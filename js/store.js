/* SOFT STREAM — persistence + business engine (the connected ERP core) */
const DB_KEY = 'softstream_db_v1';
let DB = null;

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) { DB = JSON.parse(raw); return; }
  } catch (e) { /* fall through to reseed */ }
  DB = buildSeed();
  seedHistory();
  save();
}
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch (e) { /* storage full/unavailable */ }
}
function resetDemo() {
  localStorage.removeItem(DB_KEY);
  loadDB();
}

function currentUser() { return DB.employees.find(e => e.id === DB.currentUserId) || DB.employees[0]; }
function nextCode(counterKey, prefix) { DB.counters[counterKey] = (DB.counters[counterKey] || 0) + 1; return genCode(prefix, DB.counters[counterKey]); }

function getAccount(id) { return DB.accounts.find(a => a.id === id); }
function getCustomer(id) { return DB.customers.find(c => c.id === id); }
function getProvider(id) { return DB.providers.find(p => p.id === id); }
function getTxn(id) { return DB.transactions.find(t => t.id === id); }
function getOrder(id) { return DB.externalOrders.find(o => o.id === id); }
function getExternalCustomer(id) { return DB.externalCustomers.find(c => c.id === id); }
function getEmployee(id) { return DB.employees.find(e => e.id === id); }
function getRole(id) { return DB.roles.find(r => r.id === id); }

/* ======================= Permissions ======================= */
const Permissions = {
  can(mod) {
    const u = currentUser();
    const role = getRole(u.roleId);
    if (!role) return false;
    if (role.permissions.all) return true;
    return !!role.permissions[mod];
  },
};

/* ======================= Audit ======================= */
const Audit = {
  log({ action, module, recordRef, oldValues = null, newValues = null }) {
    const entry = {
      id: uid('aud'), userId: currentUser().id, userName: currentUser().name,
      action, module, recordRef, oldValues, newValues,
      ip: '192.168.1.10', ua: (navigator.userAgent || '').slice(0, 120),
      time: new Date().toISOString(),
    };
    DB.auditLogs.unshift(entry);
    return entry;
  },
};

/* ======================= Notifications ======================= */
const Notify = {
  push({ level = 'info', title, body, link = null }) {
    const n = { id: uid('ntf'), level, title, body, link, time: new Date().toISOString(), read: false };
    DB.notifications.unshift(n);
    return n;
  },
  unreadCount() { return DB.notifications.filter(n => !n.read).length; },
  markAllRead() { DB.notifications.forEach(n => n.read = true); save(); },
  markRead(id) { const n = DB.notifications.find(x => x.id === id); if (n) { n.read = true; save(); } },
};

/* ======================= Ledger / Accounts ======================= */
const MOVE_LABELS = {
  opening: 'رصيد افتتاحي', deposit: 'إيداع', withdrawal: 'سحب',
  transfer_in: 'تحويل داخل', transfer_out: 'تحويل خارج',
  adjustment_up: 'تعديل (إضافة)', adjustment_down: 'تعديل (خصم)', reversal: 'عكس عملية',
};

const Accounts = {
  resetPeriodsIfNeeded(acc) {
    const tk = todayKey(), mk = monthKey();
    if (acc.dailyUsedDate !== tk) { acc.dailyUsed = 0; acc.dailyUsedDate = tk; }
    if (acc.monthlyUsedMonth !== mk) { acc.monthlyUsed = 0; acc.monthlyUsedMonth = mk; }
  },
  available(acc) { return Math.max(0, (acc.currentBalance || 0) - (acc.reservedBalance || 0)); },
  dailyPct(acc) { return acc.dailyLimit ? Math.round((acc.dailyUsed / acc.dailyLimit) * 100) : 0; },
  monthlyPct(acc) { return acc.monthlyLimit ? Math.round((acc.monthlyUsed / acc.monthlyLimit) * 100) : 0; },

  record(accountId, type, signedAmount, { txnId = null, reference = '', reason = '', userId = null } = {}) {
    const acc = getAccount(accountId);
    const before = acc.currentBalance;
    const after = Math.round((before + signedAmount) * 100) / 100;
    if (after < -0.009) throw new Error('INSUFFICIENT_BALANCE');
    acc.currentBalance = after;
    acc.lastActivityAt = new Date().toISOString();
    const mv = {
      id: uid('mv'), accountId, txnId, type, amount: signedAmount,
      balanceBefore: before, balanceAfter: after, reference, reason,
      userId: userId || currentUser().id, userName: getEmployee(userId || currentUser().id)?.name || currentUser().name,
      createdAt: new Date().toISOString(),
    };
    DB.movements.unshift(mv);
    this.checkLimitNotifications(acc);
    return mv;
  },

  useLimit(acc, amount) { acc.dailyUsed = Math.round((acc.dailyUsed + amount) * 100) / 100; acc.monthlyUsed = Math.round((acc.monthlyUsed + amount) * 100) / 100; },
  releaseLimit(acc, amount) { acc.dailyUsed = Math.max(0, Math.round((acc.dailyUsed - amount) * 100) / 100); acc.monthlyUsed = Math.max(0, Math.round((acc.monthlyUsed - amount) * 100) / 100); },

  checkLimitNotifications(acc) {
    const dPct = this.dailyPct(acc);
    const key = `limit_${acc.id}_${todayKey()}`;
    if (dPct >= 100 && !acc._notif100) { acc._notif100 = true; Notify.push({ level: 'danger', title: `الحد اليومي تجاوز - ${acc.name}`, body: `تم تجاوز الحد اليومي المسموح للحساب ${acc.code}.`, link: `#/accounts/${acc.id}` }); }
    else if (dPct >= 90 && !acc._notif90) { acc._notif90 = true; Notify.push({ level: 'critical', title: `تحذير حرج 90% - ${acc.name}`, body: `استهلاك الحد اليومي للحساب ${acc.code} بلغ ${dPct}%.`, link: `#/accounts/${acc.id}` }); }
    else if (dPct >= 80 && !acc._notif80) { acc._notif80 = true; Notify.push({ level: 'warning', title: `تنبيه استخدام 80% - ${acc.name}`, body: `استهلاك الحد اليومي للحساب ${acc.code} بلغ ${dPct}%.`, link: `#/accounts/${acc.id}` }); }
    if (dPct < 80) { acc._notif80 = false; acc._notif90 = false; acc._notif100 = false; }
  },

  checkCapacity(acc, amount, { override = false } = {}) {
    this.resetPeriodsIfNeeded(acc);
    const avail = this.available(acc);
    const result = { ok: true, reasons: [], avail, dailyAfterPct: this.dailyPct({ ...acc, dailyUsed: acc.dailyUsed + amount }), monthlyAfterPct: this.monthlyPct({ ...acc, monthlyUsed: acc.monthlyUsed + amount }) };
    if (acc.status !== 'نشط') { result.ok = false; result.reasons.push(`الحساب غير نشط حالياً (${acc.status}).`); }
    if (avail < amount) { result.ok = false; result.reasons.push('لا يمكن تنفيذ العملية، الرصيد المتاح غير كافٍ.'); result.shortfall = amount - avail; }
    if (acc.dailyUsed + amount > acc.dailyLimit) { result.limitDaily = true; if (!override) { result.ok = false; result.reasons.push('العملية تتجاوز الحد اليومي المسموح لهذا الحساب.'); } }
    if (acc.monthlyUsed + amount > acc.monthlyLimit) { result.limitMonthly = true; if (!override) { result.ok = false; result.reasons.push('العملية تتجاوز الحد الشهري المسموح لهذا الحساب.'); } }
    return result;
  },

  createAccount({ name, phone, providerId, type, openingBalance, dailyLimit, monthlyLimit }) {
    const n = DB.accounts.length + 1;
    const acc = {
      id: uid('acc'), code: genCode('ACC', n), name, phone, providerId, type,
      openingBalance: Number(openingBalance) || 0, currentBalance: 0, reservedBalance: 0,
      dailyLimit: Number(dailyLimit) || DB.settings.accountDefaults.dailyLimit,
      dailyUsed: 0, dailyUsedDate: todayKey(),
      monthlyLimit: Number(monthlyLimit) || DB.settings.accountDefaults.monthlyLimit,
      monthlyUsed: 0, monthlyUsedMonth: monthKey(),
      status: 'نشط', createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(),
    };
    DB.accounts.push(acc);
    if (acc.openingBalance > 0) {
      this.record(acc.id, 'opening', acc.openingBalance, { reference: 'OPEN-' + acc.code, reason: 'رصيد افتتاحي عند إنشاء الحساب' });
    }
    Audit.log({ action: 'تم إنشاء الحساب', module: 'الأرقام والحسابات', recordRef: acc.code, newValues: acc });
    save();
    return acc;
  },

  addBalance(accountId, amount, reason, notes, userId) {
    const acc = getAccount(accountId);
    amount = Number(amount);
    if (!(amount > 0)) throw new Error('INVALID_AMOUNT');
    const mv = this.record(accountId, 'adjustment_up', amount, { reference: 'ADJ-ADD', reason: reason || 'إضافة رصيد', userId });
    Audit.log({ action: 'تمت إضافة رصيد', module: 'الأرقام والحسابات', recordRef: acc.code, newValues: { amount, reason, notes, balanceAfter: acc.currentBalance } });
    save();
    return mv;
  },

  adjust(accountId, direction, amount, reason, notes, userId, { override = false } = {}) {
    const acc = getAccount(accountId);
    amount = Number(amount);
    if (!(amount > 0)) throw new Error('INVALID_AMOUNT');
    if (direction === 'decrease') {
      const avail = this.available(acc);
      if (avail < amount && !override) {
        const err = new Error('INSUFFICIENT_BALANCE'); err.avail = avail; err.requested = amount; throw err;
      }
      const mv = this.record(accountId, 'adjustment_down', -amount, { reference: 'ADJ-SUB', reason: reason || 'تعديل رصيد (خصم)', userId });
      Audit.log({ action: 'تم إجراء تعديل على الرصيد', module: 'الأرقام والحسابات', recordRef: acc.code, newValues: { direction, amount, reason, notes, override, balanceAfter: acc.currentBalance } });
      save();
      return mv;
    }
    const mv = this.record(accountId, 'adjustment_up', amount, { reference: 'ADJ-ADD', reason: reason || 'تعديل رصيد (إضافة)', userId });
    Audit.log({ action: 'تم إجراء تعديل على الرصيد', module: 'الأرقام والحسابات', recordRef: acc.code, newValues: { direction, amount, reason, notes, override, balanceAfter: acc.currentBalance } });
    save();
    return mv;
  },

  totalsFor(accountId) {
    const mvs = DB.movements.filter(m => m.accountId === accountId);
    const sum = t => sumBy(mvs.filter(m => m.type === t), m => m.amount);
    return {
      opening: getAccount(accountId).openingBalance,
      deposits: sum('deposit'),
      withdrawals: Math.abs(sum('withdrawal')),
      transfersOut: Math.abs(sum('transfer_out')),
      transfersIn: sum('transfer_in'),
      adjustments: sum('adjustment_up') + sum('adjustment_down'),
      reversals: sum('reversal'),
    };
  },
};

/* ======================= Commission & Provider Fee ======================= */
const Fees = {
  commissionRate(providerId) { return DB.settings.commissionRules[providerId]?.rate || 0; },
  activeFeeRule(providerId) {
    const now = Date.now();
    return DB.settings.providerFeeRules.find(r => r.providerId === providerId && r.enabled &&
      (!r.startDate || new Date(r.startDate).getTime() <= now) &&
      (!r.endDate || new Date(r.endDate).getTime() >= now));
  },
  compute(providerId, amount) {
    amount = Number(amount) || 0;
    const commissionRate = this.commissionRate(providerId);
    const commissionAmount = Math.round(amount * (commissionRate / 100) * 100) / 100;
    const rule = this.activeFeeRule(providerId);
    let feeAmount = 0, feeRate = 0;
    if (rule) {
      if (rule.mode === 'percent') { feeRate = rule.value; feeAmount = amount * (rule.value / 100); }
      else { feeAmount = rule.value; }
      feeAmount = clamp(feeAmount, rule.min || 0, rule.max || Infinity);
      feeAmount = Math.round(feeAmount * 100) / 100;
    }
    const totalDeductions = Math.round((commissionAmount + feeAmount) * 100) / 100;
    const netAmount = Math.round((amount - totalDeductions) * 100) / 100;
    return { amount, commissionRate, commissionAmount, feeRate, feeAmount, feeRuleId: rule?.id || null, totalDeductions, netAmount };
  },
};

/* ======================= External Orders ======================= */
const ORDER_STATUS_AR = {
  Draft: 'مسودة', Open: 'مفتوح', Collecting: 'قيد التجميع', PartiallyCollected: 'تم تجميع جزئي',
  ReadyForTransfer: 'جاهز للتحويل', Processing: 'قيد التحويل', Completed: 'مكتمل', Cancelled: 'ملغي', Expired: 'منتهي',
};
const Orders = {
  progress(order) { return order.target ? clamp(Math.round((order.collected / order.target) * 100), 0, 999) : 0; },
  recomputeStatus(order) {
    if (['Completed', 'Cancelled', 'Processing'].includes(order.status)) return;
    if (order.collected <= 0) order.status = 'Open';
    else if (order.collected >= order.target) order.status = 'ReadyForTransfer';
    else order.status = 'Collecting';
    if (order.deadline && new Date(order.deadline) < new Date() && !['ReadyForTransfer', 'Completed'].includes(order.status)) order.status = 'Expired';
  },
  applyCollection(orderId, amount, txnId) {
    const order = getOrder(orderId);
    if (!order) return;
    order.collected = Math.round((order.collected + amount) * 100) / 100;
    order.linkedTxnIds = order.linkedTxnIds || [];
    order.linkedTxnIds.push(txnId);
    const wasReady = order.status === 'ReadyForTransfer';
    this.recomputeStatus(order);
    if (!wasReady && order.status === 'ReadyForTransfer') {
      Notify.push({ level: 'success', title: 'طلب خارجي جاهز للتحويل', body: `الطلب ${order.code} أصبح جاهزاً للتحويل بالكامل.`, link: `#/orders/${order.id}` });
    }
  },
  removeCollection(orderId, amount, txnId) {
    const order = getOrder(orderId);
    if (!order) return;
    order.collected = Math.max(0, Math.round((order.collected - amount) * 100) / 100);
    order.linkedTxnIds = (order.linkedTxnIds || []).filter(id => id !== txnId);
    if (!['Cancelled'].includes(order.status)) this.recomputeStatus(order);
  },
  create(payload) {
    const order = {
      id: uid('ord'), code: nextCode('ext', 'EXT'), externalCustomerId: payload.externalCustomerId,
      target: Number(payload.target) || 0, amountType: payload.amountType || 'gross',
      collected: 0, status: 'Draft', deadline: payload.deadline || null, notes: payload.notes || '',
      createdAt: new Date().toISOString(), linkedTxnIds: [],
    };
    DB.externalOrders.push(order);
    Audit.log({ action: 'تم إنشاء طلب خارجي', module: 'الطلبات الخارجية', recordRef: order.code, newValues: order });
    save();
    return order;
  },
};

/* ======================= Transactions ======================= */
const TXN_TYPE_AR = { transfer: 'تحويل', withdrawal: 'سحب', deposit: 'إيداع' };
const TXN_STATUS_AR = { completed: 'مكتملة', pending: 'قيد المراجعة', cancelled: 'ملغاة' };

const Txns = {
  validate(payload) {
    const errors = {};
    if (!payload.customerId) errors.customerId = 'اختر العميل';
    if (!payload.providerId) errors.providerId = 'اختر مزود الخدمة';
    if (!payload.accountId) errors.accountId = 'اختر الحساب';
    if (!payload.amount || Number(payload.amount) <= 0) errors.amount = 'أدخل مبلغاً صحيحاً أكبر من صفر';
    if (payload.type === 'transfer' && !payload.beneficiaryPhone) errors.beneficiaryPhone = 'أدخل رقم/حساب المستفيد';
    return errors;
  },

  create(payload, { override = false, overrideReason = '' } = {}) {
    const acc = getAccount(payload.accountId);
    const amount = Math.round(Number(payload.amount) * 100) / 100;
    const cap = Accounts.checkCapacity(acc, amount, { override });
    if (!cap.ok) { const err = new Error('CAPACITY_BLOCKED'); err.cap = cap; throw err; }

    const feeCalc = Fees.compute(payload.providerId, amount);
    const before = acc.currentBalance;
    const txn = {
      id: uid('txn'), code: nextCode('txn', 'TXN'), type: payload.type, status: 'completed',
      customerId: payload.customerId, providerId: payload.providerId, accountId: payload.accountId,
      destAccountId: payload.destAccountId || null,
      beneficiaryName: payload.beneficiaryName || '', beneficiaryPhone: payload.beneficiaryPhone || '',
      amount, ...feeCalc,
      externalOrderId: payload.externalOrderId || null,
      proofName: payload.proofName || null, notes: payload.notes || '',
      employeeId: currentUser().id, employeeName: currentUser().name,
      balanceBefore: before, balanceAfter: before, // patched below
      overrideUsed: !!override, overrideReason: override ? overrideReason : '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      cancelReason: null, cancelledAt: null, cancelledBy: null,
    };

    if (payload.type === 'transfer') {
      Accounts.record(acc.id, 'transfer_out', -amount, { txnId: txn.id, reference: txn.code, reason: `تحويل إلى ${payload.beneficiaryName || payload.beneficiaryPhone}` });
      if (payload.destAccountId) Accounts.record(payload.destAccountId, 'transfer_in', amount, { txnId: txn.id, reference: txn.code, reason: `تحويل من ${acc.name}` });
    } else if (payload.type === 'withdrawal') {
      Accounts.record(acc.id, 'withdrawal', -amount, { txnId: txn.id, reference: txn.code, reason: 'سحب عميل' });
    } else if (payload.type === 'deposit') {
      Accounts.record(acc.id, 'deposit', amount, { txnId: txn.id, reference: txn.code, reason: 'إيداع عميل' });
    }
    Accounts.useLimit(acc, amount);
    txn.balanceAfter = acc.currentBalance;

    DB.transactions.unshift(txn);

    if (txn.externalOrderId) Orders.applyCollection(txn.externalOrderId, amount, txn.id);

    Audit.log({ action: `تم تنفيذ عملية ${TXN_TYPE_AR[txn.type]}`, module: 'العمليات', recordRef: txn.code, newValues: { amount, accountId: acc.id, customerId: txn.customerId } });
    if (override) Audit.log({ action: 'تم تجاوز الحد المسموح بإذن مدير', module: 'العمليات', recordRef: txn.code, newValues: { reason: overrideReason } });

    save();
    return txn;
  },

  cancel(txnId, reason, userId) {
    const txn = getTxn(txnId);
    if (!txn || txn.status === 'cancelled') return txn;
    const mvs = DB.movements.filter(m => m.txnId === txnId && m.type !== 'reversal');
    mvs.forEach(mv => {
      Accounts.record(mv.accountId, 'reversal', -mv.amount, { txnId, reference: 'REV-' + txn.code, reason: 'عكس عملية ملغاة' });
    });
    const acc = getAccount(txn.accountId);
    Accounts.releaseLimit(acc, txn.amount);
    txn.status = 'cancelled'; txn.cancelReason = reason; txn.cancelledAt = new Date().toISOString(); txn.cancelledBy = userId || currentUser().id;
    txn.updatedAt = new Date().toISOString();
    if (txn.externalOrderId) Orders.removeCollection(txn.externalOrderId, txn.amount, txn.id);
    Audit.log({ action: 'تم إلغاء عملية', module: 'العمليات', recordRef: txn.code, oldValues: { status: 'completed' }, newValues: { status: 'cancelled', reason } });
    Notify.push({ level: 'warning', title: 'تم إلغاء عملية', body: `العملية ${txn.code} تم إلغاؤها وعكس الحركة المالية.`, link: `#/transactions/${txn.id}` });
    save();
    return txn;
  },

  customerStats(customerId) {
    const list = DB.transactions.filter(t => t.customerId === customerId && t.status !== 'cancelled');
    return {
      count: list.length,
      total: sumBy(list, t => t.amount),
      transferTotal: sumBy(list.filter(t => t.type === 'transfer'), t => t.amount),
      withdrawalTotal: sumBy(list.filter(t => t.type === 'withdrawal'), t => t.amount),
      depositTotal: sumBy(list.filter(t => t.type === 'deposit'), t => t.amount),
      last: list[0] || null,
    };
  },
};

/* ======================= Settlements ======================= */
const Settlements = {
  create({ accountId, expected, actual, notes, reasonDiff, proofName, userId }) {
    expected = Number(expected) || 0; actual = Number(actual) || 0;
    const difference = Math.round((actual - expected) * 100) / 100;
    const s = {
      id: uid('stl'), code: nextCode('settlement', 'STL'), accountId, expected, actual, difference,
      status: difference === 0 ? 'Matched' : 'Mismatch', notes: notes || '', reasonDiff: reasonDiff || '',
      proofName: proofName || null, approved: false, approvedBy: null,
      createdAt: new Date().toISOString(), userId: userId || currentUser().id,
    };
    DB.settlements.unshift(s);
    Audit.log({ action: 'تم إنشاء تسوية', module: 'التسويات', recordRef: s.code, newValues: s });
    if (difference !== 0) Notify.push({ level: 'warning', title: 'تسوية بها فرق', body: `التسوية ${s.code} بها فرق ${fmtMoney(difference)}.`, link: '#/settlements' });
    save();
    return s;
  },
  approve(id, userId) {
    const s = DB.settlements.find(x => x.id === id);
    if (!s) return;
    s.approved = true; s.approvedBy = userId || currentUser().id;
    Audit.log({ action: 'تمت الموافقة على تسوية', module: 'التسويات', recordRef: s.code });
    save();
  },
};

/* ======================= Expenses / Revenues ======================= */
const Finance = {
  addExpense({ category, amount, date, accountId, notes, proofName }) {
    amount = Number(amount) || 0;
    const e = { id: uid('exp'), code: nextCode('expense', 'EXP'), category, amount, date: date || new Date().toISOString(), accountId: accountId || null, employeeId: currentUser().id, notes: notes || '', proofName: proofName || null, createdAt: new Date().toISOString() };
    if (accountId) Accounts.record(accountId, 'adjustment_down', -amount, { reference: e.code, reason: `مصروف: ${category}` });
    DB.expenses.unshift(e);
    Audit.log({ action: 'تم تسجيل مصروف', module: 'المصروفات', recordRef: e.code, newValues: e });
    save();
    return e;
  },
  addRevenue({ source, amount, date, accountId, notes, proofName }) {
    amount = Number(amount) || 0;
    const r = { id: uid('rev'), code: nextCode('revenue', 'REV'), source, amount, date: date || new Date().toISOString(), accountId: accountId || null, notes: notes || '', proofName: proofName || null, createdAt: new Date().toISOString() };
    if (accountId) Accounts.record(accountId, 'adjustment_up', amount, { reference: r.code, reason: `إيراد: ${source}` });
    DB.revenues.unshift(r);
    Audit.log({ action: 'تم تسجيل إيراد', module: 'الإيرادات', recordRef: r.code, newValues: r });
    save();
    return r;
  },
};

const Profit = {
  compute({ from, to } = {}) {
    const inRange = iso => (!from || new Date(iso) >= new Date(from)) && (!to || new Date(iso) <= new Date(to));
    const txns = DB.transactions.filter(t => t.status !== 'cancelled' && inRange(t.createdAt));
    const commissions = sumBy(txns, t => t.commissionAmount);
    const providerFees = sumBy(txns, t => t.feeAmount);
    const revenues = sumBy(DB.revenues.filter(r => inRange(r.date)), r => r.amount);
    const expenses = sumBy(DB.expenses.filter(e => inRange(e.date)), e => e.amount);
    const netProfit = Math.round((commissions + revenues - providerFees - expenses) * 100) / 100;
    return { commissions, providerFees, revenues, expenses, netProfit, txnCount: txns.length };
  },
};

/* ======================= History seeding (uses the engine itself) ======================= */
function seedHistory() {
  const accounts = DB.accounts;
  const customers = DB.customers;
  const providers = DB.providers;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // 1) opening balances
  accounts.forEach(acc => {
    if (acc.openingBalance > 0) {
      Accounts.record(acc.id, 'opening', acc.openingBalance, { reference: 'OPEN-' + acc.code, reason: 'رصيد افتتاحي' });
    }
  });

  // 2) randomized historical transactions over the last ~45 days
  const types = ['transfer', 'withdrawal', 'deposit'];
  const txnCount = 140;
  for (let i = 0; i < txnCount; i++) {
    const acc = pick(accounts);
    const customer = pick(customers);
    const type = pick(types);
    const amount = Math.round(rand(300, 9000) / 10) * 10;
    const createdAt = daysAgo(Math.floor(rand(0, 45)));
    const cap = Accounts.checkCapacity(acc, amount, {});
    if (!cap.ok) continue;
    try {
      const txn = Txns.create({
        type, customerId: customer.id, providerId: acc.providerId, accountId: acc.id,
        beneficiaryName: type === 'transfer' ? pick(customers).name : '', beneficiaryPhone: type === 'transfer' ? '01099988877' : '',
        amount, proofName: Math.random() > 0.4 ? 'proof.jpg' : null, notes: '',
      });
      // backdate
      txn.createdAt = createdAt; txn.updatedAt = createdAt;
      const mv = DB.movements.find(m => m.txnId === txn.id);
      if (mv) mv.createdAt = createdAt;
      // randomly cancel ~6%
      if (Math.random() < 0.06) {
        Txns.cancel(txn.id, pick(['خطأ في البيانات المدخلة', 'طلب العميل إلغاء العملية', 'تكرار العملية بالخطأ']), currentUser().id);
      }
    } catch (e) { /* skip on rare capacity race */ }
  }
  // clear transient per-account notif flags created during seeding, keep only a handful of realistic alerts
  accounts.forEach(a => { delete a._notif80; delete a._notif90; delete a._notif100; });
  DB.notifications = [];

  // 3) link a few recent transactions to external orders 2 & 4 (still open) for realism
  const openOrders = DB.externalOrders.filter(o => ['Open', 'Collecting'].includes(o.status));
  openOrders.forEach(o => {
    const t = DB.transactions.find(t => t.status === 'completed' && !t.externalOrderId && t.amount < (o.target - o.collected));
    if (t) { t.externalOrderId = o.id; Orders.applyCollection(o.id, t.amount, t.id); }
  });

  // 4) expenses & revenues
  const expCats = ['إيجار المكتب', 'رواتب', 'اتصالات وإنترنت', 'صيانة', 'مصاريف نقل', 'ضيافة'];
  const revSrcs = ['عمولة شريك', 'خدمات إضافية', 'فروقات تسوية لصالح الشركة'];
  for (let i = 0; i < 14; i++) Finance.addExpense({ category: pick(expCats), amount: Math.round(rand(200, 4500)), date: daysAgo(Math.floor(rand(0, 60))), accountId: null, notes: '' });
  for (let i = 0; i < 8; i++) Finance.addRevenue({ source: pick(revSrcs), amount: Math.round(rand(300, 6000)), date: daysAgo(Math.floor(rand(0, 60))), accountId: null, notes: '' });

  // 5) settlements for a few accounts
  accounts.slice(0, 6).forEach((acc, i) => {
    const expected = acc.currentBalance;
    const diff = i % 3 === 0 ? -Math.round(rand(100, 1500)) : 0;
    Settlements.create({ accountId: acc.id, expected, actual: expected + diff, notes: 'تسوية دورية', reasonDiff: diff ? 'فرق في عد النقدية' : '', userId: currentUser().id });
  });

  // 6) account status variety: a couple suspended/closed
  if (accounts[12]) accounts[12].status = 'معلق';
  if (accounts[26]) accounts[26].status = 'مغلق';

  // 7) force a couple of accounts near/above limit today for dashboard realism
  [accounts[3], accounts[8], accounts[21]].forEach((acc, idx) => {
    if (!acc) return;
    Accounts.resetPeriodsIfNeeded(acc);
    const targetPct = [82, 93, 101][idx];
    acc.dailyUsed = Math.round(acc.dailyLimit * (targetPct / 100));
    acc.monthlyUsed = Math.max(acc.monthlyUsed, Math.round(acc.monthlyLimit * (targetPct / 140)));
    Accounts.checkLimitNotifications(acc);
  });

  // 8) a pending-review style notification + settlement mismatch + order deadline reminder
  Notify.push({ level: 'info', title: 'مرحباً بك في SOFT STREAM', body: 'تم تجهيز النظام ببيانات تجريبية لعرض كامل تدفق العمليات المالية.', link: '#/dashboard' });
  const nearOrder = DB.externalOrders.find(o => o.status === 'Open');
  if (nearOrder) Notify.push({ level: 'warning', title: 'طلب خارجي يقترب من الموعد النهائي', body: `الطلب ${nearOrder.code} يقترب من تاريخ الاستحقاق ولم يكتمل التجميع بعد.`, link: `#/orders/${nearOrder.id}` });

  save();
}
