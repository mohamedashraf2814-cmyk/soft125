/* SOFT STREAM — shared helpers: formatting, dates, dom, toasts, modals */
const AR_DIGITS = false; // keep western digits for ledger clarity, Arabic text elsewhere

function fmtMoney(n, withCurrency = true) {
  n = Number(n) || 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return `${sign}${s}${withCurrency ? ' ج.م' : ''}`;
}
function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }
function fmtPct(n, d = 0) { return `${(Number(n) || 0).toFixed(d)}%`; }
function pad(n, len = 2) { return String(n).padStart(len, '0'); }

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDateTime(iso) { return `${fmtDate(iso)} - ${fmtTime(iso)}`; }
function todayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d.toISOString(); }
function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 2592000) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return fmtDate(iso);
}

let _seq = 1000;
function uid(prefix = 'id') { _seq += 1; return `${prefix}_${Date.now().toString(36)}${(_seq).toString(36)}`; }
function genCode(prefix, n) { return `${prefix}-${String(n).padStart(5, '0')}`; }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/* ---------------- Toasts ---------------- */
function toast(msg, type = 'ok', title = '') {
  const host = qs('#toasts');
  if (!host) return;
  const icoMap = { ok: 'checkCircle', err: 'alertCircle', warn: 'alertTriangle' };
  const node = el(`<div class="toast ${type}">${icon(icoMap[type] || 'info')}<div><div class="bold">${esc(title || (type === 'ok' ? 'تم بنجاح' : type === 'err' ? 'حدث خطأ' : 'تنبيه'))}</div><div class="small">${esc(msg)}</div></div></div>`);
  host.appendChild(node);
  setTimeout(() => { node.style.transition = 'opacity .25s'; node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, 3600);
}

/* ---------------- Modal / Drawer ---------------- */
function openModal({ title, body, foot, size = '', onMount, closable = true }) {
  closeOverlay();
  const ov = el(`<div class="overlay" id="activeOverlay"><div class="modal ${size}">
    <div class="modal-head"><div class="modal-title">${esc(title)}</div>${closable ? `<button class="x-btn" data-close-modal>${icon('close')}</button>` : ''}</div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div></div>`);
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', e => { if (e.target === ov && closable) closeOverlay(); });
  ov.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeOverlay));
  if (onMount) onMount(ov);
  return ov;
}
function openDrawer({ title, body, foot, onMount }) {
  closeOverlay();
  const ov = el(`<div class="overlay drawer-ov" id="activeOverlay"><div class="drawer">
    <div class="modal-head"><div class="modal-title">${esc(title)}</div><button class="x-btn" data-close-modal>${icon('close')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div></div>`);
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeOverlay(); });
  ov.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeOverlay));
  if (onMount) onMount(ov);
  return ov;
}
function closeOverlay() { const ov = qs('#activeOverlay'); if (ov) ov.remove(); }
function confirmDialog({ title, message, danger = true, confirmText = 'تأكيد', onConfirm, reasonRequired = false, reasonLabel = 'السبب' }) {
  openModal({
    title, size: 'sm',
    body: `<p class="text-2">${esc(message)}</p>
      ${reasonRequired ? `<div class="field full" style="margin-top:12px"><label>${esc(reasonLabel)} <span class="req">*</span></label><textarea class="textarea" id="confirmReason" placeholder=""></textarea><div class="ferr hidden" id="confirmReasonErr">هذا الحقل مطلوب</div></div>` : ''}`,
    foot: `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOkBtn">${esc(confirmText)}</button><button class="btn" data-close-modal>إلغاء</button>`,
    onMount: (ov) => {
      qs('#confirmOkBtn', ov).addEventListener('click', () => {
        let reason = '';
        if (reasonRequired) {
          reason = qs('#confirmReason', ov).value.trim();
          if (!reason) { qs('#confirmReasonErr', ov).classList.remove('hidden'); qs('#confirmReason', ov).classList.add('err'); return; }
        }
        closeOverlay();
        onConfirm(reason);
      });
    }
  });
}

