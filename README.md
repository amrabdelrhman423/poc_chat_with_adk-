# 🚀 Gemini & Ollama Healthcare Multi-Agent Studio

A state-of-the-art AI Chat and Multi-Agent execution platform powered by **Google ADK (`@google/adk`)**, **Google Gemini Cloud Models**, **Imagen 4.0**, **Local Ollama Models (Qwen3)**, **Parse Server Healthcare Database Integration**, and **Multi-Agent Orchestration Architecture**.

---

## 🌟 Key Features

- 🤖 **Multi-Agent Orchestration Architecture (Google ADK `subAgents`)**:
  - **Manager / Orchestrator Agent (`manager_agent`)**: Intelligent routing and intent classification that delegates queries to specialized domain sub-agents.
  - **Symptom & Recommendation Agent (`symptom_agent`)**: Analyzes patient symptoms (Arabic/English), performs multi-step relational lookups (`Specialties` → `HospitalDoctorSpecialty`), and recommends doctors and clinics with ratings and experience.
  - **Medical Search Agent (`search_agent`)**: Handles direct searches for doctors by name, hospitals/clinics by area, medical packages, and patient reviews.
  - **User Profile & Bookings Agent (`profile_agent`)**: Retrieves personal data for authenticated users (past/upcoming bookings, medical history, payments, and family members) scoped to the user's UID.
