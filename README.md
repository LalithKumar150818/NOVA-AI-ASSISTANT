# Nova AI Assistant — Mini Project

A Flask-based AI assistant with context-aware chat, automatic web and image search, Gemini image generation from text prompts and optional reference photos, image analysis, voice input and optional read-aloud responses, and document upload for TXT, PDF, DOCX, JPG, PNG, and WebP files.

## Features
- Responsive dark desktop and mobile chat interface with multi-turn conversations and browser-local history for guests; sign-in enables private cloud history
- Responsive recent-chat sidebar that becomes a left-sliding drawer on phones and tablets, with close button, outside-click backdrop, Escape-key support, and chat selection
- Start, reopen, rename, and delete conversations; edit an earlier user message to replace its following responses
- Generated images and image references are stored in browser IndexedDB and chat metadata in local storage
- ChatGPT-inspired dark composer, starter prompts, and mobile-friendly layout
- Clearly formatted AI answers that follow the language explicitly requested for each turn, or otherwise the language of the user's latest message
- Progressively streamed AI answers through the Groq API, with readable provider error messages
- Markdown responses with code syntax coloring, copy-code buttons, and generated-image downloads
- Automatic web search through DuckDuckGo for current events, prices, company and public-profile details, jobs, current technical documentation, troubleshooting, explicit online searches, and fact verification; cited sources are displayed with the answer
- Automatic image search through Wikimedia Commons when users ask to see pictures, photos, or visual references; thumbnails, titles, and attribution links are displayed in chat
- Automatically route explicit image-creation requests from the normal message composer to Gemini image generation; ordinary questions remain text chat
- Use Gemini 3.1 Flash Lite Image by default for image creation; override `GEMINI_IMAGE_MODEL` when your account needs a different supported model
- Display generated images in the conversation with a download link; uploaded images are used as generation guidance when available
- Display generated images as soon as Gemini responds, while saving them to browser storage in the background
- Capture a photo in the browser and ask Gemini to describe or analyze it
- Voice-to-text in supported browsers (Chrome/Edge recommended) and click-to-read AI responses where browser speech synthesis is available
- Upload TXT, text-based PDF, and DOCX; then ask questions about the extracted text
- Upload JPG, PNG, and WebP images and ask Gemini questions about their contents
- Clear uploaded document context
- API key loaded from `.env`, never exposed in frontend JavaScript or hard-coded in the app
- Optional Supabase Auth accounts with encrypted server-session tokens and per-user conversations/messages protected by PostgreSQL row-level security

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
- A Supabase project for account registration, sign-in, and cloud chat history (optional; see Supabase setup below)

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

