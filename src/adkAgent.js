import {
  LlmAgent,
  FunctionTool,
  Runner,
  Gemini,
  InMemorySessionService,
  FileArtifactService
} from '@google/adk';
import { WORKSPACE_DIR, executeWriteFile, executeReadFile, executeListFiles } from './agentTools.js';
import { queryParseClass, countParseClass, aggregateParseData } from './parseService.js';
import { OllamaLlm } from './ollamaLlm.js';

/**
 * Google ADK (Agent Development Kit) Service
 * Uses LlmAgent + FunctionTool for native tool-call loop management.
 * Includes Parse Database tools for querying live data.
 */

// ─── Shared Session Service (persists across requests in this process) ──────
export const sessionService = new InMemorySessionService();

// ─── ADK FileArtifactService ─────────────────────────────────────────────────
export const adkArtifactService = new FileArtifactService(WORKSPACE_DIR);

// ─── Parse Database Schema Description (injected into agent system instruction) ──
const PARSE_DB_SCHEMA = `
You have access to a medical/healthcare Parse Server database. Here are the available classes and their key fields:

**_User** — System users
Fields: objectId, username, email, phone, fullname, firstName, lastName, type, profileUrl, stripeCustomerId, deviceId, autoId

**Patients** — Patient medical records
Fields: objectId, uid, fullname, gender, nationality, bloodType, heartRate, bloodPressure, glucoseLevel, allergies, medications, profileUrl, dateOfBirth, email, phonenumber, preExistingConditions, countryOfResidence, cityOfResidence, address, weight (Number), height (Number), documentUrl, isPregnant (Boolean)

**PatientFamilyMembers** — Patient family members
Fields: objectId, patientUid, relation, gender, dateOfBirth, fullname

**Doctors** — Doctor profiles
Fields: objectId, uid, fullname, fullnameAr, title, positionEn, positionAr, qualificationsEn, qualificationsAr, yrsExp (Number), gender, profileUrl, averageRating (Number, default 0), email, phonenumber, isDeleted (Boolean), rank (Number), facebookUrl, instagramUrl, linkedinUrl

**Hospitals** — Hospital/clinic locations
Fields: objectId, uid, nameEn, nameAr, hospitalType, descEn, descAr, addressEn, addressAr, workingDaysHrs (Number), portfolioFileUrl, facebookUrl, instagramUrl, linkedinUrl, longitude (Number), latitude (Number), areaId, profileUrl, isDeleted (Boolean), rank (Number)

**Specialties** — Medical specialties
Fields: objectId, nameEn, nameAr, imageUrl, isDeleted (Boolean)

**HospitalDoctorSpecialty** — Links doctors to hospitals and specialties
Fields: objectId, hospitalUid, doctorUid, specialtyUid, isDeleted (Boolean)
Pointers: doctorDetails → Doctors, hospitalDetails → Hospitals, specialtyDetails → Specialties

**DoctorAppointments** — Doctor availability/schedule slots
Fields: objectId, hospitalUid, doctorUid, timeSlots (Array), sessionDuration (Number), every, startDate (Date), day, isDeleted (Boolean), isOnline (Boolean), price (Number), currency
Pointers: hospitalDetails → Hospitals, doctorDetails → Doctors

**PatientsBookings** — Patient appointment bookings
Fields: objectId, patientUid, doctorUid, hospitalUid, bookingDate (Date), slot, status (String: "confirmed","cancelled","completed","pending"), cancelledBy, isReviewed (Boolean), isOnline (Boolean), isVideoLinkGenerated (Boolean), packageUid, currency, isPackage (Boolean), sessionType, sessionIndex (Number), price (Number), paid (Number), packageInstanceUid, endAt (Date)
Pointers: doctorDetails → Doctors, patientDetails → Patients, hospitalDetails → Hospitals, packageDetails → Packages

**DoctorsReviews** — Patient reviews for doctors
Fields: objectId, patientUid, doctorUid, review, rating (Number), patientFullName, patientProfileUrl, appointmentUid, hospitalUid, isApproved (Boolean)

**Payments** — Payment transactions
Fields: objectId, amount, paymentId, paymentType, stripeCustomerId, paymentMethodId, currency, packageInstanceUid, patientUid, cardLast4, cardBrand
Pointers: patientBooking → PatientsBookings

**Packages** — Medical service packages
Fields: objectId, price (Number), currency, hospitalUid, detailsEn, detailsAr, procedureEn, procedureAr, timeframeEn, timeframeAr, paymentPercentage (Number), isDeleted (Boolean), isAssigned (Boolean)
Pointers: hospitalDetails → Hospitals

**HospitalDoctorPackages** — Links packages to doctors and hospitals
Fields: objectId, hospitalUid, doctorUid, packageUid, isDeleted (Boolean)
Pointers: hospitalDetails → Hospitals, doctorDetails → Doctors, packageDetails → Packages

**DoctorRanks** — Doctor ranking records
Fields: objectId, rankNumber (Number)
Pointers: doctor → Doctors

**ChatRooms** — Chat room sessions
Fields: objectId, chatId, createdBy, isGroup (Boolean), name, picture, sessionStatus, chatRoomName, blocked (Number), langAgent, langClient, reset (Boolean), udid, type, status (default "new"), currentAdmin, lastMsgId, lastMsgAt (Date)

**ChatRoomDetails** — Chat room membership details
Fields: objectId, chatId, isAdmin (Boolean), isLeave (Boolean), userId, userPhone, removedBy, addedBy, mutedUntil (Number), originalMember (Boolean), lastChatId, agentName, isTyping (Boolean), type, currentAdmin
Pointers: userDoctor → Doctors, userPatient → Patients, userAdmin → AdminProfile

**Messages** — Chat messages
Fields: objectId, chatId, senderId, text, type, status (Number), duration (Number), fileUrl, role, serviceId, MessageReply (Object), contactsDetail (Array), urlContent, autoId (Number), reactions (Array), reactionCounts (Object), thumbnail, filePath

**UserStatusMessage** — Message delivery/read status
Fields: objectId, chatId, messageId, userId, deliveredDate (Date), readDate (Date), pushed (Boolean)

**userStatus** — User online/offline status
Fields: objectId, userId, lastSeen (Date), mobileStatus (Number), webStatus (Number)

**VideoRooms** — Video call rooms
Fields: objectId, videoId, state, jwt, appointmentId, jwtPatient, jwtDoctor
Pointers: appointmentDetails → PatientsBookings

**VideoRoomDetails** — Video call participant details
Fields: objectId, videoId, userId, isAdmin (Boolean), userPhone, state, status, muted (Boolean)

**Cities** — City records
Fields: objectId, nameEn, nameAr, isDeleted (Boolean)

**Areas** — Area/district records
Fields: objectId, nameEn, nameAr, cityId, isDeleted (Boolean)

**TravAdmins** — Travel/admin profiles
Fields: objectId, name, profileUrl, uid, isDeleted (Boolean), type

**UserDocuments** — User uploaded documents
Fields: objectId, uid, documentUrl, documentName, appointmentId, uploaderType
Pointers: doctorDetails → Doctors

**AdminProfile** — Admin user profiles
Fields: objectId, isAdmin (Boolean), isSuperAdmin (Boolean), features (Array), scopeType, scopeHospitals (Array), scopeHospitalIds (Array), isDeleted (Boolean), uid, profileUrl, name, type, roomType, domain
Pointers: user → _User

**AdminRole** — Admin permission roles
Fields: objectId, name, features (Array)

**AdminUserRoles** — Maps users to admin roles
Fields: objectId
Pointers: user → _User, role → AdminRole

**AdminType** — Admin type catalog
Fields: objectId, key, label, domain, defaultScopeModel, requiredFeatures (Array), recommendedFeatures (Array), roomType, notes, active (Boolean), order (Number)

**AdminFeatureCatalog** — Admin feature catalog
Fields: objectId, key, label, resource, action, domain, description, group, order (Number), recommendedForTypes (Array)

**IMPORTANT QUERY GUIDELINES:**
- For text search, use: { "fieldName": { "$regex": "searchTerm", "$options": "i" } }
- For date comparisons, use ISO 8601 format: { "fieldName": { "$gte": { "__type": "Date", "iso": "2025-01-01T00:00:00.000Z" } } }
- For pointer includes, specify the pointer field name in the include parameter (e.g., "doctorDetails,hospitalDetails")
- For records that can be soft-deleted, always add { "isDeleted": { "$ne": true } } unless the user specifically asks for deleted records
- Use the "keys" parameter to only fetch needed fields when the query might return large results
- The "order" parameter uses comma-separated field names, prefix with - for descending (e.g., "-createdAt" for newest first)
- Use count_parse_records for "how many" questions — it's faster than fetching all results
- For "total revenue" or "average rating" type questions, try aggregate_parse_data with MongoDB pipeline
- When showing results, format them as a clean, readable table or list for the user
- **CRITICAL FALLBACK RULE ON TOOL ERROR**: If any database query tool returns an error or indicates that the database/server is offline or unreachable, YOU MUST NEVER STOP OR RETURN AN EMPTY RESPONSE. Instead, politely explain to the user in their language (e.g. Arabic or English) that live database lookup is temporarily unavailable, and then provide a thorough, comprehensive answer using your general knowledge (e.g., medical advice, general recommendations, symptoms to watch for, or standard procedures).
`;

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

