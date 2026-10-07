# Deployment

This guide runs LeanDocs on a server with Docker Compose and puts it behind HTTPS. The settings it mentions are explained in [configuration.md](configuration.md).

Each reverse proxy setup below was tested with LeanDocs: sign-in over HTTPS, saving, an 8 MB import, and live updates when files change on disk.

## Requirements

- Docker with the Compose plugin (`docker compose version`).
- For access from other devices: a domain name pointing at the server and a reverse proxy for HTTPS.
- Disk space for your documentation. LeanDocs itself needs about 250 MB for the image.

## 1. Install

```bash
mkdir leandocs && cd leandocs
curl -fsSLO https://raw.githubusercontent.com/pbuzdygan/leandocs/main/compose.yaml
mkdir -p data
```

Create a `.env` file next to `compose.yaml`:

```dotenv
# The version to run (see the releases page)
LEANDOCS_TAG=1.0.0
# Your user and group (`id -u`, `id -g`), so you own the files in ./data
LEANDOCS_UID=1000
LEANDOCS_GID=1000
# Once LeanDocs is behind HTTPS (step 3)
SESSION_COOKIE_SECURE=true
PUBLIC_ORIGIN=https://docs.example.com
```

Start it:

```bash
docker compose up -d
docker compose ps        # STATUS shows "healthy" after a few seconds
```

> Before the first published release, build the image from a checkout of the repository instead: `docker compose -f compose_local_build.yaml up --build -d`. It uses the same `.env` and data folder.

To use existing Markdown files, copy them into `data/content/` before or after the first start, or use **Import** in the app.

## 2. Create the administrator account

Open LeanDocs in the browser and create the administrator account. The first person who opens a new installation creates the account, so do this right after starting it, or before you make it reachable from the internet. Then add an authenticator app in Settings › Security.

Until HTTPS is set up, test from the server itself at `http://localhost:8080` with `SESSION_COOKIE_SECURE=false`. With `true`, sign-in only works over HTTPS.

## 3. HTTPS with a reverse proxy

LeanDocs listens on plain HTTP port 8080. The reverse proxy accepts HTTPS from browsers and forwards to that port. In every case:

- Set `SESSION_COOKIE_SECURE=true` and `PUBLIC_ORIGIN` in `.env`, then run `docker compose up -d` again.
- Forward the original `Host` header including its port.
- Do not buffer `/api/v1/events` (live updates). LeanDocs sends `X-Accel-Buffering: no`. The proxies below handle this without extra settings.
- No WebSocket support is needed.

