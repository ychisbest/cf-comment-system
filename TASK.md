# Task
Implement the project described in SPEC.md (read it fully first) in this directory.

Rules:
- Work through phases 1-6 in order (SPEC section 12). After each phase: run unit tests + `wrangler dev --local` smoke test (local D1/R2 emulation), fix problems, then `git commit` (init repo if needed) before continuing.
- Do NOT deploy to Cloudflare, create remote resources, or use real secrets. Use placeholders in wrangler.toml; local dev uses .dev.vars (gitignored) with dummy values; use Turnstile test keys locally.
- Deliverables: everything in SPEC section 14 (source, wrangler.toml, migrations, README, unit tests, embed example page).
- Security requirements (SPEC section 9) are mandatory.
- Keep PROGRESS.md updated with per-phase status. When all phases pass local verification, write a final summary in PROGRESS.md and stop.
