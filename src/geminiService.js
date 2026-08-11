import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getFunctionCalls, getFunctionResponses } from '@google/adk';
import { createLlmAgent, createRunner, ensureSession } from './adkAgent.js';

dotenv.config();

/**
 * Service to interact with Google Gemini models using the @google/adk LlmAgent + FunctionTool.
 */

// Available models metadata for the client UI
export const MODEL_CATALOG = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tag: 'Recommended',
    description: 'Fastest & smartest model for everyday coding, reasoning, and multimodal chat with file tools.',
    category: 'general'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tag: 'Pro',
    description: 'Versatile model with exceptional multimodal and long-context capabilities.',
    category: 'pro'
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    tag: 'Ultra-Fast',
    description: 'Lightweight model optimized for speed and high throughput.',
    category: 'fast'
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4.0',
    tag: 'Image Generation',
    description: 'Google state-of-the-art text-to-image generation model.',
    category: 'image'
  }
];

function getAIClient(customApiKey) {
  const key = customApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini API key is required. Please set GEMINI_API_KEY in .env or pass it in settings.');
  }
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Resolves the effective Gemini API key.
 */
function resolveApiKey(customApiKey) {
  const key = customApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini API key is required. Please set GEMINI_API_KEY in .env or pass it in settings.');
  }
  return key;
}

/**
 * Streams chat responses using the ADK LlmAgent + Runner with FunctionTool support.
 * The Runner manages the full tool-call loop: LLM → tool execution → result → LLM.
 *
 * @param {object} params
 * @param {string} params.apiKey - Gemini API key
 * @param {string} params.model - Gemini model ID
 * @param {Array}  params.messages - Chat history from the browser
 * @param {string} params.systemInstruction - Agent system instruction
 * @param {number} params.temperature - Generation temperature
 * @param {string} params.sessionId - Unique chat ID (used as ADK session ID)
 * @param {Function} onChunk - Callback to stream text chunks to the client
 */
export async function streamChatResponse(
  { apiKey, model = 'gemini-2.5-flash', messages = [], systemInstruction = '', temperature = 0.7, sessionId = 'default' },
  onChunk
) {
  const key = resolveApiKey(apiKey);

  // Build a fresh LlmAgent + Runner for this request
  const agent = createLlmAgent({ apiKey: key, model, instruction: systemInstruction });
  const runner = createRunner(agent);

  // Ensure a persistent session exists (keyed per chat)
  const userId = 'web_user';
  await ensureSession(userId, sessionId);

  // Extract only the last user message as the new input for this turn.
  // The ADK session service holds full history; we only send the latest message.
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    throw new Error('No user message found in messages array.');
  }

  // Build the ADK Content object for the new message
  const parts = [];
  if (lastUserMsg.text && lastUserMsg.text.trim()) {
    parts.push({ text: lastUserMsg.text });
  }

  // Handle inline images if present
  if (lastUserMsg.images && Array.isArray(lastUserMsg.images)) {
    for (const img of lastUserMsg.images) {
      if (typeof img === 'string' && img.startsWith('data:')) {
        const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      } else if (img && img.mimeType && img.data) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }
  }

  const newMessage = { role: 'user', parts };

  // Run the ADK agent — this async generator yields typed Event objects
  const eventStream = runner.runAsync({
    userId,
    sessionId,
    newMessage
  });

  for await (const event of eventStream) {
    const eventType = event.eventType;

    // Stream text content parts from model response events
    if (event.content && event.content.parts) {
      for (const part of event.content.parts) {
        if (part.text) {
          onChunk(part.text);
        }
      }
    }

    // Notify when the agent calls a tool (tool_call event: parts have functionCall)
    if (eventType === 'tool_call') {
      const calls = getFunctionCalls(event);
      for (const call of calls) {
        onChunk(`\n\n> 🔧 **Calling Tool: \`${call.name}\`**\n`);
      }
    }

    // Notify when a tool result comes back (tool_result event: parts have functionResponse)
    if (eventType === 'tool_result') {
      const responses = getFunctionResponses(event);
      for (const resp of responses) {
        const result = resp.response;
        if (result) {
          if (result.status === 'success' && result.filename) {
            onChunk(`> ✅ **File Saved**: \`workspace/${result.filename}\` (${result.bytesWritten || 0} bytes)\n\n`);
          } else if (result.status === 'success' && result.message) {
            onChunk(`> ✅ **Tool Result**: ${result.message}\n\n`);
          } else if (result.status === 'error') {
            onChunk(`> ❌ **Tool Error**: ${result.message}\n\n`);
          }
        }
      }
    }
  }
}

/**
 * Generates images using Google Imagen 4 model.
 */
export async function generateImageWithImagen({ apiKey, prompt, aspectRatio = '1:1', numberOfImages = 1 }) {
  const ai = getAIClient(apiKey);
  
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: numberOfImages,
      outputMimeType: 'image/jpeg',
      aspectRatio: aspectRatio,
    },
  });

  if (response.generatedImages && response.generatedImages.length > 0) {
    return response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
  }
  
  throw new Error('No image was returned from Imagen.');
}

