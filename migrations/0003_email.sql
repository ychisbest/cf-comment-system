-- 阶段 5：邮件通知队列与限频
CREATE TABLE email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  reply_id INTEGER NOT NULL,       -- 新回复的评论 id（发送时再取内容）
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_email_queue ON email_queue(to_email, page_id);

CREATE TABLE notify_log (
  email TEXT NOT NULL,
  page_id INTEGER NOT NULL,
  last_sent INTEGER NOT NULL,
  PRIMARY KEY (email, page_id)
);
