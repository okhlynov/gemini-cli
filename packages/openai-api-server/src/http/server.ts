#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '../config/logger.js';
import { createApp } from './app.js';
import type { Config, ContentGenerator } from '@google/gemini-cli-core';

/**
 * Starts the OpenAI API server
 *
 * @param config - The Gemini CLI configuration
 * @param contentGenerator - The content generator instance
 * @param port - The port to listen on (default: 8080)
 */
export async function startServer(
  config: Config,
  contentGenerator: ContentGenerator,
  port: number = 8080,
): Promise<void> {
  try {
    const app = await createApp(config, contentGenerator);

    const server = app.listen(port, () => {
      logger.info(`[OpenAI API Server] Started on http://localhost:${port}`);
      logger.info(
        `[OpenAI API Server] Chat completions: http://localhost:${port}/v1/chat/completions`,
      );
      logger.info(
        `[OpenAI API Server] Models list: http://localhost:${port}/v1/models`,
      );
      logger.info(
        `[OpenAI API Server] Health check: http://localhost:${port}/health`,
      );
      logger.info(`[OpenAI API Server] Press Ctrl+C to stop`);
    });

    // Graceful shutdown
    const shutdown = () => {
      logger.info('[OpenAI API Server] Shutting down...');
      server.close(() => {
        logger.info('[OpenAI API Server] Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('[OpenAI API Server] Failed to start', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}