// ─── Parse Database FunctionTools ────────────────────────────────────────────

/**
 * query_parse_db: Query any Parse database class with filters, sorting, pagination.
 */
export const queryParseDbTool = new FunctionTool({
  name: 'query_parse_db',
  description: 'Query the Parse database to fetch records from any class. Use this to answer questions about data like patients, doctors, bookings, hospitals, etc. You can filter, sort, paginate, select specific fields, and include pointer references.',
  parameters: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Parse class name to query (e.g., "Patients", "Doctors", "PatientsBookings", "Hospitals", "Messages", "ChatRooms", etc.)'
      },
      where: {
        type: 'string',
        description: 'JSON string of Parse query constraints. Examples: \'{"fullname":{"$regex":"Ahmed","$options":"i"}}\' for text search, \'{"status":"confirmed"}\' for exact match, \'{"averageRating":{"$gte":4}}\' for comparison. Leave empty for no filter.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 20, max: 100)'
      },
      skip: {
        type: 'number',
        description: 'Number of results to skip for pagination (default: 0)'
      },
      order: {
        type: 'string',
        description: 'Comma-separated fields to sort by. Prefix with - for descending. Example: "-createdAt" for newest first, "fullname" for alphabetical.'
      },
      include: {
        type: 'string',
        description: 'Comma-separated pointer fields to include/expand. Example: "doctorDetails,hospitalDetails" to include referenced objects.'
      },
      keys: {
        type: 'string',
        description: 'Comma-separated field names to return (projection). Example: "fullname,email,phone" to only fetch these fields.'
      }
    },
    required: ['className']
  },
  execute: async ({ className, where, limit = 20, skip = 0, order, include, keys, sessionToken }) => {
    try {
      let parsedWhere = {};
      if (where) {
        if (typeof where === 'object') {
          parsedWhere = where;
        } else if (typeof where === 'string' && where.trim()) {
          try {
            parsedWhere = JSON.parse(where);
          } catch (e) {
            return { status: 'error', message: `Invalid 'where' JSON: ${e.message}. Please provide valid JSON constraints.` };
          }
        }
      }

      const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
      const result = await queryParseClass(className, {
        where: parsedWhere,
        limit: safeLimit,
        skip: skip || 0,
        order: order || undefined,
        include: include || undefined,
        keys: keys || undefined,
        sessionToken
      });

      return {
        status: 'success',
        className: result.className,
        totalCount: result.count,
        returnedCount: result.results.length,
        results: result.results,
        message: `Found ${result.count} total record(s) in ${className}. Returning ${result.results.length} result(s).`
      };
    } catch (err) {
      return { status: 'error', message: `Failed to query '${className}': ${err.message}. The live database is currently offline or unreachable. Please inform the user politely and answer their question using your general knowledge.` };
    }
  }
});

