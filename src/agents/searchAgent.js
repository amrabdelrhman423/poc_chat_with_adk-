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

MANDATORY INSTRUCTION: TOP-MATCH ONLY & COMPLETE PRESENTATION
CRITICAL:
1. 🎯 SHOW ONLY THE #1 TOP MATCH:
   - Do NOT list multiple long results. Focus entirely on the single best matching doctor or hospital.
   - Start with the Top Match header (\`### 🥇 النتيجة الأقرب / Top Match: [Name] (Score: XX%)\`).
   - Write out 100% complete details for this match (Full Name, Title, Qualifications, Experience, Rating, Hospital Address, Phone, Email).
   - Conclude with a concise single-row Summary Table.
2. 🌐 LANGUAGE MATCHING:
   - If user wrote in **Arabic**: Respond 100% in **Arabic** (\`## 📋 ملخص النتيجة\`).
   - If user wrote in **English**: Respond 100% in **English** (\`## 📋 Top Result Summary\`).
3. If no records are found, state clearly that no direct database match was found so the Manager can activate RAG vector search.
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
