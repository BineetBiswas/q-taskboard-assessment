import pytest
from rest_framework.test import APIClient
from users.models import User
from projects.models import Project, Membership, Task, TaskComment


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email='meera@taskboard.dev', name='Meera Iyer', password='password123')


@pytest.fixture
def auth_client(client, user):
    response = client.post('/api/auth/login', {
        'email': 'meera@taskboard.dev',
        'password': 'password123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")
    return client


@pytest.fixture
def comment_task(user):
    project = Project.objects.create(name='Comments', owner=user)
    return Task.objects.create(project=project, title='Discuss', created_by=user)


@pytest.mark.django_db
class TestTaskComments:
    @pytest.mark.parametrize('role', ['admin', 'member', 'viewer', None])
    def test_comment_permissions(self, auth_client, user, comment_task, role):
        if role:
            Membership.objects.create(user=user, project=comment_task.project, role=role)
        url = f'/api/tasks/{comment_task.id}/comments'
        assert auth_client.get(url).status_code == (200 if role else 403)
        response = auth_client.post(url, {'body': 'Hello'}, format='json')
        allowed = role in ('admin', 'member')
        assert response.status_code == (201 if allowed else 403)
        assert TaskComment.objects.count() == (1 if allowed else 0)

    def test_author_and_time_are_set_by_server(self, auth_client, user, comment_task):
        Membership.objects.create(user=user, project=comment_task.project, role='member')
        response = auth_client.post(f'/api/tasks/{comment_task.id}/comments', {
            'body': '  Hello  ', 'author': {'id': 'someone-else'},
            'created_at': '2000-01-01T00:00:00Z',
        }, format='json')
        assert response.status_code == 201
        comment = TaskComment.objects.get()
        assert comment.author == user
        assert comment.body == 'Hello'
        assert comment.created_at.year != 2000
        assert response.data['comment']['author']['name'] == user.name

    @pytest.mark.parametrize('body', ['', '   ', None, []])
    def test_invalid_body(self, auth_client, user, comment_task, body):
        Membership.objects.create(user=user, project=comment_task.project, role='member')
        response = auth_client.post(f'/api/tasks/{comment_task.id}/comments', {'body': body}, format='json')
        assert response.status_code == 400
        assert not TaskComment.objects.exists()

    def test_list_is_chronological_and_task_scoped(self, auth_client, user, comment_task):
        from datetime import timedelta
        Membership.objects.create(user=user, project=comment_task.project, role='viewer')
        later = TaskComment.objects.create(task=comment_task, author=user, body='Later')
        earlier = TaskComment.objects.create(task=comment_task, author=user, body='Earlier')
        TaskComment.objects.filter(id=earlier.id).update(created_at=later.created_at - timedelta(minutes=1))
        other_task = Task.objects.create(project=comment_task.project, title='Other', created_by=user)
        TaskComment.objects.create(task=other_task, author=user, body='Other task')
        response = auth_client.get(f'/api/tasks/{comment_task.id}/comments')
        assert [item['body'] for item in response.data['comments']] == ['Earlier', 'Later']

    @pytest.mark.parametrize('method', ['patch', 'put', 'delete'])
    def test_comments_cannot_be_changed(self, auth_client, user, comment_task, method):
        Membership.objects.create(user=user, project=comment_task.project, role='admin')
        comment = TaskComment.objects.create(task=comment_task, author=user, body='Original')
        url = f'/api/tasks/{comment_task.id}/comments'
        assert getattr(auth_client, method)(url, {'body': 'Changed'}, format='json').status_code == 405
        assert getattr(auth_client, method)(f'{url}/{comment.id}', {'body': 'Changed'}, format='json').status_code == 404
        comment.refresh_from_db()
        assert comment.body == 'Original'

    def test_anonymous_access_is_denied(self, client, comment_task):
        url = f'/api/tasks/{comment_task.id}/comments'
        assert client.get(url).status_code == 401
        assert client.post(url, {'body': 'Hello'}, format='json').status_code == 401


@pytest.mark.django_db
class TestProjects:
    def test_create_project(self, auth_client, user):
        response = auth_client.post('/api/projects', {'name': 'My Project'}, format='json')
        assert response.status_code == 201
        assert response.data['project']['name'] == 'My Project'

    def test_list_only_returns_member_projects(self, auth_client, user):
        p1 = Project.objects.create(name='Mine', owner=user)
        Membership.objects.create(user=user, project=p1, role='admin')
        other = User.objects.create_user(email='other@example.com', name='Other', password='password123')
        p2 = Project.objects.create(name='Not Mine', owner=other)
        Membership.objects.create(user=other, project=p2, role='admin')

        response = auth_client.get('/api/projects')
        assert response.status_code == 200
        names = [p['name'] for p in response.data['projects']]
        assert 'Mine' in names
        assert 'Not Mine' not in names

    def test_get_project_detail(self, auth_client, user):
        project = Project.objects.create(name='My Project', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.get(f'/api/projects/{project.id}')
        assert response.status_code == 200
        assert response.data['project']['name'] == 'My Project'

    def test_non_member_cannot_view_project(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='Private', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/projects/{project.id}')
        assert response.status_code == 403


@pytest.mark.django_db
class TestTasks:
    @pytest.mark.parametrize('query', ["') OR 1=1 -- ", "customer's"])
    def test_search_treats_quotes_as_data(self, auth_client, user, query):
        project = Project.objects.create(name='Visible', owner=user)
        Membership.objects.create(user=user, project=project, role='viewer')
        matching = Task.objects.create(project=project, title=query, created_by=user)
        Task.objects.create(project=project, title='Unrelated', created_by=user)
        other = User.objects.create_user(email='other@example.com', name='Other')
        private = Project.objects.create(name='Private', owner=other)
        Task.objects.create(project=private, title=query, created_by=other)

        response = auth_client.get(f'/api/projects/{project.id}/tasks', {'q': query})

        assert response.status_code == 200
        assert [task['id'] for task in response.json()['tasks']] == [str(matching.id)]

    def test_search_preserves_matching_order_and_response_fields(self, auth_client, user):
        project = Project.objects.create(name='Visible', owner=user)
        Membership.objects.create(user=user, project=project, role='viewer')
        later = Task.objects.create(
            project=project, title='LAUNCH plan', created_by=user, position=2,
        )
        earlier = Task.objects.create(
            project=project, title='Notes', description='Launch details',
            created_by=user, position=1,
        )
        Task.objects.create(project=project, title='Unrelated', created_by=user)

        response = auth_client.get(f'/api/projects/{project.id}/tasks', {'q': 'launch'})

        assert response.status_code == 200
        tasks = response.json()['tasks']
        assert [task['id'] for task in tasks] == [str(earlier.id), str(later.id)]
        assert set(tasks[0]) == {
            'id', 'project_id', 'title', 'description', 'status', 'assignee_id',
            'created_by_id', 'position', 'created_at', 'updated_at',
        }

    def test_create_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.post(f'/api/projects/{project.id}/tasks', {'title': 'Do a thing'}, format='json')
        assert response.status_code == 201
        assert response.data['task']['title'] == 'Do a thing'

    def test_viewers_cannot_create_tasks(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/projects/{project.id}/tasks', {'title': 'A task'}, format='json')
        assert response.status_code == 403

    def test_delete_task_requires_membership(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.delete(f'/api/tasks/{task.id}')
        assert response.status_code == 403
