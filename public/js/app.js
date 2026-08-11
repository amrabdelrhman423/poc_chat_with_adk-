/**
 * Gemini & Ollama Qwen Studio - Main Application Script with File Tool Capabilities
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // State Initialization
  // =========================================================================
  
  const DEFAULT_SETTINGS = {
    apiKey: '',
    defaultModel: 'qwen3',
    systemInstruction: 'You are a helpful, expert AI assistant with file writing capabilities. Provide clear, accurate, and structured answers.',
    temperature: 0.7,
    topP: 0.95
  };

  const PRESETS = {
    general: {
      name: 'General Assistant',
      system: 'You are a helpful, friendly, and comprehensive AI assistant.'
    },
    coding: {
      name: 'Code Expert',
      system: 'You are an expert senior software engineer. Provide clean, efficient, modern code with clear explanations and save files to disk when asked.'
    },
    reasoning: {
      name: 'Deep Reasoner',
      system: 'You are an analytical researcher. Break down complex problems step-by-step with logical rigor, math verification, and detailed depth.'
    },
    creative: {
      name: 'Creative Writer',
      system: 'You are an imaginative creative writer and designer. Provide vibrant, engaging, and original responses.'
    }
  };

  let state = {
    settings: loadSettings(),
    geminiModels: [],
    ollamaModels: [],
    allModels: [],
    chats: loadChats(),
    activeChatId: null,
    pendingImages: [],
    isStreaming: false,
    activePreset: 'general',
    workspaceFiles: []
  };

  // DOM Elements
  const DOM = {
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    historyList: document.getElementById('history-list'),
    searchHistoryInput: document.getElementById('search-history-input'),
    clearAllChatsBtn: document.getElementById('clear-all-chats-btn'),
    
    workspaceFilesList: document.getElementById('workspace-files-list'),
    refreshFilesBtn: document.getElementById('refresh-files-btn'),
    
    activeChatTitle: document.getElementById('active-chat-title'),
    modelSelectBtn: document.getElementById('model-select-btn'),
    activeModelName: document.getElementById('active-model-name'),
    modelDropdownMenu: document.getElementById('model-dropdown-menu'),
    exportChatBtn: document.getElementById('export-chat-btn'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    
    chatMessages: document.getElementById('chat-messages'),
    welcomeScreen: document.getElementById('welcome-screen'),
    scrollBottomBtn: document.getElementById('scroll-bottom-btn'),
    
    attachmentPreviewBar: document.getElementById('attachment-preview-bar'),
    previewContainer: document.getElementById('preview-container'),
    chatForm: document.getElementById('chat-form'),
    fileInput: document.getElementById('file-input'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    
    fileModal: document.getElementById('file-modal'),
    closeFileModalBtn: document.getElementById('close-file-modal-btn'),
    modalFileTitle: document.getElementById('modal-file-title'),
    modalFileContent: document.getElementById('modal-file-content'),
    downloadFileLink: document.getElementById('download-file-link'),
    
    settingsModal: document.getElementById('settings-modal'),
    openSettingsBtn: document.getElementById('open-settings-btn'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    toggleKeyVisibilityBtn: document.getElementById('toggle-key-visibility'),
    defaultModelSelect: document.getElementById('default-model-select'),
    systemPromptInput: document.getElementById('system-prompt-input'),
    temperatureRange: document.getElementById('temperature-range'),
    tempValueDisplay: document.getElementById('temp-value-display'),
    toppRange: document.getElementById('topp-range'),
    toppValueDisplay: document.getElementById('topp-value-display'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    resetSettingsBtn: document.getElementById('reset-settings-btn'),
    toastContainer: document.getElementById('toast-container')
  };

  // Setup Marked Markdown Renderer with Highlight.js
  marked.setOptions({
    highlight: function(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-'
  });

  // Custom Code Block Renderer with Copy Button
  const renderer = new marked.Renderer();
  renderer.code = function(code, language) {
    const langStr = language || 'code';
    const validLang = hljs.getLanguage(langStr) ? langStr : 'plaintext';
    const highlightedCode = hljs.highlight(code, { language: validLang }).value;
    const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
    
    return `
      <div class="code-snippet-container">
        <div class="code-header">
          <span><i class="fa-solid fa-code"></i> ${langStr}</span>
          <button class="copy-code-btn" data-code-id="${codeId}">
            <i class="fa-regular fa-copy"></i> Copy code
          </button>
        </div>
        <pre><code id="${codeId}" class="hljs language-${validLang}">${highlightedCode}</code></pre>
      </div>
    `;
  };
  marked.use({ renderer });

  // =========================================================================
  // Initialize Application
  // =========================================================================

  async function init() {
    setupEventListeners();
    await fetchModels();
    await fetchWorkspaceFiles();
    
    if (state.chats.length === 0) {
      createNewChat();
    } else {
      setActiveChat(state.chats[0].id);
    }
    
    checkHealthStatus();
  }

  async function fetchModels() {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.success) {
        state.geminiModels = data.geminiModels || [];
        state.ollamaModels = data.ollamaModels || [];
        state.allModels = data.models || [...state.ollamaModels, ...state.geminiModels];
        renderModelDropdown();
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }

  async function fetchWorkspaceFiles() {
    try {
      const res = await fetch('/api/workspace/files');
      const data = await res.json();
      if (data.success) {
        state.workspaceFiles = data.files || [];
        renderWorkspaceFiles();
      }
    } catch (err) {
      console.error('Failed to fetch workspace files:', err);
    }
  }

  function renderWorkspaceFiles() {
    if (!DOM.workspaceFilesList) return;
    DOM.workspaceFilesList.innerHTML = '';

    if (state.workspaceFiles.length === 0) {
      DOM.workspaceFilesList.innerHTML = `<div class="empty-workspace-msg">No files in workspace yet</div>`;
      return;
    }

    state.workspaceFiles.forEach(file => {
      const item = document.createElement('div');
      item.className = 'workspace-file-item';
      const icon = getFileIcon(file.name);
      item.innerHTML = `
        <i class="${icon}"></i>
        <span class="file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
        <span class="file-size">${formatBytes(file.size)}</span>
      `;
      item.addEventListener('click', () => openFileModal(file.name));
      DOM.workspaceFilesList.appendChild(item);
    });
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'html': return 'fa-brands fa-html5';
      case 'js': case 'ts': return 'fa-brands fa-js';
      case 'css': return 'fa-brands fa-css3-alt';
      case 'py': return 'fa-brands fa-python';
      case 'json': return 'fa-solid fa-code';
      default: return 'fa-solid fa-file-lines';
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  async function openFileModal(filename) {
    try {
      const res = await fetch(`/api/workspace/file/${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.success) {
        DOM.modalFileTitle.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${escapeHTML(filename)}`;
        const validLang = hljs.getLanguage(filename.split('.').pop()) ? filename.split('.').pop() : 'plaintext';
        DOM.modalFileContent.innerHTML = hljs.highlight(data.content, { language: validLang }).value;
        DOM.downloadFileLink.href = `/workspace/${filename}`;
        DOM.downloadFileLink.download = filename;
        DOM.fileModal.classList.remove('hidden');
      } else {
        showToast('Error opening file: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Failed to open file', 'error');
    }
  }

  // Health check API Key & Ollama status
  async function checkHealthStatus() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      const statusCard = document.getElementById('key-status-indicator');
      
      let ollamaBadge = data.ollamaStatus === 'online' ? '<span style="color:#10b981;">🦙 Ollama Ready</span>' : '<span style="color:#f59e0b;">🦙 Ollama Offline</span>';
      
      statusCard.innerHTML = `<div class="status-dot online"></div><span class="status-text">${ollamaBadge}</span>`;
    } catch (e) {}
  }

  // =========================================================================
  // Chat History Management
  // =========================================================================

  function loadChats() {
    const saved = localStorage.getItem('gemini_chats');
    return saved ? JSON.parse(saved) : [];
  }

  function saveChats() {
    localStorage.setItem('gemini_chats', JSON.stringify(state.chats));
  }

  function createNewChat() {
    const newChat = {
      id: 'chat_' + Date.now(),
      title: 'New Conversation',
      model: state.settings.defaultModel || 'qwen3',
      provider: (state.settings.defaultModel || 'qwen3').includes('qwen') ? 'ollama' : 'gemini',
      systemInstruction: PRESETS[state.activePreset].system,
      messages: [],
      createdAt: new Date().toISOString()
    };
    state.chats.unshift(newChat);
    saveChats();
    renderHistoryList();
    setActiveChat(newChat.id);
  }

  function getActiveChat() {
    return state.chats.find(c => c.id === state.activeChatId);
  }

  function setActiveChat(chatId) {
    state.activeChatId = chatId;
    const chat = getActiveChat();
    if (!chat) return;

    DOM.activeChatTitle.textContent = chat.title;
    updateActiveModelUI(chat.model);
    renderMessages();
    renderHistoryList();
  }

  function deleteChat(chatId, e) {
    if (e) e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== chatId);
    saveChats();
    renderHistoryList();
    
    if (state.chats.length === 0) {
      createNewChat();
    } else if (state.activeChatId === chatId) {
      setActiveChat(state.chats[0].id);
    }
    showToast('Conversation deleted', 'info');
  }

  function clearAllChats() {
    if (confirm('Are you sure you want to clear all conversation history?')) {
      state.chats = [];
      saveChats();
      createNewChat();
      showToast('All history cleared', 'info');
    }
  }

  function renderHistoryList(filterText = '') {
    DOM.historyList.innerHTML = '';
    const filtered = state.chats.filter(c => c.title.toLowerCase().includes(filterText.toLowerCase()));

    if (filtered.length === 0) {
      DOM.historyList.innerHTML = `<div style="padding: 12px; font-size: 0.8rem; color: var(--text-dim); text-align: center;">No history found</div>`;
      return;
    }

    filtered.forEach(chat => {
      const item = document.createElement('div');
      item.className = `history-item ${chat.id === state.activeChatId ? 'active' : ''}`;
      const providerIcon = (chat.model || '').includes('qwen') ? '🦙' : '⚡';
      item.innerHTML = `
        <span style="font-size:0.85rem; margin-right:4px;">${providerIcon}</span>
        <span class="history-title">${escapeHTML(chat.title)}</span>
        <div class="history-actions">
          <button class="history-action-btn delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      item.addEventListener('click', () => setActiveChat(chat.id));
      item.querySelector('.delete-btn').addEventListener('click', (e) => deleteChat(chat.id, e));
      DOM.historyList.appendChild(item);
    });
  }

  // =========================================================================
  // Rendering Messages & UI Updates
  // =========================================================================

  function renderMessages() {
    const chat = getActiveChat();
    DOM.chatMessages.innerHTML = '';

    if (!chat || chat.messages.length === 0) {
      DOM.chatMessages.appendChild(DOM.welcomeScreen);
      DOM.welcomeScreen.style.display = 'flex';
      return;
    }

    DOM.welcomeScreen.style.display = 'none';

    chat.messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.text, msg.images, false);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(role, text, images = [], isStreamingChunk = false) {
    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user-row' : 'bot-row'}`;

    const isUser = role === 'user';
    const chat = getActiveChat();
    const isQwen = (chat?.model || '').includes('qwen');
    const avatarIcon = isQwen ? 'fa-solid fa-brain' : 'fa-solid fa-wand-magic-sparkles';

    const avatarHTML = isUser 
      ? `<div class="avatar user-avatar"><i class="fa-solid fa-user"></i></div>`
      : `<div class="avatar bot-avatar" style="${isQwen ? 'background: linear-gradient(135deg, #059669 0%, #10b981 100%);' : ''}"><i class="${avatarIcon}"></i></div>`;

    let imagesHTML = '';
    if (images && images.length > 0) {
      imagesHTML = `<div class="message-images-grid">`;
      images.forEach(img => {
        const src = typeof img === 'string' ? img : `data:${img.mimeType};base64,${img.data}`;
        imagesHTML += `<img src="${src}" class="message-img-thumb" alt="Uploaded Image" onclick="window.open('${src}', '_blank')">`;
      });
      imagesHTML += `</div>`;
    }

    let contentHTML = '';
    if (isUser) {
      contentHTML = escapeHTML(text).replace(/\n/g, '<br>');
    } else {
      contentHTML = marked.parse(text || '');
    }

    row.innerHTML = `
      ${avatarHTML}
      <div class="message-bubble-wrapper">
        <div class="message-bubble">
          ${imagesHTML}
          <div class="bubble-text">${contentHTML}</div>
        </div>
        <div class="message-actions">
          <button class="action-icon-btn copy-msg-btn" title="Copy text"><i class="fa-regular fa-copy"></i></button>
        </div>
      </div>
    `;

    row.querySelector('.copy-msg-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      showToast('Text copied to clipboard', 'success');
    });

    DOM.chatMessages.appendChild(row);
    scrollToBottom();
    return row;
  }

  // =========================================================================
  // Sending Messages & Streaming Execution
  // =========================================================================

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (state.isStreaming) return;

    const text = DOM.userInput.value.trim();
    const images = [...state.pendingImages];

    if (!text && images.length === 0) return;

    const chat = getActiveChat();
    if (!chat) return;

    DOM.userInput.value = '';
    DOM.userInput.style.height = 'auto';
    clearPendingImages();

    if (chat.messages.length === 0) {
      chat.title = text.length > 28 ? text.substring(0, 28) + '...' : text;
      DOM.activeChatTitle.textContent = chat.title;
      saveChats();
      renderHistoryList();
    }

    const userMsg = { role: 'user', text, images, timestamp: Date.now() };
    chat.messages.push(userMsg);
    saveChats();
    
    DOM.welcomeScreen.style.display = 'none';
    appendMessageToDOM('user', text, images);

    if (text.startsWith('/image ') || chat.model === 'imagen-4.0-generate-001') {
      const prompt = text.replace(/^\/image\s+/, '');
      await handleImageGeneration(prompt);
      return;
    }

    await streamAssistantResponse(chat);
  }

  async function streamAssistantResponse(chat) {
    state.isStreaming = true;
    DOM.sendBtn.disabled = true;

    const isQwen = (chat.model || '').includes('qwen');
    const avatarIcon = isQwen ? 'fa-solid fa-brain' : 'fa-solid fa-wand-magic-sparkles';
    const avatarStyle = isQwen ? 'background: linear-gradient(135deg, #059669 0%, #10b981 100%);' : '';

    const botRow = document.createElement('div');
    botRow.className = 'message-row bot-row';
    botRow.innerHTML = `
      <div class="avatar bot-avatar" style="${avatarStyle}"><i class="${avatarIcon}"></i></div>
      <div class="message-bubble-wrapper">
        <div class="message-bubble">
          <div class="bubble-text"><span class="typing-cursor"></span></div>
        </div>
      </div>
    `;
    DOM.chatMessages.appendChild(botRow);
    scrollToBottom();

    const bubbleTextElem = botRow.querySelector('.bubble-text');
    let fullResponseText = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          model: chat.model || 'qwen3',
          provider: isQwen ? 'ollama' : 'gemini',
          messages: chat.messages,
          systemInstruction: chat.systemInstruction || state.settings.systemInstruction,
          temperature: parseFloat(state.settings.temperature),
          topP: parseFloat(state.settings.topP),
          chatId: chat.id
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Server error.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace(/^data:\s*/, '').trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                fullResponseText += parsed.text;
                bubbleTextElem.innerHTML = marked.parse(fullResponseText) + `<span class="typing-cursor"></span>`;
                scrollToBottom();
              }
            } catch (jsonErr) {
              console.warn('JSON parse error in chunk:', dataStr);
            }
          }
        }
      }

      bubbleTextElem.innerHTML = marked.parse(fullResponseText);
      
      const botMsg = { role: 'model', text: fullResponseText, timestamp: Date.now() };
      chat.messages.push(botMsg);
      saveChats();

      // Refresh workspace files in case a file tool was executed
      await fetchWorkspaceFiles();

    } catch (err) {
      console.error('Error during streaming:', err);
      bubbleTextElem.innerHTML = `<div style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${escapeHTML(err.message)}</div>`;
      showToast('Error streaming response from model', 'error');
    } finally {
      state.isStreaming = false;
      DOM.sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  // Handle Imagen 4.0 Image Generation
  async function handleImageGeneration(prompt) {
    state.isStreaming = true;
    DOM.sendBtn.disabled = true;

    const botRow = document.createElement('div');
    botRow.className = 'message-row bot-row';
    botRow.innerHTML = `
      <div class="avatar bot-avatar"><i class="fa-solid fa-palette"></i></div>
      <div class="message-bubble-wrapper">
        <div class="message-bubble">
          <div class="bubble-text">
            <p><i class="fa-solid fa-spinner fa-spin"></i> Generating artwork with Imagen 4.0 for prompt: <em>"${escapeHTML(prompt)}"</em>...</p>
          </div>
        </div>
      </div>
    `;
    DOM.chatMessages.appendChild(botRow);
    scrollToBottom();

    const bubbleTextElem = botRow.querySelector('.bubble-text');

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          prompt: prompt,
          aspectRatio: '1:1',
          numberOfImages: 1
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate image');
      }

      const imgUrl = data.images[0];
      const resultText = `Here is your generated image for: **${prompt}**\n\n![Generated Image](${imgUrl})`;
      
      bubbleTextElem.innerHTML = marked.parse(resultText);

      const chat = getActiveChat();
      chat.messages.push({ role: 'model', text: resultText, timestamp: Date.now() });
      saveChats();

    } catch (err) {
      console.error('Image gen error:', err);
      bubbleTextElem.innerHTML = `<div style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Image generation error: ${escapeHTML(err.message)}</div>`;
    } finally {
      state.isStreaming = false;
      DOM.sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  // =========================================================================
  // Image Upload Attachments
  // =========================================================================

  function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        state.pendingImages.push(evt.target.result);
        renderPendingImages();
      };
      reader.readAsDataURL(file);
    });
    DOM.fileInput.value = '';
  }

  function renderPendingImages() {
    if (state.pendingImages.length === 0) {
      DOM.attachmentPreviewBar.classList.add('hidden');
      DOM.previewContainer.innerHTML = '';
      return;
    }

    DOM.attachmentPreviewBar.classList.remove('hidden');
    DOM.previewContainer.innerHTML = '';

    state.pendingImages.forEach((imgData, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb-wrapper';
      thumb.innerHTML = `
        <img src="${imgData}" alt="Attachment ${index}">
        <button class="remove-thumb-btn" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
      `;
      thumb.querySelector('.remove-thumb-btn').addEventListener('click', () => {
        state.pendingImages.splice(index, 1);
        renderPendingImages();
      });
      DOM.previewContainer.appendChild(thumb);
    });
  }

  function clearPendingImages() {
    state.pendingImages = [];
    renderPendingImages();
  }

  // =========================================================================
  // Settings & Model Controls
  // =========================================================================

  function loadSettings() {
    const saved = localStorage.getItem('gemini_settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
  }

  function saveSettings() {
    localStorage.setItem('gemini_settings', JSON.stringify(state.settings));
    checkHealthStatus();
  }

  function openSettingsModal() {
    DOM.apiKeyInput.value = state.settings.apiKey;
    DOM.defaultModelSelect.value = state.settings.defaultModel;
    DOM.systemPromptInput.value = state.settings.systemInstruction;
    DOM.temperatureRange.value = state.settings.temperature;
    DOM.tempValueDisplay.textContent = state.settings.temperature;
    DOM.toppRange.value = state.settings.topP;
    DOM.toppValueDisplay.textContent = state.settings.topP;

    DOM.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    DOM.settingsModal.classList.add('hidden');
  }

  function saveSettingsFromModal() {
    state.settings.apiKey = DOM.apiKeyInput.value.trim();
    state.settings.defaultModel = DOM.defaultModelSelect.value;
    state.settings.systemInstruction = DOM.systemPromptInput.value.trim();
    state.settings.temperature = parseFloat(DOM.temperatureRange.value);
    state.settings.topP = parseFloat(DOM.toppRange.value);

    saveSettings();
    closeSettingsModal();
    showToast('Settings saved successfully', 'success');
  }

  function renderModelDropdown() {
    DOM.modelDropdownMenu.innerHTML = '';
    
    const localHeader = document.createElement('div');
    localHeader.className = 'model-category-header';
    localHeader.innerHTML = `🦙 Local Ollama Models`;
    DOM.modelDropdownMenu.appendChild(localHeader);

    state.ollamaModels.forEach(m => {
      const opt = document.createElement('div');
      opt.className = 'model-option';
      opt.innerHTML = `
        <div class="model-option-header">
          <span class="model-option-name">${escapeHTML(m.name)}</span>
          <span class="model-option-tag" style="background:rgba(16,185,129,0.2);color:#34d399;">${escapeHTML(m.tag)}</span>
        </div>
        <div class="model-option-desc">${escapeHTML(m.description)}</div>
      `;
      opt.addEventListener('click', () => {
        const chat = getActiveChat();
        if (chat) {
          chat.model = m.id;
          chat.provider = 'ollama';
          saveChats();
          updateActiveModelUI(m.id);
        }
        DOM.modelDropdownMenu.classList.remove('show');
      });
      DOM.modelDropdownMenu.appendChild(opt);
    });

    const cloudHeader = document.createElement('div');
    cloudHeader.className = 'model-category-header';
    cloudHeader.innerHTML = `✨ Google Gemini Cloud`;
    DOM.modelDropdownMenu.appendChild(cloudHeader);

    state.geminiModels.forEach(m => {
      const opt = document.createElement('div');
      opt.className = 'model-option';
      opt.innerHTML = `
        <div class="model-option-header">
          <span class="model-option-name">${escapeHTML(m.name)}</span>
          <span class="model-option-tag">${escapeHTML(m.tag)}</span>
        </div>
        <div class="model-option-desc">${escapeHTML(m.description)}</div>
      `;
      opt.addEventListener('click', () => {
        const chat = getActiveChat();
        if (chat) {
          chat.model = m.id;
          chat.provider = 'gemini';
          saveChats();
          updateActiveModelUI(m.id);
        }
        DOM.modelDropdownMenu.classList.remove('show');
      });
      DOM.modelDropdownMenu.appendChild(opt);
    });
  }

  function updateActiveModelUI(modelId) {
    const found = state.allModels.find(m => m.id === modelId);
    const displayName = found ? found.name : modelId;
    DOM.activeModelName.textContent = displayName;
  }

  // =========================================================================
  // UI Helpers & Listeners
  // =========================================================================

  function setupEventListeners() {
    DOM.sidebarToggleBtn.addEventListener('click', () => DOM.sidebar.classList.toggle('collapsed'));
    DOM.sidebarCloseBtn.addEventListener('click', () => DOM.sidebar.classList.add('collapsed'));

    DOM.newChatBtn.addEventListener('click', createNewChat);
    DOM.clearAllChatsBtn.addEventListener('click', clearAllChats);
    DOM.refreshFilesBtn.addEventListener('click', fetchWorkspaceFiles);

    DOM.searchHistoryInput.addEventListener('input', (e) => renderHistoryList(e.target.value));

    document.querySelectorAll('.preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.activePreset = btn.dataset.preset;
        
        const chat = getActiveChat();
        if (chat) {
          chat.systemInstruction = PRESETS[state.activePreset].system;
          saveChats();
        }
        showToast(`Switched mode to ${PRESETS[state.activePreset].name}`, 'info');
      });
    });

    DOM.modelSelectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.modelDropdownMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => DOM.modelDropdownMenu.classList.remove('show'));

    DOM.chatForm.addEventListener('submit', handleSendMessage);
    DOM.fileInput.addEventListener('change', handleFileUpload);

    DOM.userInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
    DOM.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        DOM.userInput.value = card.dataset.prompt;
        DOM.userInput.focus();
        handleSendMessage();
      });
    });

    DOM.clearChatBtn.addEventListener('click', () => {
      const chat = getActiveChat();
      if (chat && confirm('Clear messages in this conversation?')) {
        chat.messages = [];
        saveChats();
        renderMessages();
      }
    });

    DOM.exportChatBtn.addEventListener('click', () => {
      const chat = getActiveChat();
      if (!chat) return;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chat, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${chat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    DOM.chatMessages.addEventListener('scroll', () => {
      const isBottom = DOM.chatMessages.scrollHeight - DOM.chatMessages.scrollTop - DOM.chatMessages.clientHeight < 120;
      if (isBottom) {
        DOM.scrollBottomBtn.classList.remove('show');
      } else {
        DOM.scrollBottomBtn.classList.add('show');
      }
    });
    DOM.scrollBottomBtn.addEventListener('click', scrollToBottom);

    DOM.closeFileModalBtn.addEventListener('click', () => DOM.fileModal.classList.add('hidden'));

    DOM.openSettingsBtn.addEventListener('click', openSettingsModal);
    DOM.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    DOM.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);
    DOM.resetSettingsBtn.addEventListener('click', () => {
      state.settings = { ...DEFAULT_SETTINGS };
      saveSettings();
      openSettingsModal();
      showToast('Settings reset to defaults', 'info');
    });

    DOM.temperatureRange.addEventListener('input', (e) => DOM.tempValueDisplay.textContent = e.target.value);
    DOM.toppRange.addEventListener('input', (e) => DOM.toppValueDisplay.textContent = e.target.value);
    DOM.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const type = DOM.apiKeyInput.type === 'password' ? 'text' : 'password';
      DOM.apiKeyInput.type = type;
      DOM.toggleKeyVisibilityBtn.querySelector('i').className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    document.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.copy-code-btn');
      if (copyBtn) {
        const codeId = copyBtn.dataset.codeId;
        const codeElem = document.getElementById(codeId);
        if (codeElem) {
          navigator.clipboard.writeText(codeElem.innerText);
          copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy code`;
          }, 2000);
        }
      }
    });
  }

  function scrollToBottom() {
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconMap = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    toast.innerHTML = `<i class="fa-solid ${iconMap[type]}"></i> ${escapeHTML(message)}`;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Start App
  init();
});
