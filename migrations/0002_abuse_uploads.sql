-- 阶段 3：限流计数、上传登记
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_expires ON rate_limits(expires_at);

CREATE TABLE uploads (
  key TEXT PRIMARY KEY,           -- R2 对象 key
  site_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  comment_id INTEGER,             -- 被评论引用后写入；为空且超过 24h 的会被清理
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_uploads_orphan ON uploads(comment_id, created_at);
