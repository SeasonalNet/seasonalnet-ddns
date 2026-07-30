# seasonalnet-ddns

`seasonalnet-ddns` is the SeasonalNet Cloudflare dynamic DNS daemon.

It keeps explicitly configured Cloudflare `A` and `AAAA` records synchronized with the address sources available on the machine running the daemon. It can run continuously under systemd or as a hardened Docker container.

## Record Model

The daemon manages only hostname/type pairs explicitly listed in `config.yaml`.

- `A` records use `wan_ip`.
- `AAAA` records use `wan_ipv6`.
- Each record independently declares its Cloudflare proxied/DNS-only policy.
- Multiple daemon instances may manage different hostname/type pairs in the same Cloudflare zone.

`A` and `AAAA` are treated as independent RRsets. If `mail.seasonalnet.org` already has an `A` record but no `AAAA`, an explicitly configured `AAAA` entry is created without modifying the `A` record. Compatible records such as `MX`, `TXT`, and `HTTPS` are also preserved.

A blocking `CNAME` at the same hostname prevents `A` or `AAAA` creation. Multiple existing records with the same hostname and desired type fail that record instead of choosing one arbitrarily.

Example:

```yaml
records:
  - name: mail.seasonalnet.org
    type: A
    proxied: false

  - name: mail.seasonalnet.org
    type: AAAA
    proxied: false
```

## Multi-Instance Deployment

SeasonalNet has one shared NATed public IPv4 address but distinct global IPv6 addresses on public-facing VMs. The clean ownership model is:

| Instance | Record ownership |
|---|---|
| SeasonalWeb | Shared `A` records and `AAAA` records for services that terminate on SeasonalWeb |
| SeasonalMail | `AAAA` records for mail services terminating directly on SeasonalMail |
| SeasonalPBX | `AAAA` records for direct SIP/voice hostnames such as `sip.seasonalnet.org` |
| SeasonalVPN | `AAAA` records for VPN hostnames terminating directly on SeasonalVPN |

A hostname/type pair must have exactly one owning instance. For example, SeasonalWeb may continue managing `mail.seasonalnet.org A`, while the SeasonalMail instance manages only `mail.seasonalnet.org AAAA`.

This avoids multiple daemons racing over the same record. Each instance discovers its own stable global IPv6 address locally.

## Configuration

Copy the example configuration:

```bash
cp config.example.yaml config.yaml
```

`config.yaml` is local runtime state and must not be committed.

Main settings:

```yaml
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN

interval_seconds: 600

wan_ip:
  command: "curl -fsS https://api.ipify.org"

wan_ipv6:
  command: "ip -6 -o addr show dev ens18 scope global | awk '!/temporary|deprecated/ { split($4,a,\"/\"); print a[1]; exit }'"

conflict_policy:
  incompatible_records: skip
  multiple_records: fail-record

logging:
  level: info
```

`interval_seconds` defaults to 600 and must be at least 30. Legacy `wan_ip.interval_seconds` configurations remain accepted. Source-specific interval values must match when more than one is present.

Only configure the address source required by that instance.

### A-only central instance

The central shared-IPv4 instance can omit `wan_ipv6` when it manages only `A` records:

```yaml
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN

interval_seconds: 600

wan_ip:
  command: "curl -fsS https://api.ipify.org"

records:
  - name: mail.seasonalnet.org
    type: A
    proxied: false

  - name: sip.seasonalnet.org
    type: A
    proxied: false

  - name: vpn.seasonalnet.org
    type: A
    proxied: false

conflict_policy:
  incompatible_records: skip
  multiple_records: fail-record

logging:
  level: info
```

## Cloudflare Token

The default environment file is:

```text
/etc/sn-ddns/ddns.env
```

Expected contents:

```env
CF_API_TOKEN=replace-with-real-token
```

Use a token limited to the required zone and DNS-edit operation. Separate tokens per VM simplify revocation and incident containment.

For systemd operation:

```bash
chown root:snddns /etc/sn-ddns/ddns.env
chmod 0640 /etc/sn-ddns/ddns.env
```

For Docker-only operation, root-owned mode `0600` is sufficient because the Docker daemon reads the environment file before creating the container.

## Commands

Check the configuration:

```bash
pnpm check-config
```

Run tests:

```bash
npm test
```

Run a dry-run pass:

```bash
set -a
. /etc/sn-ddns/ddns.env
set +a
pnpm dry-run
```

Run one live pass:

```bash
set -a
. /etc/sn-ddns/ddns.env
set +a
pnpm once
```

## Docker Operation

