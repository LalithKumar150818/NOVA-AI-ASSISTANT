const chatArea = document.getElementById("chatArea");
const welcome = document.getElementById("welcome");
const messages = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const fileStatus = document.getElementById("fileStatus");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const composerHint = document.getElementById("composerHint");
const voiceBtn = document.getElementById("voiceBtn");
const cameraBtn = document.getElementById("cameraBtn");
const cameraDialog = document.getElementById("cameraDialog");
const cameraPreview = document.getElementById("cameraPreview");
const capturePhotoBtn = document.getElementById("capturePhotoBtn");
const historyList = document.getElementById("chatHistory");
const confirmDialog = document.getElementById("confirmDialog");
const confirmDialogMessage = document.getElementById("confirmDialogMessage");
const confirmDialogAction = document.getElementById("confirmDialogAction");
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
let editingMessageIndex = null;
let editingChatId = null;
let confirmationResolver = null;
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

async function loadStoredImage(imageId, imageElement, downloadLink = null) {
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
    if (downloadLink) {
      downloadLink.href = objectUrl;
      const extension = image.type === "image/jpeg" ? "jpg" : image.type === "image/webp" ? "webp" : "png";
      downloadLink.download = `nova-generated-image.${extension}`;
    }
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

function activeChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function renderHistory() {
  historyList.replaceChildren();
  if (!chats.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "history-empty";
    emptyState.textContent = "Your conversations will appear here.";
    historyList.appendChild(emptyState);
    return;
  }
  for (const chat of chats) {
    const row = document.createElement("div");
    row.className = "history-row";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "history-item" + (chat.id === activeChatId ? " active" : "");
    openButton.textContent = chat.title;
    openButton.title = chat.title;
    openButton.addEventListener("click", () => {
      if (busy) return;
      cancelMessageEdit();
      activeChatId = chat.id;
      input.value = "";
      renderMessages();
      renderHistory();
      setMobileHistoryOpen(false);
    });
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "history-action";
    renameButton.textContent = "Rename";
    renameButton.setAttribute("aria-label", `Rename chat: ${chat.title}`);
    renameButton.addEventListener("click", event => {
      event.stopPropagation();
      if (busy) return;
      const form = document.createElement("form");
      form.className = "history-rename-form";
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = chat.title;
      titleInput.maxLength = 80;
      titleInput.required = true;
      titleInput.setAttribute("aria-label", "Conversation name");
      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.textContent = "Save";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => renderHistory());
      form.append(titleInput, saveButton, cancelButton);
      openButton.hidden = true;
      actions.hidden = true;
      row.appendChild(form);
      form.addEventListener("submit", submitEvent => {
        submitEvent.preventDefault();
        const nextTitle = titleInput.value.trim();
        if (!nextTitle) {
          titleInput.setCustomValidity("Enter a conversation name.");
          titleInput.reportValidity();
          return;
        }
        chat.title = nextTitle;
        chat.updatedAt = Date.now();
        saveChats();
      });
      titleInput.focus();
      titleInput.select();
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-action";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete chat: ${chat.title}`);
    deleteButton.addEventListener("click", event => {
      event.stopPropagation();
      if (busy) return;
      requestConfirmation(`Delete "${chat.title}" and its messages?`, "Delete").then(confirmed => {
        if (!confirmed) return;
        chats = chats.filter(item => item.id !== chat.id);
        if (activeChatId === chat.id) {
          activeChatId = null;
          cancelMessageEdit();
          renderMessages();
        }
        saveChats();
      });
    });
    actions.append(renameButton, deleteButton);
    row.append(openButton, actions);
    historyList.appendChild(row);
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

function highlightCode(code, language) {
  const supportedLanguages = new Set([
    "bash", "c", "cpp", "css", "go", "html", "java", "javascript", "js",
    "json", "python", "py", "rust", "sql", "typescript", "ts", "xml", "yaml", "yml"
  ]);
  if (!supportedLanguages.has((language || "").toLowerCase())) return escapeHTML(code);
  const tokens = /\b(?:async|await|break|case|class|const|continue|def|else|elif|export|extends|false|for|from|function|if|import|in|interface|let|new|null|public|return|static|true|try|var|while|with|yield|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AND|OR|NOT)\b|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:print|console|len|range|str|int|float|list|dict|set|tuple|bool|super|self)\b|\b\d+(?:\.\d+)?\b/g;
  let result = "";
  let lastIndex = 0;
  for (const match of code.matchAll(tokens)) {
    result += escapeHTML(code.slice(lastIndex, match.index));
    const token = match[0];
    let kind = "keyword";
    if (/^(?:\/\*|\/\/|#)/.test(token)) kind = "comment";
    else if (/^(?:"|'|`)/.test(token)) kind = "string";
    else if (/^(?:print|console|len|range|str|int|float|list|dict|set|tuple|bool|super|self)$/.test(token)) kind = "builtin";
    else if (/^\d/.test(token)) kind = "number";
    result += `<span class="code-${kind}">${escapeHTML(token)}</span>`;
    lastIndex = match.index + token.length;
  }
  return result + escapeHTML(code.slice(lastIndex));
}

function addCodeBlockControls(content) {
  content.querySelectorAll("pre").forEach(pre => {
    const code = pre.querySelector("code");
    if (!code) return;
    const language = [...code.classList]
      .find(className => className.startsWith("language-"))
      ?.slice("language-".length) || "";
    code.innerHTML = highlightCode(code.textContent || "", language);
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-code-btn";
    copyButton.textContent = "Copy";
    copyButton.setAttribute("aria-label", "Copy code block");
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent || "");
        copyButton.textContent = "Copied";
        window.setTimeout(() => { copyButton.textContent = "Copy"; }, 1500);
      } catch (error) {
        console.warn("Could not copy the Nova code block.", error);
        showFileStatus("Could not copy code. Check clipboard permission and try again.", true);
      }
    });
    pre.appendChild(copyButton);
  });
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

function createMessageAction(label, iconPath, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action";
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPath);
  icon.appendChild(path);
  button.appendChild(icon);
  button.addEventListener("click", onClick);
  return button;
}

function appendMessageActions(body, role, text, messageIndex) {
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copyButton = createMessageAction(
    "Copy message",
    "M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M6 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z",
    async event => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(text);
        button.setAttribute("aria-label", "Message copied");
        button.title = "Copied";
        window.setTimeout(() => {
          button.setAttribute("aria-label", "Copy message");
          button.title = "Copy message";
        }, 1500);
      } catch (error) {
        console.warn("Could not copy the Nova message.", error);
        showFileStatus("Could not copy message. Check clipboard permission and try again.", true);
      }
    }
  );
  actions.appendChild(copyButton);
  if (role === "user") {
    actions.appendChild(createMessageAction(
      "Edit message",
      "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z",
      () => beginEditMessage(messageIndex)
    ));
  }
  body.appendChild(actions);
}

function makeMessageElement(
  role, text, isError = false, imageId = null, imageDataUrl = null, sources = [], images = [],
  allowActions = true, referenceImageId = null, referenceImageDataUrl = null, messageIndex = null
) {
  const row = document.createElement("article");
  row.className = `message ${role}` + (isError ? " error" : "");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "Y" : "✦";
  const content = document.createElement("div");
  content.className = "message-content";
  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "assistant" && !isError && !row.classList.contains("loading")) {
    content.innerHTML = text ? renderMarkdown(text) : "";
    addCodeBlockControls(content);
  } else {
    content.textContent = text;
  }
  if (role === "assistant" && !isError && (imageId || imageDataUrl)) {
    const image = document.createElement("img");
    image.className = "generated-image";
    image.alt = text || "Generated image";
    image.loading = "lazy";
    content.appendChild(image);
    const downloadLink = document.createElement("a");
    downloadLink.className = "download-image-link";
    downloadLink.textContent = "Download image";
    const mimeExtension = imageDataUrl?.match(/^data:image\/(jpeg|png|webp);/)?.[1];
    downloadLink.download = `nova-generated-image.${mimeExtension === "jpeg" ? "jpg" : mimeExtension || "png"}`;
    if (imageDataUrl) {
      image.src = imageDataUrl;
      downloadLink.href = imageDataUrl;
    } else {
      loadStoredImage(imageId, image, downloadLink);
    }
    image.addEventListener("load", () => { downloadLink.href = image.currentSrc || image.src; });
    content.appendChild(downloadLink);
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
  body.appendChild(content);
  if (!isError && (
    (role === "assistant" && allowActions) ||
    (role === "user" && messageIndex !== null)
  )) {
    appendMessageActions(body, role, text, messageIndex);
  }
  row.append(avatar, body);
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
        message.sources, message.images, true, message.referenceImageId, message.referenceImageDataUrl,
        message.role === "user" ? chat.messages.indexOf(message) : null
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

function requestConfirmation(message, actionLabel) {
  if (confirmDialog.open) return Promise.resolve(false);
  confirmDialogMessage.textContent = message;
  confirmDialogAction.textContent = actionLabel;
  confirmationResolver = null;
  const result = new Promise(resolve => { confirmationResolver = resolve; });
  confirmDialog.showModal();
  return result;
}

confirmDialog.addEventListener("close", () => {
  if (!confirmationResolver) return;
  const resolve = confirmationResolver;
  confirmationResolver = null;
  resolve(confirmDialog.returnValue === "confirm");
});

window.matchMedia("(max-width: 880px)").addEventListener("change", event => {
  if (!event.matches && appShell.classList.contains("history-open")) {
    setMobileHistoryOpen(false);
  }
});

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
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
  const context = chatMessages.slice(-3, -1)
    .map(message => `${message.role}: ${message.content.slice(0, 240)}`)
    .join("\n");
  const contextLabel = context ? `Recent conversation context:\n${context}\n\n` : "";
  const availableContext = Math.max(0, 12000 - currentRequest.length - label.length);
  const keptContext = availableContext
    ? contextLabel.slice(-Math.min(availableContext, 600))
    : "";
  return `${keptContext}${label}${currentRequest}`;
}

function startNewChat() {
  if (busy) return;
  setMobileHistoryOpen(false);
  cancelMessageEdit();
  activeChatId = null;
  input.value = "";
  input.style.height = "auto";
  showFileStatus("");
  renderMessages();
  renderHistory();
  input.focus();
}

function beginEditMessage(messageIndex) {
  if (busy) return;
  const chat = activeChat();
  const message = chat && chat.messages[messageIndex];
  if (!message || message.role !== "user") return;
  editingMessageIndex = messageIndex;
  editingChatId = chat.id;
  input.value = message.content;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, getComposerMaxHeight()) + "px";
  input.placeholder = "Edit your message...";
  sendBtn.textContent = "↻";
  sendBtn.setAttribute("aria-label", "Update message");
  sendBtn.title = "Update message";
  cancelEditBtn.hidden = false;
  showFileStatus("Editing this message will replace the responses that followed it.");
  input.focus();
}

