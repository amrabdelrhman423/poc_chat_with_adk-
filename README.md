# 🚀 Gemini & Ollama Agent Studio

A next-generation AI Chat application powered by **Google ADK (`@google/adk`)**, **Google Gemini Cloud Models**, **Imagen 4.0**, and **Local Ollama Models (Qwen3)** with **native FunctionTool file management capabilities**.

---

## 🌟 Key Features

- 🧠 **Dual AI Engine**:
  - **Google Gemini Cloud**: Powered by `@google/genai` & `@google/adk` (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`).
  - **Local Ollama**: Run models locally privacy-first (`qwen3`, `llama3`, `mistral`) with zero API costs.
- 🛠️ **Google ADK Framework**:
  - Built with `@google/adk`'s `LlmAgent`, `FunctionTool`, `Runner`, and `InMemorySessionService`.
  - Custom `OllamaLlm` adapter extending ADK's `BaseLlm` to bring ADK's native tool-calling loop to local Ollama models.
- 📁 **Workspace File Tools**:
  - `write_file`: Agent creates/overwrites code and text files directly into the `./workspace` directory.
  - `read_file`: Agent inspects existing workspace files.
  - `list_files`: Agent browses all files in the workspace.
  - **Live Workspace Explorer**: View, open, preview, and download agent-created files directly from the browser sidebar!
- 🎨 **Imagen 4.0 Text-to-Image**:
  - Generate high-quality images directly in chat using `/image <prompt>` or selecting Imagen 4.0.
- 💬 **Multi-Turn Persistent Sessions**:
  - ADK `Runner` retains conversation memory per chat session.

---

## 🏗️ Architecture & Workflow

```
 ┌──────────────────────────────────────────────────────────┐
 │                     Web Browser UI                       │
 │        (Vanilla JS + SSE Stream + Marked.js + HLJS)      │
 └────────────────────────────┬─────────────────────────────┘
                              │ POST /api/chat
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │                     Express Server                       │
 │                       (server.js)                        │
 └──────────────┬────────────────────────────┬──────────────┘
                │                            │
      provider === 'gemini'        provider === 'ollama'
                │                            │
                ▼                            ▼
 ┌──────────────────────────┐  ┌──────────────────────────┐
 │    Gemini ADK Agent      │  │    Ollama ADK Agent      │
 │  (src/geminiService.js)  │  │  (src/ollamaService.js)  │
 └──────────────┬───────────┘  └─────────────┬────────────┘
                │                            │
                │     ┌──────────────────┐   │
                └────►│  @google/adk     │◄──┘
                      │  LlmAgent        │
                      │  FunctionTools   │
                      │  Runner          │
                      └─────────┬────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │    workspace/    │
                      │ (File Operations)│
                      └──────────────────┘
```

---

## 📁 Workspace File Tool Execution Flow

1. **User Request**: `"Write a Python script named hello.py that prints prime numbers."`
2. **ADK Agent Decision**: The `LlmAgent` identifies the intent and emits a `tool_call` event for `write_file`.
3. **FunctionTool Execution**: `@google/adk` calls `writeFileTool.execute({ filename: 'hello.py', content: '...' })`.
4. **Result Returned**: The file is written to `./workspace/hello.py`, and the status is fed back into the `LlmAgent`.
5. **Agent Summary**: The model completes its turn by confirming the file creation to the user.
6. **UI Auto-Refresh**: The sidebar Workspace File Explorer auto-refreshes to show `hello.py` with file size and click-to-view modal.

---

## ⚡ Quick Start

### Prerequisites
- **Node.js**: v18 or higher installed
- **Ollama** (optional for local models): Installed and running (`ollama run qwen3:latest`)

### Setup Instructions

1. **Clone & Install Dependencies**:
   ```bash
   git clone <repository-url>
   cd chat_ai
   npm install
   ```

2. **Configure Environment Variables** (Optional):
   Create a `.env` file in the project root:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here
   OLLAMA_HOST=127.0.0.1
   OLLAMA_PORT=11434
   ```
   *(Note: You can also set your Gemini API key inside the UI Settings Modal).*

3. **Start Application**:
   ```bash
   npm start
   ```
   Open your browser at **`http://localhost:3000`**.

---

## ⚙️ Model Catalog

| Model | Provider | Type | Description |
|---|---|---|---|
| **Gemini 2.5 Flash** | Google Cloud | Cloud LLM | Fast & smart model for everyday coding & reasoning |
| **Gemini 2.5 Pro** | Google Cloud | Cloud LLM | Pro model for complex problem solving & deep context |
| **Gemini 2.5 Flash Lite**| Google Cloud | Cloud LLM | Ultra-fast lightweight model |
| **Qwen3 (ollama)** | Ollama | Local LLM | Alibaba Qwen3 state-of-the-art local model |
| **Imagen 4.0** | Google Cloud | Image | Text-to-image artwork generation |

---

## 🛠️ Project Structure

```
chat_ai/
├── public/                # Frontend Web Interface
│   ├── index.html         # Main UI Structure
│   ├── css/styles.css     # Premium styling & glassmorphism dark theme
│   └── js/app.js          # Chat state, SSE streaming, & workspace browser
├── src/
│   ├── adkAgent.js        # Google ADK LlmAgent, FunctionTools, & Runner
│   ├── ollamaLlm.js       # Custom BaseLlm adapter bridging ADK with Ollama
│   ├── geminiService.js   # Gemini Cloud model handler
│   ├── ollamaService.js   # Local Ollama model handler & discovery
│   └── agentTools.js      # Workspace filesystem tool execution logic
├── workspace/             # Agent-created files (served at /workspace/*)
├── server.js              # Express API server & static routes
└── package.json           # Dependencies (@google/adk, @google/genai, express)
```

---

## 📜 License

MIT License. Designed with Google ADK & Gemini.
