/* SOFT STREAM — demo seed data (30 operational accounts + connected records) */
function buildSeed() {
  const now = new Date();

  const providers = [
    { id: 'vf', name: 'Vodafone Cash', code: 'VF' },
    { id: 'ip', name: 'InstaPay', code: 'IP' },
    { id: 'mc', name: 'MasterCard', code: 'MC' },
  ];

  const roles = [
    { id: 'admin', name: 'مدير النظام', permissions: { all: true } },
    { id: 'manager', name: 'مدير عمليات', permissions: { accounts: true, transactions: true, customers: true, orders: true, settlements: true, expenses: true, revenues: true, reports: true, overrides: true, employees: false, settings: false, audit: true } },
    { id: 'accountant', name: 'محاسب', permissions: { accounts: true, transactions: true, customers: true, orders: true, settlements: true, expenses: true, revenues: true, reports: true, overrides: false, employees: false, settings: false, audit: false } },
    { id: 'employee', name: 'موظف عمليات', permissions: { accounts: true, transactions: true, customers: true, orders: true, settlements: false, expenses: false, revenues: false, reports: false, overrides: false, employees: false, settings: false, audit: false } },
    { id: 'viewer', name: 'مستخدم مشاهدة', permissions: { accounts: true, transactions: true, customers: true, orders: true, settlements: false, expenses: false, revenues: false, reports: true, overrides: false, employees: false, settings: false, audit: false } },
  ];

  const employeeNames = ['أحمد سمير', 'محمد عبد الله', 'سارة إبراهيم', 'منى حسن', 'خالد يوسف', 'إيمان طارق', 'عمر رفعت', 'نورا السيد'];
  const employees = employeeNames.map((name, i) => ({
    id: `emp_${i + 1}`,
    name,
    email: `user${i + 1}@softstream.local`,
    roleId: i === 0 ? 'admin' : i === 1 ? 'manager' : i < 4 ? 'accountant' : i < 6 ? 'employee' : 'viewer',
    status: i === 6 ? 'موقوف' : 'نشط',
    createdAt: daysAgo(200 - i * 5),
  }));
  const currentUser = employees[0]; // Admin — demo session

  // ---- 30 operational accounts ----
  const firstNames = ['محمد', 'أحمد', 'علي', 'سامي', 'حسام', 'كريم', 'طارق', 'وائل', 'ياسر', 'هيثم'];
  const accounts = [];
  for (let i = 1; i <= 30; i++) {
    const provider = providers[(i - 1) % 3];
    const opening = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 8000, 12000, 60000][i % 10];
    const dailyLimit = provider.id === 'mc' ? 100000 : provider.id === 'ip' ? 80000 : 50000;
    const monthlyLimit = dailyLimit * 20;
    accounts.push({
      id: `acc_${i}`,
      code: genCode('ACC', i),
      name: `حساب ${pad(i)} - ${firstNames[i % firstNames.length]}`,
      phone: `010${String(10000000 + i * 37111).slice(0, 8)}`,
      providerId: provider.id,
      type: provider.id === 'mc' ? 'بطاقة' : 'محفظة',
      openingBalance: opening,
      currentBalance: opening,
      reservedBalance: 0,
      dailyLimit, dailyUsed: 0, dailyUsedDate: todayKey(),
      monthlyLimit, monthlyUsed: 0, monthlyUsedMonth: monthKey(),
      status: 'نشط',
      createdAt: daysAgo(250 - i * 3),
      lastActivityAt: hoursAgo((i * 5) % 72),
    });
  }

  // ---- customers ----
  const custFirst = ['أحمد محمد', 'محمود سعيد', 'منى علي', 'هبة الله', 'يوسف كامل', 'رنا شريف', 'عبد الرحمن فتحي', 'داليا عماد', 'كريم السيد', 'سلمى وجدي', 'زياد مجدي', 'آية حمدي', 'فادي نبيل', 'نهى صلاح', 'باسم عادل'];
  const customers = custFirst.map((name, i) => ({
    id: `cust_${i + 1}`,
    code: genCode('CUS', i + 1),
    name,
    phone: `011${String(20000000 + i * 91111).slice(0, 8)}`,
    createdAt: daysAgo(180 - i * 6),
  }));

  // ---- external customers & orders ----
  const extNames = ['شركة النور للاستيراد', 'مؤسسة الفا التجارية', 'مجموعة الرواد', 'شركة سما للتوريدات', 'مكتب المدينة للصرافة'];
  const externalCustomers = extNames.map((name, i) => ({ id: `extc_${i + 1}`, name, phone: `012${String(30000000 + i * 51111).slice(0, 8)}`, company: name, createdAt: daysAgo(90 - i * 10) }));

  const orderStatuses = ['Draft', 'Open', 'Collecting', 'PartiallyCollected', 'ReadyForTransfer', 'Processing', 'Completed', 'Cancelled', 'Expired'];
  const externalOrders = [
    { id: 'ord_1', code: 'EXT-00001', externalCustomerId: 'extc_1', target: 50000, amountType: 'gross', collected: 50000, status: 'Completed', deadline: daysAgo(-2), notes: 'طلب توريد مكتمل', createdAt: daysAgo(10), linkedTxnIds: [] },
    { id: 'ord_2', code: 'EXT-00002', externalCustomerId: 'extc_2', target: 80000, amountType: 'gross', collected: 46000, status: 'Collecting', deadline: daysAgo(-5), notes: '', createdAt: daysAgo(7), linkedTxnIds: [] },
    { id: 'ord_3', code: 'EXT-00003', externalCustomerId: 'extc_3', target: 30000, amountType: 'net', collected: 30000, status: 'ReadyForTransfer', deadline: daysAgo(-1), notes: 'صافي بعد الخصومات', createdAt: daysAgo(4), linkedTxnIds: [] },
    { id: 'ord_4', code: 'EXT-00004', externalCustomerId: 'extc_4', target: 120000, amountType: 'gross', collected: 15000, status: 'Open', deadline: daysAgo(-14), notes: '', createdAt: daysAgo(2), linkedTxnIds: [] },
    { id: 'ord_5', code: 'EXT-00005', externalCustomerId: 'extc_5', target: 20000, amountType: 'gross', collected: 0, status: 'Draft', deadline: daysAgo(-20), notes: 'بانتظار التأكيد', createdAt: daysAgo(1), linkedTxnIds: [] },
    { id: 'ord_6', code: 'EXT-00006', externalCustomerId: 'extc_1', target: 60000, amountType: 'gross', collected: 60000, status: 'Cancelled', deadline: daysAgo(3), notes: 'تم إلغاؤه من العميل', createdAt: daysAgo(20), linkedTxnIds: [] },
  ];

  // ---- commission + provider fee rules ----
  const commissionRules = {
    vf: { rate: 2, updatedAt: daysAgo(60), updatedBy: currentUser.name },
    ip: { rate: 1, updatedAt: daysAgo(60), updatedBy: currentUser.name },
    mc: { rate: 2.5, updatedAt: daysAgo(60), updatedBy: currentUser.name },
  };
  const providerFeeRules = [
    { id: 'pf_vf', providerId: 'vf', mode: 'percent', value: 1, min: 5, max: 500, enabled: true, startDate: daysAgo(60), endDate: null },
    { id: 'pf_ip', providerId: 'ip', mode: 'percent', value: 0.5, min: 2, max: 300, enabled: true, startDate: daysAgo(60), endDate: null },
    { id: 'pf_mc', providerId: 'mc', mode: 'fixed', value: 15, min: 15, max: 15, enabled: true, startDate: daysAgo(60), endDate: null },
  ];

  const settings = {
    systemName: 'SOFT STREAM',
    commissionRules,
    providerFeeRules,
    accountDefaults: { dailyLimit: 50000, monthlyLimit: 1000000 },
    notifyThresholds: { warn: 80, crit: 90, limit: 100 },
    backups: [],
  };
  settings.backups = [
    { id: 'bk_1', createdAt: daysAgo(1), size: '4.2 MB', by: currentUser.name },
    { id: 'bk_2', createdAt: daysAgo(2), size: '4.1 MB', by: currentUser.name },
    { id: 'bk_3', createdAt: daysAgo(8), size: '3.9 MB', by: currentUser.name },
  ];

  return {
    meta: { version: 1, seededAt: now.toISOString() },
    currentUserId: currentUser.id,
    providers, roles, employees, accounts, customers,
    externalCustomers, externalOrders,
    movements: [], transactions: [], settlements: [], expenses: [], revenues: [],
    notifications: [], auditLogs: [], settings,
    counters: { txn: 0, movement: 0, ext: externalOrders.length, settlement: 0, expense: 0, revenue: 0, notif: 0, audit: 0 },
  };
}