function cancelMessageEdit() {
  editingMessageIndex = null;
  editingChatId = null;
  cancelEditBtn.hidden = true;
  input.placeholder = "Message Nova...";
  sendBtn.textContent = busy ? "…" : "↑";
  sendBtn.setAttribute("aria-label", busy ? "Waiting for Nova" : "Send message");
  sendBtn.title = busy ? "Waiting for Nova" : "Send message";
}

function getComposerMaxHeight() {
  const configuredHeight = Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--composer-max-height"),
    10
  );
  return Number.isFinite(configuredHeight) ? configuredHeight : 180;
}

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`Nova's server returned an unexpected response${status}. Please try again.`);
  }
}

async function readChatResponse(response, loading) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return readJsonResponse(response);
  }
  if (!response.body) throw new Error("The AI response stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let result = {};

  function processEvent(line) {
    if (!line.startsWith("data: ")) return;
    const event = JSON.parse(line.slice(6));
    if (event.type === "delta" && typeof event.content === "string") {
      answer += event.content;
      const content = loading.querySelector(".message-content");
      if (content) {
        loading.classList.remove("loading");
        content.innerHTML = renderMarkdown(answer);
        chatArea.scrollTop = chatArea.scrollHeight;
      }
    } else if (event.type === "done") {
      result = event;
    } else if (event.type === "error") {
      throw new Error(event.error || "The AI provider could not complete this request.");
    }
  }

  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) processEvent(line);
      if (done) break;
    }
    if (buffer) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }
  return {...result, answer};
}

