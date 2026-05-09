# seasonal-cf-ddns

Small Node.js daemon for SeasonalNet Cloudflare DDNS.

It replaces the legacy timer-driven Bash script with a systemd-managed service that keeps explicitly configured Cloudflare `A` records pointed at the current SeasonalNet WAN IPv4 address.

## Scope

The daemon intentionally manages only the hostnames listed in `config.yaml`.

It will:

- detect the current WAN IPv4 address;
- query Cloudflare by record name first;
- update existing matching `A` records when content or proxy policy differs;
- create missing configured `A` records only when the hostname does not already exist;
- skip hostnames that already exist as another record type;
- fail a single record cleanly when duplicate matching records exist;
- log Cloudflare API error bodies without logging secrets.

It will not:

- manage mail/autodiscovery records unless explicitly listed;
- replace CNAME/MX/TXT/etc records;
- manage multiple DNS providers;
- run a UI, database, or metrics dashboard in v1.

## Requirements

- Node.js 18.18 or newer.
- A Cloudflare API token in `/etc/seasonal/cf-ddns.env`.
- Token permissions sufficient to read the target zone and edit DNS records.

Expected token file:

```env
CF_API_TOKEN=replace-with-real-token
```

Recommended permissions:

```bash
sudo groupadd --system cfddns || true
sudo useradd --system --home /opt/seasonal-cf-ddns --shell /usr/sbin/nologin --gid cfddns cfddns || true
sudo chown root:cfddns /etc/seasonal/cf-ddns.env
sudo chmod 0640 /etc/seasonal/cf-ddns.env
```

## Install

From the repository root on SeasonalWeb:

```bash
sudo mkdir -p /opt/seasonal-cf-ddns
sudo rsync -a --delete ./ /opt/seasonal-cf-ddns/
sudo chown -R cfddns:cfddns /opt/seasonal-cf-ddns
cd /opt/seasonal-cf-ddns
cp config.example.yaml config.yaml
```

Edit `config.yaml` before starting the daemon.

## Config

`config.example.yaml` is version controlled. `config.yaml` is local-only and ignored by git.

Example record entry:

```yaml
records:
  - name: grafana.seasonalnet.org
    type: A
    proxied: true

  - name: sip.seasonalnet.org
    type: A
    proxied: false
```

The default WAN detector is:

```yaml
wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600
```

`wan_ip.url` is also supported if a direct HTTP endpoint is preferred over a shell command.

## Commands

Validate local config:

```bash
npm run check-config
```

Dry-run one pass:

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

Run as a foreground daemon:

```bash
set -a
. /etc/seasonal/cf-ddns.env
set +a
npm start
```

## systemd

Install the unit:

```bash
sudo cp systemd/seasonal-cf-ddns-node.service /etc/systemd/system/seasonal-cf-ddns-node.service
sudo systemctl daemon-reload
sudo systemctl enable --now seasonal-cf-ddns-node.service
sudo systemctl status seasonal-cf-ddns-node.service --no-pager
```

Inspect logs:

```bash
journalctl -u seasonal-cf-ddns-node.service -n 100 --no-pager
```

After the Node daemon is proven, disable the old timer/script pair:

```bash
sudo systemctl disable --now seasonal-cf-ddns.timer
sudo systemctl disable --now seasonal-cf-ddns.service
sudo systemctl status seasonal-cf-ddns-node.service --no-pager
```

## DNS Validation

For proxied records, public `A` lookups should return Cloudflare edge IPs:

```bash
dig @1.1.1.1 grafana.seasonalnet.org A
```

For DNS-only records, public `A` lookups should return the SeasonalNet WAN IP:

```bash
dig @1.1.1.1 sip.seasonalnet.org A
```

## Tests

```bash
npm test
```

## Design Notes

The daemon updates Cloudflare records with `PATCH` instead of full overwrite requests. That keeps the DDNS operation focused on the fields this service owns: record content, proxy policy, and optional TTL.

Record handling decision table:

| Condition | Action |
| --- | --- |
| No records with that name | Create configured record. |
| Exactly one record with expected type | Update content/proxied/ttl if needed. |
| Existing record with another type and no expected-type record | Skip and warn. |
| Multiple expected-type records | Fail that record clearly. |
| Cloudflare API error | Log status/body and fail that operation clearly. |

## Rollback

Keep the old Bash script and timer disabled, not deleted, until the Node daemon has survived a few normal intervals.

Rollback command shape:

```bash
sudo systemctl disable --now seasonal-cf-ddns-node.service
sudo systemctl enable --now seasonal-cf-ddns.timer
```
