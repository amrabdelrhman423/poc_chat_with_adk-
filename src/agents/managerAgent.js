import { LlmAgent } from '@google/adk';
import { createSymptomAgent } from './symptomAgent.js';
import { createSearchAgent } from './searchAgent.js';
import { createProfileAgent } from './profileAgent.js';
import { workspaceTools } from './tools.js';

/**
 * Creates the Orchestrator / Manager Agent that coordinates sub-agents.
 * Uses native ADK `subAgents` for LLM-driven intent classification and delegation.
 *
 * @param {object} params
 * @param {object} params.llmModel - The instantiated Llm (Gemini or OllamaLlm)
 * @param {string} [params.customInstruction] - Optional system instruction override/append
 * @param {string} [params.sessionToken] - Parse user session token
 * @param {string} [params.userUid] - Authenticated user's UID
 */
export function createManagerAgent({ llmModel, customInstruction = '', sessionToken = null, userUid = null }) {
  // Build specialized sub-agents
  const symptomAgent = createSymptomAgent({ llmModel, sessionToken });
  const searchAgent = createSearchAgent({ llmModel, sessionToken });
  const profileAgent = createProfileAgent({ llmModel, sessionToken, userUid });

  const baseInstruction = `You are a smart Healthcare AI Manager and Chat Assistant.
Your primary role is to understand user requests and coordinate with your specialized team of sub-agents to deliver accurate, helpful healthcare information.

YOUR TEAM OF SPECIALISTS:
1. **symptom_agent**: Delegate to this agent when the user mentions ANY symptoms, health complaints, pain, ailments (e.g. "عندي الم في المفاصل", "I have back pain", "skin rash"), or asks for a doctor recommendation based on a medical condition.
2. **search_agent**: Delegate to this agent when the user explicitly searches for a specific doctor by name, searches for hospitals/clinics by location/area, asks about medical packages, or looks for doctor ratings and reviews.
3. **profile_agent**: Delegate to this agent when the user asks about THEIR OWN personal data (e.g., "show me my bookings", "what are my upcoming appointments?", "my medical profile", "my payments", "حجوزاتي", "ملفي الطبي").

GENERAL GUIDELINES:
- For simple greetings (e.g., "Hi", "Hello", "مرحبا"), respond directly with a warm, helpful greeting and explain what services you can provide.
- Always respond in the exact same language used by the user (Arabic, English, etc.).
- When delegating, pass the user request to the sub-agent.
- MANDATORY FULL RECORD PRESENTATION: NEVER allow answers that merely say "Found X records". Every final response containing database records MUST write out the detailed data of ALL returned records (names, titles, specialties, ratings, hospitals, phone numbers, dates, prices, status) in rich natural human language, concluding with a clear Summary section (\`## 📋 Summary / ملخص النتائج\`).
- You also have workspace file management tools (write_file, read_file, list_files) if the user asks to save, read, or list files in the workspace.
${customInstruction ? `\n\nAdditional Instructions:\n${customInstruction}` : ''}`;

  return new LlmAgent({
    name: 'manager_agent',
    description: 'Main healthcare orchestrator agent that routes user queries to specialized sub-agents based on intent.',
    model: llmModel,
    instruction: baseInstruction,
    tools: [...workspaceTools],
    subAgents: [symptomAgent, searchAgent, profileAgent]
  });
}