The supplied Compose service uses host networking so the default IPv6 command sees the actual VM interface named `ens18`. A bridge-networked container would inspect its own network namespace and could publish the wrong IPv6 address or no address.

The same Compose definition is deployed independently on each service VM. Because `network_mode: host` is local to that VM, the SeasonalMail instance sees SeasonalMail interfaces, the SeasonalPBX instance sees SeasonalPBX interfaces, and so on.

The image:

- Uses Node.js 22 on Debian Bookworm slim.
- Includes `curl`, `iproute2`, and `awk` for the example address commands.
- Runs as the non-root `node` user.
- Uses a read-only root filesystem.
- Drops all Linux capabilities.
- Enables `no-new-privileges`.

### Build and validate

```bash
docker compose build

docker compose run --rm seasonalnet-ddns \
  --config /config/config.yaml \
  --check-config

docker compose run --rm seasonalnet-ddns \
  --config /config/config.yaml \
  --dry-run
```

Before a live update, verify the container sees the VM's intended address:

```bash
docker compose run --rm --entrypoint /bin/sh seasonalnet-ddns -c \
  'ip -6 -o addr show dev ens18 scope global'
```

Run one live pass:

```bash
docker compose run --rm seasonalnet-ddns \
  --config /config/config.yaml \
  --once
```

Start the long-running instance:

```bash
docker compose up -d
```

Check state and logs:

```bash
docker compose ps
docker compose logs --tail=100 seasonalnet-ddns
```

Update the local image after pulling code:

```bash
docker compose up -d --build
```

Do not run a systemd and Docker instance that own the same hostname/type pairs concurrently.

## systemd Operation

Default repository deployment path:

```text
/opt/seasonalnet/seasonalnet-ddns
```

Install the supplied unit as:

```text
/etc/systemd/system/seasonal-cf-ddns-node.service
```

Then:

```bash
systemctl daemon-reload
systemctl enable --now seasonal-cf-ddns-node.service
systemctl status seasonal-cf-ddns-node.service --no-pager
journalctl -u seasonal-cf-ddns-node.service -n 100 --no-pager
```

The daemon performs one pass at startup and repeats every `interval_seconds`.

## Expected Healthy Output

```text
DDNS pass complete: changed=0 unchanged=1 skipped=0 failed=0
Scheduling DDNS passes every 600 seconds
```

A first pass may report `changed=1` when it creates the missing `AAAA` record beside an existing `A` record.

## DNS Validation

DNS-only records should expose the actual SeasonalNet addresses:

```bash
dig @1.1.1.1 mail.seasonalnet.org A +short
dig @1.1.1.1 mail.seasonalnet.org AAAA +short

dig @1.1.1.1 sip.seasonalnet.org A +short
dig @1.1.1.1 sip.seasonalnet.org AAAA +short

dig @1.1.1.1 vpn.seasonalnet.org A +short
dig @1.1.1.1 vpn.seasonalnet.org AAAA +short
```

Cloudflare-proxied web records should resolve to Cloudflare edge addresses rather than origin addresses.

## Troubleshooting

### Missing record is not created

The daemon creates a missing `A` or `AAAA` when compatible record types already exist. It skips creation only when a blocking type such as `CNAME` exists at that exact hostname.

Example log:

```text
mail.seasonalnet.org AAAA skipped because a blocking DNS record type exists
```

Review the hostname in Cloudflare and decide whether the alias or the address record is authoritative.

### Duplicate same-type records

If multiple records exist with the same hostname and desired type, the daemon fails that item instead of selecting one:

```text
mail.seasonalnet.org AAAA failed because multiple matching records exist
```

Remove the unintended duplicate and rerun the dry-run.

### Container sees no global IPv6 address

Confirm host networking is active and the interface name is correct:

```bash
docker inspect seasonalnet-ddns --format '{{.HostConfig.NetworkMode}}'
ip -6 -o addr show dev ens18 scope global
```

The expected network mode is `host`. Update `wan_ipv6.command` if the VM uses a different interface name.

## Legacy Service

This daemon replaces the old Bash timer/service pair:

```text
seasonal-cf-ddns.timer
seasonal-cf-ddns.service
/usr/local/sbin/seasonal-cf-ddns.sh
```

Disable the legacy timer after the Node or Docker daemon is proven healthy:

```bash
systemctl disable --now seasonal-cf-ddns.timer
systemctl reset-failed seasonal-cf-ddns.service
```

## Repository Notes

[AGENTS.md](./AGENTS.md) contains machine/agent contributor instructions.

[README.md](./README.md) is for human operators running and maintaining the service.
