# Phase 8 engineering lab and distributed tests

## Start the lab

The lab requires an administrator account, `SEATSYNC_LAB=1`, a loopback app origin, and a separate PostgreSQL database named `seatsync_lab`. Keep your existing SeatSync `.env` for the normal app. The commands below override settings for the lab processes.

### Docker Compose

In the project folder, start the isolated stack.

```bash
export SEATSYNC_LAB_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose -f compose.lab.yaml up --build -d
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3002/api/health
```

Compose starts PostgreSQL and Redis, applies migrations, and seeds the catalog before launching both apps. The instance IDs appear in the health responses. The services publish ports on loopback. [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order)

Sign up through the app on port 3001. In a separate terminal, grant that account the admin role in the lab database.

```bash
DATABASE_URL=postgresql://seatsync:seatsync_lab_local@127.0.0.1:55432/seatsync_lab \
npm run db:grant-admin -- you@example.com
```

Refresh **My bookings**, open **Admin dashboard**, then select **Engineering lab**. The same account can open the lab on both ports.

### Use less memory

Use a local PostgreSQL database named `seatsync_lab` and one local Redis process. Apply migrations and seed once. Start one `next dev` instance for the interactive lab and the development-only unprotected comparison.

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/seatsync_lab'
export DIRECT_URL=''
export REDIS_URL='redis://127.0.0.1:6379'
export REDIS_CACHE_URL=''
export SEATSYNC_LAB=1
export AUTH_SECRET='replace-with-your-own-random-string-of-32-plus-characters'
npm run db:deploy
npm run db:seed
AUTH_URL=http://127.0.0.1:3001 APP_INSTANCE_ID=lab-a \
  npm exec -- next dev -H 127.0.0.1 -p 3001
```

For the distributed benchmark, stop the development instance, run `npm run build -- --webpack` once, then start two copies of that build with the same database, Redis URL and auth secret. In different terminals with the exported settings above, run the commands below.

```bash
AUTH_URL=http://127.0.0.1:3001 APP_INSTANCE_ID=lab-a npm start -- -H 127.0.0.1 -p 3001
AUTH_URL=http://127.0.0.1:3002 APP_INSTANCE_ID=lab-b npm start -- -H 127.0.0.1 -p 3002
```

## Read the timeline

| Experiment | What to look for |
| --- | --- |
| Seat race | Two accounts request the same seat. The normal reservation service uses Redis coordination and PostgreSQL inventory locks. One hold persists. |
| Redis lease | `SET NX` denies a competing lease. Lua checks the token before deleting the key. The countdown follows the measured TTL of a second Redis key. |
| Optimistic locking | Two readers start at version zero. An atomic conditional `UPDATE` changes the version and rejects the stale writer. In development, the preceding comparison records how both unprotected writes over-allocate the same stock. The comparison runs in a temporary PostgreSQL table. |
| Pessimistic locking | One transaction takes `FOR UPDATE` before the next transaction asks for the row. The second waits until the first commits. |
| Idempotency | Two equivalent requests use one idempotency key. Both responses reference a single durable hold. |

Follow [the lab panel](../src/components/engineering/lab-panel.tsx) to [the experiment route](../src/app/api/engineering-lab/route.ts) and [the experiment service](../src/services/engineering-lab.ts). The route authenticates the administrator. The service timestamps actual operations on the server, while the panel measures the browser round trip separately. [Fixture provisioning](../src/repositories/lab-fixture.ts) creates and removes temporary workspace inventory.

## Run the two-instance benchmark

Install k6 locally, then run this against the Compose stack. For native services, substitute the local database connection string you used above.

```bash
DATABASE_URL=postgresql://seatsync:seatsync_lab_local@127.0.0.1:55432/seatsync_lab \
SEATSYNC_LAB=1 npm run lab:benchmark
```

The [benchmark runner](../scripts/load/benchmark.ts) creates a fresh fixture with three slots and 100 distinct accounts. It signs in before measurement. Then [k6](../scripts/load/concurrency.js) runs one virtual user per contender and alternates requests between the two apps. The runner checks the database after every race. For the confirmation test, it records one verified-payment fixture locally, then sends ten identical confirmation requests through the normal API. It checks the booking allocation, payment and stored idempotency response. The fixture is cleaned up when the run finishes. [k6 per-VU iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/per-vu-iterations/)

Optional environment settings include `SEATSYNC_K6_BIN` for a custom k6 binary path and `SEATSYNC_LAB_REPORT` for a JSON results file. The runner accepts only loopback app origins and a dedicated loopback database.

### Measured local run

Measured with k6 v2.4.0 on macOS ARM64, two Next.js processes, PostgreSQL 17 and Redis 7.4.12. Latencies are local request durations and exclude sign-in.

| Concurrent hold requests | App A / B | Holds persisted | Expected conflicts | Unexpected outcomes | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 5 / 5 | 1 | 9 | 0 | 10.4 ms |
| 50 | 25 / 25 | 1 | 49 | 0 | 28.5 ms |
| 100 | 50 / 50 | 1 | 99 | 0 | 58.1 ms |

Ten concurrent confirmation requests returned HTTP 200. PostgreSQL contained one allocation, one successful payment and one completed idempotency record. The run used a sandbox payment fixture and made no gateway calls.

### Acceptance checks

- Lab API returns HTTP 404 when disabled, HTTP 401 without a session, and HTTP 403 for a signed-in non-admin.
- Each race produces one persisted hold with a single owner. The other requests receive a conflict.
- Both app instance headers appear in every benchmark run. Duplicate confirmations produce one allocation.
- The development-only comparison can over-allocate its temporary row. The production build omits that comparison.
