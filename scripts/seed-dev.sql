INSERT OR REPLACE INTO sites (id, name, domains, custom_css, settings, created_at)
VALUES ('site_dev', 'Dev site', '["localhost","example.com"]', '', '{}', strftime('%s','now'));
