/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { startServer } from '@google/gemini-cli-openai-api-server';

/**
 * Starts the OpenAI API server mode
 */
export async function runOpenAIApiMode(
  config: Config,
  settings: LoadedSettings,
  port: number,
): Promise<void> {
  debugLogger.info(`Starting OpenAI API server on port ${port}...`);

  // Initialize the config to set up authentication and content generator
  await config.initialize();

  // Get the content generator from the config
  const contentGenerator = config.getContentGenerator();
  if (!contentGenerator) {
    throw new Error('Failed to initialize content generator');
  }

  debugLogger.info('Content generator initialized successfully');

  // Start the OpenAI API server
  await startServer(config, contentGenerator, port);

  // The server runs indefinitely until interrupted
  // No need to call process.exit() here as the server keeps the process alive
}