async function sendMessage(textOverride) {
  if (busy) return;
  const message = (textOverride ?? input.value).trim();
  if (!message) return;
  const generateImage = isImageGenerationRequest(message);

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

  let userMessage;
  if (editingChatId === chat.id && editingMessageIndex !== null) {
    const editedMessage = chat.messages[editingMessageIndex];
    chat.messages = chat.messages.slice(0, editingMessageIndex);
    userMessage = {...editedMessage, role: "user", content: message};
    if (editingMessageIndex === 0) {
      chat.title = message.replace(/\s+/g, " ").slice(0, 48) || "New chat";
    }
    editingMessageIndex = null;
    editingChatId = null;
    cancelEditBtn.hidden = true;
  } else {
    userMessage = {role: "user", content: message};
  }
  chat.messages.push(userMessage);
  chat.updatedAt = Date.now();
  input.value = "";
  input.style.height = "auto";
  input.placeholder = "Message Nova...";
  sendBtn.textContent = "↑";
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.title = "Send message";
  showFileStatus("");
  saveChats();
  renderMessages();
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
        prompt: buildImagePrompt(chat.messages)
      }
      : {
        messages: chat.messages.slice(-24).map(({role, content}) => ({role, content})),
        stream: true
      };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body)
    });
    const data = await readChatResponse(response, loading);
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
  input.style.height = Math.min(input.scrollHeight, getComposerMaxHeight()) + "px";
});
document.querySelectorAll(".suggestion").forEach(button => {
  if (button.dataset.prompt) button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
document.getElementById("newChatBtn").addEventListener("click", startNewChat);
document.getElementById("mobileNewChatBtn").addEventListener("click", startNewChat);
document.getElementById("uploadBtn").addEventListener("click", () => fileInput.click());
cancelEditBtn.addEventListener("click", () => {
  cancelMessageEdit();
  input.value = "";
  input.style.height = "auto";
  showFileStatus("");
  input.focus();
});

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
    const data = await readJsonResponse(response);
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
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Upload failed.");
    showFileStatus(data.message + (data.image
      ? " Nova can analyze it or use it as visual guidance for an image request."
      : " Ask Nova a question about it."));
  } catch (error) {
    showFileStatus(error.message || "Upload failed.", true);
  } finally {
    fileInput.value = "";
  }
});

document.getElementById("clearDocBtn").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/clear-document", {method: "POST"});
    const data = await readJsonResponse(response);
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
