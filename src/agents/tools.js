import { FunctionTool } from '@google/adk';
import { executeWriteFile, executeReadFile, executeListFiles } from '../agentTools.js';
import { queryParseClass, countParseClass, aggregateParseData } from '../parseService.js';

/**
 * File management tools
 */
/**
 * Safely parse JSON strings produced by LLMs with automatic syntax error recovery.
 */
function safeParseJson(input, fallback = {}) {
  if (!input) return fallback;
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  // 1. First standard attempt
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // 2. Attempt automatic repairs for common LLM hallucinations in JSON
    try {
      let cleaned = trimmed
        .replace(/\]\s*\\*"\s*,/g, '],')          // Fix: ]", -> ],
        .replace(/\]\s*\\*"\s*\}/g, ']}')          // Fix: ]"} -> ]}
        .replace(/\}\s*\\*"\s*,/g, '},')          // Fix: }", -> },
        .replace(/,\s*([\}\]])/g, '$1')           // Fix trailing commas: ,} -> } or ,] -> ]
        .replace(/(['"])?([a-zA-Z0-9_$]+)(['"])?\s*:/g, '"$2":') // Ensure keys are double-quoted
        .replace(/:\s*'([^']*)'/g, ':"$1"');      // Single quotes to double quotes

      return JSON.parse(cleaned);
    } catch (repairErr) {
      throw new Error(`Invalid JSON parameter (${e.message}): "${input.substring(0, 120)}"`);
    }
  }
}

export const writeFileTool = new FunctionTool({
  name: 'write_file',
  description: 'Create or overwrite a file in the workspace directory with the given content.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'The target filename or relative path' },
      content: { type: 'string', description: 'The exact text or code content to write' }
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

export const readFileTool = new FunctionTool({
  name: 'read_file',
  description: 'Read the contents of an existing file from the workspace directory.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'The filename or relative path to read' }
    },
    required: ['filename']
  },
  execute: async ({ filename }) => {
    const result = executeReadFile({ filename });
    if (result.success) {
      return { status: 'success', filename: result.filename, content: result.content };
    }
    return { status: 'error', message: result.error };
  }
});

