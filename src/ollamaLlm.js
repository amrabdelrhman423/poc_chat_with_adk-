import http from 'http';
import { BaseLlm } from '@google/adk';

/**
 * OllamaLlm — a custom BaseLlm adapter for @google/adk that routes LLM requests
 * to a local Ollama instance. Supports streaming text AND tool calls via Ollama's
 * native /api/chat tool_calls protocol.
 *
 * Implements the generateContentAsync(llmRequest, stream) async generator interface
 * required by ADK's LlmAgent runner.
 */
export class OllamaLlm extends BaseLlm {
  static supportedModels = [/qwen.*/, /llama.*/, /mistral.*/, /phi.*/, /ollama:.*/];

  constructor({ model = 'qwen3:latest' } = {}) {
    super({ model });
    this.ollamaHost = process.env.OLLAMA_HOST || '127.0.0.1';
    this.ollamaPort = parseInt(process.env.OLLAMA_PORT || '11434', 10);
  }

  /**
   * ADK calls this with an LlmRequest and expects LlmResponse objects yielded.
   * @param {object} llmRequest - { contents, config, model }
   * @param {boolean} stream - Whether to stream
   */
  async *generateContentAsync(llmRequest, stream = false) {
    const messages = this._convertContentsToOllamaMessages(llmRequest);
    const tools = this._convertToolsToOllamaFormat(llmRequest);

    const payload = {
      model: llmRequest.model || this.model,
      messages,
      stream: false, // Ollama non-streaming for reliable tool_call parsing
      options: {
        temperature: llmRequest.config?.temperature ?? 0.3
      }
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    const responseBody = await this._callOllama(payload);
    const llmResponse = this._convertOllamaResponseToLlmResponse(responseBody);
    yield llmResponse;
  }

  /**
   * Converts Google ADK content format to Ollama messages array.
   * Handles text parts and functionCall/functionResponse parts.
   */
  _convertContentsToOllamaMessages(llmRequest) {
    const messages = [];

    // Add system instruction if present
    const systemInstruction = llmRequest.config?.systemInstruction;
    if (systemInstruction) {
      const sysText = typeof systemInstruction === 'string'
        ? systemInstruction
        : systemInstruction.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
      if (sysText) {
        messages.push({ role: 'system', content: sysText });
      }
    }

    for (const content of llmRequest.contents || []) {
      const role = content.role === 'user' ? 'user' : 'assistant';

      // Collect text parts
      const textParts = (content.parts || []).filter(p => p.text).map(p => p.text);

      // Collect function calls (model wants to call a tool)
      const functionCalls = (content.parts || []).filter(p => p.functionCall);

      // Collect function responses (tool result being returned to model)
      const functionResponses = (content.parts || []).filter(p => p.functionResponse);

      if (functionResponses.length > 0) {
        // Tool results go as 'tool' role messages in Ollama
        for (const part of functionResponses) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(part.functionResponse.response)
          });
        }
      } else if (functionCalls.length > 0) {
        // Model-side function calls — encode as assistant message with tool_calls
        messages.push({
          role: 'assistant',
          content: textParts.join('\n') || '',
          tool_calls: functionCalls.map(part => ({
            function: {
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            }
          }))
        });
      } else if (textParts.length > 0) {
        messages.push({ role, content: textParts.join('\n') });
      }
    }

    return messages;
  }

  /**
   * Converts ADK tool declarations (FunctionDeclaration format) to Ollama tool format.
   */
  _convertToolsToOllamaFormat(llmRequest) {
    const tools = [];
    for (const toolGroup of llmRequest.config?.tools || []) {
      for (const decl of toolGroup.functionDeclarations || []) {
        tools.push({
          type: 'function',
          function: {
            name: decl.name,
            description: decl.description || '',
            parameters: decl.parameters || { type: 'object', properties: {} }
          }
        });
      }
    }
    return tools;
  }

  /**
   * Converts Ollama /api/chat response to an ADK LlmResponse object.
   * Handles both text responses and tool_calls with resilient argument parsing and auto-repair.
   */
  _convertOllamaResponseToLlmResponse(body) {
    const msg = body.message || {};

    // Handle tool calls from Ollama
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const parts = [];

      // Include any text content alongside tool call
      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content });
      }

      for (const tc of msg.tool_calls) {
        const fnCall = tc.function || tc;
        let parsedArgs = {};

        if (typeof fnCall.arguments === 'object' && fnCall.arguments !== null) {
          parsedArgs = fnCall.arguments;
        } else if (typeof fnCall.arguments === 'string') {
          parsedArgs = this._repairAndParseJson(fnCall.arguments, {});
        }

        // Deep-clean stringified JSON fields inside arguments (such as 'where', 'pipeline', 'filters')
        for (const [key, value] of Object.entries(parsedArgs)) {
          if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
            try {
              // Test if it's stringified JSON and clean it up if broken
              parsedArgs[key] = this._cleanJsonString(value);
            } catch {
              // Keep original string if cleaning fails
            }
          }
        }

        parts.push({
          functionCall: {
            name: fnCall.name,
            args: parsedArgs
          }
        });
      }

      return {
        content: { role: 'model', parts },
        finishReason: 'STOP'
      };
    }

    // Plain text response
    const text = msg.content || (msg.thinking ? msg.thinking.trim() : '');
    return {
      content: {
        role: 'model',
        parts: [{ text }]
      },
      finishReason: body.done_reason === 'stop' ? 'STOP' : 'STOP'
    };
  }

  /**
   * Makes a POST request to the local Ollama /api/chat endpoint.
   */
  _callOllama(payload) {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(payload);

      const req = http.request({
        hostname: this.ollamaHost,
        port: this.ollamaPort,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama returned status ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Failed to connect to Ollama: ${err.message}`));
      });

      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Ollama request timed out (120s)'));
      });

      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Helper to safely parse and auto-repair broken JSON from Qwen.
   */
  _repairAndParseJson(input, fallback = {}) {
    if (!input || typeof input !== 'string') return fallback;
    const trimmed = input.trim();
    if (!trimmed) return fallback;

    // 1. Direct parse attempt
    try {
      return JSON.parse(trimmed);
    } catch {
      // 2. Auto-repair regex pass
      try {
        const cleaned = this._cleanJsonString(trimmed);
        return JSON.parse(cleaned);
      } catch {
        // 3. Fallback: if it starts with { or [, try wrapping or extracting
        const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) {
          try {
            return JSON.parse(this._cleanJsonString(match[0]));
          } catch {
            return fallback;
          }
        }
        return fallback;
      }
    }
  }

  /**
   * Cleans up common LLM JSON syntax artifacts (stray quotes, unescaped quotes, trailing commas).
   */
  _cleanJsonString(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/\]\s*\\*"\s*,/g, '],')           // Fix: ]", -> ],
      .replace(/\]\s*\\*"\s*\}/g, ']}')           // Fix: ]"} -> ]}
      .replace(/\}\s*\\*"\s*,/g, '},')           // Fix: }", -> },
      .replace(/,\s*([\}\]])/g, '$1')            // Fix trailing commas: ,} -> } or ,] -> ]
      .replace(/(['"])?([a-zA-Z0-9_$]+)(['"])?\s*:/g, '"$2":') // Quote unquoted keys
      .replace(/:\s*'([^']*)'/g, ':"$1"');       // Single quotes values to double quotes
  }
}

