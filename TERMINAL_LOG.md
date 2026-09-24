# Terminal command summary

This is a concise command/result log for the assessment. It is not a verbatim
terminal transcript. Tokens, `.env` values, SSH credentials, and Airtable secrets
are intentionally omitted.

## 1. Setup and initial review

| Step | Command or action | Result |
| --- | --- | --- |
| Confirm repository state | `git status --short` and source inspection | Started from the assigned TaskBoard codebase on the assessment branch. |
| Review codebase | `rg --files`, targeted reads of backend views/models/serializers, frontend task editor/API client, tests, and setup files | Four findings documented in [REVIEW.md](REVIEW.md), ranked by business impact. |

## 2. Highest-priority bug proof and fix

| Step | Command or action | Result |
| --- | --- | --- |
| Before-fix proof | `curl.exe` login as seeded viewer, then `curl.exe --get /api/projects/:id/tasks --data-urlencode "q=') OR 1=1 -- "` | `HTTP 200` returned 12 tasks, including five tasks from a project whose direct project request returned `HTTP 403`. |
| Saved before evidence | Wrote the response body to `docs/evidence/bug-before.json` | File contains leaked cross-project task data from the injected search response. |
| Regression before fix | `python -m pytest projects/tests.py -k search -q --tb=short` | Injection and apostrophe tests failed before the fix, confirming the bug and expected regression coverage. |
| Fix validation | `python -m pytest -q --tb=short` from the backend | Backend suite passed after binding SQL parameters. |
| After-fix proof | Repeated the same injected search and saved `docs/evidence/bug-after.json` | Response body is `{"tasks":[]}`. The endpoint still returns successfully, but the payload is treated as text, not SQL. |

## 3. Part 3a: task comments

| Step | Command or action | Result |
| --- | --- | --- |
| Migration | `python manage.py makemigrations projects` and `python manage.py migrate` | Created/applied the `TaskComment` table. |
| Backend validation | `python -m pytest backend -q` | Backend tests passed after adding comment permission, ordering, append-only, and validation coverage. |
| Frontend validation | `npm test -- --run` and `npm run build` from `frontend` | Frontend tests and production build passed. |

Implemented behavior:

- Project members can read task comments.
- Admins and members can post comments.
- Viewers cannot post comments.
- Comments show author, body, and posted time in chronological order.
- There are no edit/delete endpoints for comments.

## 4. Part 3c: Airtable export

| Step | Command or action | Result |
| --- | --- | --- |
| Official SDK dependency | `npm install` / lockfile update under `backend/airtable` | Added the official `airtable` npm package for the server-side runner. |
| Backend/API validation | `python -m pytest backend -q` | `42 passed`. Covers export authorization, field mapping, empty project behavior, missing configuration, runner failures, and project scoping. |
| Runner validation | `npm test --prefix backend/airtable` | `10 passed`. Covers official SDK request shape, upsert behavior, transient retries, permanent validation failures, global Airtable auth/table failure, empty export, and 1,000 tasks. |
| Frontend validation | `npm test -- --run` from `frontend` | `16 passed`. Covers export button visibility, pending state, partial failure display, and error display. |
| Frontend build | `npm run build` from `frontend` | Passed. Existing Vite/CommonJS and module-type warnings remained. |

The production export code calls the real Airtable API through the official
package when `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, and `AIRTABLE_TABLE_NAME`
are configured. Test doubles are isolated to test files.

The final screen recording shows the live Airtable export against the configured
base and a second export of the same project to demonstrate upsert behavior.
The recording link and Airtable evidence notes are in [RECORDING.md](RECORDING.md).

## 5. Docker deployment verification

Commands run in the Mac deployment directory:

```bash
git clone https://github.com/BineetBiswas/q-taskboard-assessment.git q-taskboard
cd q-taskboard
git checkout ba15dd63d346a802d0c70ca16be6d5b412434980
cp ../.env .env
docker compose up -d db
docker compose build
docker compose run --rm backend python manage.py migrate
docker compose run --rm backend python manage.py seed
docker compose up -d
docker compose ps
```

Observed deployment results:

- Backend and frontend Docker images built successfully.
- Migrations applied through `projects.0003_rename_tasks_project_status_idx_tasks_project_fe19a5_idx`.
- Seed command completed and printed the demo accounts.
- `docker compose ps` showed:
  - `q-taskboard-db-1` healthy
  - `q-taskboard-backend-1` running on port `18001`
  - `q-taskboard-frontend-1` running on port `13001`

Reachability checks:

```bash
curl -I http://127.0.0.1:13001
curl -I http://127.0.0.1:18001/api/projects
```

Mac results:

- Frontend: `HTTP/1.1 200 OK`
- Backend unauthenticated API: `HTTP/1.1 401 Unauthorized` (expected)

Windows-to-Mac checks:

```powershell
curl.exe -I --max-time 10 http://10.211.55.2:13001
curl.exe -I --max-time 10 http://10.211.55.2:18001/api/projects
```

Windows results:

- Frontend: `HTTP/1.1 200 OK`
- Backend unauthenticated API: `HTTP/1.1 401 Unauthorized` (expected)

Deployment note: the submitted Compose file binds ports to localhost for safer
local defaults. The Mac recording deployment temporarily exposed those ports to
the Windows VM network so the browser in Windows could reach the Mac-hosted
Docker stack.

## Scope

Completed: Part 1, Part 2, Part 3a, and Part 3c. Part 3b was intentionally not
attempted. The recording link and Airtable visual evidence notes are in
[RECORDING.md](RECORDING.md).