/**
 * count_parse_records: Count records in a Parse class with optional filters.
 */
export const countParseRecordsTool = new FunctionTool({
  name: 'count_parse_records',
  description: 'Count the number of records in a Parse database class. Use this for "how many" questions — it is faster than fetching all results. Supports optional filters.',
  parameters: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Parse class name to count (e.g., "Patients", "Doctors", "PatientsBookings")'
      },
      where: {
        type: 'string',
        description: 'JSON string of Parse query constraints for filtering. Example: \'{"status":"confirmed"}\' to count only confirmed bookings. Leave empty to count all records.'
      }
    },
    required: ['className']
  },
  execute: async ({ className, where, sessionToken }) => {
    try {
      let parsedWhere = {};
      if (where) {
        if (typeof where === 'object') {
          parsedWhere = where;
        } else if (typeof where === 'string' && where.trim()) {
          try {
            parsedWhere = JSON.parse(where);
          } catch (e) {
            return { status: 'error', message: `Invalid 'where' JSON: ${e.message}` };
          }
        }
      }

      const result = await countParseClass(className, parsedWhere, sessionToken);
      return {
        status: 'success',
        className: result.className,
        count: result.count,
        message: `There are ${result.count} record(s) in ${className}${Object.keys(parsedWhere).length > 0 ? ' matching the given filter' : ' total'}.`
      };
    } catch (err) {
      return { status: 'error', message: `Failed to count '${className}': ${err.message}. The live database is currently offline or unreachable. Please inform the user politely and answer their question using your general knowledge.` };
    }
  }
});

