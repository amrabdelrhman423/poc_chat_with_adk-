import { FunctionTool } from '@google/adk';
import { executeWriteFile, executeReadFile, executeListFiles } from '../agentTools.js';
import { queryParseClass, countParseClass, aggregateParseData } from '../parseService.js';

/**
 * File management tools
 */
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
        let parsedWhere = {};
        if (where) {
          if (typeof where === 'object') {
            parsedWhere = where;
          } else if (typeof where === 'string' && where.trim()) {
            try { parsedWhere = JSON.parse(where); } catch (e) {
              return { status: 'error', message: `Invalid 'where' JSON: ${e.message}.` };
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
        let parsedWhere = {};
        if (where) {
          if (typeof where === 'object') {
            parsedWhere = where;
          } else if (typeof where === 'string' && where.trim()) {
            try { parsedWhere = JSON.parse(where); } catch (e) {
              return { status: 'error', message: `Invalid 'where' JSON: ${e.message}` };
            }
          }
        }
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
        let parsedPipeline = [];
        if (pipeline) {
          if (Array.isArray(pipeline)) parsedPipeline = pipeline;
          else if (typeof pipeline === 'string' && pipeline.trim()) {
            try { parsedPipeline = JSON.parse(pipeline); } catch (e) {
              return { status: 'error', message: `Invalid pipeline JSON: ${e.message}` };
            }
          }
        }
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

  return { queryParseDbTool, countParseRecordsTool, aggregateParseDataTool };
}
