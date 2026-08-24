import http from 'http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

/**
 * Service to interact with local Ollama models (e.g. qwen3)
 */

export async function getOllamaModels() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_BASE_URL}/api/tags`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.models || []).map(m => ({
            id: m.name,
            name: `Ollama: ${m.name}`,
            provider: 'ollama',
            tag: 'Local LLM',
            description: `Local model running via Ollama (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`,
            category: 'local'
          }));
          
          if (!models.some(m => m.id.includes('qwen3'))) {
            models.unshift({
              id: 'qwen3:latest',
              name: 'Ollama: qwen3',
              provider: 'ollama',
              tag: 'Local Qwen',
              description: 'Alibaba Qwen3 state-of-the-art local model running via Ollama.',
              category: 'local'
            });
          }
          
          resolve({ status: 'online', models });
        } catch (err) {
          resolve({ status: 'online', models: [{ id: 'qwen3:latest', name: 'Ollama: qwen3', provider: 'ollama', tag: 'Local Qwen', description: 'Local Qwen3 model via Ollama.', category: 'local' }] });
        }
      });
    });

    req.on('error', () => {
      resolve({ status: 'offline', models: [] });
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ status: 'offline', models: [] });
    });
  });
}

/**
 * Streams chat responses from a local Ollama model using the ADK LlmAgent + OllamaLlm adapter.
 * Uses the same FunctionTool-based tool-call loop as the Gemini path.
 *
 * @param {object} params
 * @param {string} params.model - Ollama model name (e.g. 'qwen3:latest')
 * @param {Array}  params.messages - Chat history from the browser
 * @param {string} params.systemInstruction - System instruction for the agent
 * @param {number} params.temperature - Generation temperature
 * @param {string} params.sessionId - Unique chat ID (used as ADK session ID)
 * @param {Function} onChunk - SSE callback to stream text to the client
 */
export async function streamOllamaChatResponse({ model = 'qwen3:latest', messages = [], systemInstruction = '', temperature = 0.7, sessionId = 'default', sessionToken = null, userUid = null }, onChunk) {
  const { createOllamaLlmAgent, createRunner, ensureSession } = await import('./adkAgent.js');
  const { getFunctionCalls, getFunctionResponses } = await import('@google/adk');

  // Build agent + runner using the OllamaLlm ADK adapter
  const agent = createOllamaLlmAgent({ model, instruction: systemInstruction, sessionToken, userUid });
  const runner = createRunner(agent);

  const userId = 'ollama_user';
  await ensureSession(userId, sessionId, userUid ? { user_uid: userUid } : {});

  // Use only the last user message as the new turn input
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    throw new Error('No user message found in messages array.');
  }

  const parts = [];
  if (lastUserMsg.text && lastUserMsg.text.trim()) {
    parts.push({ text: lastUserMsg.text });
  }
  if (parts.length === 0) {
    parts.push({ text: lastUserMsg.text || 'Hello' });
  }
  const newMessage = { role: 'user', parts };

  // Notify the client that we're thinking (Ollama is non-streaming per request)
  onChunk('');

  // Run the ADK agent — yields typed Event objects
  const eventStream = runner.runAsync({ userId, sessionId, newMessage });

  let stepIndex = 0;
  let hasEmittedText = false;
  let lastToolSummary = '';

  try {
    for await (const event of eventStream) {
      // 1. Stream text content from model response events
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

      // 3. Detect and stream tool responses with full record presentation
      const responses = getFunctionResponses(event);
      if (responses && responses.length > 0) {
        for (const resp of responses) {
          const result = resp.response;
          if (result) {
            if (result.status === 'success') {
              const { formatToolExecutionSummary } = await import('./geminiService.js');
              lastToolSummary = formatToolExecutionSummary(result);
              onChunk(`\n> ✅ **Step ${stepIndex} Output:**\n${lastToolSummary}\n\n`);
            } else if (result.status === 'error') {
              onChunk(`\n> ❌ **Step ${stepIndex} Error:** ${result.message || 'Operation failed.'}\n\n`);
            }
          }
        }
      }
    }

    if (!hasEmittedText && stepIndex > 0 && lastToolSummary) {
      onChunk(`\n\n## 📋 Summary / ملخص النتائج\n\n${lastToolSummary}`);
    }
  } catch (streamErr) {
    console.error('Error during Ollama ADK execution:', streamErr);
    const { sessionService } = await import('./adkAgent.js');
    try {
      await sessionService.deleteSession({ appName: 'gemini_adk_chat', userId, sessionId });
    } catch (e) {}
    onChunk(`\n\n⚠️ **Notice:** An issue occurred during processing (${streamErr.message}). Session state was reset — please try asking your question again.`);
  }
}

