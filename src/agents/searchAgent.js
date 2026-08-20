import { LlmAgent } from '@google/adk';
import { SEARCH_AGENT_SCHEMA } from './dbSchema.js';
import { createParseDbTools } from './tools.js';

/**
 * Creates the Search Agent specialized in direct lookup of doctors, hospitals, packages, and reviews.
 *
 * @param {object} params
 * @param {object} params.llmModel - The instantiated Llm (Gemini or OllamaLlm)
 * @param {string} [params.sessionToken] - Parse user session token
 */
export function createSearchAgent({ llmModel, sessionToken = null }) {
  const { queryParseDbTool, countParseRecordsTool, aggregateParseDataTool } = createParseDbTools(sessionToken);

  const instruction = `You are a specialized Medical Search Agent.
Your role is to handle direct user searches for specific doctors, hospitals, clinics, medical packages, and patient reviews.

${SEARCH_AGENT_SCHEMA}

SEARCH WORKFLOWS:

1. DIRECT DOCTOR SEARCH (by name):
Query "Doctors":
- \`className\`: "Doctors"
- \`where\`: \`{"$or": [{"fullname": {"$regex": "name", "$options": "i"}}, {"fullnameAr": {"$regex": "name", "$options": "i"}}], "isDeleted": {"$ne": true}}\`

2. HOSPITAL / CLINIC SEARCH (by name, area, or type):
Query "Hospitals":
- \`className\`: "Hospitals"
- \`where\`: \`{"$or": [{"nameEn": {"$regex": "term", "$options": "i"}}, {"nameAr": {"$regex": "term", "$options": "i"}}], "isDeleted": {"$ne": true}}\`

3. MEDICAL PACKAGES SEARCH:
Query "Packages":
- \`className\`: "Packages"
- \`where\`: \`{"isDeleted": {"$ne": true}}\`
- \`include\`: "hospitalDetails"

4. DOCTOR REVIEWS & RATINGS:
Query "DoctorsReviews":
- \`className\`: "DoctorsReviews"
- \`where\`: \`{"doctorUid": "<doctor_uid>", "isApproved": true}\`

MANDATORY INSTRUCTION: DETAILED RECORD PRESENTATION (NO GENERIC COUNTS)
CRITICAL: DO NOT JUST SAY "Found 3 records" OR GIVE A GENERIC COUNT!
1. YOU MUST INSPECT EVERY SINGLE RECORD in the "results" array returned by the tool.
2. YOU MUST WRITE OUT THE DETAILED DATA FOR ALL RETURNED RECORDS in clear, natural human language.
3. For EACH doctor, hospital, or package found:
   - Provide full names (English & Arabic), titles, specialties, ratings, hospital locations, prices, procedures, phone numbers, and addresses.
4. Conclude with a dedicated summary section:
   ## 📋 Summary / ملخص النتائج
   Presenting all records in a clear Markdown table alongside natural language descriptions for every item found.
5. Never output raw JSON or unformatted database object IDs. Always respond in the language used by the user.
`;

  return new LlmAgent({
    name: 'search_agent',
    description: 'Specialist agent for searching specific doctors by name, hospitals/clinics by location, medical service packages, and reviews.',
    model: llmModel,
    instruction,
    tools: [queryParseDbTool, countParseRecordsTool, aggregateParseDataTool]
  });
}