/* ---------------- Simple data helpers ---------------- */
function groupBy(arr, fn) { const m = {}; arr.forEach(x => { const k = fn(x); (m[k] = m[k] || []).push(x); }); return m; }
function sumBy(arr, fn) { return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function usageTone(pct) {
  if (pct >= 100) return 'danger';
  if (pct >= 90) return 'crit';
  if (pct >= 80) return 'warn';
  return 'ok';
}
function statusBadge(label, tone) { return `<span class="badge b-${tone}">${esc(label)}</span>`; }

/* ---------------- Shared view-building blocks ---------------- */
function crumbs(items) {
  const parts = items.map((it, i) => {
    const last = i === items.length - 1;
    return last
      ? `<span class="cur">${esc(it.label)}</span>`
      : `<a href="${it.href}">${esc(it.label)}</a><span class="sep">${icon('chevLeft')}</span>`;
  });
  return `<div class="crumbs">${parts.join('')}</div>`;
}
function pageHeader(title, sub, actionsHtml = '') {
  return `<div class="page-head">
    <div><div class="page-title">${esc(title)}</div>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>
    <div class="head-actions">${actionsHtml}</div>
  </div>`;
}
const PROVIDER_CLASS = { vf: 'prov-VF', ip: 'prov-IP', mc: 'prov-MC' };
function providerTag(providerId) {
  const p = getProvider(providerId);
  if (!p) return '';
  return `<span class="prov-tag ${PROVIDER_CLASS[providerId] || ''}">${esc(p.name)}</span>`;
}
function accountStatusBadge(status) {
  const tone = status === 'نشط' ? 'ok' : status === 'معلق' ? 'warn' : 'muted';
  return statusBadge(status, tone);
}
function txnStatusBadge(status) {
  const map = { completed: ['مكتملة', 'ok'], pending: ['قيد المراجعة', 'warn'], cancelled: ['ملغاة', 'muted'] };
  const [label, tone] = map[status] || [status, 'muted'];
  return statusBadge(label, tone);
}
function txnTypeBadge(type) {
  return `<span class="badge nodot b-${type === 'transfer' ? 'transfer' : type === 'withdrawal' ? 'withdrawal' : 'deposit'}">${esc(TXN_TYPE_AR[type] || type)}</span>`;
}
function orderStatusBadge(status) {
  const toneMap = { Draft: 'muted', Open: 'info', Collecting: 'info', PartiallyCollected: 'warn', ReadyForTransfer: 'ok', Processing: 'info', Completed: 'ok', Cancelled: 'muted', Expired: 'danger' };
  return statusBadge(ORDER_STATUS_AR[status] || status, toneMap[status] || 'muted');
}
function emptyState(iconName, title, body, actionsHtml = '') {
  return `<div class="empty">${icon(iconName)}<h4>${esc(title)}</h4><p class="small">${esc(body)}</p>${actionsHtml}</div>`;
}
function paginate(arr, page, perPage) {
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = clamp(page, 1, pages);
  const start = (page - 1) * perPage;
  return { rows: arr.slice(start, start + perPage), page, pages, total };
}
function pagerHtml(page, pages, total, label = 'نتيجة') {
  if (pages <= 1) return `<div class="pager"><span>إجمالي ${fmtNum(total)} ${label}</span></div>`;
  return `<div class="pager">
    <span>صفحة ${page} من ${pages} - إجمالي ${fmtNum(total)} ${label}</span>
    <div class="btns">
      <button class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevRight')}</button>
      <button class="btn btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>${icon('chevLeft')}</button>
    </div>
  </div>`;
}
function dateRangeFromPreset(preset) {
  const now = new Date(); let from = null;
  if (preset === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (preset === 'week') from = daysAgoDate(7);
  else if (preset === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (preset === 'year') from = new Date(now.getFullYear(), 0, 1);
  return { from: from ? from.toISOString() : null, to: null };
}
function daysAgoDate(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function fileInputPreview(inputEl, previewEl) {
  inputEl.addEventListener('change', () => {
    const f = inputEl.files[0];
    if (!f) return;
    previewEl.innerHTML = `<div class="file-chip">${icon('file')}<div><div class="bold small">${esc(f.name)}</div><div class="muted small">${(f.size / 1024).toFixed(0)} KB</div></div></div>`;
  });
}
