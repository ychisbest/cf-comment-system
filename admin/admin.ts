// 管理后台：令牌只存 sessionStorage；所有用户内容经 textContent 渲染。
export {};
const cmw = window as unknown as { __cmWidget?: { mount(el: HTMLElement, o: Record<string, unknown>): void } };

const app = document.getElementById('app')!;
const TOKEN_KEY = 'cm_admin_token';
let token = '';
try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* 忽略 */ }

type Attrs = Record<string, string | boolean | ((e: Event) => void) | undefined>;
function h(tag: string, attrs?: Attrs | null, ...kids: (Node | string | null | undefined)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (typeof v === 'boolean') e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
const clear = (e: Element) => { e.textContent = ''; };

function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch('/admin/api' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new ApiError(401, 'unauthorized'); }
  if (!res.ok) throw new ApiError(res.status, data.error || 'error');
  return data as T;
}
const post = (p: string, b: unknown, m = 'POST') => api(p, { method: m, body: JSON.stringify(b) });

function logout() {
  token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* 忽略 */ }
  renderLogin();
}

// ---------- 登录 ----------
function renderLogin(message = '') {
  clear(app);
  const input = h('input', { type: 'password', placeholder: '管理密钥 (ADMIN_TOKEN)', autocomplete: 'current-password', 'aria-label': '管理密钥' }) as HTMLInputElement;
  const err = h('div', { class: 'err', role: 'alert' }, message);
  const form = h('form', { class: 'card login', onsubmit: async (e) => {
    e.preventDefault();
    token = input.value.trim();
    try {
      await api('/stats');
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* 忽略 */ }
      renderShell();
    } catch (x) {
      token = '';
      err.textContent = x instanceof ApiError && x.status === 429 ? '失败次数过多，请稍后再试' : '密钥无效';
    }
  } }, h('h2', null, '评论后台登录'), input, err, h('button', { class: 'primary', type: 'submit' }, '登录'));
  app.append(form);
  input.focus();
}

// ---------- 外壳 ----------
type Tab = 'overview' | 'comments' | 'sites' | 'bans';
const TABS: [Tab, string][] = [['overview', '总览'], ['comments', '评论'], ['sites', '站点'], ['bans', '封禁']];
let tab: Tab = 'overview';
let content: HTMLElement;
let nav: HTMLElement;

function renderShell() {
  clear(app);
  nav = h('nav', { 'aria-label': '主导航' });
  content = h('main', null);
  app.append(h('header', { class: 'top' }, h('h1', null, '评论后台'), nav, h('button', { onclick: logout }, '退出')), content);
  go(tab);
}
function go(t: Tab) {
  tab = t;
  clear(nav);
  for (const [k, label] of TABS) nav.append(h('button', { 'aria-current': k === t ? 'page' : undefined, onclick: () => go(k) }, label));
  clear(content);
  const run = { overview: viewOverview, comments: viewComments, sites: viewSites, bans: viewBans }[t];
  run().catch((e) => { if (!(e instanceof ApiError && e.status === 401)) toast('出错：' + e.message); });
}

const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleString();

// ---------- 总览 ----------
async function viewOverview() {
  const s = await api('/stats');
  const stat = (label: string, n: number) => h('div', { class: 'stat' }, h('b', null, String(n)), h('span', { class: 'muted' }, label));
  content.append(
    h('div', { class: 'card' }, h('h2', null, '全部站点'), h('div', { class: 'grid' },
      stat('可见评论', s.total.visible), stat('近 24 小时新增', s.total.last_24h), stat('待核查', s.total.pending_review), stat('已隐藏', s.total.hidden), stat('垃圾', s.total.spam))),
  );
  const rows = s.sites.map((r: any) => h('tr', null,
    h('td', null, r.name, h('div', { class: 'muted' }, r.site_id)), h('td', null, String(r.visible)), h('td', null, String(r.last_24h)),
    h('td', null, r.pending_review ? h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); commentFilter = { site: r.site_id, pending: true }; go('comments'); } }, String(r.pending_review)) : '0'),
    h('td', null, String(r.hidden + r.spam))));
  content.append(h('div', { class: 'card table-wrap' }, h('h2', null, '各站点'), h('table', null,
    h('thead', null, h('tr', null, ...['站点', '评论数', '24h 新增', '待核查', '隐藏/垃圾'].map((x) => h('th', null, x)))), h('tbody', null, ...rows))));
}

