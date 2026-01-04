/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';

/**
 * OpenAI Chat Completion response message
 */
export interface OpenAIResponseMessage {
  role: 'assistant';
  content: string;
}

/**
 * OpenAI Chat Completion choice
 */
export interface OpenAIChoice {
  index: number;
  message: OpenAIResponseMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

/**
 * OpenAI Chat Completion streaming choice delta
 */
export interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

/**
 * OpenAI Chat Completion response
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Chat Completion streaming chunk
 */
export interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
}

/**
 * Extracts text content from Gemini response
 */
function extractTextFromGeminiResponse(
  response: GenerateContentResponse,
): string {
  if (!response.candidates || response.candidates.length === 0) {
    return '';
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    return '';
  }

  // Concatenate all text parts
  return candidate.content.parts
    .filter((part) => 'text' in part)
    .map((part) => part.text)
    .join('');
}

/**
 * Maps Gemini finish reason to OpenAI finish reason
 */
function mapFinishReason(
  geminiFinishReason?: string,
): 'stop' | 'length' | 'content_filter' | null {
  if (!geminiFinishReason) {
    return null;
  }

  switch (geminiFinishReason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    default:
      return null;
  }
}

/**
 * Transforms Gemini response to OpenAI Chat Completion response
 */
export function transformGeminiResponseToOpenAI(
  response: GenerateContentResponse,
  requestId: string,
  model: string,
): OpenAIChatCompletionResponse {
  const content = extractTextFromGeminiResponse(response);
  const finishReason = response.candidates?.[0]?.finishReason;

  const choice: OpenAIChoice = {
    index: 0,
    message: {
      role: 'assistant',
      content,
    },
    finish_reason: mapFinishReason(finishReason),
  };

  const openaiResponse: OpenAIChatCompletionResponse = {
    id: requestId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [choice],
  };

  // Add usage statistics if available
  if (response.usageMetadata) {
    openaiResponse.usage = {
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata.totalTokenCount || 0,
    };
  }

  return openaiResponse;
}

/**
 * Transforms Gemini streaming response to OpenAI Chat Completion chunk
 */
export function transformGeminiStreamChunkToOpenAI(
  response: GenerateContentResponse,
  requestId: string,
  model: string,
  isFirst: boolean,
): OpenAIChatCompletionChunk {
  const content = extractTextFromGeminiResponse(response);
  const finishReason = response.candidates?.[0]?.finishReason;

  const delta: { role?: 'assistant'; content?: string } = {};

  // Include role only in the first chunk
  if (isFirst) {
    delta.role = 'assistant';
  }

  // Include content if there's any text
  if (content) {
    delta.content = content;
  }

  const choice: OpenAIStreamChoice = {
    index: 0,
    delta,
    finish_reason: mapFinishReason(finishReason),
  };

  return {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [choice],
  };
}

/**
 * Formats an OpenAI streaming chunk as a Server-Sent Event
 */
export function formatStreamChunk(chunk: OpenAIChatCompletionChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Returns the final SSE message indicating completion
 */
export function formatStreamDone(): string {
  return 'data: [DONE]\n\n';
}
