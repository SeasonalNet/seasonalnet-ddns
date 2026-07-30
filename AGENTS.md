# AGENTS.md

## Project

`seasonal-cf-ddns` is the SeasonalNet Cloudflare DDNS daemon.

It keeps explicitly listed Cloudflare `A` and `AAAA` records pointed at the configured IPv4 and IPv6 sources while preserving per-record proxied/DNS-only policy.

## Rules

- Keep the daemon small and boring.
- Do not add a web UI, database, dashboard, provider abstraction, or automatic service discovery without an explicit plan update.
- Treat `config.example.yaml` as the version-controlled example and `config.yaml` as local-only runtime state.
- Never commit Cloudflare API tokens or `/etc/sn-ddns/ddns.env` contents.
- Query Cloudflare records by hostname first, then classify by type.
- Treat `A` and `AAAA` as independent RRsets: create a missing address type while preserving compatible records at the same hostname.
- Never create `A` or `AAAA` beside a blocking `CNAME`; skip the configured record and report the conflict.
- Prefer safe, partial Cloudflare updates over destructive overwrites.
- A single record failure should not stop the whole pass unless the failure is global, such as address detection or zone lookup.
- Logs must not include secrets, authorization headers, or full environment dumps.
- Keep systemd deployment compatible with `/opt/seasonal-cf-ddns` and the `cfddns` service account.
- Keep Docker deployment unprivileged, read-only, and compatible with host-network IPv6 discovery on the VM running that instance.
- Keep record ownership explicit across instances. Two hosts must not manage the same hostname/type pair.
- Pass the Cloudflare token through an environment file; never bake it into an image or Compose file.

## Validation

Before committing runtime changes, run:

```bash
pnpm check-config
npm test
```

Before deployment changes, also run:

```bash
pnpm dry-run
pnpm once
```