// ---------- 评论 ----------
let commentFilter: { site?: string; status?: string; q?: string; pending?: boolean } = {};

async function viewComments() {
  const { sites } = await api('/sites');
  const siteSel = h('select', { 'aria-label': '站点' }, h('option', { value: '' }, '全部站点'), ...sites.map((s: any) => h('option', { value: s.id }, s.name))) as HTMLSelectElement;
  const statusSel = h('select', { 'aria-label': '状态' }, ...[['', '全部状态'], ['visible', '可见'], ['hidden', '已隐藏'], ['spam', '垃圾'], ['pending', '待核查']].map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
  const qIn = h('input', { type: 'search', placeholder: '搜索内容 / 昵称', 'aria-label': '搜索' }) as HTMLInputElement;
  siteSel.value = commentFilter.site ?? '';
  statusSel.value = commentFilter.pending ? 'pending' : commentFilter.status ?? '';
  qIn.value = commentFilter.q ?? '';
  const list = h('div', null);
  const more = h('button', { hidden: true }, '加载更多');
  const bulkBar = h('div', { class: 'row' });
  const selected = new Set<number>();
  let cursor: number | null = null;

  const refreshBulk = () => {
    clear(bulkBar);
    bulkBar.append(h('span', { class: 'muted' }, `已选 ${selected.size} 条`));
    for (const [a, label, cls] of [['hide', '隐藏', ''], ['spam', '标记垃圾', ''], ['restore', '恢复', ''], ['approve', '通过核查', ''], ['delete', '永久删除', 'danger']] as const)
      bulkBar.append(h('button', { class: cls, disabled: selected.size === 0, onclick: async () => {
        if (a === 'delete' && !confirm(`永久删除 ${selected.size} 条评论？此操作不可恢复`)) return;
        const r = await post('/comments/bulk', { action: a, ids: [...selected] });
        toast(`已处理 ${r.updated} 条`); selected.clear(); void load(true);
      } }, label));
  };

  async function act(id: number, a: 'hide' | 'spam' | 'restore' | 'delete' | 'approve') {
    if (a === 'delete' && !confirm('永久删除这条评论？')) return;
    await post('/comments/bulk', { action: a, ids: [id] });
    void load(true);
  }

  function row(c: any): HTMLElement {
    const cb = h('input', { type: 'checkbox', 'aria-label': '选择评论 ' + c.id, onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? selected.add(c.id) : selected.delete(c.id); refreshBulk(); } }) as HTMLInputElement;
    cb.checked = selected.has(c.id);
    const btn = (label: string, fn: () => void, cls = '') => h('button', { class: cls, onclick: fn }, label);
    const acts = h('div', { class: 'actions' });
    if (c.status === 'visible') acts.append(btn('隐藏', () => act(c.id, 'hide')));
    else acts.append(btn('恢复', () => act(c.id, 'restore')));
    if (c.status !== 'spam') acts.append(btn('垃圾', () => act(c.id, 'spam')));
    if (c.pending_review) acts.append(btn('通过核查', () => act(c.id, 'approve')));
    acts.append(
      btn('封禁 IP（本站）', async () => { if (!confirm('封禁该评论者 IP（仅本站）并隐藏其现有评论？')) return; await post('/bans', { comment_id: c.id, scope: 'site', hide_existing: true, reason: 'admin ui' }); toast('已封禁'); void load(true); }),
      btn('封禁 IP（全局）', async () => { if (!confirm('全局封禁该 IP 并隐藏其现有评论？')) return; await post('/bans', { comment_id: c.id, scope: 'global', hide_existing: true, reason: 'admin ui' }); toast('已封禁'); void load(true); }),
      btn('永久删除', () => act(c.id, 'delete'), 'danger'));
    const img = c.image_key ? h('div', null, h('img', { src: '/img/' + c.image_key, alt: '评论图片', loading: 'lazy', style: 'max-height:120px;max-width:100%;border-radius:6px' })) : null;
    const where = c.page_url ? h('a', { href: c.page_url, target: '_blank', rel: 'noopener noreferrer' }, c.page_title || c.page_key) : h('span', null, c.page_title || c.page_key);
    return h('div', { class: 'cm-row' }, cb, h('div', null,
      h('div', { class: 'meta' }, h('b', null, c.nickname), h('span', { class: 'badge ' + c.status }, c.status), c.pending_review ? h('span', { class: 'badge pending' }, '待核查') : null,
        h('span', null, fmtTime(c.created_at)), h('span', null, c.site_id), where, h('span', null, `👍${c.likes} 👎${c.dislikes}`), h('span', null, `#${c.id}`)),
      h('div', { class: 'content' }, c.content), img, acts));
  }

  async function load(reset: boolean) {
    if (reset) { cursor = null; clear(list); }
    const p = new URLSearchParams({ limit: '30' });
    if (siteSel.value) p.set('site', siteSel.value);
    if (statusSel.value === 'pending') p.set('pending', '1'); else if (statusSel.value) p.set('status', statusSel.value);
    if (qIn.value.trim()) p.set('q', qIn.value.trim());
    if (cursor) p.set('cursor', String(cursor));
    const r = await api('/comments?' + p);
    if (reset && !r.comments.length) list.append(h('p', { class: 'muted' }, '没有符合条件的评论'));
    for (const c of r.comments) list.append(row(c));
    cursor = r.next_cursor;
    more.hidden = cursor == null;
    refreshBulk();
  }
  more.onclick = () => void load(false);
  const reload = () => { commentFilter = { site: siteSel.value, status: statusSel.value === 'pending' ? undefined : statusSel.value, pending: statusSel.value === 'pending', q: qIn.value }; selected.clear(); void load(true); };
  siteSel.onchange = statusSel.onchange = reload;
  qIn.onkeydown = (e) => { if (e.key === 'Enter') reload(); };
  content.append(h('div', { class: 'card' }, h('div', { class: 'row' }, siteSel, statusSel, qIn, h('button', { class: 'primary', onclick: reload }, '筛选')), bulkBar, list, more));
  await load(true);
}