/**
 * aggregate_parse_data: Run aggregation pipelines for analytics queries.
 */
export const aggregateParseDataTool = new FunctionTool({
  name: 'aggregate_parse_data',
  description: 'Run an aggregation pipeline on a Parse database class for analytics. Use this for statistical queries like total revenue, average ratings, group by status, etc. Uses MongoDB-style aggregation pipeline syntax.',
  parameters: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'The Parse class name to aggregate (e.g., "Payments", "PatientsBookings", "DoctorsReviews")'
      },
      pipeline: {
        type: 'string',
        description: 'JSON string of a MongoDB-style aggregation pipeline array. Example: \'[{"$group":{"objectId":"$status","count":{"$sum":1}}}]\' to count bookings per status. Example for matching + grouping: \'[{"$match":{"status":"completed"}},{"$group":{"objectId":null,"totalRevenue":{"$sum":"$price"}}}]\''
      }
    },
    required: ['className', 'pipeline']
  },
  execute: async ({ className, pipeline, sessionToken }) => {
    try {
      let parsedPipeline = [];
      if (pipeline) {
        if (Array.isArray(pipeline)) {
          parsedPipeline = pipeline;
        } else if (typeof pipeline === 'string' && pipeline.trim()) {
          try {
            parsedPipeline = JSON.parse(pipeline);
          } catch (e) {
            return { status: 'error', message: `Invalid pipeline JSON: ${e.message}` };
          }
        }
      }

      if (!Array.isArray(parsedPipeline)) {
        return { status: 'error', message: 'Pipeline must be a JSON array.' };
      }

      const result = await aggregateParseData(className, parsedPipeline, sessionToken);
      return {
        status: 'success',
        className: result.className,
        results: result.results,
        message: `Aggregation on ${className} returned ${Array.isArray(result.results) ? result.results.length : 1} result(s).`
      };
    } catch (err) {
      return { status: 'error', message: `Aggregation failed on '${className}': ${err.message}. The live database is currently offline or unreachable. Please inform the user politely and answer their question using your general knowledge.` };
    }
  }
});

