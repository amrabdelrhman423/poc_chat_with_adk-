# 🚀 Gemini & Ollama Agent Studio

A state-of-the-art AI Chat and Agent execution platform powered by **Google ADK (`@google/adk`)**, **Google Gemini Cloud Models**, **Imagen 4.0**, **Local Ollama Models (Qwen3)**, **Parse Server Healthcare Database Integration**, and **Workspace File Management Tools**.

---

## 🌟 Key Features

- 🧠 **Dual AI Engine**:
  - **Google Gemini Cloud**: Powered by `@google/genai` & `@google/adk` (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-3.6-flash`).
  - **Local Ollama Models**: Run privacy-first local models (`qwen3`, `llama3`, `mistral`) with zero API costs using a custom `BaseLlm` adapter.
- 🛠️ **Google ADK Framework Core**:
  - Built on `@google/adk` using `LlmAgent`, `FunctionTool`, `Runner`, `InMemorySessionService`, and `FileArtifactService`.
  - Native multi-step agent loop handling reasoning, function tool invocation, and multi-turn session persistence.
- 🏥 **Parse Server Database Integration**:
  - Direct REST integration with Parse Server using master key access and user session validation.
  - Native ADK tools to query, count, filter, sort, paginate, and perform MongoDB-style aggregations on healthcare and user data (`Patients`, `Doctors`, `Hospitals`, `PatientsBookings`, `Payments`, etc.).
  - Built-in graceful offline fallbacks when the live database is unreachable.
- 🔐 **Parse Authentication**:
  - Native Parse user authentication (`/login` and `/users/me`) with session token verification (`X-Parse-Session-Token`).
- 📁 **Workspace File Tools & Live Explorer**:
  - `write_file`: Agent creates and persists code, scripts, and documents directly into `./workspace/`.
  - `read_file` & `list_files`: Agents inspect and list workspace contents.
  - Live interactive browser sidebar to view, preview, and download agent-created files.
- 🎨 **Imagen 4.0 Text-to-Image**:
  - Generate high-resolution images in chat via `/api/generate-image` or Imagen model selection.
- ⚡ **Real-Time Step-by-Step SSE Streaming**:
  - Streams intermediate tool execution parameters, status indicators, and model text responses in real-time using Server-Sent Events (SSE).

---

## 🏗️ Architecture & System Design

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                         Web Browser UI                           │
 │     (Vanilla JS + SSE Stream + Marked.js + Highlight.js)         │
 └────────────────────────────────┬─────────────────────────────────┘
                                  │ POST /api/chat
                                  ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                          Express Server                          │
 │                           (server.js)                            │
 └──────────────┬───────────────────────────────────┬───────────────┘
                │                                   │
      provider === 'gemini'               provider === 'ollama'
                │                                   │
                ▼                                   ▼
 ┌──────────────────────────────┐    ┌──────────────────────────────┐
 │       Gemini ADK Agent       │    │       Ollama ADK Agent       │
 │   (src/geminiService.js)     │    │   (src/ollamaService.js)     │
 └──────────────┬───────────────┘    └──────────────┬───────────────┘
                │                                   │
                │       ┌───────────────────┐       │
                └──────►│   @google/adk     │◄──────┘
                        │   LlmAgent        │
                        │   FunctionTools   │
                        │   Runner          │
                        └─────────┬─────────┘
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
┌───────────────────┐                           ┌───────────────────┐
│    workspace/     │                           │   Parse Server    │
│  File Tools       │                           │   Database API    │
│(write, read, list)│                           │(query, count, agg)│
└───────────────────┘                           └───────────────────┘
```

---

## 🔄 Recent Changes & Key Improvements

1. **Parse Server Healthcare Database Tools**:
   - Added `src/parseService.js` to provide low-level REST API interactions with Parse Server (querying, counting, aggregating, and user authentication).
   - Integrated `query_parse_db`, `count_parse_records`, and `aggregate_parse_data` as native ADK `FunctionTool` definitions in `src/adkAgent.js`.
   - Comprehensive database schema instructions injected into the system prompt covering 25+ Parse classes (such as `Patients`, `Doctors`, `Hospitals`, `PatientsBookings`, `Payments`, `ChatRooms`, and `Messages`).
   - Implemented automatic pointer expansion (`include`) and regex search for seamless data exploration.

2. **Parse Authentication & Session Handling**:
   - Added `/api/auth/login` and `/api/auth/me` endpoints in `server.js`.
   - Propagated `sessionToken` from frontend auth modal through SSE streaming chat requests into ADK database tools.

3. **Graceful Offline Database Fallbacks**:
   - Tool execution handlers safely catch database errors/timeouts and return clear status markers.
   - System prompts instruct agents to explain connection status in user native language (e.g., Arabic/English) and pivot to general knowledge responses without breaking the conversation turn.

4. **ADK Ollama Integration (`OllamaLlm`)**:
   - Extended `@google/adk`'s `BaseLlm` with `src/ollamaLlm.js` to bring ADK's native function-calling loop and session runner to local Ollama models (e.g. `qwen3:latest`).

5. **Enhanced Real-Time Tool Call Streaming**:
   - Updated SSE stream handlers to emit formatted Markdown blocks detailing tool calls, JSON input arguments, tool outputs, and record counts.

---

## 🛠️ Project Structure

```
chat_ai/
├── public/                 # Frontend Web Interface
│   ├── index.html          # Main HTML structure & auth modals
│   ├── css/style.css       # Dark-mode glassmorphism styling
│   └── js/app.js           # Client chat engine, SSE stream parser, & workspace viewer
├── src/
│   ├── adkAgent.js         # Google ADK agent setup, FunctionTools & session runners
│   ├── agentTools.js       # Workspace filesystem execution helpers
│   ├── parseService.js     # Parse Server REST client, queries, & authentication
│   ├── geminiService.js    # Gemini Cloud models integration & Imagen 4.0
│   ├── ollamaLlm.js        # ADK BaseLlm adapter for Ollama models
│   └── ollamaService.js    # Ollama model discovery & streaming handler
├── workspace/              # Storage directory for agent-created files
├── schema.json             # Parse database schema definitions reference
├── server.js               # Express application server & API routes
└── package.json            # Dependencies (@google/adk, @google/genai, express, etc.)
```

---

## ⚡ Quick Start Guide

### Prerequisites

- **Node.js**: v18.0.0 or higher installed.
- **Ollama** *(Optional for local models)*: Installed and running locally (`ollama run qwen3:latest`).
- **Parse Server** *(Optional for live DB features)*: A running Parse Server instance with Master Key configuration.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd chat_ai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here

   # Ollama Configuration
   OLLAMA_HOST=127.0.0.1
   OLLAMA_PORT=11434

   # Parse Server Configuration
   PARSE_SERVER_URL=https://your-parse-server.com/parse
   PARSE_APP_ID=your_parse_app_id
   PARSE_MASTER_KEY=your_parse_master_key
   ```
   *(Note: You can also configure your Gemini API Key directly via the settings UI).*

4. **Run the Application**:
   - **Development Mode**:
     ```bash
     npm run dev
     ```
   - **Production Mode**:
     ```bash
     npm start
     ```
   Open your browser at **`http://localhost:3000`**.

---

## 📡 API Reference

### 🔐 Authentication

- **`POST /api/auth/login`**: Authenticate Parse user credentials.
  - **Body**: `{ "username": "...", "password": "..." }`
  - **Response**: User details and `sessionToken`.

- **`GET /api/auth/me`**: Verify current Parse session token.
  - **Header**: `X-Parse-Session-Token: <token>`

### 💬 Chat & Models

- **`GET /api/models`**: List available Google Gemini and local Ollama models.
- **`POST /api/chat`**: Server-Sent Events (SSE) streaming chat endpoint.
  - **Body**:
    ```json
    {
      "provider": "gemini",
      "model": "gemini-3.6-flash",
      "apiKey": "your_api_key",
      "chatId": "session-123",
      "messages": [{ "role": "user", "text": "List confirmed patient bookings" }],
      "sessionToken": "optional_parse_token"
    }
    ```

### 🎨 Image Generation

- **`POST /api/generate-image`**: Generate images using Google Imagen 4.0.
  - **Body**: `{ "prompt": "A modern medical clinic logo", "aspectRatio": "1:1", "numberOfImages": 1 }`

### 📁 Workspace Files

- **`GET /api/workspace/files`**: List all files saved in `./workspace/`.
- **`GET /api/workspace/file/*`**: Read specific file content from `./workspace/`.

---

## 💡 Usage Examples

### 1. Database Exploration (Parse Server)
> **User**: *"How many confirmed patient bookings do we have?"*
>
> **Agent Execution**:
> - Tool Call: `count_parse_records({ className: "PatientsBookings", where: '{"status":"confirmed"}' })`
> - Agent Response: *"There are currently 42 confirmed patient bookings in the database."*

### 2. Workspace Code Generation
> **User**: *"Write a Node.js script called analytics.js that calculates average patient age."*
>
> **Agent Execution**:
> - Tool Call: `write_file({ filename: "analytics.js", content: "..." })`
> - Result: File is written to `workspace/analytics.js` and immediately previewable in the UI sidebar.

---

## 📜 License

MIT License. Developed with Google ADK, Gemini, & Ollama.