// ---------- 站点 ----------
const SETTING_FIELDS: [string, string, 'number' | 'bool' | 'text' | 'lines'][] = [
  ['pageSize', '每页条数', 'number'], ['maxDepth', '嵌套缩进层数', 'number'], ['maxLength', '评论最大长度', 'number'], ['allowImages', '允许图片', 'bool'],
  ['lang', '语言 (auto/en/zh)', 'text'], ['ssrEnabled', '启用 SEO 片段 (SSR)', 'bool'], ['ssrDelayHours', 'SSR 延迟（小时）', 'number'], ['ssrMaxComments', 'SSR 最多条数', 'number'],
  ['maxLinks', '外链阈值（超过则待核查）', 'number'], ['stripWww', '规范化时去掉 www', 'bool'], ['queryMode', '查询参数 (keep/drop)', 'text'], ['blacklist', '黑名单关键词（每行一个）', 'lines'],
];

async function viewSites() {
  const { sites } = await api('/sites');
  const newBtn = h('button', { class: 'primary', onclick: async () => {
    const name = prompt('站点名称'); if (!name) return;
    const domains = prompt('允许的域名（逗号分隔，如 example.com,*.example.com）'); if (!domains) return;
    try { await post('/sites', { name, domains: domains.split(',').map((x) => x.trim()) }); toast('已创建'); go('sites'); } catch (e: any) { toast('创建失败：' + e.message); }
  } }, '＋ 新增站点');
  content.append(h('div', { class: 'row' }, newBtn));
  for (const s of sites) content.append(siteCard(s));
}

