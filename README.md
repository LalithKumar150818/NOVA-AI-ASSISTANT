# Nova AI Assistant — Mini Project

A Flask-based AI assistant with text chat, Gemini image generation and photo analysis, browser voice-to-text, and document upload for TXT, PDF, and DOCX files.

## Features
- Responsive desktop and mobile chat interface with multi-turn conversations and recent chats saved in the current browser
- Mobile-accessible recent-chat drawer; generated image files are stored in browser IndexedDB and chat metadata in local storage
- ChatGPT-inspired composer, starter prompts, and mobile-friendly layout
- Clearly formatted AI answers that follow the language explicitly requested for each turn, or otherwise the language of the user's latest message
- AI answers through the Groq API
- Create images from ordinary prompts through Gemini image generation and display them in the conversation
- Display generated images as soon as Gemini responds, while saving them to browser storage in the background
- Capture a photo in the browser and ask Gemini to describe or analyze it
- Voice-to-text in supported browsers (Chrome/Edge recommended)
- Upload TXT, text-based PDF, and DOCX; then ask questions about the extracted text
- Clear uploaded document context
- API key loaded from `.env`, never exposed in frontend JavaScript or hard-coded in the app

## Technology
- Python + Flask: backend and API routes
- HTML/CSS/JavaScript: frontend
- Groq Python SDK: text chat API
- Google Gemini API: photo analysis
- Google Gemini image model: image generation
- pypdf and python-docx: text extraction
- Browser Web Speech API: microphone input

## Requirements
- Python 3.10+
- VS Code
- Internet connection for Groq API calls
- A Groq API key for text chat: https://console.groq.com/keys
- A Gemini API key for photo analysis: https://aistudio.google.com/apikey

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
4. Ask: `Generate an example image of a friendly robot reading under a tree.` The image should appear in the chat.
5. On a phone-sized browser window, tap `Chats` and reopen a recent conversation.
6. Click the microphone and allow access; speak a short question.
7. Click the camera button, allow camera access, take a photo, and ask Gemini a question about it.
8. Upload a TXT, text-based PDF, or DOCX file.
9. Ask: `Summarize the uploaded document in five bullet points.`
10. Click `Clear document` to remove document context from the session.

Chat history is saved locally in the browser and is not shared across browsers or devices. This lets a user reopen chats on the same phone/browser; sharing history between a phone and a computer requires user accounts and a server-side database, neither of which this demo currently has. Generated image files are stored separately in browser IndexedDB to avoid filling the smaller local-storage quota, without delaying the first display of the image. Image-generation time itself depends on Gemini's model, service load, and network; the app cannot guarantee a shorter provider generation time. Photo data is sent to Gemini for analysis; the app does not store the captured photo. Text chat and uploaded document context continue to use Groq. Nova's response quality depends on the configured Groq model and provider limits; this project does not run or include ChatGPT, Claude, or Gemini chat models.

## Deploying

Deploy the `ai_assistant_mini_project` folder as a Python web service on a host that supports Flask and Gunicorn (for example, Render):

1. Set the project root to `ai_assistant_mini_project`.
2. Use `pip install -r requirements.txt` as the build command.
3. Use `gunicorn app:app` as the start command.
4. Configure `GROQ_API_KEY`, `GEMINI_API_KEY`, and a unique `FLASK_SECRET_KEY` as private environment variables. Set `GROQ_MODEL`, `GEMINI_MODEL`, or `GEMINI_IMAGE_MODEL` only if you need to use a different model. Do not put secrets in source code or commit `.env`.
5. Enable HTTPS on the host. Browser camera and microphone access require localhost or a secure (HTTPS) origin.

Generate a secret locally with `python -c "import secrets; print(secrets.token_hex(32))"` and add the result as `FLASK_SECRET_KEY` in the host settings. Never use the example secret in a public deployment. The included Gunicorn command runs without Flask's development server or debugger. This demo stores conversations in each visitor's browser, not on the server; hosting it does not synchronize chat history across devices.

## Voice input language
In `static/app.js`, change:

```javascript
recognition.lang = "en-IN";
```

to `te-IN` for Telugu voice input, if your browser supports it. This setting affects speech recognition only. For chat, ask for a response in any language (for example, "Reply in Telugu") or simply write your question in that language. Nova is instructed to follow the language requested for the current turn, and otherwise respond in the language of your latest message; support for a specific language depends on the configured AI provider/model.

Voice input is browser-dependent. The app uses speech recognition to convert speech into text; it does not include a separate spoken audio reply (text-to-speech) yet.

## File upload notes
- Maximum request size: 10 MB
- Supported: `.txt`, `.pdf`, `.docx`
- Image-only/scanned PDFs are not OCR-processed in this starter project.
- The app extracts up to 15,000 characters for document context to limit prompt size.
- The extracted document text is sent to the AI provider when you ask a question. Do not upload confidential documents.

## Troubleshooting
- `npm run dev` fails with `ENOENT` for `package.json`: this is a Python/Flask project, not a Node.js project. From the `ai_assistant_mini_project` folder, start it with `python app.py`, then open http://127.0.0.1:5000.
- `ModuleNotFoundError`: confirm `.venv` is active and run `pip install -r requirements.txt`.
- `GROQ_API_KEY is missing`: check that `.env` is in the project folder or the parent folder, and restart `python app.py`.
- Image generation fails: check `GEMINI_API_KEY`, confirm `GEMINI_IMAGE_MODEL` is available to your account (default `gemini-2.5-flash-image`), and review the error shown in the chat.
- `401` / authentication error: create a valid key in Groq Console and paste it without quotes or extra spaces.
- Gemini photo analysis fails: check `GEMINI_API_KEY`, confirm the configured `GEMINI_MODEL` is available, and try a smaller photo.
- Model error: check which models are currently available for your Groq account, then update `GROQ_MODEL` in `.env`.
- Microphone does not work: try Chrome/Edge, use `http://127.0.0.1:5000`, and allow microphone access.
- Camera does not work: use Chrome/Edge on `http://127.0.0.1:5000` or HTTPS, allow camera access in the browser, and check that another app is not using the camera.
- Port 5000 is busy: stop the other Flask app or change the port in `app.py`.

## Important
This is a learning/demo project, not a production-ready public service. Before deploying publicly, add authentication, rate limiting, stronger session management, secure hosting, and privacy controls. Do not expose `.env` or your API key.
