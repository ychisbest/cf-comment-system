-- 阶段 1：核心表（与 SPEC 第 4 节一致）
CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domains TEXT NOT NULL,
  custom_css TEXT DEFAULT '',
  settings TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  title TEXT,
  url TEXT,
  comment_count INTEGER DEFAULT 0,
  UNIQUE(site_id, page_key)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  site_id TEXT NOT NULL,
  parent_id INTEGER,
  root_id INTEGER,
  nickname TEXT NOT NULL,
  email TEXT,
  email_hash TEXT,
  content TEXT NOT NULL,
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'visible',
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- 扩展：0=正常 1=待核查(外链多/命中黑名单) 2=站长已人工通过
  flagged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_comments_page ON comments(page_id, status, created_at);
CREATE INDEX idx_comments_root ON comments(root_id);
CREATE INDEX idx_comments_ip ON comments(ip_hash, created_at);
CREATE INDEX idx_comments_site ON comments(site_id, status, id);

CREATE TABLE votes (
  comment_id INTEGER NOT NULL,
  voter_hash TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (comment_id, voter_hash)
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_subs_comment ON subscriptions(comment_id);

CREATE TABLE bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT,
  ip_hash TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_bans_ip ON bans(ip_hash);
