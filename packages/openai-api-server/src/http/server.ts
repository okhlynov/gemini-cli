#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Socket } from 'node:net';
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

    // Track all connections to force close them on shutdown
    const connections = new Set<Socket>();
    server.on('connection', (conn: Socket) => {
      connections.add(conn);
      conn.on('close', () => {
        connections.delete(conn);
      });
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`[OpenAI API Server] Received ${signal}, shutting down...`);

      // Stop accepting new connections
      server.close(() => {
        logger.info('[OpenAI API Server] Server closed');
        process.exit(0);
      });

      // Force close all existing connections after a timeout
      setTimeout(() => {
        logger.warn(
          '[OpenAI API Server] Forcing closure of remaining connections...',
        );
        connections.forEach((conn) => conn.destroy());

        // Force exit after another timeout if server still hasn't closed
        setTimeout(() => {
          logger.error(
            '[OpenAI API Server] Forced exit after shutdown timeout',
          );
          process.exit(1);
        }, 1000);
      }, 5000); // 5 second grace period
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('[OpenAI API Server] Failed to start', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}