8. Open `.env` and add your Groq key as `GROQ_API_KEY` and Gemini key as `GEMINI_API_KEY`. Set a unique `FLASK_SECRET_KEY`. Do not share or commit these values. Text chat uses the configured Groq model (default `openai/gpt-oss-120b`); photo analysis uses `gemini-3.8-flash`; image generation defaults to `gemini-3.1-flash-lite-image`. Update `GROQ_MODEL`, `GEMINI_MODEL`, or `GEMINI_IMAGE_MODEL` if a configured model is unavailable to your account.

   For cloud accounts, also set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as described in [Supabase setup](#supabase-setup). Without these, the app clearly indicates that sign-in is unavailable and keeps guest history in the current browser.

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
   Rename or delete a conversation from its sidebar controls. Use **Edit** under a user message to revise it and regenerate the following response.
4. In the regular message composer, ask: `Generate an image of a friendly robot reading under a tree.` Nova should generate and display an actual image in the chat. Use **Download image** below the generated image to save it.
5. Upload a JPEG, PNG, or WebP using the upload button, then ask Nova to create an image guided by the uploaded photo.
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

The tests cover search selection, provider responses, image/file features, authentication, encrypted token handling, CSRF protection, and user-scoped conversation routes. Live Supabase integration must be verified against a configured Supabase project.

## Mobile sidebar
At widths up to 880px, tap the menu icon beside the Nova header to slide in Recent Chats from the left. Choose a saved conversation or use **New chat** to close the drawer and return to the conversation. Close it with the close icon, by tapping the shaded area outside the sidebar, or with Escape. At wider desktop widths, the sidebar remains visible beside the chat. Guest history is browser-local; sign in to sync conversation text and source metadata across devices.

Guest chat history stays in the current browser. Signed-in conversations and messages are stored in Supabase and protected by per-user row-level security, so users can access their history on other devices. Generated image files and image references remain in the current browser's IndexedDB; document and image uploads are held in server process memory and are not durable across restarts. Do not upload confidential documents or photos. Explicit image-creation prompts are detected by the web interface and sent to Gemini; ordinary prompts use Groq. Groq text responses stream progressively. Web and image searches use DuckDuckGo and Wikimedia Commons, respectively. Search excerpts are reference material, not guaranteed fact-checking; results depend on upstream availability and may be incomplete or out of date.

## Deploying

Deploy the project folder as a Python web service on Render. The included `render.yaml` configures Gunicorn, a health check, and the required secret environment variables:

1. Push this project folder to a GitHub repository and create a Render Web Service from it, or use **New + → Blueprint** to apply `render.yaml`.
2. Use `pip install -r requirements.txt` as the build command and `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 360 app:app` as the start command if configuring the service manually. Binding to Render's assigned port is required. A single worker keeps the existing in-memory upload context consistent; cloud conversations are stored in Supabase.
3. In Render's Environment settings, add `GROQ_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Set `FLASK_SECRET_KEY` to a long random value if Render did not generate it from the Blueprint. Configure the model variables only when you need a non-default model. Never add a service-role key.
4. Run the database setup SQL in [Supabase setup](#supabase-setup) before enabling accounts.
5. Keep HTTPS enabled. Render provides HTTPS; camera and microphone access require localhost or a secure origin.
6. Redeploy after changing source or environment settings.

Generate a secret locally with `python -c "import secrets; print(secrets.token_hex(32))"` if needed. Production startup fails when `FLASK_SECRET_KEY` is missing. This app uses the Supabase anonymous/publishable key with each user's access token and database RLS; it does not require or accept a service-role key.

## Supabase setup
1. Create a Supabase project and open **SQL Editor → New query**.
2. Copy and run [`supabase/schema.sql`](./supabase/schema.sql). This creates `profiles`, `conversations`, and `messages`, installs profile synchronization for Supabase Auth users, enables RLS, and creates an owner-scoped transactional function used to save edited chat histories.
3. In **Project Settings → API**, copy the Project URL and the **publishable key** (or legacy `anon` key). Set them as `SUPABASE_URL` and `SUPABASE_ANON_KEY` in local `.env` and Render's private environment settings. Do not use `service_role` or secret keys.
4. Configure Supabase Auth email confirmation and allowed redirect URLs for your deployed site as appropriate. With email confirmation enabled, users confirm registration before signing in.
5. Restart locally or redeploy on Render. The top bar then shows the sign-in action. Sign-in becomes available when both environment variables are configured. Apply the SQL schema before using cloud conversation history; if the schema is missing, history operations will return a setup error.

Passwords are submitted directly to Supabase Auth over HTTPS; the app does not store password hashes or plaintext passwords. Supabase Auth manages password hashing. Access/refresh tokens are encrypted in the signed, HttpOnly Flask session cookie and are never returned to browser JavaScript. PostgreSQL queries use the user's JWT and RLS rather than a service-role credential.

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
- The app extracts up to 25,000 characters for document context to limit prompt size.
- The extracted document text is sent to the AI provider when you ask a question. Do not upload confidential documents.

## Automatic web search
Nova searches automatically when a question asks for current information, news, prices, job openings, company details, public profiles, current technical documentation or troubleshooting, explicit online research, or fact verification. Greetings, creative requests, translations, summaries of provided text, basic coding concepts, and math do not trigger web search unless you request external research.

Search results are evaluated as excerpts and shown below the answer as clickable source links. Nova is instructed to prefer official sources, compare independent sources for important claims, cite supported facts, and state when the available results do not verify an answer. Search uses DuckDuckGo's HTML results; search availability and result quality depend on that service.

## Troubleshooting
- `npm run dev` fails with `ENOENT` for `package.json`: this is a Python/Flask project, not a Node.js project. From the `ai_assistant_mini_project` folder, start it with `python app.py`, then open http://127.0.0.1:5000.
- `ModuleNotFoundError`: confirm `.venv` is active and run `pip install -r requirements.txt`.
- `GROQ_API_KEY is missing`: check that `.env` is in the project folder or the parent folder, and restart `python app.py`.
- Image generation or reference-photo generation fails: check `GEMINI_API_KEY`, confirm `GEMINI_IMAGE_MODEL` is available to your account (default `gemini-3.1-flash-lite-image`), use a JPEG, PNG, or WebP reference smaller than 7 MB, and review the error shown in the chat.
- `401` / authentication error: create a valid key in Groq Console and paste it without quotes or extra spaces.
- Gemini photo analysis fails: check `GEMINI_API_KEY`, confirm the configured `GEMINI_MODEL` is available, and try a smaller photo.
- Web or image search fails: check the internet connection and retry; search providers may temporarily rate-limit or change their response format.
- Model error: check which models are currently available for your Groq account, then update `GROQ_MODEL` in `.env`.
- Microphone does not work: try Chrome/Edge, use `http://127.0.0.1:5000`, and allow microphone access.
- Camera does not work: use Chrome/Edge on `http://127.0.0.1:5000` or HTTPS, allow camera access in the browser, and check that another app is not using the camera.
- Port 5000 is busy: stop the other Flask app or change the port in `app.py`.

## Important
This is a learning/demo project and is not a production-ready public service. Optional Supabase authentication and per-user row-level security are available when configured, but the app does not include rate limiting or comprehensive abuse monitoring. Before a public launch, add those protections and review hosting, privacy, retention, and incident-response requirements. Do not expose `.env` or API keys.
