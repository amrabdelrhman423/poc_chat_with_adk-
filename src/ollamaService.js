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
export async function streamOllamaChatResponse({ model = 'qwen3:latest', messages = [], systemInstruction = '', temperature = 0.7, sessionId = 'default' }, onChunk) {
  const { createOllamaLlmAgent, createRunner, ensureSession } = await import('./adkAgent.js');
  const { getFunctionCalls, getFunctionResponses } = await import('@google/adk');

  // Build agent + runner using the OllamaLlm ADK adapter
  const agent = createOllamaLlmAgent({ model, instruction: systemInstruction });
  const runner = createRunner(agent);

  const userId = 'ollama_user';
  await ensureSession(userId, sessionId);

  // Use only the last user message as the new turn input
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    throw new Error('No user message found in messages array.');
  }

  const parts = [];
  if (lastUserMsg.text && lastUserMsg.text.trim()) {
    parts.push({ text: lastUserMsg.text });
  }
  const newMessage = { role: 'user', parts };

  // Notify the client that we're thinking (Ollama is non-streaming per request)
  onChunk('');

  // Run the ADK agent — yields typed Event objects
  const eventStream = runner.runAsync({ userId, sessionId, newMessage });

  for await (const event of eventStream) {
    const eventType = event.eventType;

    // Stream text content from model response events
    if (event.content && event.content.parts) {
      for (const part of event.content.parts) {
        if (part.text) {
          onChunk(part.text);
        }
      }
    }

    // Notify when the agent invokes a tool
    if (eventType === 'tool_call') {
      const calls = getFunctionCalls(event);
      for (const call of calls) {
        onChunk(`\n\n> 🔧 **Calling Tool: \`${call.name}\`**\n`);
      }
    }

    // Notify when a tool result is returned
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