function siteCard(s: any): HTMLElement {
  const name = h('input', { type: 'text', value: s.name }) as HTMLInputElement;
  const domains = h('textarea', { rows: '3', 'aria-label': '域名白名单' }) as HTMLTextAreaElement;
  domains.value = s.domains.join('\n');
  const css = h('textarea', { rows: '10', 'aria-label': '自定义 CSS', spellcheck: 'false' }) as HTMLTextAreaElement;
  css.value = s.custom_css;
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const fields = SETTING_FIELDS.map(([k, label, type]) => {
    let el: HTMLInputElement | HTMLTextAreaElement;
    const v = s.settings[k];
    if (type === 'bool') { el = h('input', { type: 'checkbox' }) as HTMLInputElement; (el as HTMLInputElement).checked = !!v; }
    else if (type === 'lines') { el = h('textarea', { rows: '3' }) as HTMLTextAreaElement; el.value = (v as string[]).join('\n'); }
    else { el = h('input', { type: type === 'number' ? 'number' : 'text' }) as HTMLInputElement; el.value = String(v); }
    inputs.set(k, el);
    return h('div', { class: 'field' }, h('label', null, label), el);
  });
  const previewBox = h('div', { class: 'preview' });
  const renderPreview = () => {
    const go = () => { clear(previewBox); const host = h('div'); previewBox.append(host); cmw.__cmWidget?.mount(host, { demo: true, demoCss: css.value, theme: 'light', lang: 'zh' }); };
    if (cmw.__cmWidget) go();
    else { const sc = h('script', { src: '/widget.js' }); sc.addEventListener('load', go); document.head.append(sc); }
  };
  css.addEventListener('input', () => { clearTimeout((css as any)._t); (css as any)._t = setTimeout(renderPreview, 250); });
  const embed = h('pre', null, s.embed_code);
  const save = h('button', { class: 'primary', onclick: async () => {
    const settings: Record<string, unknown> = {};
    for (const [k, , type] of SETTING_FIELDS) {
      const el = inputs.get(k)!;
      settings[k] = type === 'bool' ? (el as HTMLInputElement).checked : type === 'number' ? Number(el.value) : type === 'lines' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value.trim();
    }
    try {
      await post('/sites/' + s.id, { name: name.value, domains: domains.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean), custom_css: css.value, settings }, 'PATCH');
      toast('已保存');
    } catch (e: any) { toast('保存失败：' + e.message); }
  } }, '保存');
  const del = h('button', { class: 'danger', onclick: async () => {
    if (prompt(`删除站点将同时删除其全部评论与图片。输入站点 ID（${s.id}）确认：`) !== s.id) return;
    await api('/sites/' + s.id + '?confirm=' + encodeURIComponent(s.id), { method: 'DELETE' });
    toast('已删除'); go('sites');
  } }, '删除站点');
  const details = h('details', null, h('summary', null, '编辑 / 自定义 CSS / 设置'),
    h('div', { class: 'two', style: 'margin-top:10px' },
      h('div', null, h('div', { class: 'field' }, h('label', null, '名称'), name), h('div', { class: 'field' }, h('label', null, '域名白名单（每行一个，支持 *.example.com）'), domains), ...fields),
      h('div', null, h('div', { class: 'field' }, h('label', null, '自定义 CSS（变量：--cm-bg --cm-text --cm-accent --cm-radius …）'), css), h('div', { class: 'field' }, h('label', null, '预览'), previewBox))),
    h('div', { class: 'row' }, save, del));
  details.addEventListener('toggle', () => { if ((details as HTMLDetailsElement).open) renderPreview(); });
  return h('div', { class: 'card' }, h('h2', null, s.name), h('div', { class: 'muted' }, `ID: ${s.id} · 域名: ${s.domains.join(', ')}`), h('div', { class: 'field', style: 'margin-top:8px' }, h('label', null, '嵌入代码'), embed,
    h('button', { onclick: async () => { try { await navigator.clipboard.writeText(s.embed_code); toast('已复制'); } catch { toast('复制失败，请手动选择'); } } }, '复制')), details);
}

// ---------- 封禁 ----------
async function viewBans() {
  const { bans } = await api('/bans');
  const rows = bans.map((b: any) => h('tr', null, h('td', null, b.site_id || '全局'), h('td', null, String(b.ip_hash || '').slice(0, 12) + '…'), h('td', null, b.reason || ''), h('td', null, fmtTime(b.created_at)),
    h('td', null, h('button', { onclick: async () => { await api('/bans/' + b.id, { method: 'DELETE' }); toast('已解除'); go('bans'); } }, '解除'))));
  content.append(h('div', { class: 'card table-wrap' }, h('h2', null, '封禁列表'), bans.length ? h('table', null, h('thead', null, h('tr', null, ...['范围', 'IP 哈希', '原因', '时间', ''].map((x) => h('th', null, x)))), h('tbody', null, ...rows)) : h('p', { class: 'muted' }, '暂无封禁')));
}

if (token) renderShell(); else renderLogin();
