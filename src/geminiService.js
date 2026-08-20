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
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Recommended',
    description: 'Latest & smartest flagship model for coding, reasoning, and multimodal agent tools.',
    category: 'general'
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (Latest)',
    tag: 'Fast & Reliable',
    description: 'Always points to the latest stable Flash model for general chat and tool calls.',
    category: 'general'
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'Balanced',
    description: 'High-speed model optimized for low latency and high quality.',
    category: 'fast'
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro (Latest)',
    tag: 'Pro Reasoning',
    description: 'Advanced reasoning model with deep analysis and long-context capabilities.',
    category: 'pro'
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

const SUPPORTED_GEMINI_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-pro-latest',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
]);

export function sanitizeGeminiModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return 'gemini-3.6-flash';
  const lower = modelId.toLowerCase().trim();
  if (SUPPORTED_GEMINI_MODELS.has(lower)) return lower;
  if (lower.includes('pro')) return 'gemini-pro-latest';
  if (lower.includes('lite')) return 'gemini-3.5-flash-lite';
  return 'gemini-3.6-flash';
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
  { apiKey, model = 'gemini-3.6-flash', messages = [], systemInstruction = '', temperature = 0.7, sessionId = 'default', sessionToken = null, userUid = null },
  onChunk
) {
  const key = resolveApiKey(apiKey);
  const effectiveModel = sanitizeGeminiModel(model);

  // Build a fresh LlmAgent + Runner for this request (uses Manager Agent with subAgents)
  const agent = createLlmAgent({ apiKey: key, model: effectiveModel, instruction: systemInstruction, sessionToken, userUid });
  const runner = createRunner(agent);

  // Ensure a persistent session exists (keyed per chat)
  const userId = 'web_user';
  await ensureSession(userId, sessionId, userUid ? { user_uid: userUid } : {});

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

  // Fallback if parts is still empty
  if (parts.length === 0) {
    parts.push({ text: lastUserMsg.text || 'Hello' });
  }

  const newMessage = { role: 'user', parts };

  // Run the ADK agent — this async generator yields typed Event objects
  const eventStream = runner.runAsync({
    userId,
    sessionId,
    newMessage
  });

  let stepIndex = 0;
  let hasEmittedText = false;
  let lastToolSummary = '';

  try {
    for await (const event of eventStream) {
      // 1. Stream text content parts from model response events
      if (event.content && event.content.parts) {
        for (const part of event.content.parts) {
          if (part.text && part.text.trim()) {
            hasEmittedText = true;
            onChunk(part.text);
          }
        }
      }

      // 2. Detect and stream tool calls
      const calls = getFunctionCalls(event);
      if (calls && calls.length > 0) {
        for (const call of calls) {
          stepIndex++;
          
          let formattedArgsStr = '';
          if (call.args && Object.keys(call.args).length > 0) {
            const cleanedArgs = { ...call.args };
            if (typeof cleanedArgs.where === 'string' && cleanedArgs.where.trim()) {
              try { cleanedArgs.where = JSON.parse(cleanedArgs.where); } catch (e) {}
            }
            if (typeof cleanedArgs.pipeline === 'string' && cleanedArgs.pipeline.trim()) {
              try { cleanedArgs.pipeline = JSON.parse(cleanedArgs.pipeline); } catch (e) {}
            }
            formattedArgsStr = JSON.stringify(cleanedArgs, null, 2);
          }

          let stepMarkdown = `\n\n> 🔍 **Step ${stepIndex}: Executing Tool \`${call.name}\`**\n`;
          if (formattedArgsStr) {
            stepMarkdown += `> 📥 **Parameters:**\n\`\`\`json\n${formattedArgsStr}\n\`\`\`\n`;
          } else {
            stepMarkdown += `> 📥 **Parameters:** *(None)*\n`;
          }

          onChunk(stepMarkdown);
        }
      }

      // 3. Detect and stream tool responses
      const responses = getFunctionResponses(event);
      if (responses && responses.length > 0) {
        for (const resp of responses) {
          const result = resp.response;
          if (result) {
            if (result.status === 'success') {
              let detailedSummary = result.message || `Query completed for ${result.className || 'workspace'}.`;
              if (result.results && Array.isArray(result.results) && result.results.length > 0) {
                const recordsList = result.results.map((r, i) => {
                  const name = r.fullname || r.fullnameAr || r.nameEn || r.nameAr || r.detailsEn || r.objectId || `Record #${i+1}`;
                  const details = [];
                  if (r.title || r.positionAr || r.positionEn) details.push(`Title: ${r.title || r.positionAr || r.positionEn}`);
                  if (r.specialtyDetails?.nameEn || r.specialtyDetails?.nameAr) details.push(`Specialty: ${r.specialtyDetails.nameEn || r.specialtyDetails.nameAr}`);
                  if (r.hospitalDetails?.nameEn || r.hospitalDetails?.nameAr) details.push(`Hospital: ${r.hospitalDetails.nameEn || r.hospitalDetails.nameAr}`);
                  if (r.doctorDetails?.fullname || r.doctorDetails?.fullnameAr) details.push(`Doctor: ${r.doctorDetails.fullname || r.doctorDetails.fullnameAr}`);
                  if (r.averageRating) details.push(`Rating: ⭐${r.averageRating}/5`);
                  if (r.yrsExp) details.push(`Experience: ${r.yrsExp} yrs`);
                  if (r.price) details.push(`Price: ${r.price} ${r.currency || ''}`);
                  if (r.status) details.push(`Status: ${r.status}`);
                  if (r.bookingDate) details.push(`Date: ${new Date(r.bookingDate.iso || r.bookingDate).toLocaleDateString()}`);
                  if (r.phonenumber) details.push(`Phone: ${r.phonenumber}`);

                  return `  ${i + 1}. **${name}** ${details.length > 0 ? `(${details.join(' | ')})` : ''}`;
                }).join('\n');

                detailedSummary = `Found ${result.results.length} record(s) in **${result.className}**:\n${recordsList}`;
              } else if (result.count !== undefined) {
                detailedSummary += ` — **Total Count:** \`${result.count}\``;
              } else if (result.filename) {
                detailedSummary += ` — **File Saved:** \`workspace/${result.filename}\``;
              }

              lastToolSummary = detailedSummary;
              onChunk(`> ✅ **Step ${stepIndex} Output:** ${lastToolSummary}\n\n`);
            } else if (result.status === 'error') {
              onChunk(`> ❌ **Step ${stepIndex} Error:** ${result.message}\n\n`);
            }
          }
        }
      }
    }

    if (!hasEmittedText && stepIndex > 0 && lastToolSummary) {
      onChunk(`\n\n## 📋 Summary / ملخص النتائج\n${lastToolSummary}`);
    }
  } catch (streamErr) {
    console.error('Error during Gemini ADK execution:', streamErr);
    const { sessionService } = await import('./adkAgent.js');
    try {
      await sessionService.deleteSession({ appName: 'gemini_adk_chat', userId, sessionId });
    } catch (e) {}
    onChunk(`\n\n⚠️ **Notice:** An issue occurred during processing (${streamErr.message}). Session state was reset — please try asking your question again.`);
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

