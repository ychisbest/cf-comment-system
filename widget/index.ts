import CSS from './style.css';
import { dictFor, type Dict } from './i18n';
import { resolvePageUrl } from '../src/lib/url';

interface C {
  id: number; parent_id: number | null; root_id: number | null; nickname: string; avatar: string | null;
  content: string; image: string | null; likes: number; dislikes: number; created_at: number; my_vote: number;
}
interface Config {
  settings: { lang: string; pageSize: number; allowImages: boolean; maxDepth: number; maxLength: number };
  custom_css: string; turnstile_sitekey: string;
}
interface Opts {
  base: string; site: string; pageId: string; lang: string; theme: string; cssUrl: string; demo?: boolean; demoCss?: string;
}

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id?: string): void };
    __cmWidget?: { mount(el: HTMLElement, o: Partial<Opts>): void };
  }
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, part?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (part) e.setAttribute('part', part);
  if (text != null) e.textContent = text;
  return e;
};

const store = {
  get(k: string) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } },
};

// 判断宿主网站当前是深色还是浅色：显式标记 > color-scheme > 背景亮度 > 系统偏好
function detectSiteTheme(systemDark: boolean): 'light' | 'dark' {
  const els = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  for (const el of els) {
    const attr = ['data-theme', 'data-bs-theme', 'data-color-mode', 'data-mode', 'color-scheme'].map((a) => el.getAttribute(a) || '').join(' ').toLowerCase();
    if (/\bdark\b/.test(attr)) return 'dark';
    if (/\blight\b/.test(attr)) return 'light';
    const cls = ' ' + el.className + ' ';
    if (/[\s-](dark|dark-mode|theme-dark)[\s]/i.test(cls)) return 'dark';
    if (/[\s-](light|light-mode|theme-light)[\s]/i.test(cls)) return 'light';
  }
  for (const el of els) {
    const cs = getComputedStyle(el);
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (a > 0.5) return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light';
    }
  }
  const cs = getComputedStyle(document.documentElement).colorScheme;
  if (cs === 'dark') return 'dark';
  if (cs === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

function mount(host: HTMLElement, o: Opts) {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.textContent = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const customStyle = document.createElement('style');
  root.appendChild(customStyle);
  if (o.cssUrl) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = o.cssUrl;
    root.appendChild(l);
  }
  const wrap = h('section', 'cm', 'container');
  wrap.setAttribute('aria-label', 'Comments');
  root.appendChild(wrap);

  const mq = matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => { const th = o.theme === 'dark' || o.theme === 'light' ? o.theme : detectSiteTheme(mq.matches); wrap.dataset.theme = th; host.dataset.theme = th; };
  applyTheme();
  mq.addEventListener?.('change', applyTheme);
  if (o.theme !== 'dark' && o.theme !== 'light') {
    // 跟随网站自身的深浅切换（class / data-* 属性 / color-scheme 变化）
    const mo = new MutationObserver(applyTheme);
    const opts = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-bs-theme', 'data-color-mode', 'data-mode', 'style', 'color-scheme'] };
    mo.observe(document.documentElement, opts);
    if (document.body) mo.observe(document.body, opts);
  }

  let { dict: t, locale, dir } = dictFor(o.lang);
  wrap.dir = dir;
  let cfg: Config | null = null;
  let comments: C[] = [];
  let total = 0;
  let cursor: number | null = null;
  let sort: 'new' | 'hot' = 'new';
  const pageUrl = resolvePageUrl(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href, location.href);
  const mkRtf = () => { try { return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }); } catch { return null; } };
  let rtf = mkRtf();

  // ---------- API ----------
  async function api(path: string, init?: RequestInit): Promise<any> {
    if (o.demo) return demoApi(path, init);
    const res = await fetch(o.base + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-cache' });
    let data: any = null;
    try { data = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok) throw Object.assign(new Error(data?.error || 'http_' + res.status), { status: res.status, code: data?.error });
    return data;
  }
  const errText = (e: any): string => {
    if (e?.status === 429) return t.errRate;
    if (e?.code === 'turnstile_failed') return t.errCaptcha;
    if (e?.code === 'banned') return t.errBanned;
    if (e?.code === 'nickname_required') return t.errNick;
    if (e?.code === 'content_required') return t.errText;
    return t.errGeneric;
  };

  // ---------- Turnstile（用户点击输入框时才加载） ----------
  let tsLoading: Promise<void> | null = null;
  let tsId: string | null = null;
  let tsToken: string | null = null;
  let tsWaiters: ((tok: string) => void)[] = [];
  const tsBox = h('div', 'cm-ts');
  function loadTurnstile() {
    if (o.demo || !cfg?.turnstile_sitekey) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise<void>((resolve) => {
      const start = () => {
        if (!window.turnstile) return resolve();
        tsId = window.turnstile.render(tsBox, {
          sitekey: cfg!.turnstile_sitekey, appearance: 'interaction-only', theme: wrap.dataset.theme,
          callback: (tok: string) => { tsToken = tok; const w = tsWaiters; tsWaiters = []; w.forEach((f) => f(tok)); },
          'expired-callback': () => { tsToken = null; },
          'error-callback': () => { tsToken = null; },
        });
        resolve();
      };
      if (window.turnstile) return start();
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = start;
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return tsLoading;
  }
  /** 取一个一次性 token，取走后立即 reset 以便后台生成下一个。 */
  async function takeToken(): Promise<string> {
    if (o.demo) return 'demo';
    await loadTurnstile();
    const tok = tsToken ?? (await new Promise<string>((res, rej) => { tsWaiters.push(res); setTimeout(() => rej(Object.assign(new Error('captcha_timeout'), { code: 'turnstile_failed' })), 30000); }));
    tsToken = null;
    try { window.turnstile?.reset(tsId ?? undefined); } catch { /* 忽略 */ }
    return tok;
  }

  // ---------- 渲染 ----------
  const header = h('div', 'cm-header', 'header');
  const title = h('h2', 'cm-title', 'title');
  const sortBox = h('div', 'cm-sort', 'sort');
  sortBox.setAttribute('role', 'group');
  const listEl = h('ul', 'cm-list', 'list');
  const moreBtn = h('button', 'cm-btn cm-more', 'more-button');
  moreBtn.type = 'button'; moreBtn.hidden = true;
  const status = h('div', 'cm-loading', 'status');
  status.setAttribute('role', 'status');
  const formSlot = h('div');

  function buildHeader() {
    title.textContent = `${t.comments}${total ? ` (${total})` : ''}`;
    sortBox.textContent = '';
    (['new', 'hot'] as const).forEach((k) => {
      const b = h('button', '', 'sort-button', k === 'new' ? t.sortNew : t.sortHot);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(sort === k));
      b.onclick = () => { if (sort !== k) { sort = k; void load(true); } };
      sortBox.appendChild(b);
    });
  }
  header.append(title, sortBox);
  wrap.append(header, formSlot, listEl, status, moreBtn);
  moreBtn.onclick = () => { if (cursor != null) void load(false); };

  function timeLabel(ts: number): string {
    const diff = ts - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diff);
    if (abs < 45) return t.justNow;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, s] of units) if (abs >= s) return rtf ? rtf.format(Math.round(diff / s), u) : new Date(ts * 1000).toLocaleDateString();
    return t.justNow;
  }
  const hue = (s: string | null) => { let n = 0; for (const ch of s || 'x') n = (n * 31 + ch.charCodeAt(0)) % 360; return n; };

  function renderComment(c: C, replyingTo: C | null): HTMLElement {
    const li = h('li', 'cm-item', 'item');
    li.id = 'cm-' + c.id;
    const row = h('div', 'cm-comment', 'comment');
    const av = h('div', 'cm-avatar', 'avatar', (c.nickname.trim()[0] || '?').toUpperCase());
    av.style.background = `hsl(${hue(c.avatar)} 45% 42%)`;
    av.setAttribute('aria-hidden', 'true');
    const body = h('div', 'cm-body');
    const meta = h('div', 'cm-meta', 'meta');
    meta.appendChild(h('span', 'cm-name', 'name', c.nickname));
    if (replyingTo) meta.appendChild(h('span', 'cm-reply-to', 'reply-to', `${t.replyTo} ${replyingTo.nickname}`));
    const time = h('time', 'cm-time', 'time', timeLabel(c.created_at));
    time.dateTime = new Date(c.created_at * 1000).toISOString();
    meta.appendChild(time);
    body.append(meta, h('div', 'cm-text', 'text', c.content));
    if (c.image) {
      const img = h('img', 'cm-img', 'image');
      img.loading = 'lazy';
      img.alt = t.imgAlt + ' ' + c.nickname;
      img.src = `${o.base}/img/${c.image}`;
      body.appendChild(img);
    }
    const tools = h('div', 'cm-tools', 'tools');
    const up = h('button', 'cm-vote', 'vote-up');
    const down = h('button', 'cm-vote', 'vote-down');
    up.type = down.type = 'button';
    const paint = () => {
      up.textContent = `▲ ${c.likes}`; down.textContent = `▼ ${c.dislikes}`;
      up.setAttribute('aria-pressed', String(c.my_vote === 1)); down.setAttribute('aria-pressed', String(c.my_vote === -1));
      up.setAttribute('aria-label', `${t.like} (${c.likes})`); down.setAttribute('aria-label', `${t.dislike} (${c.dislikes})`);
    };
    paint();
    const vote = async (value: 1 | -1) => {
      try {
        const r = await api('/api/vote', { method: 'POST', body: JSON.stringify({ site: o.site, comment_id: c.id, value }) });
        c.likes = r.likes; c.dislikes = r.dislikes; c.my_vote = r.my_vote; paint();
      } catch (e) { flash(errText(e)); }
    };
    up.onclick = () => void vote(1);
    down.onclick = () => void vote(-1);
    const replyBtn = h('button', 'cm-link', 'reply-button', t.reply);
    replyBtn.type = 'button';
    let formEl: HTMLElement | null = null;
    replyBtn.onclick = () => {
      if (formEl) { formEl.remove(); formEl = null; replyBtn.textContent = t.reply; return; }
      formEl = buildForm(c, (nc) => { formEl?.remove(); formEl = null; replyBtn.textContent = t.reply; addComment(nc); });
      formEl.classList.add('cm-reply-form');
      body.appendChild(formEl);
      replyBtn.textContent = t.cancel;
      formEl.querySelector('textarea')?.focus();
    };
    tools.append(up, down, replyBtn);
    body.appendChild(tools);
    row.append(av, body);
    li.appendChild(row);
    return li;
  }

  function renderTree() {
    listEl.textContent = '';
    const byId = new Map(comments.map((c) => [c.id, c]));
    const kids = new Map<number, C[]>();
    const tops: C[] = [];
    for (const c of comments) {
      if (c.parent_id == null) { tops.push(c); continue; }
      // 父评论被隐藏时，挂回楼主
      const pid = byId.has(c.parent_id) ? c.parent_id : c.root_id;
      if (pid == null || !byId.has(pid)) continue;
      (kids.get(pid) ?? kids.set(pid, []).get(pid)!).push(c);
    }
    const maxDepth = cfg?.settings.maxDepth ?? 3;
    const descendants = (id: number, out: C[] = []): C[] => { for (const k of kids.get(id) ?? []) { out.push(k); descendants(k.id, out); } return out; };
    const build = (c: C, depth: number, replyingTo: C | null): HTMLElement => {
      const li = renderComment(c, replyingTo);
      let children: C[] = [];
      let flat = false;
      if (depth >= maxDepth) { children = descendants(c.id).sort((a, b) => a.id - b.id); flat = true; }
      else children = (kids.get(c.id) ?? []).sort((a, b) => a.id - b.id);
      if (children.length) {
        const ul = h('ul', 'cm-replies' + (depth < maxDepth ? ' cm-indent' : ''), 'replies');
        for (const k of children) ul.appendChild(flat ? renderComment(k, byId.get(k.parent_id!) ?? null) : build(k, depth + 1, null));
        li.appendChild(ul);
      }
      return li;
    };
    for (const c of tops) listEl.appendChild(build(c, 1, null));
    status.textContent = tops.length ? '' : t.empty;
    status.className = tops.length ? '' : 'cm-empty';
    buildHeader();
  }

  function addComment(nc: C) {
    comments.push(nc);
    total += 1;
    if (sort === 'new' && nc.parent_id == null) comments = [...comments.filter((x) => x.id === nc.id), ...comments.filter((x) => x.id !== nc.id)];
    renderTree();
    root.getElementById?.('cm-' + nc.id)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const flash = (msg: string) => { status.className = 'cm-error'; status.textContent = msg; };

  // ---------- 表单 ----------
  function buildForm(parent: C | null, done: (c: C) => void): HTMLElement {
    const f = h('form', 'cm-form', 'form');
    f.noValidate = true;
    const ta = h('textarea', '', 'textarea');
    ta.placeholder = t.placeholder; ta.setAttribute('aria-label', t.placeholder);
    ta.maxLength = cfg?.settings.maxLength ?? 3000;
    const nick = h('input', '', 'input'); nick.type = 'text'; nick.placeholder = t.nickname; nick.setAttribute('aria-label', t.nickname);
    nick.maxLength = 40; nick.autocomplete = "nickname" as AutoFill; nick.value = store.get('cm_nick');
    const mail = h('input', '', 'input'); mail.type = 'email'; mail.placeholder = t.email; mail.setAttribute('aria-label', t.email);
    mail.autocomplete = "email"; mail.value = store.get('cm_email');
    const row = h('div', 'row'); row.append(nick, mail);
    const err = h('div', 'cm-error', 'error'); err.setAttribute('role', 'alert');
    const actions = h('div', 'cm-actions', 'actions');
    const notifyLabel = h('label', 'cm-notify');
    const notify = document.createElement('input'); notify.type = 'checkbox'; notify.checked = store.get('cm_notify') === '1';
    notifyLabel.append(notify, document.createTextNode(t.notify));
    let imageKey: string | null = null;
    const preview = h('div', 'cm-preview-slot');
    const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/jpeg,image/png,image/webp,image/gif'; fileIn.hidden = true;
    const imgBtn = h('button', 'cm-btn', 'image-button', '🖼 ' + t.image); imgBtn.type = 'button';
    imgBtn.hidden = cfg?.settings.allowImages === false;
    imgBtn.onclick = () => fileIn.click();
    const submit = h('button', 'cm-submit', 'submit', t.submit); submit.type = 'submit';
    const spacer = h('span', 'spacer');
    actions.append(imgBtn, fileIn, notifyLabel, spacer);
    if (parent) {
      const cancel = h('button', 'cm-btn', 'cancel-button', t.cancel); cancel.type = 'button';
      cancel.onclick = () => (f.parentElement?.querySelector('.cm-link') as HTMLElement | null)?.click();
      actions.appendChild(cancel);
    }
    actions.appendChild(submit);
    f.append(ta, row, preview, err, actions);

    const warm = () => void loadTurnstile();
    ta.addEventListener('focus', warm, { once: true });
    nick.addEventListener('focus', warm, { once: true });

    fileIn.onchange = async () => {
      const file = fileIn.files?.[0];
      fileIn.value = '';
      if (!file) return;
      err.textContent = '';
      imgBtn.disabled = true;
      try {
        const blob = await compress(file);
        const fd = new FormData();
        fd.append('site', o.site);
        fd.append('token', await takeToken());
        fd.append('file', blob, 'image.webp');
        const res = await fetch(o.base + '/api/upload', { method: 'POST', body: fd });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status, code: data.error });
        imageKey = data.image_key;
        preview.textContent = '';
        const box = h('div', 'cm-preview', 'preview');
        const im = document.createElement('img'); im.src = URL.createObjectURL(blob); im.alt = '';
        const x = h('button', '', 'preview-remove', '×'); x.type = 'button'; x.setAttribute('aria-label', t.removeImage);
        x.onclick = () => { imageKey = null; preview.textContent = ''; imgBtn.hidden = false; };
        box.append(im, x); preview.appendChild(box);
        imgBtn.hidden = true;
      } catch (e: any) {
        err.textContent = e?.code === 'image_processing' ? t.errImage : errText(e);
      } finally { imgBtn.disabled = false; }
    };

    f.onsubmit = async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      if (!nick.value.trim()) { err.textContent = t.errNick; nick.focus(); return; }
      if (!ta.value.trim()) { err.textContent = t.errText; ta.focus(); return; }
      submit.disabled = true; submit.textContent = t.posting;
      try {
        const token = await takeToken();
        const r = await api('/api/comments', {
          method: 'POST',
          body: JSON.stringify({
            site: o.site, url: pageUrl, page_id: o.pageId || undefined, title: document.title,
            parent_id: parent?.id ?? null, nickname: nick.value, email: mail.value, content: ta.value,
            image_key: imageKey, notify: notify.checked && !!mail.value.trim(), token,
          }),
        });
        store.set('cm_nick', nick.value); store.set('cm_email', mail.value); store.set('cm_notify', notify.checked ? '1' : '0');
        ta.value = ''; imageKey = null; preview.textContent = ''; imgBtn.hidden = cfg?.settings.allowImages === false;
        done(r.comment);
        if (r.flagged) flash(t.pending);
      } catch (e) {
        err.textContent = errText(e);
      } finally { submit.disabled = false; submit.textContent = t.submit; }
    };
    if (!parent) f.appendChild(tsBox);
    return f;
  }

  async function compress(file: File): Promise<Blob> {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw Object.assign(new Error('bad type'), { code: 'image_processing' });
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * scale)); cv.height = Math.max(1, Math.round(bmp.height * scale));
      cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
      let q = 0.86;
      for (;;) {
        const b: Blob | null = await new Promise((res) => cv.toBlob(res, 'image/webp', q));
        if (!b) throw new Error('toBlob');
        if (b.size <= 1024 * 1024 || q < 0.4) { if (b.size > 2 * 1024 * 1024) throw new Error('too big'); return b; }
        q -= 0.12;
      }
    } catch { throw Object.assign(new Error('image_processing'), { code: 'image_processing' }); }
  }

  // ---------- 加载 ----------
  async function load(reset: boolean) {
    if (reset) { comments = []; cursor = null; listEl.textContent = ''; }
    status.className = 'cm-loading'; status.textContent = t.loading; moreBtn.hidden = true;
    try {
      const qs = new URLSearchParams({ site: o.site, url: pageUrl, sort });
      if (o.pageId) qs.set('page_id', o.pageId);
      if (cursor != null) qs.set('cursor', String(cursor));
      const r = await api('/api/comments?' + qs);
      if (r.config && !cfg) {
        cfg = r.config as Config;
        if (o.lang === 'auto' && cfg.settings.lang && cfg.settings.lang !== 'auto') ({ dict: t, locale, dir } = dictFor(cfg.settings.lang)); wrap.dir = dir; rtf = mkRtf();
        customStyle.textContent = (cfg.custom_css || '') + (o.demoCss || '');
        formSlot.textContent = '';
        formSlot.appendChild(buildForm(null, addComment));
      }
      comments = comments.concat(r.comments);
      total = r.total; cursor = r.next_cursor;
      renderTree();
      moreBtn.hidden = cursor == null; moreBtn.textContent = t.more;
    } catch {
      status.className = 'cm-error'; status.textContent = t.errLoad;
      const retry = h('button', 'cm-link', 'retry-button', t.retry); retry.type = 'button'; retry.onclick = () => void load(reset);
      status.appendChild(retry);
    }
  }

  // ---------- 演示模式（后台 CSS 预览用，不发请求） ----------
  function demoApi(path: string, init?: RequestInit): any {
    const ts = Math.floor(Date.now() / 1000);
    if (path.startsWith('/api/comments?')) {
      const mk = (id: number, parent: number | null, nick: string, text: string, likes: number): any => ({ id, parent_id: parent, root_id: parent ? 1 : null, nickname: nick, avatar: nick, content: text, image: null, likes, dislikes: 0, created_at: ts - id * 3600, my_vote: id === 2 ? 1 : 0 });
      return { comments: [mk(1, null, 'Alice', 'Great article, thanks for sharing!', 5), mk(2, 1, 'Bob', 'Agreed — the second section was very helpful.', 2), mk(3, null, 'Carol', 'A question about the last example…', 0)], total: 3, next_cursor: null, config: { settings: { lang: 'auto', pageSize: 20, allowImages: true, maxDepth: 3, maxLength: 3000 }, custom_css: '', turnstile_sitekey: '' } };
    }
    return { likes: 1, dislikes: 0, my_vote: 1, comment: { id: 99, parent_id: null, root_id: null, nickname: 'You', avatar: 'you', content: JSON.parse((init?.body as string) || '{}').content || '', image: null, likes: 0, dislikes: 0, created_at: ts, my_vote: 0 } };
  }

  // ---------- 懒加载：进入视口再请求 ----------
  const start = () => void load(true);
  if (o.demo || !('IntersectionObserver' in window)) start();
  else {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
    io.observe(host);
  }
  buildHeader();
}

function auto() {
  const s = document.currentScript as HTMLScriptElement | null;
  if (!s || !s.dataset.site) return;
  const target = (s.dataset.target && document.querySelector<HTMLElement>(s.dataset.target)) || document.getElementById('comments');
  if (!target) { console.warn('[comments] #comments container not found'); return; }
  mount(target, {
    base: new URL(s.src).origin, site: s.dataset.site, pageId: (s.dataset.pageId || '').trim(),
    lang: s.dataset.lang || 'auto', theme: s.dataset.theme || 'auto', cssUrl: s.dataset.cssUrl || '',
  });
}

window.__cmWidget = { mount: (el, o) => mount(el, { base: '', site: 'demo', pageId: '', lang: 'auto', theme: 'auto', cssUrl: '', ...o }) };
auto();
