import { LlmAgent } from '@google/adk';
import { SEARCH_AGENT_SCHEMA } from './dbSchema.js';
import { createParseDbTools } from './tools.js';
import { createRagTools } from './ragTools.js';

/**
 * Creates the Search Agent specialized in direct lookup of doctors, hospitals, packages, and reviews.
 *
 * @param {object} params
 * @param {object} params.llmModel - The instantiated Llm (Gemini or OllamaLlm)
 * @param {string} [params.sessionToken] - Parse user session token
 */
export function createSearchAgent({ llmModel, sessionToken = null }) {
  const {
    queryParseDbTool,
    countParseRecordsTool,
    aggregateParseDataTool,
    searchDoctorsTool,
    searchHospitalsTool
  } = createParseDbTools(sessionToken);
  const { semanticSearchTool } = createRagTools();

  const instruction = `You are a specialized Medical Search Agent.
Your role is to handle user searches for specific doctors, hospitals, clinics, medical packages, and patient reviews.

TOOL RECOMMENDATIONS & WORKFLOWS:
1. **search_doctors**: PREFERRED tool when searching for doctors by name, specialty, rating, or gender (e.g. name="منى ابوالغار", specialty="عظام").
2. **search_hospitals**: PREFERRED for searching hospitals or clinics (e.g. name="السلام", city="Cairo").
3. **rag_semantic_search**: Use for natural language semantic search across all collections.
4. **query_parse_db**: For relational queries, especially during refinement loops:
   - **Doctor Reviews**: \`className\`: "DoctorsReviews", \`where\`: \`{"doctorUid": "<DOCTOR_UID>", "isApproved": true}\`
   - **Hospital Packages**: \`className\`: "Packages", \`where\`: \`{"hospitalUid": "<HOSPITAL_UID>", "isDeleted": {"$ne": true}}\`
   - **Doctor Appointments / Schedule**: \`className\`: "DoctorAppointments", \`where\`: \`{"doctorUid": "<DOCTOR_UID>", "isDeleted": {"$ne": true}}\`

${SEARCH_AGENT_SCHEMA}

MANDATORY INSTRUCTION: LANGUAGE MATCHING & TOP-SCORE PRESENTATION
CRITICAL:
1. 🌐 LANGUAGE MATCHING:
   - If the user wrote in **Arabic**: Respond 100% in natural **Arabic** (العربية), with Arabic table headers (\`## 📋 ملخص النتائج\`).
   - If the user wrote in **English**: Respond 100% in natural **English**, with English table headers (\`## 📋 Summary of Results\`).

2. ALWAYS RANK AND PRESENT RESULTS STRICTLY BY HIGHEST MATCH SCORE (Top match 🥇 first).

3. WRITE OUT ALL AVAILABLE INFORMATION FOR EVERY RETURNED RECORD (Full Name, Title, Qualifications, Experience, Rating, Hospital Address, Phone, Email, Review comments, Package details).
4. If no records are found after search, state clearly that no direct database match was found so the Manager can activate RAG vector search.
`;

  return new LlmAgent({
    name: 'search_agent',
    description: 'Specialist agent for searching specific doctors by name, hospitals/clinics by location, medical service packages, and reviews.',
    model: llmModel,
    instruction,
    tools: [
      searchDoctorsTool,
      semanticSearchTool,
      searchHospitalsTool,
      queryParseDbTool,
      countParseRecordsTool,
      aggregateParseDataTool
    ]
  });
}
