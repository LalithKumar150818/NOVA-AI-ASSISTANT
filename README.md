# Nova AI Assistant — Mini Project

A Flask-based AI assistant with context-aware chat, automatic web and image search, Gemini image generation from text prompts and optional reference photos, image analysis, voice input and optional read-aloud responses, and document upload for TXT, PDF, DOCX, JPG, PNG, and WebP files.

## Features
- Responsive dark desktop and mobile chat interface with multi-turn conversations and recent chats saved in the current browser
- Responsive recent-chat sidebar that becomes a left-sliding drawer on phones and tablets, with close button, outside-click backdrop, Escape-key support, and chat selection
- Start a new conversation from the sidebar or mobile header; generated images and image references are stored in browser IndexedDB and chat metadata in local storage
- ChatGPT-inspired dark composer, starter prompts, image-creation mode, and mobile-friendly layout
- Clearly formatted AI answers that follow the language explicitly requested for each turn, or otherwise the language of the user's latest message
- AI answers through the Groq API
- Automatic web search through DuckDuckGo for current events, recent information, news, releases, prices, and other time-sensitive questions; cited sources are displayed with the answer
- Automatic image search through Wikimedia Commons when users ask to see pictures, photos, or visual references; thumbnails, titles, and attribution links are displayed in chat
- Create images from text prompts through Gemini image generation; optionally attach a JPEG, PNG, or WebP reference photo to guide the result
- Display generated images as soon as Gemini responds, while saving them to browser storage in the background
- Capture a photo in the browser and ask Gemini to describe or analyze it
- Voice-to-text in supported browsers (Chrome/Edge recommended) and click-to-read AI responses where browser speech synthesis is available
- Upload TXT, text-based PDF, and DOCX; then ask questions about the extracted text
- Upload JPG, PNG, and WebP images and ask Gemini questions about their contents
- Clear uploaded document context
- API key loaded from `.env`, never exposed in frontend JavaScript or hard-coded in the app

## Technology
- Python + Flask: backend and API routes
- HTML/CSS/JavaScript: frontend
- Groq Python SDK: text chat API
- Google Gemini API: photo analysis and text/image-reference generation
- DuckDuckGo HTML search and Wikimedia Commons API: automatic web and image search (no search API key required)
- pypdf and python-docx: text extraction
- Browser Web Speech API: microphone input

## Requirements
- Python 3.10+
- VS Code
- Internet connection for Groq API calls
- A Groq API key for text chat: https://console.groq.com/keys
- A Gemini API key for photo analysis and image generation: https://aistudio.google.com/apikey

## Windows setup in VS Code (PowerShell)

1. Extract the ZIP file.
2. Open the extracted `ai_assistant_mini_project` folder in VS Code.
3. Open Terminal → New Terminal.
4. Create a virtual environment:

   ```powershell
   python -m venv .venv
   ```

