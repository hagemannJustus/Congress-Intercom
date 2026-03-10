import unittest
from fastapi.testclient import TestClient
from app.main import app
import asyncio

class TestMagicLink(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_read_root(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.json())

    def test_graphql_health(self):
        query = "{ hello }"
        response = self.client.post("/graphql", json={"query": query})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["hello"], "Welcome to the Magic Link API!")

    def test_request_magic_link_invalid_email(self):
        mutation = """
        mutation RequestMagicLink($email: String!) {
            requestMagicLink(email: $email) {
                success
                message
            }
        }
        """
        response = self.client.post("/graphql", json={
            "query": mutation,
            "variables": {"email": "invalid-email"}
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]["requestMagicLink"]
        self.assertFalse(data["success"])
        self.assertEqual(data["message"], "Invalid email format")

if __name__ == "__main__":
    unittest.main()
