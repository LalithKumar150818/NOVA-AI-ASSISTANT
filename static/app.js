const chatArea = document.getElementById("chatArea");
const welcome = document.getElementById("welcome");
const messages = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const fileStatus = document.getElementById("fileStatus");
const voiceBtn = document.getElementById("voiceBtn");
const historyList = document.getElementById("chatHistory");
const STORAGE_KEY = "nova-ai-chats-v1";
const MAX_SAVED_CHATS = 30;
let chats = loadChats();
let activeChatId = null;
let busy = false;

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(chat =>
      chat && typeof chat.id === "string" && typeof chat.title === "string" &&
      Array.isArray(chat.messages) && chat.messages.every(message =>
        message && ["user", "assistant"].includes(message.role) && typeof message.content === "string"
      )
    ).slice(0, MAX_SAVED_CHATS);
  } catch (error) {
    console.warn("Could not load saved Nova chats.", error);
    return [];
  }
}

function saveChats() {
  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  chats = chats.slice(0, MAX_SAVED_CHATS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    console.warn("Could not save Nova chats.", error);
    showFileStatus("Chat history could not be saved in this browser.", true);
  }
  renderHistory();
}

function showFileStatus(text, isError = false) {
  fileStatus.hidden = !text;
  fileStatus.textContent = text || "";
  fileStatus.classList.toggle("is-error", isError);
}

function activeChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function renderHistory() {
  historyList.replaceChildren();
  for (const chat of chats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item" + (chat.id === activeChatId ? " active" : "");
    button.textContent = chat.title;
    button.title = chat.title;
    button.addEventListener("click", () => {
      if (busy) return;
      activeChatId = chat.id;
      input.value = "";
      renderMessages();
      renderHistory();
    });
    historyList.appendChild(button);
  }
}

function makeMessageElement(role, text, isError = false) {
  const row = document.createElement("article");
  row.className = `message ${role}` + (isError ? " error" : "");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "Y" : "✦";
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;
  row.append(avatar, content);
  return row;
}

function renderMessages() {
  const chat = activeChat();
  const hasMessages = Boolean(chat && chat.messages.length);
  welcome.hidden = hasMessages;
  messages.replaceChildren();
  if (chat) {
    for (const message of chat.messages) {
      messages.appendChild(makeMessageElement(message.role, message.content, message.isError));
    }
  }
  chatArea.scrollTop = chatArea.scrollHeight;
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  sendBtn.textContent = value ? "…" : "↑";
  sendBtn.setAttribute("aria-label", value ? "Waiting for Nova" : "Send message");
}

function startNewChat() {
  if (busy) return;
  activeChatId = null;
  input.value = "";
  input.style.height = "auto";
  showFileStatus("");
  renderMessages();
  renderHistory();
  input.focus();
}

async function sendMessage(textOverride) {
  if (busy) return;
  const message = (textOverride ?? input.value).trim();
  if (!message) return;

  let chat = activeChat();
  if (!chat) {
    chat = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: message.replace(/\s+/g, " ").slice(0, 48) || "New chat",
      updatedAt: Date.now(),
      messages: []
    };
    chats.unshift(chat);
    activeChatId = chat.id;
  }

  chat.messages.push({role: "user", content: message});
  chat.updatedAt = Date.now();
  input.value = "";
  input.style.height = "auto";
  renderMessages();
  renderHistory();
  const loading = makeMessageElement("assistant", "Thinking…");
  loading.classList.add("loading");
  messages.appendChild(loading);
  chatArea.scrollTop = chatArea.scrollHeight;
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({messages: chat.messages.slice(-24).map(({role, content}) => ({role, content}))})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    const answer = typeof data.answer === "string" && data.answer.trim()
      ? data.answer.trim()
      : "I couldn't generate a response. Please try again.";
    chat.messages.push({role: "assistant", content: answer});
    chat.updatedAt = Date.now();
    saveChats();
    loading.remove();
    messages.appendChild(makeMessageElement("assistant", answer));
  } catch (error) {
    loading.remove();
    messages.appendChild(makeMessageElement("assistant", error.message || "Could not connect to Nova.", true));
  } finally {
    setBusy(false);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

sendBtn.addEventListener("click", () => sendMessage());
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
});
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
document.getElementById("newChatBtn").addEventListener("click", startNewChat);
document.getElementById("mobileNewChatBtn").addEventListener("click", startNewChat);
document.getElementById("uploadBtn").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  showFileStatus(`Uploading ${file.name}…`);
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch("/api/upload", {method: "POST", body: form});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed.");
    showFileStatus(data.message + " Ask Nova a question about it.");
  } catch (error) {
    showFileStatus(error.message || "Upload failed.", true);
  } finally {
    fileInput.value = "";
  }
});

document.getElementById("clearDocBtn").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/clear-document", {method: "POST"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not clear the document.");
    showFileStatus(data.message || "Document context cleared.");
  } catch (error) {
    showFileStatus(error.message || "Could not clear document context.", true);
  }
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  voiceBtn.title = "Voice input is not supported in this browser. Try Chrome or Edge.";
  voiceBtn.addEventListener("click", () => showFileStatus("Voice input is not supported here. Try Chrome or Edge, and allow microphone access.", true));
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  voiceBtn.addEventListener("click", () => {
    if (voiceBtn.classList.contains("recording")) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      voiceBtn.classList.add("recording");
      showFileStatus("Listening… speak now. Click the microphone again to stop.");
    } catch (error) {
      console.warn("Could not start voice input.", error);
      showFileStatus("Microphone could not start. Check browser permissions and try again.", true);
    }
  });
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    input.value = (input.value ? input.value + " " : "") + transcript;
    input.dispatchEvent(new Event("input"));
    input.focus();
    showFileStatus("Voice captured. Press send when you're ready.");
  };
  recognition.onerror = event => showFileStatus("Voice input error: " + event.error + ". Check microphone permission.", true);
  recognition.onend = () => voiceBtn.classList.remove("recording");
}

renderHistory();
renderMessages();
