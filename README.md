# TaskBoard submission

React + TypeScript frontend, Django REST API, PostgreSQL, and a server-side Node Airtable runner.

## Assessment status

- Part 1: completed. Four issues ranked by business impact in [REVIEW.md](REVIEW.md).
- Part 2: completed. Parameterized task search fixes the highest-priority SQL injection; regression tests and before/after evidence are included.
- Part 3a: completed. Task comments with server-side permissions and backend/frontend tests.
- Part 3b: activity feed intentionally not attempted.
- Part 3c: completed. Real Airtable integration using the official npm package; test doubles are used only in tests.

Automated results and the Mac Docker deployment check are summarized in
[TERMINAL_LOG.md](TERMINAL_LOG.md). The final screen recording link and Airtable
evidence notes are in [RECORDING.md](RECORDING.md).

## Docker setup

From the repository root, create `.env` from `.env.example` if it does not exist.
Set the database credentials and Django secret key there. Do not commit `.env`.

```bash
docker compose up --build -d
docker compose exec backend python manage.py migrate
# Optional: seed demo users/projects on a fresh database; this deletes existing app data.
docker compose exec backend python manage.py seed
```

Open http://localhost:13001; the API is at http://localhost:18001 on the Docker host.
For a remote host, use SSH port forwarding to access these loopback-bound ports.
These ports avoid the local Windows development app on 3000/8000. PostgreSQL is
internal to Compose. Compose reads `.env`, but intentionally uses `db:5432` inside
containers and proxies frontend `/api` requests to `backend:8000`.

For the Windows-recording rehearsal, the same Docker stack was also verified from
Windows through the Mac VM-network IP after temporarily exposing the Compose
ports in that local deployment clone. That port-exposure change was a local
recording/deployment adjustment, not required for normal submission setup.

The frontend image checks its production build, then runs Vite's development
server. Django also uses its development server; this is an assessment deployment.

## Manual setup

Requires Python 3.12+, Node.js 20+, and PostgreSQL 15+.
Create a virtual environment, install dependencies, and load the `.env` values
into your shell before starting Django (Django does not load that file itself).
Node must be on the backend process's PATH.

```bash
# From the repository root, with the Python virtual environment active:
python -m pip install -r backend/requirements.txt
npm ci --prefix backend/airtable
npm ci --prefix frontend
cd backend
python manage.py migrate
python manage.py runserver
# In a second terminal, from the repository root:
npm run dev --prefix frontend
```

Manual URLs: frontend http://localhost:3000, API http://localhost:8000.
Demo accounts and their roles are defined in `backend/projects/management/commands/seed.py`.

## Tests and build

```bash
# Docker:
docker compose exec backend python -m pytest -q
docker compose exec backend npm test --prefix airtable
docker compose exec frontend npm test -- --run
docker compose exec frontend npm run build
```

Without Docker, run `python -m pytest -q` from `backend` with the database
environment loaded; from the root run `npm test --prefix backend/airtable`,
`npm test --prefix frontend -- --run`, and `npm run build --prefix frontend`.
The PostgreSQL test user needs permission to create a test database.

Last observed results: **42 backend tests, 10 Node runner tests, 16 frontend tests,
and a successful production build**. The production TypeScript check excludes
`src/tests`; Vitest runs those tests separately.

The Mac Docker deployment check also passed: the frontend returned `HTTP 200`
and the backend returned the expected unauthenticated `HTTP 401` from both the
Mac host and the Windows VM.

## Feature notes

- Search retains its response shape, case-insensitive matching, wildcard behavior,
  and ordering while binding user input as SQL parameters.
- Comments: `GET/POST /api/tasks/:id/comments`. Admins and members can post;
  viewers can read. Comments show author, body, and time, oldest first, with no
  comment edit/delete endpoints. The server assigns the author and timestamp.
- Export: `POST /api/projects/:id/export`. Only admins and members can export;
  the project page shows progress, counts, and record failures.
- Review findings 2 and 3 remain open: task-update authorization and the assignee
  field-name mismatch. See the review for details.

## Airtable Export (Part 3c)

Set these in your `.env` before running the export:

```
AIRTABLE_API_KEY=your_personal_access_token
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_NAME=Tasks
```

The Django endpoint calls `backend/airtable/export.cjs`, which uses the official
`airtable` npm package. Install Node.js 20+ on the backend host and run
`npm ci --prefix backend/airtable` from the repository root. Docker installs these
dependencies automatically; rebuild the backend image after this change.

The three variables above must be available to the Django process. Docker Compose
passes them from the root `.env`; manual Django startup does not load `.env`
automatically. Use a personal access token with record read/write permissions for
the target base. Never put this token in frontend environment variables.

Create these exact Airtable columns before exporting:

| Column | Airtable type |
| --- | --- |
| Task ID | Single line text (primary field) |
| Project ID | Single line text |
| Title | Single line text |
| Description | Long text |
| Status | Single line text |
| Assignee | Single line text (email) |
| Updated At | Date with time |

Admins and members can select **Export to Airtable** on the project page. Tasks
are upserted by Task ID, so repeat exports update existing rows. Keep Task ID
unique and do not edit it in Airtable. This one-way export does not delete remote
rows when local tasks are deleted. Clearing an assignee clears its exported email.

Responses contain `attempted`, `exported`, `failed`, `skipped`, and per-task
`failures`. Individual validation failures are not retried and do not stop later
tasks. Transient failures get at most three attempts; rate limits wait 30 seconds
before retrying. Invalid credentials or inaccessible tables stop the export and
report skipped tasks.

An export of 1,000 tasks takes at least four minutes plus network time. Configure
your server/proxy timeout to allow up to 20 minutes. If the runner times out, the
final count is unknown; repeat the export to upsert tasks already written. Avoid
overlapping exports to reduce rate-limit contention.

Run runner unit tests with `npm test --prefix backend/airtable`. Test doubles live
only in test files; production always uses the real Airtable client.

The final recording shows a real export against the configured Airtable base,
then a second export of the same project to demonstrate Task ID upsert behavior
rather than duplicate row creation.

## Conversation tracking

The provided repository's pre-commit hook captures supported AI conversation
files from the project into `.ai-conversations/`. This assessment also uses a
screen recording. Do not include credentials in documentation or terminal logs.
