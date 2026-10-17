# Nova AI Assistant — Mini Project

A local AI assistant web app with a ChatGPT-inspired interface, text chat, camera photo analysis, browser voice-to-text, and document upload for TXT, PDF, and DOCX files.

## Features
- Responsive chat interface with multi-turn conversations and recent chats saved in the current browser
- ChatGPT-inspired composer, starter prompts, and mobile-friendly layout
- Clearly formatted AI answers with headings, lists, paragraphs, code blocks, and relevant takeaways or next steps
- AI answers through the Groq API
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

8. Open `.env` and add your Groq key as `GROQ_API_KEY` and your Gemini key as `GEMINI_API_KEY`. Do not share or commit these keys. Text chat uses the default Groq model `openai/gpt-oss-120b`; image analysis uses `gemini-2.5-flash`. Update `GROQ_MODEL` or `GEMINI_MODEL` if those models are unavailable for your accounts.

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
4. Click the microphone and allow access; speak a short question.
5. Click the camera button, allow camera access, take a photo, and ask Gemini a question about it.
6. Upload a TXT, text-based PDF, or DOCX file.
7. Ask: `Summarize the uploaded document in five bullet points.`
8. Click `Clear document` to remove document context from the session.

Chat history is saved locally in the browser and is not shared across browsers or devices. Photo data is sent to Gemini for analysis; the app does not store the photo. Text chat and uploaded document context continue to use Groq. Nova's interface and conversation flow are inspired by common AI chat apps, but it does not use ChatGPT or Claude models.

## Voice language
In `static/app.js`, change:

```javascript
recognition.lang = "en-IN";
```

to `te-IN` for Telugu voice input, if your browser supports it.

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
- `401` / authentication error: create a valid key in Groq Console and paste it without quotes or extra spaces.
- Gemini photo analysis fails: check `GEMINI_API_KEY`, confirm the configured `GEMINI_MODEL` is available, and try a smaller photo.
- Model error: check which models are currently available for your Groq account, then update `GROQ_MODEL` in `.env`.
- Microphone does not work: try Chrome/Edge, use `http://127.0.0.1:5000`, and allow microphone access.
- Camera does not work: use Chrome/Edge on `http://127.0.0.1:5000` or HTTPS, allow camera access in the browser, and check that another app is not using the camera.
- Port 5000 is busy: stop the other Flask app or change the port in `app.py`.

## Important
This is a learning/demo project, not a production-ready public service. Before deploying publicly, add authentication, rate limiting, stronger session management, secure hosting, and privacy controls. Do not expose `.env` or your API key.
