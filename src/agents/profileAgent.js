import { LlmAgent } from '@google/adk';
import { PROFILE_AGENT_SCHEMA } from './dbSchema.js';
import { createParseDbTools } from './tools.js';

/**
 * Creates the Profile Agent specialized in logged-in user personal data retrieval.
 * Queries appointment bookings, patient profile, payments, and family members.
 *
 * @param {object} params
 * @param {object} params.llmModel - The instantiated Llm (Gemini or OllamaLlm)
 * @param {string} [params.sessionToken] - Parse user session token
 * @param {string} [params.userUid] - Authenticated user's UID or objectId
 */
export function createProfileAgent({ llmModel, sessionToken = null, userUid = null }) {
  const { queryParseDbTool, countParseRecordsTool, aggregateParseDataTool } = createParseDbTools(sessionToken);

  const userContextPrompt = userUid
    ? `\n\nLOGGED IN USER CONTEXT:\nThe current logged-in user's UID/objectId is: "${userUid}". Use this value when querying records for the logged-in user.`
    : `\n\nLOGGED IN USER CONTEXT:\nThe query is authenticated using the user's session token. When querying user records, filter by the patientUid associated with the current session.`;

  const instruction = `You are a specialized User Profile & Bookings Agent.
Your role is to retrieve and display personal medical information for the currently logged-in user, such as their appointment bookings, medical records, payments, and family member details.

${PROFILE_AGENT_SCHEMA}
${userContextPrompt}

USER DATA WORKFLOWS:

1. MY BOOKINGS / APPOINTMENTS:
Query "PatientsBookings":
- \`className\`: "PatientsBookings"
- \`where\`: Filter by \`patientUid\` (e.g. \`{"patientUid": "${userUid || '<USER_UID>'}"}\`)
- \`include\`: "doctorDetails,hospitalDetails,packageDetails"
- \`order\`: "-bookingDate" (newest first)

2. MY PATIENT PROFILE / MEDICAL RECORD:
Query "Patients":
- \`className\`: "Patients"
- \`where\`: Filter by \`uid\` or \`objectId\` (e.g. \`{"uid": "${userUid || '<USER_UID>'}"}\`)

3. MY PAYMENTS & TRANSACTIONS:
Query "Payments":
- \`className\`: "Payments"
- \`where\`: Filter by \`patientUid\` (e.g. \`{"patientUid": "${userUid || '<USER_UID>'}"}\`)
- \`include\`: "patientBooking"

4. MY FAMILY MEMBERS:
Query "PatientFamilyMembers":
- \`className\`: "PatientFamilyMembers"
- \`where\`: Filter by \`patientUid\` (e.g. \`{"patientUid": "${userUid || '<USER_UID>'}"}\`)

CRITICAL SECURITY, PRIVACY & MANDATORY RECORD PRESENTATION RULES:
- Always scope queries to the logged-in user's UID/objectId.
- If no session token or user UID is present and user asks for personal data, kindly prompt them to log in first.

MANDATORY INSTRUCTION: LANGUAGE MATCHING & 100% COMPLETE RECORD PRESENTATION
CRITICAL:
1. 🌐 LANGUAGE MATCHING:
   - If the user wrote in **Arabic**: Respond 100% in natural **Arabic** (العربية), with Arabic table headers (\`## 📋 ملخص الحجوزات والبيانات\`).
   - If the user wrote in **English**: Respond 100% in natural **English**, with English table headers (\`## 📋 Summary of Bookings & Profile\`).

2. YOU MUST WRITE OUT THE FULL DETAILED DATA FOR EVERY SINGLE RECORD in clear, natural human language (Booking Date, Doctor, Specialty, Hospital, Status, Price, Payment).
`;

  return new LlmAgent({
    name: 'profile_agent',
    description: 'Specialist agent for retrieving personal data for the logged-in user, including appointment bookings, patient medical profile, payment history, and family members.',
    model: llmModel,
    instruction,
    tools: [queryParseDbTool, countParseRecordsTool, aggregateParseDataTool]
  });
}