If the proxy runs on the same host but outside Docker, set `LEANDOCS_BIND=127.0.0.1`, so port 8080 is not reachable from other machines. If the proxy runs in Docker, put both containers in one Docker network and forward to `leandocs:8080` (see [Same Docker network](#same-docker-network)).

### Nginx Proxy Manager

Tested with Nginx Proxy Manager 2.16.

1. **Hosts › Proxy Hosts › Add Proxy Host**, tab **Details**:
   - **Domain Names:** `docs.example.com`
   - **Scheme:** `http`
   - **Forward Hostname / IP:** the address of the LeanDocs host, or `leandocs` on a shared Docker network
   - **Forward Port:** `8080`
   - **Block Common Exploits:** on (works with LeanDocs)
   - **Websockets Support:** not needed
2. Tab **SSL**: request a Let's Encrypt certificate, and turn on **Force SSL** and **HTTP/2 Support**. **HSTS** is optional; turn it on once HTTPS works.
3. Nothing in **Advanced** is needed. Nginx Proxy Manager already allows uploads up to 2000 MB, and live updates work as they are.
4. In LeanDocs' `.env`: `SESSION_COOKIE_SECURE=true` and `PUBLIC_ORIGIN=https://docs.example.com`.

Use the standard HTTPS port 443 for the proxy host. Nginx Proxy Manager forwards the host name without the port, so browsers must reach it on 443.

### Nginx

Tested with Nginx 1.27.

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name docs.example.com;
    ssl_certificate     /etc/ssl/docs.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/docs.example.com/privkey.pem;

    # Imports send many files in one request; each attachment may be up to MAX_UPLOAD_SIZE.
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        # $http_host keeps a non-standard port; $host would drop it and saves would fail.
        proxy_set_header Host $http_host;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}

server {
    listen 80;
    server_name docs.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy

Tested with Caddy 2. Caddy obtains the certificate itself and needs no other settings:

```caddyfile
docs.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

### Traefik

Tested with Traefik 3.7, using labels on the LeanDocs service. Older 3.x releases, such as 3.3, cannot talk to current Docker engines, so use a current v3 release. Add to `compose.yaml` (or a `compose.override.yaml`) next to your existing Traefik setup:

```yaml
services:
  leandocs:
    labels:
      - traefik.enable=true
      - traefik.http.routers.leandocs.rule=Host(`docs.example.com`)
      - traefik.http.routers.leandocs.entrypoints=websecure
      - traefik.http.routers.leandocs.tls.certresolver=letsencrypt
      - traefik.http.services.leandocs.loadbalancer.server.port=8080
    networks: [proxy]
networks:
  proxy:
    external: true
```

When Traefik reaches LeanDocs through the Docker network, the `ports:` entry is not needed. Remove it, or set `LEANDOCS_BIND=127.0.0.1`.

### Same Docker network

When the proxy is a container, connect LeanDocs to the proxy's network and forward to `leandocs:8080`. For example, in `compose.override.yaml` next to `compose.yaml`:

```yaml
services:
  leandocs:
    networks: [proxy]
networks:
  proxy:
    external: true # the network of your proxy, e.g. `docker network ls`
```

## Updating

1. Read the release notes in `CHANGELOG.md`.
2. Back up `./data` (see below).
3. Set the new `LEANDOCS_TAG` in `.env`, then:

```bash
docker compose pull
docker compose up -d
```

Database changes are applied automatically when the new version starts ([how](migrations.md)). They only go forward: an older version refuses to start on a database that a newer one has upgraded. To go back to the previous version, restore the backup taken before the update and set the old tag again.

## Backup and restore

Everything lives in `./data` ([what is inside](configuration.md#storage)). Stop the container for a moment, so the database files are consistent, then archive the folder:

```bash
docker compose stop
tar -cpzf leandocs-$(date +%F).tar.gz -C data .
docker compose start
```

`data/content` contains plain files. You can also back it up while LeanDocs runs, with any tool: `rsync`, `restic`, `borg` or snapshots.

Restore into an empty data folder, keeping file permissions:

```bash
docker compose stop
mkdir data.new && tar -xpzf leandocs-2026-10-07.tar.gz -C data.new
mv data data.old && mv data.new data
docker compose start
```

Moving to another server is the same: copy `compose.yaml`, `.env` and the archive, then restore. The account, pins, search index and documents come along. The search index can also be rebuilt from the documents at any time (Settings › Index).

LeanDocs refuses to start when `system/auth.initialized` exists but `system/app.db` is missing or damaged. This stops a stranger from creating a new administrator account after a partial restore. Restore `app.db`, `auth.initialized` and `mfa.key` together from the same backup.

## Lost password

There is no password reset by e-mail. As a last resort, someone with access to the server can recreate the account. Documents are not affected, but sessions, the authenticator setup and pinned documents are lost:

```bash
docker compose stop
cd data/system && rm -f app.db app.db-wal app.db-shm auth.initialized mfa.key && cd ../..
docker compose start
```

Open LeanDocs right away and create the account again (step 2), before anyone else can.

## Troubleshooting

| Symptom                                                                                                   | Cause and fix                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saving fails with "Submit requests from this application" (403)                                           | Behind HTTPS without `SESSION_COOKIE_SECURE=true`, a `PUBLIC_ORIGIN` that differs from the browser address, or a proxy that drops the port from `Host` (use `$http_host` in Nginx). |
| Sign-in does not stick                                                                                    | `SESSION_COOKIE_SECURE=true` while LeanDocs is opened over plain `http://`. Use HTTPS, or set it to `false` for local testing.                                                      |
| The container stops at once with "Application database is missing, invalid or corrupt"                    | Partial restore: `auth.initialized` without its `app.db`. Restore the system files together (see above).                                                                            |
| The container stops at once with "Data directory /data/content is not usable"                             | `./data` belongs to another user. Set `LEANDOCS_UID`/`LEANDOCS_GID` to the owner of the folder, or `chown -R 1000:1000 data`.                                                       |
| The container stops at once with "Database schema version … is newer than this LeanDocs version supports" | An older version was started on data a newer version has upgraded. Run the newer version again, or restore the backup taken before the update.                                      |
| The container stops at once with `Invalid …`                                                              | A setting has an unsupported value; the message names it. See [configuration.md](configuration.md).                                                                                 |
| Changes made in another editor do not appear                                                              | Network shares and some VM mounts do not report file events: set `WATCH_MODE=poll`. Behind a proxy that buffers responses, turn buffering off for `/api/v1/events`.                 |
| Large imports fail with 413                                                                               | The proxy's upload limit, e.g. Nginx `client_max_body_size`. LeanDocs itself accepts up to 10,000 files and 256 MiB of documents and attachments per import.                        |
| `docker compose ps` shows "unhealthy"                                                                     | `docker compose logs leandocs` shows why.                                                                                                                                           |

The image contains no shell: `docker exec … sh` does not work. Use `docker compose logs`, look at `./data` on the host, or run `docker compose exec leandocs /nodejs/bin/node -e "…"`.
