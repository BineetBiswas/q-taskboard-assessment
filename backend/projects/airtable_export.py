import json
import os
import subprocess
from pathlib import Path


class AirtableExportError(Exception):
    pass


def export_project_tasks(tasks):
    required = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE_NAME']
    if any(not os.environ.get(name) for name in required):
        raise AirtableExportError('Configure AIRTABLE_API_KEY, AIRTABLE_BASE_ID and AIRTABLE_TABLE_NAME on the server.')

    records = []
    for task in tasks:
        records.append({'fields': {
            'Task ID': str(task.id),
            'Project ID': str(task.project_id),
            'Title': task.title,
            'Description': task.description or '',
            'Status': task.status,
            'Assignee': task.assignee.email if task.assignee else '',
            'Updated At': task.updated_at.isoformat(),
        }})
    if not records:
        return {'attempted': 0, 'exported': 0, 'failed': 0, 'skipped': 0, 'failures': []}

    runner = Path(__file__).resolve().parent.parent / 'airtable' / 'export.cjs'
    try:
        # JSON travels over stdin; secrets remain in the inherited server environment.
        completed = subprocess.run(
            ['node', str(runner)], input=json.dumps(records), capture_output=True,
            text=True, encoding='utf-8', check=True, timeout=1200,
        )
        return json.loads(completed.stdout)
    except subprocess.TimeoutExpired as exc:
        raise AirtableExportError('Export timed out; some tasks may have exported. Run export again to safely update them.') from exc
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        raise AirtableExportError('Airtable runner failed. Check the server Node installation and Airtable package setup.') from exc
