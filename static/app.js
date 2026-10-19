const chatArea = document.getElementById("chatArea");
const welcome = document.getElementById("welcome");
const messages = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const referenceImageInput = document.getElementById("referenceImageInput");
const fileStatus = document.getElementById("fileStatus");
const referencePreview = document.getElementById("referencePreview");
const referencePreviewImage = document.getElementById("referencePreviewImage");
const referenceImageName = document.getElementById("referenceImageName");
const imageModeBtn = document.getElementById("imageModeBtn");
const referenceBtn = document.getElementById("referenceBtn");
const composerHint = document.getElementById("composerHint");
const voiceBtn = document.getElementById("voiceBtn");
const cameraBtn = document.getElementById("cameraBtn");
const cameraDialog = document.getElementById("cameraDialog");
const cameraPreview = document.getElementById("cameraPreview");
const capturePhotoBtn = document.getElementById("capturePhotoBtn");
const historyList = document.getElementById("chatHistory");
const appShell = document.querySelector(".app-shell");
const mobileHistoryBtn = document.getElementById("mobileHistoryBtn");
const closeHistoryBtn = document.getElementById("closeHistoryBtn");
const historyBackdrop = document.getElementById("historyBackdrop");
const STORAGE_KEY = "nova-ai-chats-v1";
const IMAGE_DATABASE = "nova-ai-generated-images-v1";
const MAX_SAVED_CHATS = 30;
let chats = loadChats();
let activeChatId = null;
let busy = false;
let imageMode = false;
let referenceImageDataUrl = null;
const imageObjectUrls = new Set();

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(chat =>
      chat && typeof chat.id === "string" && typeof chat.title === "string" &&
      Array.isArray(chat.messages) && chat.messages.every(message =>
        message && ["user", "assistant"].includes(message.role) && typeof message.content === "string" &&
        (!("imageId" in message) || typeof message.imageId === "string") &&
        (!("referenceImageId" in message) || typeof message.referenceImageId === "string") &&
        (!("referenceImageDataUrl" in message) || typeof message.referenceImageDataUrl === "string") &&
        (!("sources" in message) || Array.isArray(message.sources)) &&
        (!("images" in message) || Array.isArray(message.images))
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
    const savedChats = chats.map(chat => ({
      ...chat,
      messages: chat.messages.map(({imageDataUrl, referenceImageDataUrl, ...message}) => message)
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedChats));
  } catch (error) {
    console.warn("Could not save Nova chats.", error);
    showFileStatus("Chat history could not be saved in this browser.", true);
  }
  renderHistory();
}

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support saving generated images."));
      return;
    }
    const request = indexedDB.open(IMAGE_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the generated-image store."));
  });
}

async function storeGeneratedImage(dataUrl) {
  const image = await (await fetch(dataUrl)).blob();
  const database = await openImageDatabase();
  const imageId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("images", "readwrite");
      transaction.objectStore("images").put(image, imageId);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the generated image."));
      transaction.onabort = () => reject(transaction.error || new Error("Could not save the generated image."));
    });
    return imageId;
  } finally {
    database.close();
  }
}

async function loadStoredImage(imageId, imageElement) {
  try {
    const database = await openImageDatabase();
    let image;
    try {
      image = await new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readonly");
        const request = transaction.objectStore("images").get(imageId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not load a saved image."));
      });
    } finally {
      database.close();
    }
    if (!image) {
      if (imageElement.isConnected) {
        showFileStatus("An image saved with this chat is no longer available in this browser.", true);
      }
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    if (!imageElement.isConnected) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    imageObjectUrls.add(objectUrl);
    imageElement.src = objectUrl;
  } catch (error) {
    if (imageElement.isConnected) {
      showFileStatus(error.message || "Could not load a saved generated image.", true);
    }
  }
}

function releaseImageObjectUrls() {
  for (const objectUrl of imageObjectUrls) URL.revokeObjectURL(objectUrl);
  imageObjectUrls.clear();
}

