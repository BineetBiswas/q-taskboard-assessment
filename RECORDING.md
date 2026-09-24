# Assessment recording

Recording link: https://drive.google.com/file/d/1RvmUbQLJhBdBm1VU2-dIK-dcKmOqK2gf/view?usp=sharing

The recording should show the following completed scope:

1. Part 1: the review process and the completed [REVIEW.md](REVIEW.md).
2. Part 2: the highest-priority SQL injection proof before the fix, the code
   fix, regression tests, and the after-fix proof in `docs/evidence/bug-after.json`.
3. Part 3a: task comments in the UI, including admin/member posting and viewer
   read-only behavior.
4. Part 3c: the Airtable export button, a successful export using the configured
   server-side Airtable credentials, and a second export showing the same Task IDs
   are upserted rather than duplicated.
5. Final validation commands: backend tests, Airtable runner tests, frontend
   tests, frontend build, and Docker deployment check.

Part 3b (activity feed) was intentionally not attempted.

## Airtable evidence

During the recording, the real Airtable export was demonstrated in the browser.

Observed result:

- Exported 5 tasks from one project.
- Exported 7 tasks from another project.
- Airtable showed 12 task rows total.
- Re-exported one project.
- Airtable still showed 12 task rows, confirming repeat exports update existing rows instead of creating duplicates.

This verifies the real Airtable integration and Task ID upsert behavior.

See [TERMINAL_LOG.md](TERMINAL_LOG.md) for the command/result summary.