5. Activate it:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

   If PowerShell blocks activation, run this for the current terminal only, then activate again:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\.venv\Scripts\Activate.ps1
   ```

6. Install dependencies:

   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

7. Create your environment file by copying the example:

   ```powershell
   Copy-Item .env.example .env
   ```

8. Open `.env` and add your Groq key as `GROQ_API_KEY` and your Gemini key as `GEMINI_API_KEY`. Do not share or commit these keys. Text chat uses the default Groq model `openai/gpt-oss-120b`; photo analysis uses `gemini-2.5-flash`; image generation uses `gemini-2.5-flash-image`. Update `GROQ_MODEL`, `GEMINI_MODEL`, or `GEMINI_IMAGE_MODEL` if a configured model is unavailable for your account.

9. Start the app:

   ```powershell
   python app.py
   ```

10. Open this address in your browser:

    http://127.0.0.1:5000

## Quick test
1. Ask: `Explain Python loops with two examples.`
2. Ask a follow-up question and confirm Nova uses earlier messages in the same chat.
3. Click `New chat`, then switch to an earlier conversation from the Recent Chats list.
4. Turn on **Image** in the composer and ask: `Create a friendly robot reading under a tree.` The image should appear in the chat.
5. While **Image** mode is active, attach a JPEG, PNG, or WebP with the picture button, then describe how it should guide the result (for example, `Keep the same subject, but make it a watercolor illustration.`).
6. On a phone-sized browser window, tap `Chats` and reopen a recent conversation.
7. Click the microphone and allow access; speak a short question.
8. Click the camera button, allow camera access, take a photo, and ask Gemini a question about it.
9. Upload a TXT, text-based PDF, or DOCX file.
10. Ask: `Summarize the uploaded document in five bullet points.`
11. Click `Clear document` to remove document context from the session.
12. Ask `What are the latest Python releases?` and inspect the numbered citations and source links. No search control is needed.
13. Ask `Show me pictures of the aurora borealis.` and open an image result to view its Wikimedia Commons attribution page.
14. Ask a stable question such as `Explain Python functions with an example.` and confirm Nova answers without requiring live search.
15. Upload a JPG, PNG, or WebP image and ask a question about it; Gemini analyzes the image in the context of the current chat.
16. Select **Read aloud** under an AI response where browser speech synthesis is supported.

## Run the tests
From the `ai_assistant_mini_project` folder with the virtual environment activated:

```powershell
python -m unittest discover -s tests -v
```

The search behavior is automatic and heuristic: Nova uses web search for time-sensitive wording and image search for explicit requests to see or find pictures. Stable questions use the configured AI model's knowledge. Search provider failures do not prevent a regular AI response; the interface displays a warning when live results could not be fetched.

## Mobile sidebar
At widths up to 880px, tap the menu icon beside the Nova header to slide in Recent Chats from the left. Choose a saved conversation or use **New chat** to close the drawer and return to the conversation. Close it with the close icon, by tapping the shaded area outside the sidebar, or with Escape. At wider desktop widths, the sidebar remains visible beside the chat. Chat history is stored in the current browser.

Chat history is saved locally in the browser and is not shared across browsers or devices. This lets a user reopen chats on the same phone/browser; sharing history between a phone and a computer requires user accounts and a server-side database, neither of which this demo currently has. Generated images and reference photos used in chat history are stored separately in browser IndexedDB to avoid filling the smaller local-storage quota, without delaying the first display of generated images. Image-generation time itself depends on Gemini's model, service load, and network; the app cannot guarantee a shorter provider generation time. Captured and uploaded photos are sent to Gemini for analysis and are held in the app's in-memory demo document store until cleared or the server restarts. Text chat and uploaded document context continue to use Groq. Web results come from DuckDuckGo and image results from Wikimedia Commons; source excerpts are reference material, not guaranteed fact-checking. Search results depend on upstream availability and may be incomplete or out of date. Nova's response quality depends on the configured AI models and provider limits; this project does not run or include ChatGPT, Claude, or Gemini chat models, and cannot guarantee equivalent capabilities.

## Deploying

Deploy the `ai_assistant_mini_project` folder as a Python web service on a host that supports Flask and Gunicorn (for example, Render):

1. Set the project root to `ai_assistant_mini_project`.
2. Use `pip install -r requirements.txt` as the build command.
3. Use `gunicorn app:app` as the start command.
4. Configure `GROQ_API_KEY`, `GEMINI_API_KEY`, and a unique `FLASK_SECRET_KEY` as private environment variables. Set `GROQ_MODEL`, `GEMINI_MODEL`, or `GEMINI_IMAGE_MODEL` only if you need to use a different model. Do not put secrets in source code or commit `.env`.
5. Enable HTTPS on the host. Browser camera and microphone access require localhost or a secure (HTTPS) origin.
6. Redeploy/restart the service after uploading or pushing the updated project files. For a Git-based deployment, push the updated source to the configured branch and trigger the host's deployment; for a ZIP/manual deployment, upload the updated project folder and restart the web service.

Generate a secret locally with `python -c "import secrets; print(secrets.token_hex(32))"` and add the result as `FLASK_SECRET_KEY` in the host settings. Never use the example secret in a public deployment. The included Gunicorn command runs without Flask's development server or debugger. This demo stores conversations in each visitor's browser, not on the server; hosting it does not synchronize chat history across devices.

## Voice input language
In `static/app.js`, change:

```javascript
recognition.lang = "en-IN";
```

to `te-IN` for Telugu voice input, if your browser supports it. This setting affects speech recognition only. For chat, ask for a response in any language (for example, "Reply in Telugu") or simply write your question in that language. Nova is instructed to follow the language requested for the current turn, and otherwise respond in the language of your latest message; support for a specific language depends on the configured AI provider/model.

Voice features are browser-dependent. The app uses speech recognition to convert speech into text and the browser's speech synthesis to read an answer aloud when the user selects **Read aloud**. Text-to-speech is not automatic.

## File upload notes
- Maximum request size: 10 MB
- Supported: `.txt`, `.pdf`, `.docx`, `.jpg`, `.jpeg`, `.png`, `.webp`
- Uploaded images are limited to 7 MB and are analyzed by Gemini; image-generation reference photos have the same limit. Document uploads are limited by the 10 MB total request size.
- Image-only/scanned PDFs are not OCR-processed in this starter project.
- The app extracts up to 15,000 characters for document context to limit prompt size.
- The extracted document text is sent to the AI provider when you ask a question. Do not upload confidential documents.

## Troubleshooting
- `npm run dev` fails with `ENOENT` for `package.json`: this is a Python/Flask project, not a Node.js project. From the `ai_assistant_mini_project` folder, start it with `python app.py`, then open http://127.0.0.1:5000.
- `ModuleNotFoundError`: confirm `.venv` is active and run `pip install -r requirements.txt`.
- `GROQ_API_KEY is missing`: check that `.env` is in the project folder or the parent folder, and restart `python app.py`.
- Image generation or reference-photo generation fails: check `GEMINI_API_KEY`, confirm `GEMINI_IMAGE_MODEL` is available to your account (default `gemini-2.5-flash-image`), use a JPEG, PNG, or WebP reference smaller than 7 MB, and review the error shown in the chat.
- `401` / authentication error: create a valid key in Groq Console and paste it without quotes or extra spaces.
- Gemini photo analysis fails: check `GEMINI_API_KEY`, confirm the configured `GEMINI_MODEL` is available, and try a smaller photo.
- Web or image search fails: check the internet connection and retry; search providers may temporarily rate-limit or change their response format.
- Model error: check which models are currently available for your Groq account, then update `GROQ_MODEL` in `.env`.
- Microphone does not work: try Chrome/Edge, use `http://127.0.0.1:5000`, and allow microphone access.
- Camera does not work: use Chrome/Edge on `http://127.0.0.1:5000` or HTTPS, allow camera access in the browser, and check that another app is not using the camera.
- Port 5000 is busy: stop the other Flask app or change the port in `app.py`.

## Important
This is a learning/demo project, not a production-ready public service. Before deploying publicly, add authentication, rate limiting, stronger session management, secure hosting, and privacy controls. Do not expose `.env` or your API key.
