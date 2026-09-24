# Code review

These are the four findings from the initial review. References below use current file line numbers; descriptions for resolved findings describe the original behavior. Findings 1 and 4 are now resolved; findings 2 and 3 remain open.

Ranked by business impact: exposure across projects, unauthorized changes, accidental data loss during normal use, then a blocked integration. Reviewed the backend models, views, serializers, routes, authentication, settings, tests, and seed data; the frontend project page, task editor, API client, types, and tests; and setup documentation and configuration.

## 1. Task search allows SQL injection across projects

- **File and lines:** `backend/projects/views.py:133-148` (`TaskListCreateView.get`).
- **Category:** Security
- **Severity:** Critical
- **Description:** The search text is inserted directly into SQL, so a user can change the query instead of just searching task text. Even a viewer in one project can retrieve tasks belonging to other projects, exposing private work and breaking project isolation.
- **Recommended fix:** Replace the raw SQL with a project-scoped Django queryset using `Q(title__icontains=q) | Q(description__icontains=q)`. Return results through `TaskSerializer` and add regression tests for injected text, ordinary apostrophes, and isolation between projects.

**Resolution (Part 2):** Bound SQL parameters now keep search input separate from SQL. This smaller fix preserves existing response fields, ordering, and wildcard behavior. Injection and apostrophe tests failed before the fix and passed afterward. Evidence: [before](docs/evidence/bug-before.json), [after](docs/evidence/bug-after.json).

### Confirmed reproduction (before the fix)

Executed against the running local API on 2026-09-24 with the seeded `dev@example.com` account, a viewer of Q3 Launch. No task or project data was changed. The PowerShell commands below obtain a fresh token without printing it; project IDs are from this local database and will change if it is reseeded.

```powershell
$login = '{"email":"dev@example.com","password":"password123"}' |
    curl.exe -sS http://localhost:8000/api/auth/login `
        -H 'Content-Type: application/json' --data-binary '@-' |
    ConvertFrom-Json
$authHeader = 'Authorization: Bearer ' + $login.token

# Direct access to the other project is denied.
curl.exe -sS -i `
    http://localhost:8000/api/projects/e32f43d5-82e5-4890-911b-47578b25a8ec `
    -H $authHeader

# Search within the viewer's own project bypasses that boundary.
curl.exe -sS -i --get `
    http://localhost:8000/api/projects/b0e71274-4dce-4d75-9d9a-aa2b5aaeb9fb/tasks `
    -H $authHeader --data-urlencode "q=') OR 1=1 -- "
```

Actual direct-access response (unrelated headers omitted):

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"error":"forbidden"}
```

Actual injected-search response: `HTTP/1.1 200 OK`. It returned 12 tasks, including five from the forbidden project. The following is one complete task object from that response; the other task objects and response wrapper are omitted for readability:

```json
{
  "id": "91f0291e-97e8-4d0a-903e-2ee7a76d8886",
  "project_id": "e32f43d5-82e5-4890-911b-47578b25a8ec",
  "title": "Map current onboarding funnel",
  "description": "Detail for: Map current onboarding funnel",
  "status": "done",
  "assignee_id": "34edc07a-937e-485e-a101-5fda120df1d2",
  "created_by_id": "34edc07a-937e-485e-a101-5fda120df1d2",
  "position": 0,
  "created_at": "2026-09-24T06:16:58.801611Z",
  "updated_at": "2026-09-24T06:16:58.801611Z"
}
```

The returned `project_id` matches the project that denied direct access. The injected `OR 1=1` bypasses the project filter, and `--` comments out the remaining SQL.

## 2. Task updates do not enforce project permissions

- **File and lines:** `backend/projects/views.py:190-210` (`TaskDetailView.patch`); compare the permission checks at `218-222` for deletion.
- **Category:** Security
- **Severity:** High
- **Description:** The update endpoint loads a task by ID and saves changes without checking project membership or role. Any authenticated user who knows a task ID can change its title, description, status, or assignee, including viewers and users outside the project, undermining the team's task records.
- **Recommended fix:** Check membership in the task's project and require the `admin` or `member` role before applying any changes, using the existing permission helpers. Add tests showing that viewers and non-members receive `403` without changing the task, while admins and members can update it.

## 3. Saving an assigned task can silently remove its assignee

- **File and lines:** `backend/projects/serializers.py:18-23,33-35`; `frontend/src/components/TaskDetail.tsx:21,47-54`; `backend/projects/views.py:205-207`. Related contract: `frontend/src/types/index.ts:10-22` and `frontend/src/lib/api-client.ts:38-46`.
- **Category:** Data Integrity
- **Severity:** High
- **Description:** The API returns `assignee_id`, but the task editor reads `assigneeId`, and the API client does not convert field names. Opening an assigned task therefore initializes the selection as unassigned, and saving an unrelated edit sends `assigneeId: null`, silently removing responsibility for the task.
- **Recommended fix:** Choose one explicit API field convention and align the serializers, frontend types, and editor with it. Add a task-editor regression test using an actual API-shaped response: changing only the title must preserve the existing assignee.

## 4. The Airtable export endpoint never exports tasks

- **File and lines:** `backend/projects/views.py:259-272` (`ExportView.post`).
- **Category:** Architecture
- **Severity:** Medium
- **Description:** The documented export endpoint only reads local tasks and returns `exported: 0`; it never calls Airtable. Teams cannot transfer their project tasks into Airtable, and the successful HTTP response does not explain that the integration is unimplemented.
- **Recommended fix:** Add a small, explicit export function that uses a real Airtable client and server-side Airtable configuration to write the project's tasks. Return the confirmed exported count, report configuration and upstream failures clearly, and use a test double only in unit tests.

**Resolution (Part 3c):** Django now calls a server-side Node runner using the official `airtable` npm package. It upserts by Task ID, retries transient failures, reports individual failures, and uses test doubles only in tests.

## Verification scope

Issue 1 was reproduced with real curl requests against the local API before the
fix, then re-run after the fix with an empty task result. Issues 2-4 were
initially established by source inspection. Later validation passed 42 backend
tests, 10 Node runner tests, 16 frontend tests, and the production build. The
Airtable export implementation uses the official client in production; tests use
doubles only around external Airtable behavior. See [TERMINAL_LOG.md](TERMINAL_LOG.md)
for the command summary and [RECORDING.md](RECORDING.md) for the final recording
link and Airtable evidence notes.
