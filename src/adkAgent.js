import {
  LlmAgent,
  Runner,
  Gemini,
  InMemorySessionService,
  FileArtifactService
} from '@google/adk';
import { WORKSPACE_DIR } from './agentTools.js';
import { OllamaLlm } from './ollamaLlm.js';
import { createManagerAgent } from './agents/managerAgent.js';
import { workspaceTools, writeFileTool, readFileTool, listFilesTool, createParseDbTools } from './agents/tools.js';
import { SYMPTOM_AGENT_SCHEMA } from './agents/dbSchema.js';

/**
 * Google ADK (Agent Development Kit) Multi-Agent Architecture
 * Uses a Manager Agent orchestrator with specialized sub-agents:
 * - symptom_agent: Symptom analysis & doctor recommendation (3-step flow)
 * - search_agent: Direct search for doctors, hospitals, packages, reviews
 * - profile_agent: Logged-in user's personal bookings, profile, payments
 */

// ─── Shared Session Service (persists across requests in process) ─────────────
export const sessionService = new InMemorySessionService();

// ─── ADK FileArtifactService ─────────────────────────────────────────────────
export const adkArtifactService = new FileArtifactService(WORKSPACE_DIR);

// Re-export tools for backward compatibility
export { writeFileTool, readFileTool, listFilesTool };

export function getAdkTools(sessionToken = null) {
  const { queryParseDbTool, countParseRecordsTool, aggregateParseDataTool } = createParseDbTools(sessionToken);
  return [...workspaceTools, queryParseDbTool, countParseRecordsTool, aggregateParseDataTool];
}

// ─── Agent & Runner Factory ──────────────────────────────────────────────────

/**
 * Creates a Manager Agent with Gemini backend and specialized sub-agents.
 * @param {object} params
 * @param {string} params.apiKey - Gemini API key
 * @param {string} params.model - Gemini model ID (e.g. 'gemini-3.6-flash')
 * @param {string} [params.instruction] - Optional system instruction override
 * @param {string} [params.sessionToken] - Optional Parse user session token
 * @param {string} [params.userUid] - Optional authenticated user's UID
 */
export function createLlmAgent({ apiKey, model = 'gemini-3.6-flash', instruction = '', sessionToken = null, userUid = null }) {
  const geminiModel = new Gemini({ model, apiKey });
  return createManagerAgent({
    llmModel: geminiModel,
    customInstruction: instruction,
    sessionToken,
    userUid
  });
}

/**
 * Creates a Manager Agent backed by a local Ollama model (e.g. qwen3:latest).
 * @param {object} params
 * @param {string} params.model - Ollama model name (e.g. 'qwen3:latest')
 * @param {string} [params.instruction] - System instruction
 * @param {string} [params.sessionToken] - Parse user session token
 * @param {string} [params.userUid] - Authenticated user's UID
 */
export function createOllamaLlmAgent({ model = 'qwen3:latest', instruction = '', sessionToken = null, userUid = null }) {
  const ollamaModel = new OllamaLlm({ model });
  return createManagerAgent({
    llmModel: ollamaModel,
    customInstruction: instruction,
    sessionToken,
    userUid
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
 * @param {object} [initialState] - Optional initial session state
 */
export async function ensureSession(userId, sessionId, initialState = {}) {  
  const existing = await sessionService.getSession({
    appName: 'gemini_adk_chat',
    userId,
    sessionId
  });

  if (!existing) {
    await sessionService.createSession({
      appName: 'gemini_adk_chat',
      userId,
      sessionId,
      state: initialState
    });
  }
}