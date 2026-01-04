/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';
import {
  transformOpenAIRequestToGemini,
  type OpenAIChatCompletionRequest,
} from '../transformers/openai-to-gemini.js';
import {
  transformGeminiResponseToOpenAI,
  transformGeminiStreamChunkToOpenAI,
  formatStreamChunk,
  formatStreamDone,
} from '../transformers/gemini-to-openai.js';
import type { Config, ContentGenerator } from '@google/gemini-cli-core';

/**
 * Context object containing configuration and dependencies
 */
interface ServerContext {
  config: Config;
  contentGenerator: ContentGenerator;
}

/**
 * Handles POST /v1/chat/completions endpoint
 */
async function handleChatCompletions(
  req: Request,
  res: Response,
  context: ServerContext,
): Promise<void> {
  const requestId = `chatcmpl-${uuidv4()}`;

  try {
    const openaiRequest = req.body as OpenAIChatCompletionRequest;

    // Validate request
    if (!openaiRequest.messages || !Array.isArray(openaiRequest.messages)) {
      res.status(400).json({
        error: {
          message: 'Invalid request: messages must be an array',
          type: 'invalid_request_error',
        },
      });
      return;
    }

    if (openaiRequest.messages.length === 0) {
      res.status(400).json({
        error: {
          message: 'Invalid request: messages array cannot be empty',
          type: 'invalid_request_error',
        },
      });
      return;
    }

    // Transform OpenAI request to Gemini format
    const geminiRequestBase = transformOpenAIRequestToGemini(openaiRequest);

    // Get the model name (use from request or default from config)
    const modelName = openaiRequest.model || context.config.getModel();

    // Gemini API requires model names to be prefixed with 'models/'
    const model = modelName.startsWith('models/')
      ? modelName
      : `models/${modelName}`;

    // Add model to the request
    const geminiRequest = {
      ...geminiRequestBase,
      model,
    };

    logger.info(`[OpenAI API] Processing chat completion request`, {
      requestId,
      model,
      messageCount: openaiRequest.messages.length,
      stream: openaiRequest.stream || false,
    });

    // Handle streaming vs non-streaming
    if (openaiRequest.stream) {
      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        // Generate streaming response
        const streamGenerator =
          await context.contentGenerator.generateContentStream(
            geminiRequest,
            requestId,
          );

        let isFirst = true;
        for await (const geminiResponse of streamGenerator) {
          // Transform Gemini chunk to OpenAI format
          const openaiChunk = transformGeminiStreamChunkToOpenAI(
            geminiResponse,
            requestId,
            model,
            isFirst,
          );

          // Send as Server-Sent Event
          res.write(formatStreamChunk(openaiChunk));
          isFirst = false;
        }

        // Send completion marker
        res.write(formatStreamDone());
        res.end();

        logger.info(`[OpenAI API] Streaming response completed`, {
          requestId,
        });
      } catch (streamError) {
        logger.error(`[OpenAI API] Error during streaming`, {
          requestId,
          error:
            streamError instanceof Error
              ? streamError.message
              : String(streamError),
        });

        // If we haven't sent any data yet, send an error response
        if (!res.headersSent) {
          res.status(500).json({
            error: {
              message:
                streamError instanceof Error
                  ? streamError.message
                  : 'Streaming error',
              type: 'server_error',
            },
          });
          return;
        }
        // Otherwise just end the stream
        res.end();
      }
    } else {
      // Non-streaming response
      const geminiResponse = await context.contentGenerator.generateContent(
        geminiRequest,
        requestId,
      );

      // Transform Gemini response to OpenAI format
      const openaiResponse = transformGeminiResponseToOpenAI(
        geminiResponse,
        requestId,
        model,
      );

      logger.info(`[OpenAI API] Non-streaming response completed`, {
        requestId,
        usage: openaiResponse.usage,
      });

      res.status(200).json(openaiResponse);
    }
  } catch (error) {
    logger.error(`[OpenAI API] Error processing request`, {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: {
        message:
          error instanceof Error ? error.message : 'Internal server error',
        type: 'server_error',
      },
    });
  }
}

/**
 * Handles GET /v1/models endpoint (returns available models)
 */
function handleListModels(
  req: Request,
  res: Response,
  _context: ServerContext,
) {
  // List of available Gemini models
  // Note: This is a curated list of publicly available models
  // Update this list as new models become available
  const availableModels = [
    // Gemini 2.0 models
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-thinking-exp-01-21',
    'gemini-2.0-flash-thinking-exp',

    // Gemini 2.5 models (if available)
    'gemini-2.5-flash-lite',

    // Gemini 3.0 models (experimental/preview)
    'gemini-3-flash-preview',

    // Experimental models
    'gemini-exp-1206',
    'gemini-exp-1121',
    'gemini-exp-1114',
    'learnlm-1.5-pro-experimental',

    // Gemini 1.5 models (stable)
    'gemini-1.5-pro',
    'gemini-1.5-pro-002',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-8b-latest',
  ];

  const models = availableModels.map((modelId) => ({
    id: modelId,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'google',
  }));

  return res.status(200).json({
    object: 'list',
    data: models,
  });
}

/**
 * Creates and configures the Express app
 */
export async function createApp(
  config: Config,
  contentGenerator: ContentGenerator,
): Promise<express.Application> {
  const app = express();

  const context: ServerContext = {
    config,
    contentGenerator,
  };

  // Middleware
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    logger.debug(`[OpenAI API] ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // OpenAI-compatible endpoints
  app.post('/v1/chat/completions', (req, res) => {
    void handleChatCompletions(req, res, context);
  });

  app.get('/v1/models', (req, res) => {
    handleListModels(req, res, context);
  });

  // Root endpoint - basic info
  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'Gemini CLI OpenAI API Server',
      version: '0.1.0',
      endpoints: {
        chat_completions: '/v1/chat/completions',
        models: '/v1/models',
        health: '/health',
      },
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: `Endpoint ${req.path} not found`,
        type: 'invalid_request_error',
      },
    });
  });

  // Error handler
  app.use(
    (err: Error, req: Request, res: Response, _next: express.NextFunction) => {
      logger.error(`[OpenAI API] Unhandled error`, {
        error: err.message,
        stack: err.stack,
        path: req.path,
      });

      res.status(500).json({
        error: {
          message: 'Internal server error',
          type: 'server_error',
        },
      });
    },
  );

  return app;
}
