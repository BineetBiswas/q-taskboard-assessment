import json
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from rest_framework.test import APIClient
from users.models import User
from projects.models import Project, Membership, Task
from projects.airtable_export import export_project_tasks, AirtableExportError


@pytest.fixture
def configured(monkeypatch):
    for name in ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE_NAME']:
        monkeypatch.setenv(name, 'test-only')


@pytest.mark.django_db
@pytest.mark.parametrize('role', ['admin', 'member', 'viewer', None, 'anonymous'])
def test_export_authorization_and_project_scope(monkeypatch, role):
    user = User.objects.create_user(email='export@example.com', name='Exporter')
    project = Project.objects.create(name='Export', owner=user)
    task = Task.objects.create(project=project, title='Included', created_by=user)
    other = Project.objects.create(name='Other', owner=user)
    Task.objects.create(project=other, title='Excluded', created_by=user)
    if role in ('admin', 'member', 'viewer'):
        Membership.objects.create(project=project, user=user, role=role)
    service = Mock(return_value={'attempted': 1, 'exported': 1, 'failed': 0, 'skipped': 0, 'failures': []})
    monkeypatch.setattr('projects.views.export_project_tasks', service)
    client = APIClient()
    if role != 'anonymous':
        client.force_authenticate(user)
    response = client.post(f'/api/projects/{project.id}/export')
    if role in ('admin', 'member'):
        assert response.status_code == 200
        assert response.data['exported'] == 1
        assert list(service.call_args.args[0]) == [task]
    else:
        assert response.status_code == (401 if role == 'anonymous' else 403)
        service.assert_not_called()


def test_service_mapping_and_partial_result(configured, monkeypatch):
    from datetime import datetime, timezone
    task = SimpleNamespace(id='t1', project_id='p1', title='Title', description=None,
                           status='todo', assignee=None, updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    result = {'attempted': 1, 'exported': 0, 'failed': 1, 'skipped': 0,
              'failures': [{'task_id': 't1', 'error': 'INVALID_VALUE_FOR_COLUMN'}]}
    runner = Mock(return_value=SimpleNamespace(stdout=json.dumps(result)))
    monkeypatch.setattr('projects.airtable_export.subprocess.run', runner)
    assert export_project_tasks([task]) == result
    fields = json.loads(runner.call_args.kwargs['input'])[0]['fields']
    assert fields == {'Task ID': 't1', 'Project ID': 'p1', 'Title': 'Title',
                      'Description': '', 'Status': 'todo', 'Assignee': '',
                      'Updated At': '2026-01-01T00:00:00+00:00'}
    assert runner.call_args.args[0][0] == 'node'
    assert 'test-only' not in runner.call_args.kwargs['input']


def test_missing_configuration(monkeypatch):
    monkeypatch.delenv('AIRTABLE_API_KEY', raising=False)
    with pytest.raises(AirtableExportError, match='Configure'):
        export_project_tasks([])


def test_empty_project_does_not_start_runner(configured, monkeypatch):
    runner = Mock()
    monkeypatch.setattr('projects.airtable_export.subprocess.run', runner)
    assert export_project_tasks([])['exported'] == 0
    runner.assert_not_called()


@pytest.mark.parametrize('failure', [FileNotFoundError(), subprocess.TimeoutExpired('node', 1200)])
def test_runner_failure_is_readable(configured, monkeypatch, failure):
    from datetime import datetime, timezone
    task = SimpleNamespace(id='t1', project_id='p1', title='Title', description='',
                           status='todo', assignee=None, updated_at=datetime.now(timezone.utc))
    monkeypatch.setattr('projects.airtable_export.subprocess.run', Mock(side_effect=failure))
    with pytest.raises(AirtableExportError):
        export_project_tasks([task])
