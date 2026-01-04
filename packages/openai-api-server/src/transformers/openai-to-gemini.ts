/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, GenerateContentParameters } from '@google/genai';

/**
 * OpenAI Chat Completion API message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI Chat Completion API request format
 */
export interface OpenAIChatCompletionRequest {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  stop?: string | string[];
  n?: number;
}

/**
 * Transforms OpenAI role to Gemini role
 */
function transformRole(openaiRole: string): 'user' | 'model' {
  // Map OpenAI roles to Gemini roles
  // OpenAI: system, user, assistant
  // Gemini: user, model
  // Note: system messages will be handled specially by prepending to first user message
  switch (openaiRole) {
    case 'assistant':
      return 'model';
    case 'user':
    case 'system':
    default:
      return 'user';
  }
}

/**
 * Transforms OpenAI messages to Gemini contents
 */
function transformMessages(messages: OpenAIMessage[]): Content[] {
  const contents: Content[] = [];
  let systemPrompts: string[] = [];

  for (const message of messages) {
    // Collect system prompts separately
    if (message.role === 'system') {
      systemPrompts.push(message.content);
      continue;
    }

    const role = transformRole(message.role);
    let content = message.content;

    // If this is the first user message and we have system prompts,
    // prepend them to the user message
    if (role === 'user' && systemPrompts.length > 0) {
      const systemContent = systemPrompts.join('\n\n');
      content = `${systemContent}\n\n${content}`;
      systemPrompts = [];
    }

    contents.push({
      role,
      parts: [{ text: content }],
    });
  }

  return contents;
}

/**
 * Transforms OpenAI Chat Completion request to Gemini GenerateContentParameters
 */
export function transformOpenAIRequestToGemini(
  request: OpenAIChatCompletionRequest,
): Omit<GenerateContentParameters, 'model'> {
  const contents = transformMessages(request.messages);

  const config: GenerateContentParameters['config'] = {};

  // Map temperature (both use 0-2 range, but OpenAI typically uses 0-1)
  if (request.temperature !== undefined) {
    config.temperature = request.temperature;
  }

  // Map top_p (both use 0-1 range)
  if (request.top_p !== undefined) {
    config.topP = request.top_p;
  }

  // Map max_tokens to maxOutputTokens
  if (request.max_tokens !== undefined) {
    config.maxOutputTokens = request.max_tokens;
  }

  // Map stop sequences
  if (request.stop !== undefined) {
    config.stopSequences = Array.isArray(request.stop)
      ? request.stop
      : [request.stop];
  }

  // Note: OpenAI's frequency_penalty and presence_penalty don't have direct
  // equivalents in Gemini, so we skip them

  // Note: OpenAI's n parameter (number of completions) is not supported in Gemini
  // streaming API, so we ignore it

  // Note: We don't include 'model' here as it's provided separately by the server
  return {
    contents,
    config,
  };
}
