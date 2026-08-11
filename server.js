import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MODEL_CATALOG, streamChatResponse, generateImageWithImagen } from './src/geminiService.js';
import { getOllamaModels, streamOllamaChatResponse } from './src/ollamaService.js';
import { executeListFiles, executeReadFile, WORKSPACE_DIR } from './src/agentTools.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));
app.use('/workspace', express.static(WORKSPACE_DIR));

// API Routes

// 1. Get supported models (Both Google Gemini Cloud and Ollama Local Models)
app.get('/api/models', async (req, res) => {
  const geminiModels = MODEL_CATALOG.map(m => ({ ...m, provider: 'gemini' }));
  const ollamaInfo = await getOllamaModels();
  
  res.json({
    success: true,
    geminiModels: geminiModels,
    ollamaStatus: ollamaInfo.status,
    ollamaModels: ollamaInfo.models,
    models: [...ollamaInfo.models, ...geminiModels]
  });
});

// 2. Health check
app.get('/api/health', async (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
  const ollamaInfo = await getOllamaModels();
  res.json({
    status: 'online',
    hasApiKey: hasKey,
    ollamaStatus: ollamaInfo.status,
    timestamp: new Date().toISOString()
  });
});

// 3. Streaming Chat Endpoint (Handles both Gemini and Ollama Qwen with Tool Calling)
app.post('/api/chat', async (req, res) => {
  const { apiKey, model = 'qwen3', provider, messages, systemInstruction, temperature, topP, chatId } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required and cannot be empty.' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const isOllama = provider === 'ollama' || model.toLowerCase().includes('qwen') || model.toLowerCase().includes('ollama') || model.toLowerCase().includes('llama');

  // Use chatId as sessionId for ADK session management (default to 'default' if not provided)
  const sessionId = chatId || 'default';

  try {
    if (isOllama) {
      await streamOllamaChatResponse(
        { model, messages, systemInstruction, temperature, sessionId },
        (chunkText) => {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      );
    } else {
      await streamChatResponse(
        { apiKey, model, messages, systemInstruction, temperature, topP, sessionId },
        (chunkText) => {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      );
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Error streaming chat:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'An error occurred during chat response.' })}\n\n`);
    res.end();
  }
});


// 4. Image Generation Endpoint (Imagen 4.0)
app.post('/api/generate-image', async (req, res) => {
  const { apiKey, prompt, aspectRatio, numberOfImages } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  try {
    const images = await generateImageWithImagen({ apiKey, prompt, aspectRatio, numberOfImages });
    res.json({ success: true, images });
  } catch (err) {
    console.error('Error generating image:', err);
    res.status(500).json({ error: err.message || 'Failed to generate image.' });
  }
});

// 5. Workspace Files API Endpoints
app.get('/api/workspace/files', (req, res) => {
  const result = executeListFiles();
  res.json(result);
});

app.get('/api/workspace/file/*', (req, res) => {
  const filename = req.params[0];
  const result = executeReadFile({ filename });
  if (result.success) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

// Serve frontend for all unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Gemini & Ollama Qwen Chat App live at http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
