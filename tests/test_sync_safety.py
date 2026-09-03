import os
import tempfile
import unittest


class SyncSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database_file = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        cls.database_file.close()
        os.environ['DATABASE_URL'] = f"sqlite:///{cls.database_file.name.replace(os.sep, '/')}"
        os.environ['SECRET_KEY'] = 'test-secret'

        from api.index import app, db
        cls.app = app
        cls.db = db
        with app.app_context():
            db.create_all()

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            cls.db.engine.dispose()
        os.unlink(cls.database_file.name)

    def setUp(self):
        self.client = self.app.test_client()
        response = self.client.post('/api/auth/signup', json={
            'email': f'user-{id(self)}@example.com',
            'password': 'password'
        })
        self.assertEqual(response.status_code, 201)
        self.token = response.get_json()['token']
        self.headers = {'Authorization': f'Bearer {self.token}'}

    def test_omitted_events_are_preserved_until_explicitly_deleted(self):
        events = [
            {'id': 'event-a', 'type': 'task', 'title': 'A', 'date': '2026-09-03'},
            {'id': 'event-b', 'type': 'task', 'title': 'B', 'date': '2026-09-03'},
        ]
        response = self.client.post('/api/events/sync', headers=self.headers,
                                    json={'events': events})
        self.assertEqual(response.status_code, 200)

        response = self.client.post('/api/events/sync', headers=self.headers,
                                    json={'events': [events[0]]})
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/events', headers=self.headers)
        self.assertEqual({event['id'] for event in response.get_json()}, {'event-a', 'event-b'})

        response = self.client.post('/api/events/sync', headers=self.headers,
                                    json={'events': [events[0]], 'deletedIds': ['event-b']})
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/events', headers=self.headers)
        self.assertEqual({event['id'] for event in response.get_json()}, {'event-a'})

    def test_stale_event_update_cannot_replace_newer_update(self):
        newer = {
            'id': 'event-c', 'type': 'task', 'title': 'New title',
            'date': '2026-09-03', 'updatedAt': '2026-09-03T12:00:00+00:00'
        }
        stale = {**newer, 'title': 'Old title', 'updatedAt': '2026-09-03T11:00:00+00:00'}

        response = self.client.post('/api/events/sync', headers=self.headers,
                                    json={'events': [newer]})
        self.assertEqual(response.status_code, 200)
        response = self.client.post('/api/events/sync', headers=self.headers,
                                    json={'events': [stale]})
        self.assertEqual(response.status_code, 200)
        event = next(item for item in response.get_json()['events'] if item['id'] == 'event-c')
        self.assertEqual(event['title'], 'New title')

    def test_shared_event_access_respects_view_and_edit_permissions(self):
        owner_token = self.token
        recipient_email = f'recipient-{id(self)}@example.com'
        response = self.client.post('/api/auth/signup', json={
            'email': recipient_email,
            'password': 'password'
        })
        self.assertEqual(response.status_code, 201)
        recipient_token = response.get_json()['token']
        owner_headers = {'Authorization': f'Bearer {owner_token}'}
        recipient_headers = {'Authorization': f'Bearer {recipient_token}'}
        event = {
            'id': f'shared-{id(self)}', 'type': 'task', 'title': 'Shared task',
            'date': '2026-09-03', 'updatedAt': '2026-09-03T12:00:00+00:00'
        }

        response = self.client.post('/api/events/sync', headers=owner_headers,
                                    json={'events': [event]})
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            f"/api/events/{event['id']}/shares", headers=owner_headers,
            json={'email': recipient_email, 'permission': 'view'})
        self.assertEqual(response.status_code, 201)

        response = self.client.get('/api/shared/events', headers=recipient_headers)
        self.assertEqual(response.status_code, 200)
        shared = response.get_json()[0]
        self.assertEqual(shared['id'], event['id'])
        self.assertEqual(shared['sharePermission'], 'view')

        response = self.client.put(f"/api/shared/events/{event['id']}",
                                   headers=recipient_headers,
                                   json={**event, 'title': 'Rejected edit'})
        self.assertEqual(response.status_code, 403)

        response = self.client.post(
            f"/api/events/{event['id']}/shares", headers=owner_headers,
            json={'email': recipient_email, 'permission': 'edit'})
        self.assertEqual(response.status_code, 201)
        response = self.client.put(f"/api/shared/events/{event['id']}",
                                   headers=recipient_headers,
                                   json={**event, 'title': 'Accepted edit',
                                         'updatedAt': '2026-09-03T13:00:00+00:00'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['title'], 'Accepted edit')


if __name__ == '__main__':
    unittest.main()