function showFileStatus(text, isError = false) {
  fileStatus.hidden = !text;
  fileStatus.textContent = text || "";
  fileStatus.classList.toggle("is-error", isError);
}

function setImageMode(enabled) {
  imageMode = enabled;
  imageModeBtn.setAttribute("aria-pressed", String(enabled));
  imageModeBtn.classList.toggle("active", enabled);
  referenceBtn.hidden = !enabled;
  input.placeholder = enabled ? "Describe the image you want to create..." : "Message Nova...";
  composerHint.textContent = enabled
    ? "Describe your image, or add a reference photo to guide its subject, style, or composition."
    : "Nova can answer questions, write code, explain concepts, search current sources, and help with images.";
}

function clearReferenceImage() {
  referenceImageDataUrl = null;
  referenceImageInput.value = "";
  referencePreviewImage.removeAttribute("src");
  referenceImageName.textContent = "";
  referencePreview.hidden = true;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the selected image."));
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
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
      setMobileHistoryOpen(false);
    });
    historyList.appendChild(button);
  }
}

function escapeHTML(text) {
  return text.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderInlineMarkdown(text) {
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  return text.split(tokenPattern).map(token => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return `<code>${escapeHTML(token.slice(1, -1))}</code>`;
    }
    if ((token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))) {
      return `<strong>${escapeHTML(token.slice(2, -2))}</strong>`;
    }
    if ((token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))) {
      return `<em>${escapeHTML(token.slice(1, -1))}</em>`;
    }
    return escapeHTML(token);
  }).join("");
}

function stripWrappingQuotes(text) {
  const trimmed = text.trim();
  const quotePairs = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
  for (const [opening, closing] of quotePairs) {
    if (trimmed.startsWith(opening) && trimmed.endsWith(closing) && trimmed.length > 2) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return text;
}

function parseTableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map(cell => cell.trim());
}

