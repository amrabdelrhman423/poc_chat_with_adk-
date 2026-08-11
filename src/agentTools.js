import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace Directory Path
export const WORKSPACE_DIR = path.join(path.dirname(__dirname), 'workspace');

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

/**
 * Tool Declarations for Google ADK / @google/genai SDK
 */
export const ADK_TOOLS_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'write_file',
        description: 'Create or overwrite a file in the workspace directory with specified content.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: {
              type: 'STRING',
              description: 'Target filename or relative path (e.g. index.html, server.py, notes.txt, styles/main.css)'
            },
            content: {
              type: 'STRING',
              description: 'The exact text or code content to write into the file'
            }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of an existing file in the workspace directory.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: {
              type: 'STRING',
              description: 'Target filename to read from the workspace'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'list_files',
        description: 'List all existing files currently stored in the workspace directory.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

/**
 * Safely resolve target filepath inside WORKSPACE_DIR to prevent path traversal outside workspace.
 */
function resolveWorkspacePath(filename) {
  const sanitized = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
  const resolvedPath = path.join(WORKSPACE_DIR, sanitized);
  
  if (!resolvedPath.startsWith(WORKSPACE_DIR)) {
    throw new Error('Access denied: Filename path traversal outside workspace directory is not allowed.');
  }
  return resolvedPath;
}

/**
 * Tool Execution Handlers
 */

export function executeWriteFile({ filename, content }) {
  try {
    const targetPath = resolveWorkspacePath(filename);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    const relativePath = path.relative(WORKSPACE_DIR, targetPath).replace(/\\/g, '/');
    
    return {
      success: true,
      filename: relativePath,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
      message: `File '${relativePath}' successfully created/updated in workspace.`
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write file '${filename}': ${err.message}`
    };
  }
}

export function executeReadFile({ filename }) {
  try {
    const targetPath = resolveWorkspacePath(filename);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `File '${filename}' does not exist in workspace.` };
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    const relativePath = path.relative(WORKSPACE_DIR, targetPath).replace(/\\/g, '/');
    
    return {
      success: true,
      filename: relativePath,
      content: content
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file '${filename}': ${err.message}`
    };
  }
}

export function executeListFiles() {
  try {
    const files = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else {
          const relPath = path.relative(WORKSPACE_DIR, fullPath).replace(/\\/g, '/');
          const stats = fs.statSync(fullPath);
          files.push({
            name: relPath,
            size: stats.size,
            updatedAt: stats.mtime
          });
        }
      }
    }

    scanDir(WORKSPACE_DIR);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
}

/**
 * Main router to execute function calls by name
 */
export function handleToolExecution(functionName, args) {
  switch (functionName) {
    case 'write_file':
      return executeWriteFile(args);
    case 'read_file':
      return executeReadFile(args);
    case 'list_files':
      return executeListFiles();
    default:
      return { success: false, error: `Unknown tool: ${functionName}` };
  }
}
