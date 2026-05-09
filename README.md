# SeasonalNet Cloudflare DDNS

`seasonal-cf-ddns` is the SeasonalNet Cloudflare dynamic DNS daemon.

It keeps selected public `seasonalnet.org` DNS records pointed at the current SeasonalNet WAN IPv4 address. It replaces the older Bash/systemd-timer implementation with a small Node.js service that runs continuously under systemd.

## What It Manages

The daemon manages only records explicitly listed in `config.yaml`.

It is intended for public edge hostnames such as:

- `www.seasonalnet.org`
- `docs.seasonalnet.org`
- `auth.seasonalnet.org`
- `git.seasonalnet.org`
- `grafana.seasonalnet.org`
- `pbx.seasonalnet.org`
- `sip.seasonalnet.org`

Each record declares whether it should be Cloudflare-proxied or DNS-only.

Example:

```yaml
records:
  - name: grafana.seasonalnet.org
    type: A
    proxied: true

  - name: sip.seasonalnet.org
    type: A
    proxied: false
```

## What It Does Not Manage

The daemon does not discover records automatically.

It does not manage mail/autodiscovery names unless they are deliberately added to `config.yaml`.

Leave these out unless their DNS behavior is reviewed first:

- `mail.seasonalnet.org`
- `autoconfig.seasonalnet.org`
- `autodiscover.seasonalnet.org`

These records may need DNS-only, CNAME, MX, or service-specific treatment.

## Runtime Location

Current SeasonalWeb deployment path:

```text
/opt/seasonalnet/seasonalnet-ddns
```

systemd unit:

```text
/etc/systemd/system/seasonal-cf-ddns-node.service
```

Cloudflare token environment file:

```text
/etc/seasonal/cf-ddns.env
```

Expected token variable:

```env
CF_API_TOKEN=replace-with-real-token
```

The token file should be readable by root and the service group only:

```bash
chown root:cfddns /etc/seasonal/cf-ddns.env
chmod 0640 /etc/seasonal/cf-ddns.env
```

## Configuration

Copy the example config before first use:

```bash
cp config.example.yaml config.yaml
```

`config.yaml` is local-only and should not be committed.

Main settings:

```yaml
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN

wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600

conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record

logging:
  level: info
```

## Commands

Check config:

```bash
npm run check-config
```

Run tests:

```bash
npm test
```

Run a dry-run pass:

```bash
set -a
. /etc/seasonal/cf-ddns.env
set +a

npm run dry-run
```

Run one live pass:

```bash
set -a
. /etc/seasonal/cf-ddns.env
set +a

npm run once
```

The manual `set -a` step is needed because direct shell runs do not automatically load the systemd `EnvironmentFile`.

## systemd Operation

Start the daemon:

```bash
systemctl start seasonal-cf-ddns-node.service
```

Enable it at boot:

```bash
systemctl enable seasonal-cf-ddns-node.service
```

Check status:

```bash
systemctl status seasonal-cf-ddns-node.service --no-pager
```

View logs:

```bash
journalctl -u seasonal-cf-ddns-node.service -n 100 --no-pager
```

The daemon runs one DDNS pass at startup, then repeats based on `wan_ip.interval_seconds`.

## Expected Healthy Output

A healthy pass should end with a summary similar to:

```text
DDNS pass complete: changed=0 unchanged=13 skipped=0 failed=0
Scheduling DDNS passes every 600 seconds
```

`changed` may be nonzero when the WAN IP changes or when Cloudflare record settings are corrected.

## DNS Validation

DNS-only records should resolve to the SeasonalNet WAN IPv4 address:

```bash
dig @1.1.1.1 sip.seasonalnet.org A +short
```

Cloudflare-proxied records should resolve to Cloudflare edge IPs, not the SeasonalNet WAN IP:

```bash
dig @1.1.1.1 grafana.seasonalnet.org A +short
dig @1.1.1.1 www.seasonalnet.org A +short
```

## Legacy Service

This daemon replaces the old Bash timer/service pair:

```text
seasonal-cf-ddns.timer
seasonal-cf-ddns.service
/usr/local/sbin/seasonal-cf-ddns.sh
```

After the Node daemon is proven healthy:

```bash
systemctl disable --now seasonal-cf-ddns.timer
systemctl reset-failed seasonal-cf-ddns.service
systemctl enable --now seasonal-cf-ddns-node.service
```

The old Bash script can be kept temporarily as a rollback artifact, but it should not be timer-driven once the Node daemon is active.

## Troubleshooting

### Missing Cloudflare token during manual run

If this appears:

```text
Cloudflare API token environment variable is missing: CF_API_TOKEN
```

Load the env file first:

```bash
set -a
. /etc/seasonal/cf-ddns.env
set +a
```

Then rerun the command.

### Record skipped because another type exists

Example:

```text
hostname skipped because hostname exists as another type
```

This means the hostname exists in Cloudflare, but not as the expected record type.

For v1, the daemon skips instead of guessing. Review the Cloudflare record manually before adding or changing it.

### Duplicate records

If multiple records exist with the same name and expected type, the daemon fails that record instead of choosing one.

Fix the duplicate in Cloudflare, then rerun:

```bash
npm run dry-run
```

## Repository Notes

`AGENTS.md` contains machine/agent contributor instructions.

`README.md` is for human operators running and maintaining the service.
