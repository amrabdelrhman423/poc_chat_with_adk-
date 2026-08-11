import {
  LlmAgent,
  FunctionTool,
  Runner,
  Gemini,
  InMemorySessionService,
  FileArtifactService
} from '@google/adk';
import { WORKSPACE_DIR, executeWriteFile, executeReadFile, executeListFiles } from './agentTools.js';
import { OllamaLlm } from './ollamaLlm.js';

/**
 * Google ADK (Agent Development Kit) Service
 * Uses LlmAgent + FunctionTool for native tool-call loop management.
 */

// ─── Shared Session Service (persists across requests in this process) ──────
export const sessionService = new InMemorySessionService();

// ─── ADK FileArtifactService ─────────────────────────────────────────────────
export const adkArtifactService = new FileArtifactService(WORKSPACE_DIR);

// ─── FunctionTool Definitions ────────────────────────────────────────────────

/**
 * write_file: Creates or overwrites a file in the workspace directory.
 */
export const writeFileTool = new FunctionTool({
  name: 'write_file',
  description: 'Create or overwrite a file in the workspace directory with the given content. Use this whenever the user asks to write, create, save, or generate a file, code, script, or document.',
  parameters: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'The target filename or relative path (e.g. index.html, scripts/app.js, notes.txt)'
      },
      content: {
        type: 'string',
        description: 'The exact text or code content to write into the file'
      }
    },
    required: ['filename', 'content']
  },
  execute: async ({ filename, content }) => {
    const result = executeWriteFile({ filename, content });
    if (result.success) {
      return {
        status: 'success',
        message: `File '${result.filename}' written successfully (${result.bytesWritten} bytes) to workspace.`,
        filename: result.filename,
        bytesWritten: result.bytesWritten
      };
    }
    return { status: 'error', message: result.error };
  }
});

/**
 * read_file: Reads an existing file from the workspace directory.
 */
export const readFileTool = new FunctionTool({
  name: 'read_file',
  description: 'Read the contents of an existing file from the workspace directory.',
  parameters: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'The filename or relative path to read from the workspace'
      }
    },
    required: ['filename']
  },
  execute: async ({ filename }) => {
    const result = executeReadFile({ filename });
    if (result.success) {
      return {
        status: 'success',
        filename: result.filename,
        content: result.content
      };
    }
    return { status: 'error', message: result.error };
  }
});

/**
 * list_files: Lists all files currently in the workspace directory.
 */
export const listFilesTool = new FunctionTool({
  name: 'list_files',
  description: 'List all files currently stored in the workspace directory. Use this when the user asks what files exist or to browse the workspace.',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    const result = executeListFiles();
    if (result.success) {
      if (result.files.length === 0) {
        return { status: 'success', message: 'The workspace is empty — no files yet.', files: [] };
      }
      const fileList = result.files.map(f => `${f.name} (${(f.size / 1024).toFixed(1)} KB)`).join(', ');
      return {
        status: 'success',
        message: `Workspace contains ${result.files.length} file(s): ${fileList}`,
        files: result.files
      };
    }
    return { status: 'error', message: result.error };
  }
});

// ─── All tools array ─────────────────────────────────────────────────────────
const ADK_TOOLS = [writeFileTool, readFileTool, listFilesTool];

// ─── Agent & Runner Factory ──────────────────────────────────────────────────

/**
 * Creates a new LlmAgent with Gemini backend and file tools.
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Gemini model ID (e.g. 'gemini-2.5-flash')
 * @param {string} instruction - System instruction for the agent
 */
export function createLlmAgent({ apiKey, model = 'gemini-2.5-flash', instruction = '' }) {
  const toolInstruction = `\n\nYou have access to file management tools: write_file, read_file, and list_files. Whenever the user asks to create, write, save, or generate a file, code, script, or document — always use the write_file tool to persist it to the workspace.`;

  return new LlmAgent({
    name: 'chat_agent',
    model: new Gemini({ model, apiKey }),
    instruction: instruction + toolInstruction,
    tools: ADK_TOOLS
  });
}

/**
 * Creates an LlmAgent backed by a local Ollama model (e.g. qwen3:latest).
 * Uses the OllamaLlm BaseLlm adapter so the full ADK tool-call loop works.
 * @param {string} model - Ollama model name (e.g. 'qwen3:latest')
 * @param {string} instruction - System instruction for the agent
 */
export function createOllamaLlmAgent({ model = 'qwen3:latest', instruction = '' }) {
  const toolInstruction = `\n\nYou have access to file management tools: write_file, read_file, and list_files. Whenever the user asks to create, write, save, or generate a file, code, script, or document — always use the write_file tool to persist it to the workspace.`;

  return new LlmAgent({
    name: 'ollama_agent',
    model: new OllamaLlm({ model }),
    instruction: instruction + toolInstruction,
    tools: ADK_TOOLS
  });
}

/**
 * Creates an ADK Runner for the given LlmAgent.
 * @param {LlmAgent} agent
 */
export function createRunner(agent) {
  return new Runner({
    appName: 'gemini_adk_chat',
    agent,
    sessionService,
    artifactService: adkArtifactService
  });
}

/**
 * Ensures a session exists for the given IDs. Creates one if it doesn't exist.
 * @param {string} userId
 * @param {string} sessionId
 */
export async function ensureSession(userId, sessionId) {  
  const existing = await sessionService.getSession({
    appName: 'gemini_adk_chat',
    userId,
    sessionId
  });

  if (!existing) {
    await sessionService.createSession({
      appName: 'gemini_adk_chat',
      userId,
      sessionId
    });
  }
}

