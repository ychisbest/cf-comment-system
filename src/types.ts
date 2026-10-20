export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  // secrets
  ADMIN_TOKEN: string;
  TURNSTILE_SECRET?: string; // 可选：不配置则关闭 Turnstile
  RESEND_API_KEY: string;
  IP_SALT: string;
  // vars
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_VERIFY_URL?: string; // 仅测试用：覆盖 siteverify 地址
  EMAIL_FROM: string;
  PUBLIC_BASE_URL: string;
  RESEND_API_URL?: string; // 仅测试用：覆盖 Resend 地址
  RATE_COMMENT?: string;
  RATE_UPLOAD?: string;
  RATE_VOTE?: string;
  EMAIL_DAILY_LIMIT?: string;
}

export interface SiteSettings {
  lang: string;
  pageSize: number;
  allowImages: boolean;
  maxDepth: number; // 前端缩进层数上限
  maxLength: number;
  stripWww: boolean;
  queryMode: 'keep' | 'drop';
  ssrEnabled: boolean;
  ssrDelayHours: number;
  ssrMaxComments: number;
  maxLinks: number; // 超过则标记待核查
  blacklist: string[];
}

export interface Site {
  id: string;
  name: string;
  domains: string[];
  custom_css: string;
  settings: SiteSettings;
  created_at: number;
}

export type AppEnv = { Bindings: Env };
