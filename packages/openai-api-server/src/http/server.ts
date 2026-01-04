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

      // Immediately destroy all active connections (HTTP keep-alive connections)
      connections.forEach((conn) => conn.destroy());
      logger.info(
        `[OpenAI API Server] Closed ${connections.size} active connections`,
      );

      // Stop accepting new connections
      server.close(() => {
        logger.info('[OpenAI API Server] Server closed');
        process.exit(0);
      });

      // Fallback: Force exit if server doesn't close within 2 seconds
      setTimeout(() => {
        logger.error('[OpenAI API Server] Forced exit after timeout');
        process.exit(1);
      }, 2000);
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