// ─── All tools array factory ──────────────────────────────────────────────────
export function getAdkTools(sessionToken = null) {
  if (!sessionToken) {
    return [
      writeFileTool, readFileTool, listFilesTool,
      queryParseDbTool, countParseRecordsTool, aggregateParseDataTool
    ];
  }

  const queryTool = new FunctionTool({
    name: 'query_parse_db',
    description: queryParseDbTool.description,
    parameters: queryParseDbTool.parameters,
    execute: async (args) => queryParseDbTool.execute({ ...args, sessionToken })
  });

  const countTool = new FunctionTool({
    name: 'count_parse_records',
    description: countParseRecordsTool.description,
    parameters: countParseRecordsTool.parameters,
    execute: async (args) => countParseRecordsTool.execute({ ...args, sessionToken })
  });

  const aggTool = new FunctionTool({
    name: 'aggregate_parse_data',
    description: aggregateParseDataTool.description,
    parameters: aggregateParseDataTool.parameters,
    execute: async (args) => aggregateParseDataTool.execute({ ...args, sessionToken })
  });

  return [writeFileTool, readFileTool, listFilesTool, queryTool, countTool, aggTool];
}

// ─── Agent & Runner Factory ──────────────────────────────────────────────────

/**
 * Creates a new LlmAgent with Gemini backend, file tools, and Parse database tools.
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Gemini model ID (e.g. 'gemini-3.6-flash')
 * @param {string} instruction - System instruction for the agent
 * @param {string} [sessionToken] - Optional user Parse session token
 */
export function createLlmAgent({ apiKey, model = 'gemini-3.6-flash', instruction = '', sessionToken = null }) {
  const toolInstruction = `\n\nYou have access to file management tools: write_file, read_file, and list_files. Whenever the user asks to create, write, save, or generate a file, code, script, or document — always use the write_file tool to persist it to the workspace.`;

  const parseInstruction = `\n\nYou also have access to a live Parse Server database with the following tools: query_parse_db, count_parse_records, and aggregate_parse_data. Use these tools whenever the user asks questions about data, records, statistics, or anything that requires looking up information from the database.\n\n${PARSE_DB_SCHEMA}`;

  return new LlmAgent({
    name: 'chat_agent',
    model: new Gemini({ model, apiKey }),
    instruction: instruction + toolInstruction + parseInstruction,
    tools: getAdkTools(sessionToken)
  });
}

/**
 * Creates an LlmAgent backed by a local Ollama model (e.g. qwen3:latest).
 * Uses the OllamaLlm BaseLlm adapter so the full ADK tool-call loop works.
 * @param {string} model - Ollama model name (e.g. 'qwen3:latest')
 * @param {string} instruction - System instruction for the agent
 * @param {string} [sessionToken] - Optional user Parse session token
 */
export function createOllamaLlmAgent({ model = 'qwen3:latest', instruction = '', sessionToken = null }) {
  const toolInstruction = `\n\nYou have access to file management tools: write_file, read_file, and list_files. Whenever the user asks to create, write, save, or generate a file, code, script, or document — always use the write_file tool to persist it to the workspace.`;

  const parseInstruction = `\n\nYou also have access to a live Parse Server database with the following tools: query_parse_db, count_parse_records, and aggregate_parse_data. Use these tools whenever the user asks questions about data, records, statistics, or anything that requires looking up information from the database.\n\n${PARSE_DB_SCHEMA}`;

  return new LlmAgent({
    name: 'ollama_agent',
    model: new OllamaLlm({ model }),
    instruction: instruction + toolInstruction + parseInstruction,
    tools: getAdkTools(sessionToken)
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