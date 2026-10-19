import base64
import json
import os
import unittest
from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from app import DOCUMENTS, DuckDuckGoResultsParser, app, search_images, select_search_tools


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

    def test_uses_reference_image_as_multimodal_generation_input(self):
        reference_bytes = b"reference png bytes"
        generated_bytes = b"generated png bytes"
        response_body = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": base64.b64encode(generated_bytes).decode("ascii"),
                        },
                    }],
                },
            }],
        }
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")
        reference_data_url = "data:image/png;base64," + base64.b64encode(reference_bytes).decode("ascii")

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response) as urlopen:
                response = self.client.post(
                    "/api/generate-image",
                    json={"prompt": "Create a watercolor version of this scene", "referenceImage": reference_data_url},
                )

        self.assertEqual(response.status_code, 200)
        request_body = json.loads(urlopen.call_args.args[0].data)
        parts = request_body["contents"][0]["parts"]
        self.assertEqual(len(parts), 2)
        self.assertIn("use it as visual guidance", parts[0]["text"])
        self.assertEqual(parts[1]["inlineData"]["mimeType"], "image/png")
        self.assertEqual(
            base64.b64decode(parts[1]["inlineData"]["data"]),
            reference_bytes,
        )

    def test_rejects_invalid_reference_image_data(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            response = self.client.post(
                "/api/generate-image",
                json={"prompt": "A watercolor fox", "referenceImage": "data:image/gif;base64,YWJj"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("JPEG, PNG, or WebP", response.get_json()["error"])


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

    def test_web_and_image_search_results_are_returned_and_ground_the_answer(self):
        groq_client = MagicMock()
        groq_client.chat.completions.create.return_value.choices = [
            MagicMock(message=MagicMock(content="The current answer is 42 [1]."))
        ]
        web_results = [{
            "title": "Example source",
            "url": "https://example.com/article",
            "snippet": "A useful factual excerpt.",
        }]
        image_results = [{
            "title": "Example image",
            "thumbnail": "https://upload.wikimedia.org/example.jpg",
            "url": "https://commons.wikimedia.org/wiki/File:Example.jpg",
            "source": "Wikimedia Commons",
        }]

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}):
            with patch("app.Groq", return_value=groq_client):
                with patch("app.search_web", return_value=web_results) as web_search:
                    with patch("app.search_images", return_value=image_results) as image_search:
                        response = app.test_client().post(
                            "/api/chat",
                            json={
                                "messages": [{
                                    "role": "user",
                                    "content": "Show me the latest images of aurora borealis.",
                                }],
                            },
                        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["sources"], web_results)
        self.assertEqual(response.get_json()["images"], image_results)
        self.assertEqual(response.get_json()["search_warnings"], [])
        web_search.assert_called_once()
        image_search.assert_called_once()
        system_message = groq_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("untrusted reference data", system_message)
        self.assertIn("A useful factual excerpt.", system_message)

    def test_search_intent_selects_tools_from_the_latest_user_message(self):
        current_question = select_search_tools([
            {"role": "user", "content": "Explain Python functions."},
            {"role": "assistant", "content": "Functions package reusable logic."},
            {"role": "user", "content": "What are the latest Python updates?"},
        ])
        image_question = select_search_tools([
            {"role": "user", "content": "Tell me about auroras."},
            {"role": "assistant", "content": "Auroras are natural light displays."},
            {"role": "user", "content": "Show me some pictures of them."},
        ])
        visual_reference_question = select_search_tools([
            {"role": "user", "content": "I need visual references for a solar eclipse."},
        ])
        ordinary_question = select_search_tools([
            {"role": "user", "content": "Explain Python functions with an example."},
        ])
        image_creation = select_search_tools([
            {"role": "user", "content": "Create an image of a purple dragon."},
        ])

        self.assertTrue(current_question["web"])
        self.assertFalse(current_question["images"])
        self.assertTrue(image_question["images"])
        self.assertIn("Tell me about auroras.", image_question["query"])
        self.assertFalse(image_question["web"])
        self.assertTrue(visual_reference_question["images"])
        self.assertFalse(ordinary_question["web"])
        self.assertFalse(ordinary_question["images"])
        self.assertFalse(image_creation["images"])

    def test_search_controls_are_not_rendered(self):
        response = app.test_client().get("/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b'id="webSearchBtn"', response.data)
        self.assertNotIn(b'id="imageSearchBtn"', response.data)

    def test_rejects_non_boolean_search_options(self):
        response = app.test_client().post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Hello"}], "web_search": "yes"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("true or false", response.get_json()["error"])

    def test_search_provider_errors_are_reported(self):
        groq_client = MagicMock()
        groq_client.chat.completions.create.return_value.choices = [
            MagicMock(message=MagicMock(content="I can offer background, but cannot verify the latest news."))
        ]
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}):
            with patch("app.search_web", side_effect=URLError("offline")):
                with patch("app.Groq", return_value=groq_client):
                    response = app.test_client().post(
                        "/api/chat",
                        json={"messages": [{"role": "user", "content": "What is the latest news?"}]},
                    )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("latest news", payload["answer"])
        self.assertIn("Web search is temporarily unavailable", payload["search_warnings"][0])
        system_message = groq_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("could not verify the latest information", system_message)

    def test_uploaded_image_is_used_for_a_contextual_gemini_answer(self):
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps({
            "candidates": [{
                "content": {"parts": [{"text": "The image shows a red bicycle."}]},
            }],
        }).encode("utf-8")
        client = app.test_client()
        upload_response = client.post(
            "/api/upload",
            data={"file": (BytesIO(b"png image bytes"), "bicycle.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(upload_response.status_code, 200)
        self.assertTrue(upload_response.get_json()["image"])

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("app.urlopen", return_value=upstream_response) as urlopen:
                response = client.post(
                    "/api/chat",
                    json={"messages": [{"role": "user", "content": "What color is the bicycle?"}]},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["answer"], "The image shows a red bicycle.")
        request_body = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(request_body["contents"][0]["parts"][1]["inlineData"]["mimeType"], "image/png")
        self.assertIn("What color is the bicycle?", request_body["contents"][0]["parts"][0]["text"])
        with client.session_transaction() as flask_session:
            DOCUMENTS.pop(flask_session.get("document_id"), None)


class SearchHelperTests(unittest.TestCase):
    def test_duckduckgo_parser_extracts_source_and_snippet(self):
        parser = DuckDuckGoResultsParser()
        parser.feed(
            '<a class="result__a" href="https://example.com/article">Example source</a>'
            '<div class="result__snippet">Useful search result.</div>'
        )

        self.assertEqual(parser.results, [{
            "title": "Example source",
            "url": "https://example.com/article",
            "snippet": "Useful search result.",
        }])

    def test_image_search_returns_wikimedia_thumbnails_and_source_links(self):
        response_body = {
            "query": {
                "pages": {
                    "123": {
                        "title": "File:Example.jpg",
                        "imageinfo": [{
                            "thumburl": "https://upload.wikimedia.org/wikipedia/commons/example.jpg",
                            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
                        }],
                    },
                },
            },
        }
        upstream_response = MagicMock()
        upstream_response.__enter__.return_value.read.return_value = json.dumps(response_body).encode("utf-8")

        with patch("app.urlopen", return_value=upstream_response):
            results = search_images("example")

        self.assertEqual(results, [{
            "title": "Example.jpg",
            "thumbnail": "https://upload.wikimedia.org/wikipedia/commons/example.jpg",
            "url": "https://commons.wikimedia.org/wiki/File:Example.jpg",
            "source": "Wikimedia Commons",
        }])


if __name__ == "__main__":
    unittest.main()
