# Infrastructure

Everything runs locally with Docker Compose. There is no production deployment, TLS or proxy configuration.

## Services and ports

| Service | Image | Host port | Purpose |
| --- | --- | --- | --- |
| `postgres` | `postgres:17.11` | 15432 | accounts, quizzes, built-in packs, game history |
| `redis` | `redis:7.4.11` | 16379 | live game state, sessions, BullMQ timers, Socket.io adapter |
| `minio` | `chainguard/minio` (pinned by digest) | 19000 (S3), 19001 (console) | question images |
| `minio-init` | `chainguard/minio-client` (pinned by digest) | none | one-shot: creates the image bucket |
| `api` | built from `apps/api/Dockerfile` | 3000 | NestJS backend |
| `web` | built from `apps/web/Dockerfile` | 8080 | Nginx serving the web client and proxying `/api/` and `/socket.io/` to `api` |

Only the `web` and `api` ports are bound to `0.0.0.0`, so phones on the network can reach it. PostgreSQL, Redis and MinIO are bound to `127.0.0.1`: Redis has no password and `game:{id}:state` holds the running game's quiz snapshot with the correct answers, and PostgreSQL and MinIO use credentials published in this repository. Anyone on the quiz Wi-Fi could otherwise read the answers before a question closes or rewrite scores. Tools on the laptop itself (`psql`, `redis-cli`, the MinIO console) still use `localhost`. Host ports for the infrastructure are offset (`1xxxx`) to avoid clashing with other local projects; inside Compose the services talk to each other by name on their normal ports.

`minio/minio` is no longer published on Docker Hub or Quay, so the Chainguard build is used. Its image has no `curl`; the health check in `compose.yaml` talks to the liveness endpoint with bash and `/dev/tcp`.

Start order is enforced with health checks: `minio-init` waits for a healthy MinIO; `api` waits for healthy PostgreSQL and Redis and for `minio-init` to complete; `web` waits for a healthy `api`. The `api` container has a health check on `/healthz`, the `web` container on its index page.

## Configuration

Compose reads variables from the shell or a `.env` file in the repository root and falls back to local-only defaults, so `docker compose up` works without any file. Copy `.env.example` to `.env` to change values or to change local settings.

| Variable | Meaning |
| --- | --- |
| `PORT` | API port (3000) |
| `PUBLIC_BASE_URL` | address of the web app that devices open; QR codes and join links are `<PUBLIC_BASE_URL>/play?pin=<PIN>` |
| `DATABASE_URL`, `REDIS_URL` | connections; in `.env.example` they point at the host ports (`localhost:15432`, `localhost:16379`), Compose overrides them for the container |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | MinIO access and bucket name |
| `SESSION_SECRET`, `CSRF_SECRET` | at least 32 characters each; the defaults are obvious local placeholders |
| `COOKIE_SECURE` | `true` only behind HTTPS; plain HTTP on a LAN needs `false` |
| `VALIDATE_RESPONSES` | validate API responses against the OpenAPI contract (on by default in Compose, a development aid) |

Every credential in the repository is a local-only placeholder. The API refuses to start on a missing or malformed variable and names each offending one.

## Reaching the app from other devices

A phone cannot open `localhost` of your laptop, and the QR code encodes `PUBLIC_BASE_URL`. Get a suggestion for it:

```sh
tools/dev/lan-url.sh        # PUBLIC_BASE_URL=http://192.168.1.42:8080  (the web port)
tools/dev/lan-url.sh --api  # http://192.168.1.42:3000                  (the API only)
```

Put the first line into `.env` and recreate the API (`docker compose up -d api`) so new games get QR codes with that address. To check that the backend is reachable over the network:

```sh
curl --fail "$(tools/dev/lan-url.sh --api)/healthz"
```

The script reads the address of `en0`/`en1` (macOS). Phones open the web port 8080; the API port is only needed for the check above. While `PUBLIC_BASE_URL` points at `localhost` or `127.0.0.1`, the host lobby shows a warning under the join address.

## Socket origin check and proxies

The Socket.io handshake refuses browsers from other sites (cross-site WebSocket hijacking). A browser's `Origin` is accepted when it equals the origin of `PUBLIC_BASE_URL`, or when its host (with port) equals the host the browser actually addressed: the `Host` header, or the first `X-Forwarded-Host` entry when a proxy rewrote `Host`. The comparison is exact, port included; clients without an `Origin` (not browsers) are accepted.

A reverse proxy in front of the API, such as the web container's Nginx (`apps/web/nginx.conf`), must therefore keep the port the browser used. With the common `proxy_set_header Host $host;` the port is dropped, and a host who opens `http://localhost:8080` on the laptop while `PUBLIC_BASE_URL` is the LAN address would be refused. The `/socket.io` location is configured like this:

```nginx
location /socket.io/ {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $http_host;               # keeps the port the browser used
    proxy_set_header X-Forwarded-Host $http_host;
}
```

The Vite dev server proxies without `changeOrigin`, so it already passes the original `Host`.

## Running the API locally

Running `pnpm start` outside Docker is not supported: the workspace packages (`protocol`, `game-engine`) ship TypeScript sources, which plain Node cannot load, and only the Docker build compiles them (see below). Local development uses the Compose `api` service (`docker compose up -d --build`); for backend logic use the tests, which start the API in-process against disposable containers (see [Testing](testing.md)).

## The API image

`apps/api/Dockerfile` is multi-stage and is built from the repository root (Compose does this):

1. `node:24-alpine` with `corepack` and `pnpm@12.15.0`; install with the frozen lockfile, then `nest build` (which also copies the SQL migrations to `dist/db/migrations`).
2. The workspace packages export TypeScript sources, which Node cannot load from `node_modules`, so `protocol` and `game-engine` are compiled with SWC and their `exports` are rewritten to the output.
3. `pnpm deploy --prod` assembles a production tree without dev dependencies.
4. The final image contains `node_modules`, `dist/`, `seed/` (built-in packs) and `contracts/openapi.yaml` (request validation reads it at start) and runs as the unprivileged `node` user.

`.dockerignore` keeps `node_modules`, build output, `.env` files and docs out of the build context. The web image (`apps/web/Dockerfile`) builds the Vite bundle in a Node stage and serves it from `nginx` with an SPA fallback, gzip, a 6 MB body limit for image uploads and one-hour socket timeouts. Rebuild both images after any source change with `docker compose up -d --build`.

## Resetting data

```sh
docker compose down            # stop, keep data
docker compose down --volumes  # stop and delete PostgreSQL, Redis and MinIO data
```

Deleting the volumes removes accounts, quizzes, history, images and any live game. Built-in packs return on the next API start. To drop only live game state, run `docker compose exec redis redis-cli flushall`; sessions are stored in Redis too, so hosts will have to sign in again.
