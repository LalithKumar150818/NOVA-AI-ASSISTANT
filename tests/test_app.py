import base64
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from app import app


class GenerateImageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_requires_a_nonempty_prompt(self):
        response = self.client.post("/api/generate-image", json={"prompt": " "})

        self.assertEqual(response.status_code, 400)
        self.assertIn("image prompt", response.get_json()["error"])

    def test_requires_gemini_api_key(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = self.client.post("/api/generate-image", json={"prompt": "A watercolor fox"})

        self.assertEqual(response.status_code, 500)
        self.assertIn("GEMINI_API_KEY is missing", response.get_json()["error"])

    def test_returns_generated_image_and_text(self):
        image_bytes = b"generated png bytes"
        response_body = {
            "candidates": [{
                "content": {
                    "parts": [
                        {"text": "A watercolor fox in a forest."},
                        {"inlineData": {
                            "mimeType": "image/png",
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }},
                    ],
                },
            }],
        }
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response) as urlopen:
                response = self.client.post("/api/generate-image", json={"prompt": "A watercolor fox"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["answer"], "A watercolor fox in a forest.")
        self.assertEqual(
            payload["imageDataUrl"],
            "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii"),
        )
        request = urlopen.call_args.args[0]
        self.assertIn("gemini-2.5-flash-image:generateContent", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "test-key")

    def test_rejects_provider_response_without_an_image(self):
        response_body = {"candidates": [{"content": {"parts": [{"text": "No image"}]}}]}
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response):
                response = self.client.post("/api/generate-image", json={"prompt": "A watercolor fox"})

        self.assertEqual(response.status_code, 502)
        self.assertIn("did not return a usable image", response.get_json()["error"])

    def test_generation_prompt_includes_requested_language_rules(self):
        response_body = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": base64.b64encode(b"generated image").decode("ascii"),
                        },
                    }],
                },
            }],
        }
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response) as urlopen:
                response = self.client.post(
                    "/api/generate-image",
                    json={"prompt": "దయచేసి తెలుగులో పూల చిత్రం సృష్టించు"},
                )

        self.assertEqual(response.status_code, 200)
        request_body = json.loads(urlopen.call_args.args[0].data)
        generation_prompt = request_body["contents"][0]["parts"][0]["text"]
        self.assertIn("explicitly asks for", generation_prompt)
        self.assertIn("దయచేసి తెలుగులో పూల చిత్రం సృష్టించు", generation_prompt)


class ChatTests(unittest.TestCase):
    def test_chat_prompt_preserves_context_and_encourages_careful_answers(self):
        groq_client = MagicMock()
        groq_client.chat.completions.create.return_value.choices = [
            MagicMock(message=MagicMock(content="Here is the follow-up."))
        ]
        conversation = [
            {"role": "user", "content": "Explain a Python generator."},
            {"role": "assistant", "content": "It yields values lazily."},
            {"role": "user", "content": "Show a short example."},
        ]

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}):
            with patch("app.Groq", return_value=groq_client):
                response = app.test_client().post("/api/chat", json={"messages": conversation})

        self.assertEqual(response.status_code, 200)
        sent_messages = groq_client.chat.completions.create.call_args.kwargs["messages"]
        self.assertIn("conversation history", sent_messages[0]["content"])
        self.assertIn("explicitly asks for", sent_messages[0]["content"])
        self.assertIn("do not keep using a language requested in an earlier turn", sent_messages[0]["content"])
        self.assertEqual(sent_messages[-1]["content"], "Show a short example.")
        self.assertEqual(response.get_json()["answer"], "Here is the follow-up.")

    def test_photo_analysis_prompt_uses_the_requested_language_rules(self):
        response_body = {
            "candidates": [{
                "content": {"parts": [{"text": "ఇది ఒక పువ్వు."}]},
            }],
        }
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")
        image_data = "data:image/png;base64," + base64.b64encode(b"test photo").decode("ascii")

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response) as urlopen:
                response = app.test_client().post(
                    "/api/analyze-image",
                    json={"image": image_data, "prompt": "తెలుగులో ఈ ఫోటోను వివరించు"},
                )

        self.assertEqual(response.status_code, 200)
        request_body = json.loads(urlopen.call_args.args[0].data)
        analysis_prompt = request_body["contents"][0]["parts"][0]["text"]
        self.assertIn("explicitly asks for", analysis_prompt)
        self.assertIn("తెలుగులో ఈ ఫోటోను వివరించు", analysis_prompt)


if __name__ == "__main__":
    unittest.main()
