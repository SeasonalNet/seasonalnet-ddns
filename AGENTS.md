# AGENTS.md

## Project

`seasonal-cf-ddns` is the SeasonalNet Cloudflare DDNS daemon.

It keeps explicitly listed Cloudflare `A` records pointed at the current SeasonalNet WAN IPv4 address while preserving per-record proxied/DNS-only policy.

## Rules

- Keep the daemon small and boring.
- Do not add a web UI, database, dashboard, provider abstraction, or automatic service discovery without an explicit plan update.
- Treat `config.example.yaml` as the version-controlled example and `config.yaml` as local-only runtime state.
- Never commit Cloudflare API tokens or `/etc/seasonal/cf-ddns.env` contents.
- Query Cloudflare records by hostname first, then classify by type.
- Do not blindly create an `A` record when the hostname already exists as another record type.
- Prefer safe, partial Cloudflare updates over destructive overwrites.
- A single record failure should not stop the whole pass unless the failure is global, such as WAN IP detection or zone lookup.
- Logs must not include secrets, authorization headers, or full environment dumps.
- Keep systemd deployment compatible with `/opt/seasonal-cf-ddns` and the `cfddns` service account.

## Validation

Before committing runtime changes, run:

```bash
npm run check-config
npm test
```

Before deployment changes, also run:

```bash
npm run dry-run
npm run once
```