- 🧠 **Dual AI Engine**:
  - **Google Gemini Cloud**: Powered by `@google/genai` & `@google/adk` (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-3.6-flash`).
  - **Local Ollama Models**: Run privacy-first local models (`qwen3:latest`, `llama3`, `mistral`) with zero API costs using a custom `BaseLlm` adapter supporting tool execution and reasoning/thinking traces.
- 🏥 **Parse Server Healthcare Database Integration**:
  - REST integration with Parse Server using master key access and user session validation.
  - Native ADK tools to query, count, filter, sort, paginate, and perform MongoDB-style aggregations on healthcare and user data (`Patients`, `Doctors`, `Hospitals`, `PatientsBookings`, `Payments`, `HospitalDoctorSpecialty`, `Packages`, etc.).
  - **Class Name Normalization**: Automatically maps variations/plurals/singulars (e.g., `doctor` → `Doctors`, `patientbookings` → `PatientsBookings`).
  - Built-in graceful offline fallbacks and detailed summary extraction when tools return data.
- 🔐 **Parse Authentication & Scoped User Sessions**:
  - Native Parse user authentication (`/api/auth/login` and `/api/auth/me`) with session token verification (`X-Parse-Session-Token`).
  - User UID extracted and stored in ADK session state to securely scope personal data access in `profile_agent`.
- 📁 **Workspace File Tools & Live Explorer**:
  - `write_file`: Agent creates and persists code, scripts, reports, and documents directly into `./workspace/`.
  - `read_file` & `list_files`: Agents inspect and list workspace contents.
  - Live interactive browser sidebar to view, preview, and download agent-created files.
- 🎨 **Imagen 4.0 Text-to-Image**:
  - Generate high-resolution medical or general images in chat via `/api/generate-image` or Imagen model selection.
- ⚡ **Real-Time Step-by-Step SSE Streaming**:
  - Streams intermediate tool execution parameters, status indicators, record breakdowns, and model text responses in real-time using Server-Sent Events (SSE).

---

## 🏗️ Multi-Agent Architecture & System Design

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                         Web Browser UI                           │
 │     (Vanilla JS + SSE Stream + Marked.js + Highlight.js)         │
 └────────────────────────────────┬─────────────────────────────────┘
                                  │ POST /api/chat (SSE)
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
                └─────────────────┬─────────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │       MANAGER AGENT       │
                    │   (src/agents/manager)    │
                    │  Intent Routing & Orchestr.│
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  symptom_agent   │    │   search_agent   │    │  profile_agent   │
│ Symptom Matching │    │ Doctor / Clinic  │    │ User Bookings &  │
│ & Recommendation │    │ Package Search   │    │ Personal Profile │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │    ADK FunctionTools  │
                     └───────────┬───────────┘
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

## 👥 Specialized Sub-Agents Breakdown

| Sub-Agent | Name | Primary Responsibility | Data Classes / Sources |
|---|---|---|---|
| 👑 **Manager Agent** | `manager_agent` | Evaluates user prompt, maintains conversational context, routes to sub-agents or workspace tools. | Global Orchestrator & Workspace |
| 🩺 **Symptom Agent** | `symptom_agent` | Matches patient symptoms / ailments to specialties and queries relational doctor assignments with ratings and clinic info. | `Specialties`, `HospitalDoctorSpecialty`, `Doctors`, `Hospitals` |
| 🔍 **Search Agent** | `search_agent` | Direct search for specific doctors by name, hospitals by city/area, medical packages, and verified patient reviews. | `Doctors`, `Hospitals`, `Packages`, `DoctorsReviews` |
| 👤 **Profile Agent** | `profile_agent` | Securely queries personal user data scoped to the authenticated user's UID (bookings, profile, invoices, family members). | `PatientsBookings`, `Patients`, `Payments`, `PatientFamilyMembers` |

---

## 🔄 Recent Changes & Architectural Upgrades

1. **Modular Multi-Agent System (`src/agents/`)**:
   - Refactored single-agent setup into a modular Google ADK `subAgents` architecture with a dedicated `manager_agent` orchestrator.
   - Created specialized sub-agents: `symptomAgent.js`, `searchAgent.js`, and `profileAgent.js` with isolated domain instructions and schemas.
   - Modularized schemas (`src/agents/dbSchema.js`) to provide targeted context to each sub-agent rather than overloading a single prompt.

2. **3-Step Relational Symptom Recommendation Workflow**:
   - Implemented an enforced 3-step search pipeline for `symptom_agent`:
     1. Search `Specialties` by symptom/complaint.
     2. Query `HospitalDoctorSpecialty` using the specialty ID and expanded pointers (`include: "doctorDetails,hospitalDetails,specialtyDetails"`).
     3. Format complete doctor and hospital profiles in clear natural language with a structured summary table (`## 📋 Summary / ملخص النتائج`).

3. **Authenticated User Profile Scoping**:
   - Integrated Parse user session token resolution in `server.js` (`verifyParseSessionToken`).
   - Automatically injected `userUid` into the ADK Session state (`ensureSession`) and `profile_agent` context.

4. **Parse Class Name Normalization**:
   - Added `normalizeClassName` in `src/parseService.js` with comprehensive alias mappings (e.g. `doctor`, `doctors` → `Doctors`; `patientbooking`, `booking` → `PatientsBookings`).

5. **Rich Record Output & Stream Fallback**:
   - Enforced full-record presentation in system prompts (names, specialties, ratings, phone numbers, prices, dates) avoiding bare counts.
   - Enhanced SSE streaming in `geminiService.js` and `ollamaService.js` to format tool results and ensure a structured summary is delivered.

---

## 🛠️ Project Structure

```
chat_ai/
├── public/                     # Frontend Web Interface
│   ├── index.html              # Main HTML structure & auth modals
│   ├── css/style.css           # Dark-mode glassmorphism styling
│   └── js/app.js               # Client chat engine, SSE stream parser, & workspace viewer
├── src/
│   ├── agents/                 # Multi-Agent Architecture (Google ADK)
│   │   ├── dbSchema.js         # Modular schema definitions for sub-agents
│   │   ├── managerAgent.js     # Manager / Orchestrator Agent
│   │   ├── symptomAgent.js     # Symptom analysis & doctor recommendation sub-agent
│   │   ├── searchAgent.js      # Direct doctor/hospital/package search sub-agent
│   │   ├── profileAgent.js     # User bookings & personal data sub-agent
│   │   └── tools.js            # Workspace & Parse DB ADK FunctionTools
│   ├── adkAgent.js             # ADK Agent and Runner factory & session management
│   ├── agentTools.js           # Workspace filesystem execution helpers
│   ├── parseService.js         # Parse Server REST client, queries, normalization & auth
│   ├── geminiService.js        # Gemini Cloud models integration & Imagen 4.0
│   ├── ollamaLlm.js            # ADK BaseLlm adapter for Ollama models
│   └── ollamaService.js        # Ollama model discovery & streaming handler
├── workspace/                  # Storage directory for agent-created files
├── schema.json                 # Complete Parse database schema reference
├── server.js                   # Express application server & API routes
└── package.json                # Project configuration and dependencies
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
   *(Note: You can also configure your Gemini API Key directly via the settings UI in the browser).*

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
      "messages": [{ "role": "user", "text": "عندي ألم في الركبة ومحتاج دكتور عظام" }],
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

### 1. Symptom Analysis & Doctor Recommendation
> **User**: *"عندي ألم في المفاصل والركبة، مين دكتور كويس؟"*
>
> **Agent Execution**:
> 1. `manager_agent` delegates to `symptom_agent`.
> 2. `symptom_agent` executes `query_parse_db` on `Specialties` for orthopedic/rheumatology specialties.
> 3. `symptom_agent` executes `query_parse_db` on `HospitalDoctorSpecialty` with `include: "doctorDetails,hospitalDetails,specialtyDetails"`.
> 4. **Response**: Detailed doctor recommendations with names, hospital locations, ratings, contact numbers, and a formatted summary table.

### 2. User Bookings & Profile Retrieval
> **User**: *"Show me my upcoming appointments and bookings"*
>
> **Agent Execution**:
> 1. `manager_agent` delegates to `profile_agent` with the user's authenticated session.
> 2. `profile_agent` executes `query_parse_db` on `PatientsBookings` filtered by `patientUid` with linked doctor and hospital details.
> 3. **Response**: A formatted breakdown of appointment dates, time slots, doctor names, clinics, and booking status.

### 3. Workspace Code & Report Generation
> **User**: *"Write a Python script called medical_report.py that summarizes our patient statistics."*
>
> **Agent Execution**:
> 1. `manager_agent` calls `write_file({ filename: "medical_report.py", content: "..." })`.
> 2. **Result**: File is written directly to `workspace/medical_report.py` and previewable in the UI sidebar.

---

## 📜 License

MIT License. Developed with Google ADK, Gemini, & Ollama.