function isTableSeparator(cells) {
  return cells && cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdown(text) {
  const lines = stripWrappingQuotes(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let index = 0;

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const tableHeader = parseTableCells(line);
    const tableSeparator = index + 1 < lines.length ? parseTableCells(lines[index + 1]) : null;
    if (tableHeader && isTableSeparator(tableSeparator) && tableHeader.length === tableSeparator.length) {
      flushParagraph();
      const rows = [];
      index += 2;
      while (index < lines.length) {
        const cells = parseTableCells(lines[index]);
        if (!cells) break;
        rows.push(cells);
        index += 1;
      }
      const headerCells = tableHeader.map(cell => `<th scope="col">${renderInlineMarkdown(cell)}</th>`).join("");
      const bodyRows = rows.map(row => {
        const cells = tableHeader.map((_, cellIndex) =>
          `<td>${renderInlineMarkdown(row[cellIndex] || "")}</td>`
        ).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      blocks.push(`<div class="table-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`);
      continue;
    }

    if (tableHeader && isTableSeparator(tableHeader)) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      index += 1;
      const codeLines = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const languageClass = fence[1] ? ` class="language-${escapeHTML(fence[1])}"` : "";
      blocks.push(`<pre><code${languageClass}>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const listItem = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[1]);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(`<li>${renderInlineMarkdown(item[2])}</li>`);
        index += 1;
      }
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph();
  return blocks.join("");
}

function getExternalUrl(value, permittedHost) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (permittedHost && url.hostname !== permittedHost) return null;
    return url.href;
  } catch {
    return null;
  }
}

function appendSearchResults(content, sources, images) {
  if (Array.isArray(sources) && sources.length) {
    const section = document.createElement("section");
    section.className = "source-results";
    const heading = document.createElement("strong");
    heading.textContent = "Sources";
    section.appendChild(heading);
    const list = document.createElement("ol");
    sources.forEach(source => {
      const url = source && getExternalUrl(source.url);
      if (!url || typeof source.title !== "string") return;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title;
      item.appendChild(link);
      if (typeof source.snippet === "string" && source.snippet) {
        const snippet = document.createElement("p");
        snippet.textContent = source.snippet;
        item.appendChild(snippet);
      }
      list.appendChild(item);
    });
    if (list.childElementCount) {
      section.appendChild(list);
      content.appendChild(section);
    }
  }

  if (Array.isArray(images) && images.length) {
    const section = document.createElement("section");
    section.className = "image-results";
    const heading = document.createElement("strong");
    heading.textContent = "Image results · Wikimedia Commons";
    section.appendChild(heading);
    const grid = document.createElement("div");
    grid.className = "image-results-grid";
    images.forEach(result => {
      const imageUrl = result && getExternalUrl(result.thumbnail, "upload.wikimedia.org");
      const sourceUrl = result && getExternalUrl(result.url);
      if (!imageUrl || !sourceUrl) return;
      const link = document.createElement("a");
      link.href = sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "image-result";
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = typeof result.title === "string" ? result.title : "Search result";
      image.loading = "lazy";
      const caption = document.createElement("span");
      caption.textContent = typeof result.title === "string" ? result.title : "View image";
      link.append(image, caption);
      grid.appendChild(link);
    });
    if (grid.childElementCount) {
      section.appendChild(grid);
      content.appendChild(section);
    }
  }
}

function appendVoiceResponse(content, text) {
  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function" || !text.trim()) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "read-aloud-btn";
  button.textContent = "Read aloud";
  button.setAttribute("aria-label", "Read this response aloud");
  button.addEventListener("click", () => {
    window.speechSynthesis.cancel();
    const spokenText = text
      .replace(/```[\s\S]*?```/g, " code example omitted ")
      .replace(/[`*_#>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (spokenText) window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(spokenText));
  });
  content.appendChild(button);
}

function makeMessageElement(
  role, text, isError = false, imageId = null, imageDataUrl = null, sources = [], images = [],
  allowSpeech = true, referenceImageId = null, referenceImageDataUrl = null
) {
  const row = document.createElement("article");
  row.className = `message ${role}` + (isError ? " error" : "");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "Y" : "✦";
  const content = document.createElement("div");
  content.className = "message-content";
  if (role === "assistant" && !isError && !row.classList.contains("loading")) {
    content.innerHTML = text ? renderMarkdown(text) : "";
  } else {
    content.textContent = text;
  }
  if (role === "assistant" && !isError && (imageId || imageDataUrl)) {
    const image = document.createElement("img");
    image.className = "generated-image";
    image.alt = text || "Generated image";
    image.loading = "lazy";
    if (imageDataUrl) image.src = imageDataUrl;
    else loadStoredImage(imageId, image);
    content.appendChild(image);
  }
  if (role === "user" && !isError && (referenceImageId || referenceImageDataUrl)) {
    const image = document.createElement("img");
    image.className = "reference-image";
    image.alt = "Image reference attached to this prompt";
    image.loading = "lazy";
    if (referenceImageDataUrl) image.src = referenceImageDataUrl;
    else loadStoredImage(referenceImageId, image);
    content.appendChild(image);
  }
  if (role === "assistant" && !isError) appendSearchResults(content, sources, images);
  if (role === "assistant" && !isError && allowSpeech) appendVoiceResponse(content, text);
  row.append(avatar, content);
  return row;
}

function renderMessages() {
  const chat = activeChat();
  const hasMessages = Boolean(chat && chat.messages.length);
  welcome.hidden = hasMessages;
  releaseImageObjectUrls();
  messages.replaceChildren();
  if (chat) {
    for (const message of chat.messages) {
      messages.appendChild(makeMessageElement(
        message.role, message.content, message.isError, message.imageId, message.imageDataUrl,
        message.sources, message.images, true, message.referenceImageId, message.referenceImageDataUrl
      ));
    }
  }
  chatArea.scrollTop = hasMessages ? chatArea.scrollHeight : 0;
}

function setMobileHistoryOpen(open) {
  appShell.classList.toggle("history-open", open);
  historyBackdrop.hidden = !open;
  mobileHistoryBtn.setAttribute("aria-expanded", String(open));
  mobileHistoryBtn.setAttribute("aria-label", open ? "Close recent chats" : "Open recent chats");
  document.body.classList.toggle("history-drawer-open", open && window.matchMedia("(max-width: 880px)").matches);
  if (open) {
    closeHistoryBtn.focus();
  } else if (mobileHistoryBtn.offsetParent !== null) {
    mobileHistoryBtn.focus();
  }
}

window.matchMedia("(max-width: 880px)").addEventListener("change", event => {
  if (!event.matches && appShell.classList.contains("history-open")) {
    setMobileHistoryOpen(false);
  }
});

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  imageModeBtn.disabled = value;
  referenceBtn.disabled = value;
  document.getElementById("uploadBtn").disabled = value;
  sendBtn.textContent = value ? "…" : "↑";
  sendBtn.setAttribute("aria-label", value ? "Waiting for Nova" : "Send message");
}

function isImageGenerationRequest(text) {
  const asksHowTo = /\b(?:how|why|when|where|what)\b.{0,50}\b(?:generate|create|draw|make|design|illustrate|paint)\b/i.test(text);
  const asksForImage = /\b(?:generate|create|draw|make|design|illustrate|paint)\b[\s\S]{0,100}\b(?:images?|pictures?|photos?|illustrations?|artwork|drawings?|wallpapers?|logos?)\b/i.test(text);
  return asksForImage && !asksHowTo;
}

function buildImagePrompt(chatMessages) {
  const label = "Image request: ";
  const currentRequest = chatMessages[chatMessages.length - 1].content.slice(0, 12000 - label.length);
  const context = chatMessages.slice(-7, -1)
    .map(message => `${message.role}: ${message.content.slice(0, 500)}`)
    .join("\n");
  const contextLabel = context ? `Recent conversation context:\n${context}\n\n` : "";
  const availableContext = Math.max(0, 12000 - currentRequest.length - label.length);
  const keptContext = availableContext ? contextLabel.slice(-availableContext) : "";
  return `${keptContext}${label}${currentRequest}`;
}

function startNewChat() {
  if (busy) return;
  setMobileHistoryOpen(false);
  activeChatId = null;
  input.value = "";
  input.style.height = "auto";
  clearReferenceImage();
  setImageMode(false);
  showFileStatus("");
  renderMessages();
  renderHistory();
  input.focus();
}

async function sendMessage(textOverride) {
  if (busy) return;
  const message = (textOverride ?? input.value).trim();
  if (!message) return;
  const generateImage = imageMode || isImageGenerationRequest(message);
  const attachedReference = generateImage ? referenceImageDataUrl : null;

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

  const userMessage = {role: "user", content: message};
  if (attachedReference) userMessage.referenceImageDataUrl = attachedReference;
  chat.messages.push(userMessage);
  chat.updatedAt = Date.now();
  input.value = "";
  input.style.height = "auto";
  saveChats();
  renderMessages();
  if (attachedReference) {
    storeGeneratedImage(attachedReference).then(imageId => {
      userMessage.referenceImageId = imageId;
      delete userMessage.referenceImageDataUrl;
      saveChats();
    }).catch(error => {
      console.warn("Could not save the Nova reference image.", error);
      showFileStatus("The reference image was used, but this browser could not save it with the chat.", true);
    });
  }
  const loading = makeMessageElement(
    "assistant",
    generateImage ? "Creating your image…" : "Thinking…",
    false, null, null, [], [], false
  );
  loading.classList.add("loading");
  messages.appendChild(loading);
  chatArea.scrollTop = chatArea.scrollHeight;
  setBusy(true);
  const imageWaitNotice = generateImage
    ? window.setTimeout(() => {
      const loadingText = loading.querySelector(".message-content");
      if (loadingText && loading.isConnected) {
        loadingText.textContent = "Still creating your image. Detailed requests may take longer.";
      }
    }, 15000)
    : null;

  try {
    const endpoint = generateImage ? "/api/generate-image" : "/api/chat";
    const body = generateImage
      ? {
        prompt: buildImagePrompt(chat.messages),
        ...(attachedReference ? {referenceImage: attachedReference} : {})
      }
      : {
        messages: chat.messages.slice(-24).map(({role, content}) => ({role, content}))
      };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    const answer = typeof data.answer === "string" && data.answer.trim()
      ? stripWrappingQuotes(data.answer)
      : (generateImage ? "" : "I couldn't generate a response. Please try again.");
    const imageDataUrl = generateImage && typeof data.imageDataUrl === "string"
      ? data.imageDataUrl
      : null;
    const sources = !generateImage && Array.isArray(data.sources) ? data.sources : [];
    const images = !generateImage && Array.isArray(data.images) ? data.images : [];
    const searchWarnings = !generateImage && Array.isArray(data.search_warnings)
      ? data.search_warnings.filter(warning => typeof warning === "string")
      : [];
    const assistantMessage = {
      role: "assistant",
      content: answer,
      ...(imageDataUrl ? {imageDataUrl} : {}),
      ...(sources.length ? {sources} : {}),
      ...(images.length ? {images} : {})
    };
    chat.messages.push(assistantMessage);
    chat.updatedAt = Date.now();
    saveChats();
    loading.remove();
    messages.appendChild(makeMessageElement(
      "assistant", answer, false, null, imageDataUrl, sources, images
    ));
    if (searchWarnings.length) showFileStatus(searchWarnings.join(" "), true);
    if (imageDataUrl) {
      storeGeneratedImage(imageDataUrl).then(imageId => {
        assistantMessage.imageId = imageId;
        delete assistantMessage.imageDataUrl;
        saveChats();
      }).catch(error => {
        console.warn("Could not save the generated Nova image.", error);
        showFileStatus("Image generated, but this browser could not save it for later.", true);
      });
    }
  } catch (error) {
    loading.remove();
    messages.appendChild(makeMessageElement("assistant", error.message || "Could not connect to Nova.", true));
  } finally {
    if (imageWaitNotice !== null) window.clearTimeout(imageWaitNotice);
    setBusy(false);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

sendBtn.addEventListener("click", () => sendMessage());
mobileHistoryBtn.addEventListener("click", () => {
  setMobileHistoryOpen(!appShell.classList.contains("history-open"));
});
closeHistoryBtn.addEventListener("click", () => setMobileHistoryOpen(false));
historyBackdrop.addEventListener("click", () => setMobileHistoryOpen(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && appShell.classList.contains("history-open")) {
    setMobileHistoryOpen(false);
  }
});
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
  if (button.dataset.prompt) button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
document.getElementById("createImageSuggestion").addEventListener("click", () => {
  setImageMode(true);
  input.focus();
});
document.getElementById("newChatBtn").addEventListener("click", startNewChat);
document.getElementById("mobileNewChatBtn").addEventListener("click", startNewChat);
document.getElementById("uploadBtn").addEventListener("click", () => fileInput.click());
imageModeBtn.addEventListener("click", () => setImageMode(!imageMode));
referenceBtn.addEventListener("click", () => referenceImageInput.click());
document.getElementById("removeReferenceBtn").addEventListener("click", clearReferenceImage);

let cameraStream = null;
let cameraRequestId = 0;

function stopCamera() {
  cameraRequestId += 1;
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraPreview.srcObject = null;
}

cameraDialog.addEventListener("close", stopCamera);
document.getElementById("closeCameraBtn").addEventListener("click", () => cameraDialog.close());
document.getElementById("cancelCameraBtn").addEventListener("click", () => cameraDialog.close());
cameraBtn.addEventListener("click", async () => {
  if (busy) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showFileStatus("Camera access is unavailable. Open this app on localhost or HTTPS in a supported browser.", true);
    return;
  }
  try {
    cameraDialog.showModal();
    const requestId = ++cameraRequestId;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: {ideal: "environment"}},
      audio: false
    });
    if (requestId !== cameraRequestId || !cameraDialog.open) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    cameraStream = stream;
    cameraPreview.srcObject = cameraStream;
    await cameraPreview.play();
    showFileStatus("");
  } catch (error) {
    cameraDialog.close();
    stopCamera();
    showFileStatus("Camera access was not granted or the camera could not start. Check browser permissions and try again.", true);
  }
});

