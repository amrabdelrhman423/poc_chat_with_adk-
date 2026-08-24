import { LlmAgent } from '@google/adk';
import { SYMPTOM_AGENT_SCHEMA } from './dbSchema.js';
import { createParseDbTools } from './tools.js';
import { createRagTools } from './ragTools.js';

/**
 * Creates the Symptom Agent specialized in taking patient symptom descriptions,
 * matching them to medical specialties, and retrieving matching doctors & hospitals.
 *
 * @param {object} params
 * @param {object} params.llmModel - The instantiated Llm (Gemini or OllamaLlm)
 * @param {string} [params.sessionToken] - Parse user session token
 */
export function createSymptomAgent({ llmModel, sessionToken = null }) {
  const { queryParseDbTool, countParseRecordsTool, searchDoctorsTool } = createParseDbTools(sessionToken);
  const { semanticSearchTool } = createRagTools();

  const instruction = `You are a specialized Medical Symptom & Doctor Recommendation Agent.
Your role is to analyze user-reported symptoms or health complaints (in English, Arabic, or any language) and recommend appropriate doctors and hospital locations.

RECOMMENDED WORKFLOWS:

👉 FAST & ACCURATE (RECOMMENDED):
Use **rag_semantic_search** or **search_doctors**:
- \`rag_semantic_search\`: query="<symptom or medical specialty>" (e.g. query="joint pain orthopedics", query="الم مفاصل وعظام", query="cardiology heart")
- \`search_doctors\`: specialty="<Specialty Name>" (e.g. specialty="Orthopedics", specialty="Cardiology", specialty="عظام")
- This immediately returns matching doctors, hospitals, specialties, and contact info in one single step without complex JSON!

👉 ALTERNATIVE DIRECT PARSE FLOW:
1. Find Specialty via \`query_parse_db\`: className="Specialties", where=\`{"nameEn": {"$regex": "Ortho", "$options": "i"}}\`
2. Find Doctors via \`query_parse_db\`: className="HospitalDoctorSpecialty", where=\`{"specialtyUid": "<UID>", "isDeleted": {"$ne": true}}\`, include="doctorDetails,hospitalDetails,specialtyDetails"

${SYMPTOM_AGENT_SCHEMA}

MANDATORY INSTRUCTION: LANGUAGE MATCHING & 100% COMPLETE RECORD PRESENTATION
CRITICAL:
1. 🌐 LANGUAGE MATCHING:
   - If the user wrote in **Arabic**: Respond 100% in natural **Arabic** (العربية), with Arabic table headers (\`## 📋 ملخص النتائج\`).
   - If the user wrote in **English**: Respond 100% in natural **English**, with English table headers (\`## 📋 Summary of Results\`).

2. ALWAYS RANK AND PRESENT RESULTS STRICTLY BY RELEVANCE (Top match 🥇 first).

3. WRITE OUT ALL AVAILABLE INFORMATION FOR EVERY RECOMMENDED DOCTOR (Full Name, Title, Qualifications, Experience, Rating, Hospital Address, Phone, Email).
`;

  return new LlmAgent({
    name: 'symptom_agent',
    description: 'Specialist agent for analyzing symptoms, mapping ailments to medical specialties, and recommending doctors and hospitals.',
    model: llmModel,
    instruction,
    tools: [semanticSearchTool, searchDoctorsTool, queryParseDbTool, countParseRecordsTool]
  });
}