export const listFilesTool = new FunctionTool({
  name: 'list_files',
  description: 'List all files currently stored in the workspace directory.',
  parameters: { type: 'object', properties: {} },
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

export const workspaceTools = [writeFileTool, readFileTool, listFilesTool];

/**
 * Creates Parse DB FunctionTools optionably bound to a user's sessionToken.
 * @param {string} [sessionToken] 
 */
export function createParseDbTools(sessionToken = null) {
  const queryParseDbTool = new FunctionTool({
    name: 'query_parse_db',
    description: 'Query the live Parse database to fetch records (Specialties, HospitalDoctorSpecialty, Doctors, Patients, Hospitals, PatientsBookings, Packages, etc.).',
    parameters: {
      type: 'object',
      properties: {
        className: {
          type: 'string',
          description: 'The Parse class name to query (e.g. "Specialties", "HospitalDoctorSpecialty", "Doctors", "Patients", "PatientsBookings", "Hospitals", "Packages")'
        },
        where: {
          type: 'string',
          description: 'JSON string of Parse query constraints. Examples: \'{"fullname":{"$regex":"Ahmed","$options":"i"}}\' for text search, \'{"status":"confirmed"}\' for exact match. Leave empty for no filter.'
        },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 20, max: 100)' },
        skip: { type: 'number', description: 'Number of results to skip for pagination (default: 0)' },
        order: { type: 'string', description: 'Comma-separated fields to sort by. Prefix with - for descending.' },
        include: { type: 'string', description: 'Comma-separated pointer fields to include/expand (e.g. "doctorDetails,hospitalDetails,specialtyDetails").' },
        keys: { type: 'string', description: 'Comma-separated field names to return (projection).' }
      },
      required: ['className']
    },
    execute: async ({ className, where, limit = 20, skip = 0, order, include, keys }) => {
      try {
        const parsedWhere = safeParseJson(where, {});
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
          message: `Found ${result.count} record(s) in ${result.className}. Returning ${result.results.length} result(s).`
        };
      } catch (err) {
        return { status: 'error', message: `Database query failed for '${className}': ${err.message}` };
      }
    }
  });

  const countParseRecordsTool = new FunctionTool({
    name: 'count_parse_records',
    description: 'Count the number of records in a Parse database class.',
    parameters: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'The Parse class name to count' },
        where: { type: 'string', description: 'JSON string of query constraints for filtering.' }
      },
      required: ['className']
    },
    execute: async ({ className, where }) => {
      try {
        const parsedWhere = safeParseJson(where, {});
        const result = await countParseClass(className, parsedWhere, sessionToken);
        return {
          status: 'success',
          className: result.className,
          count: result.count,
          message: `There are ${result.count} record(s) in ${result.className}.`
        };
      } catch (err) {
        return { status: 'error', message: `Database count failed for '${className}': ${err.message}` };
      }
    }
  });

  const aggregateParseDataTool = new FunctionTool({
    name: 'aggregate_parse_data',
    description: 'Run an aggregation pipeline on a Parse database class for analytics and summaries.',
    parameters: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'The Parse class name to aggregate' },
        pipeline: { type: 'string', description: 'JSON string of MongoDB-style aggregation pipeline array.' }
      },
      required: ['className', 'pipeline']
    },
    execute: async ({ className, pipeline }) => {
      try {
        const parsedPipeline = safeParseJson(pipeline, []);
        const result = await aggregateParseData(className, parsedPipeline, sessionToken);
        return {
          status: 'success',
          className: result.className,
          results: result.results,
          message: `Aggregation on ${result.className} returned results.`
        };
      } catch (err) {
        return { status: 'error', message: `Database aggregation failed for '${className}': ${err.message}` };
      }
    }
  });

  /**
   * Simplified, foolproof doctor search tool.
   * Requires only simple string/number parameters — no complex JSON required from the LLM.
   */
  const searchDoctorsTool = new FunctionTool({
    name: 'search_doctors',
    description: 'Search for doctors using simple parameters (name, specialty, gender, minimum rating, experience). Foolproof and does not require complex JSON.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Doctor name in Arabic or English (e.g. "منى ابوالغار", "Mona", "Ahmed", "طارق")' },
        specialty: { type: 'string', description: 'Medical specialty name in Arabic or English (e.g. "عظام", "Cardiology", "Dentistry")' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Doctor gender filter' },
        minRating: { type: 'number', description: 'Minimum average rating out of 5 (e.g. 4.0)' },
        minExperience: { type: 'number', description: 'Minimum years of experience' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 10)' }
      }
    },
    execute: async ({ name, specialty, gender, minRating, minExperience, limit = 10 }) => {
      try {
        const safeLimit = Math.min(Math.max(limit || 10, 1), 50);
        const whereClause = { isDeleted: { $ne: true } };

        if (gender) {
          whereClause.gender = gender;
        }
        if (typeof minRating === 'number' && minRating > 0) {
          whereClause.averageRating = { $gte: minRating };
        }
        if (typeof minExperience === 'number' && minExperience > 0) {
          whereClause.yrsExp = { $gte: minExperience };
        }

        // Clean up common title prefixes from doctor name (e.g. "دكتور جمال" -> "جمال")
        let cleanName = '';
        if (name && typeof name === 'string' && name.trim()) {
          cleanName = name.trim().replace(/^(دكتور|دكتورة|د\.|د\/|طبيب|dr\.|dr|doctor)\s+/i, '').trim();
          whereClause.$or = [
            { fullname: { $regex: cleanName, $options: 'i' } },
            { fullnameAr: { $regex: cleanName, $options: 'i' } },
            { positionEn: { $regex: cleanName, $options: 'i' } },
            { positionAr: { $regex: cleanName, $options: 'i' } }
          ];
        }

        let result = { results: [], count: 0 };

        // 1. If specialty is specified, resolve it via Specialties + HospitalDoctorSpecialty
        if (specialty && typeof specialty === 'string' && specialty.trim()) {
          const cleanSpecialty = specialty.trim();
          const specResult = await queryParseClass('Specialties', {
            where: {
              isDeleted: { $ne: true },
              $or: [
                { nameEn: { $regex: cleanSpecialty, $options: 'i' } },
                { nameAr: { $regex: cleanSpecialty, $options: 'i' } }
              ]
            },
            limit: 10,
            sessionToken
          });

          if (specResult.results && specResult.results.length > 0) {
            const specUids = specResult.results.map(s => s.objectId);
            const hdsResult = await queryParseClass('HospitalDoctorSpecialty', {
              where: {
                isDeleted: { $ne: true },
                specialtyUid: specUids.length === 1 ? specUids[0] : { $in: specUids }
              },
              limit: safeLimit * 5,
              include: 'doctorDetails,hospitalDetails,specialtyDetails',
              sessionToken
            });

            if (hdsResult.results && hdsResult.results.length > 0) {
              const seenDocIds = new Set();
              const matchedDoctors = [];

              for (const item of hdsResult.results) {
                const doc = item.doctorDetails;
                if (!doc || doc.isDeleted) continue;

                const docKey = doc.objectId || item.doctorUid;
                if (seenDocIds.has(docKey)) continue;

                // Apply gender filter
                if (gender && doc.gender !== gender) continue;

                // Apply minRating filter
                if (typeof minRating === 'number' && minRating > 0 && (doc.averageRating || 0) < minRating) continue;

                // Apply minExperience filter
                if (typeof minExperience === 'number' && minExperience > 0 && (doc.yrsExp || 0) < minExperience) continue;

                // Apply name / keyword filter if given
                if (cleanName) {
                  const nameRegex = new RegExp(cleanName, 'i');
                  const matchesName = nameRegex.test(doc.fullname || '') ||
                                      nameRegex.test(doc.fullnameAr || '') ||
                                      nameRegex.test(doc.positionEn || '') ||
                                      nameRegex.test(doc.positionAr || '');
                  if (!matchesName) continue;
                }

                seenDocIds.add(docKey);

                const specName = item.specialtyDetails
                  ? (item.specialtyDetails.nameAr ? `${item.specialtyDetails.nameEn} (${item.specialtyDetails.nameAr})` : item.specialtyDetails.nameEn)
                  : cleanSpecialty;

                const hospName = item.hospitalDetails
                  ? (item.hospitalDetails.nameEn || item.hospitalDetails.nameAr)
                  : '';

                const hospAddr = item.hospitalDetails
                  ? (item.hospitalDetails.addressEn || item.hospitalDetails.addressAr)
                  : '';

                matchedDoctors.push({
                  ...doc,
                  specialtyName: specName,
                  hospitalName: hospName,
                  hospitalAddress: hospAddr
                });
              }

              // Sort by rating desc, yrsExp desc
              matchedDoctors.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0) || (b.yrsExp || 0) - (a.yrsExp || 0));

              result.results = matchedDoctors.slice(0, safeLimit);
              result.count = matchedDoctors.length;
            }
          }
        } else {
          // No specialty specified: query Doctors collection directly
          result = await queryParseClass('Doctors', {
            where: whereClause,
            limit: safeLimit,
            order: '-averageRating,-yrsExp',
            sessionToken
          });
        }

        // 🧠 AUTOMATIC RAG FALLBACK: If Parse exact regex returned 0 results, query Qdrant vector database!
        if ((!result.results || result.results.length === 0) && (cleanName || specialty)) {
          const searchQuery = cleanName || specialty || name;
          try {
            const { semanticSearch } = await import('../ragService.js');
            const vectorHits = await semanticSearch(searchQuery, ['doctors', 'hospital_doctor_specialty'], safeLimit);
            const foundDoctors = [];
            const seenIds = new Set();

            if (vectorHits.doctors && vectorHits.doctors.length > 0) {
              for (const hit of vectorHits.doctors) {
                if (hit.payload && !seenIds.has(hit.payload.objectId)) {
                  seenIds.add(hit.payload.objectId);
                  foundDoctors.push({ ...hit.payload, relevanceScore: hit.score });
                }
              }
            }

            if (vectorHits.hospital_doctor_specialty && vectorHits.hospital_doctor_specialty.length > 0) {
              for (const hit of vectorHits.hospital_doctor_specialty) {
                const p = hit.payload;
                if (p && !seenIds.has(p.doctorUid || p.objectId)) {
                  seenIds.add(p.doctorUid || p.objectId);
                  foundDoctors.push({
                    fullname: p.doctorName,
                    fullnameAr: p.doctorNameAr,
                    positionEn: p.doctorPosition,
                    positionAr: p.doctorPositionAr,
                    qualificationsEn: p.doctorQualifications,
                    averageRating: p.doctorRating,
                    yrsExp: p.doctorYrsExp,
                    gender: p.doctorGender,
                    phonenumber: p.doctorPhone,
                    email: p.doctorEmail,
                    hospitalName: p.hospitalName,
                    hospitalAddress: p.hospitalAddress,
                    specialtyName: p.specialtyName,
                    relevanceScore: hit.score
                  });
                }
              }
            }

            if (foundDoctors.length > 0) {
              result.results = foundDoctors;
              result.count = foundDoctors.length;
            }
          } catch (ragErr) {
            console.warn('RAG fallback in search_doctors failed:', ragErr.message);
          }
        }

        // Pre-format detailed readable output for every doctor to guarantee complete presentation
        const formattedList = result.results.map((doc, idx) => {
          const lines = [
            `### 👨‍⚕️ Doctor ${idx + 1}: **${doc.fullname || 'Unknown'}** ${doc.fullnameAr ? `(${doc.fullnameAr})` : ''}`,
            `- 🩺 **Title / Position**: ${doc.positionEn || doc.title || 'Doctor'} ${doc.positionAr ? `/ ${doc.positionAr}` : ''}`,
            doc.specialtyName ? `- 🩺 **Specialty**: ${doc.specialtyName}` : null,
            doc.hospitalName ? `- 🏥 **Hospital**: ${doc.hospitalName} ${doc.hospitalAddress ? `(${doc.hospitalAddress})` : ''}` : null,
            doc.qualificationsEn ? `- 🎓 **Qualifications (EN)**: ${doc.qualificationsEn}` : null,
            doc.qualificationsAr ? `- 🎓 **المؤهلات (AR)**: ${doc.qualificationsAr}` : null,
            doc.yrsExp ? `- ⏳ **Experience**: ${doc.yrsExp} years (${doc.yrsExp} سنة خبرة)` : null,
            doc.averageRating ? `- ⭐ **Rating**: ${doc.averageRating} / 5 (${doc.averageRating} من 5)` : null,
            doc.gender ? `- 👤 **Gender**: ${doc.gender}` : null,
            doc.phonenumber ? `- 📞 **Phone / الهاتف**: ${doc.phonenumber}` : null,
            doc.email ? `- ✉️ **Email / البريد الإلكتروني**: ${doc.email}` : null,
            doc.relevanceScore ? `- 🎯 **Match Score**: ${(doc.relevanceScore * 100).toFixed(1)}%` : null
          ].filter(Boolean);
          return lines.join('\n');
        }).join('\n\n');

        return {
          status: 'success',
          count: result.results.length,
          totalAvailable: result.count,
          formattedDetails: formattedList || 'No doctors found matching criteria.',
          doctors: result.results,
          message: `Found ${result.results.length} doctor(s). Write out ALL the details above in your response!`
        };
      } catch (err) {
        return { status: 'error', message: `Doctor search failed: ${err.message}` };
      }
    }
  });

  /**
   * Simplified, foolproof hospital search tool.
   */
  const searchHospitalsTool = new FunctionTool({
    name: 'search_hospitals',
    description: 'Search for hospitals, clinics, or medical centers using simple string parameters.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hospital or clinic name in Arabic or English (e.g. "السلام", "Al Salam", "Cleopatra")' },
        hospitalType: { type: 'string', description: 'Type of facility (e.g. "Hospital", "Clinic", "Center")' },
        city: { type: 'string', description: 'City or area name (e.g. "Cairo", "Giza", "القاهرة")' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 10)' }
      }
    },
    execute: async ({ name, hospitalType, city, limit = 10 }) => {
      try {
        const safeLimit = Math.min(Math.max(limit || 10, 1), 50);
        const whereClause = { isDeleted: { $ne: true } };

        if (hospitalType) {
          whereClause.hospitalType = { $regex: hospitalType.trim(), $options: 'i' };
        }

        if (name && typeof name === 'string' && name.trim()) {
          const cleanName = name.trim();
          whereClause.$or = [
            { nameEn: { $regex: cleanName, $options: 'i' } },
            { nameAr: { $regex: cleanName, $options: 'i' } },
            { descEn: { $regex: cleanName, $options: 'i' } },
            { descAr: { $regex: cleanName, $options: 'i' } }
          ];
        }

        if (city && typeof city === 'string' && city.trim()) {
          const cleanCity = city.trim();
          if (!whereClause.$or) {
            whereClause.$or = [];
          }
          whereClause.$or.push(
            { addressEn: { $regex: cleanCity, $options: 'i' } },
            { addressAr: { $regex: cleanCity, $options: 'i' } }
          );
        }

        const result = await queryParseClass('Hospitals', {
          where: whereClause,
          limit: safeLimit,
          sessionToken
        });

        // Pre-format detailed readable output for every hospital
        const formattedList = result.results.map((hosp, idx) => {
          const lines = [
            `### 🏥 Hospital ${idx + 1}: **${hosp.nameEn || 'Unknown'}** ${hosp.nameAr ? `(${hosp.nameAr})` : ''}`,
            hosp.hospitalType ? `- 🏷️ **Type**: ${hosp.hospitalType}` : null,
            (hosp.addressEn || hosp.addressAr) ? `- 📍 **Address / العنوان**: ${hosp.addressEn || ''} ${hosp.addressAr ? `/ ${hosp.addressAr}` : ''}` : null,
            (hosp.descEn || hosp.descAr) ? `- 📝 **Description**: ${hosp.descEn || hosp.descAr}` : null,
            hosp.workingDaysHrs ? `- 🕒 **Working Hours**: ${hosp.workingDaysHrs}` : null
          ].filter(Boolean);
          return lines.join('\n');
        }).join('\n\n');

        return {
          status: 'success',
          count: result.results.length,
          totalAvailable: result.count,
          formattedDetails: formattedList || 'No hospitals found matching criteria.',
          hospitals: result.results,
          message: `Found ${result.results.length} hospital(s). Write out ALL the details above in your response!`
        };
      } catch (err) {
        return { status: 'error', message: `Hospital search failed: ${err.message}` };
      }
    }
  });

  return {
    queryParseDbTool,
    countParseRecordsTool,
    aggregateParseDataTool,
    searchDoctorsTool,
    searchHospitalsTool
  };
}