capturePhotoBtn.addEventListener("click", async () => {
  if (busy) return;
  if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    showFileStatus("The camera is not ready yet. Please wait and try again.", true);
    return;
  }

  const scale = Math.min(1, 1600 / Math.max(cameraPreview.videoWidth, cameraPreview.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cameraPreview.videoWidth * scale);
  canvas.height = Math.round(cameraPreview.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    showFileStatus("Could not capture a photo in this browser. Please try again.", true);
    return;
  }
  context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.85);
  const prompt = document.getElementById("photoPrompt").value.trim();
  if (!prompt) {
    showFileStatus("Enter a question for Gemini about the photo.", true);
    return;
  }
  cameraDialog.close();
  await analyzePhoto(image, prompt);
});

async function analyzePhoto(image, prompt) {
  if (busy) return;
  const userText = `📷 Photo question: ${prompt}`;
  let chat = activeChat();
  if (!chat) {
    chat = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: userText.replace(/\s+/g, " ").slice(0, 48),
      updatedAt: Date.now(),
      messages: []
    };
    chats.unshift(chat);
    activeChatId = chat.id;
  }

  chat.messages.push({role: "user", content: userText});
  chat.updatedAt = Date.now();
  saveChats();
  renderMessages();
  const loading = makeMessageElement("assistant", "Gemini is looking at your photo…");
  loading.classList.add("loading");
  messages.appendChild(loading);
  chatArea.scrollTop = chatArea.scrollHeight;
  setBusy(true);

  try {
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({image, prompt})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gemini could not analyze the photo.");
    const answer = typeof data.answer === "string" && data.answer.trim()
      ? stripWrappingQuotes(data.answer)
      : "Gemini could not generate a response. Please try again.";
    chat.messages.push({role: "assistant", content: answer});
    chat.updatedAt = Date.now();
    saveChats();
    loading.remove();
    messages.appendChild(makeMessageElement("assistant", answer));
  } catch (error) {
    loading.remove();
    messages.appendChild(makeMessageElement("assistant", error.message || "Could not analyze the photo.", true));
  } finally {
    setBusy(false);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

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

referenceImageInput.addEventListener("change", async () => {
  const file = referenceImageInput.files[0];
  if (!file) return;
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  const mimeType = file.type === "image/jpg" ? "image/jpeg" : (file.type || mimeTypes[extension]);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    showFileStatus("Choose a JPEG, PNG, or WebP reference image.", true);
    referenceImageInput.value = "";
    return;
  }
  if (!file.size) {
    showFileStatus("The selected reference image is empty.", true);
    referenceImageInput.value = "";
    return;
  }
  if (file.size > 7 * 1024 * 1024) {
    showFileStatus("Reference images must be 7 MB or smaller.", true);
    referenceImageInput.value = "";
    return;
  }
  try {
    const imageDataUrl = await readImageFile(file);
    const separator = imageDataUrl.indexOf(",");
    if (separator < 0) throw new Error("Could not read the selected image.");
    referenceImageDataUrl = `data:${mimeType};base64,${imageDataUrl.slice(separator + 1)}`;
    referencePreviewImage.src = referenceImageDataUrl;
    referenceImageName.textContent = file.name;
    referencePreview.hidden = false;
    showFileStatus("");
  } catch (error) {
    clearReferenceImage();
    showFileStatus(error.message || "Could not read the selected image.", true);
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
