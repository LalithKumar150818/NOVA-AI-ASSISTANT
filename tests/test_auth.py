import json
import os
import unittest
from unittest.mock import patch

from app import app


TEST_USER_ID = "2eb56a10-4e52-4ec8-9f74-9f8d2bc1b222"
TEST_CONVERSATION_ID = "2c11d8af-1e12-4df3-81b1-733ad0e59a76"
SUPABASE_ENV = {
    "SUPABASE_URL": "https://nova-test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
}


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _size=-1):
        return self.body


class SupabaseAuthTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_missing_supabase_configuration_is_reported(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "", "SUPABASE_ANON_KEY": ""}):
            status = self.client.get("/api/auth/status")
            response = self.client.post(
                "/api/auth/register",
                json={"email": "person@example.com", "password": "a-secure-password"},
            )

        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.get_json()["enabled"])
        self.assertEqual(response.status_code, 503)
        self.assertIn("SUPABASE_URL and SUPABASE_ANON_KEY", response.get_json()["error"])

    def test_registration_and_login_validate_credentials_before_provider_call(self):
        with patch.dict(os.environ, SUPABASE_ENV):
            with patch("app.urlopen") as urlopen:
                response = self.client.post(
                    "/api/auth/register",
                    json={"email": "not-an-email", "password": "short"},
                )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.get_json()["error"])
        urlopen.assert_not_called()

    def test_login_keeps_provider_tokens_encrypted_and_out_of_response(self):
        auth_response = {
            "access_token": "secret-access-token",
            "refresh_token": "secret-refresh-token",
            "expires_in": 3600,
            "user": {"id": TEST_USER_ID, "email": "person@example.com"},
        }
        with patch.dict(os.environ, SUPABASE_ENV):
            with patch(
                "app.urlopen",
                return_value=FakeResponse(json.dumps(auth_response).encode("utf-8")),
            ) as urlopen:
                response = self.client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-secure-password"},
                )
            status = self.client.get("/api/auth/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["id"], TEST_USER_ID)
        self.assertNotIn("access_token", response.get_json())
        self.assertNotIn("secret-access-token", response.headers.get("Set-Cookie", ""))
        self.assertNotIn("secret-refresh-token", response.headers.get("Set-Cookie", ""))
        self.assertEqual(status.get_json()["user"]["email"], "person@example.com")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://nova-test.supabase.co/auth/v1/token?grant_type=password")
        self.assertEqual(request.get_header("Apikey"), "test-anon-key")
        self.assertNotIn(b"secret-access-token", request.data)
        self.assertIn(b'"password": "a-secure-password"', request.data)

    def test_authenticated_conversation_writes_require_csrf_and_user_jwt(self):
        auth_response = {
            "access_token": "secret-access-token",
            "refresh_token": "secret-refresh-token",
            "expires_in": 3600,
            "user": {"id": TEST_USER_ID, "email": "person@example.com"},
        }
        created = [{
            "id": TEST_CONVERSATION_ID,
            "title": "Example",
            "created_at": "2026-10-25T00:00:00Z",
            "updated_at": "2026-10-25T00:00:00Z",
        }]
        with patch.dict(os.environ, SUPABASE_ENV):
            with patch("app.urlopen", return_value=FakeResponse(json.dumps(auth_response).encode())):
                login = self.client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-secure-password"},
                )
            csrf_token = login.get_json()["csrf_token"]
            with patch("app.urlopen") as urlopen:
                rejected = self.client.post(
                    "/api/conversations",
                    json={"title": "Example"},
                )
            self.assertEqual(rejected.status_code, 403)
            urlopen.assert_not_called()

            with patch(
                "app.urlopen",
                return_value=FakeResponse(json.dumps(created).encode()),
            ) as urlopen:
                response = self.client.post(
                    "/api/conversations",
                    json={"title": "Example"},
                    headers={"X-CSRF-Token": csrf_token},
                )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["conversation"]["id"], TEST_CONVERSATION_ID)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-access-token")
        self.assertEqual(request.get_header("Apikey"), "test-anon-key")
        self.assertEqual(json.loads(request.data)["user_id"], TEST_USER_ID)
        self.assertNotIn("secret-access-token", response.get_data(as_text=True))

    def test_conversation_history_is_replaced_through_owner_scoped_rpc(self):
        auth_response = {
            "access_token": "secret-access-token",
            "refresh_token": "secret-refresh-token",
            "expires_in": 3600,
            "user": {"id": TEST_USER_ID, "email": "person@example.com"},
        }
        conversation = [{
            "id": TEST_CONVERSATION_ID,
            "title": "Example",
            "created_at": "2026-10-25T00:00:00Z",
            "updated_at": "2026-10-25T00:00:00Z",
        }]
        rpc_response = {"saved": 2}
        with patch.dict(os.environ, SUPABASE_ENV):
            with patch("app.urlopen", return_value=FakeResponse(json.dumps(auth_response).encode())):
                login = self.client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-secure-password"},
                )
            with patch(
                "app.urlopen",
                side_effect=[
                    FakeResponse(json.dumps(conversation).encode()),
                    FakeResponse(json.dumps(rpc_response).encode()),
                    FakeResponse(b""),
                ],
            ) as urlopen:
                response = self.client.put(
                    f"/api/conversations/{TEST_CONVERSATION_ID}/messages",
                    json={
                        "title": "Example",
                        "messages": [
                            {"role": "user", "content": "Hi", "imageDataUrl": "not persisted"},
                            {"role": "assistant", "content": "Hello", "sources": [{"title": "Source"}]},
                        ],
                    },
                    headers={"X-CSRF-Token": login.get_json()["csrf_token"]},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(urlopen.call_count, 3)
        rpc_request = urlopen.call_args_list[1].args[0]
        self.assertTrue(rpc_request.full_url.endswith("/rest/v1/rpc/replace_conversation_messages"))
        self.assertEqual(rpc_request.get_header("Authorization"), "Bearer secret-access-token")
        rpc_payload = json.loads(rpc_request.data)
        self.assertEqual(rpc_payload["p_conversation_id"], TEST_CONVERSATION_ID)
        self.assertEqual(rpc_payload["p_messages"][0]["metadata"], {})
        self.assertNotIn("imageDataUrl", rpc_request.data.decode("utf-8"))

    def test_rls_hidden_foreign_conversations_return_not_found(self):
        auth_response = {
            "access_token": "secret-access-token",
            "refresh_token": "secret-refresh-token",
            "expires_in": 3600,
            "user": {"id": TEST_USER_ID, "email": "person@example.com"},
        }
        with patch.dict(os.environ, SUPABASE_ENV):
            with patch("app.urlopen", return_value=FakeResponse(json.dumps(auth_response).encode())):
                self.client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-secure-password"},
                )
            with patch("app.urlopen", return_value=FakeResponse(b"[]")) as urlopen:
                response = self.client.get(f"/api/conversations/{TEST_CONVERSATION_ID}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Conversation not found.")
        self.assertEqual(urlopen.call_args.args[0].get_header("Authorization"), "Bearer secret-access-token")


if __name__ == "__main__":
    unittest.main()
