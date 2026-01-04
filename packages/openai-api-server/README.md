# OpenAI API Server for Gemini CLI

This package provides an OpenAI-compatible API server for the Gemini CLI. It
allows you to use Gemini models through the OpenAI Chat Completion API format.

## Features

- ✅ OpenAI Chat Completion API compatible
- ✅ Streaming and non-streaming responses
- ✅ Reuses existing Gemini CLI authentication
- ✅ Automatic request/response transformation
- ✅ Support for OAuth, API keys, and Vertex AI

## Usage

Start the OpenAI API server using the Gemini CLI:

```bash
gemini --openai-api --openai-port 8080
```

### Command-line Options

- `--openai-api`: Enable OpenAI API server mode
- `--openai-port <port>`: Specify the port to listen on (default: 8080)

## API Endpoints

### POST /v1/chat/completions

OpenAI-compatible chat completion endpoint.

**Request Example:**

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "stream": false
  }'
```

**Streaming Example:**

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

### GET /v1/models

List available models.

```bash
curl http://localhost:8080/v1/models
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:8080/health
```

## Supported OpenAI Request Parameters

- `model`: Model name (uses Gemini CLI configured model if not specified)
- `messages`: Array of message objects with `role` and `content`
- `temperature`: Temperature for response generation (0-2)
- `max_tokens`: Maximum tokens in the response
- `top_p`: Nucleus sampling parameter
- `stop`: Stop sequences (string or array)
- `stream`: Enable streaming responses (boolean)

**Note:** OpenAI parameters `frequency_penalty`, `presence_penalty`, and `n` are
not supported by Gemini and will be ignored.

## Authentication

The server uses the authentication configured in your Gemini CLI settings. Make
sure you have authenticated before starting the server:

```bash
# Authenticate with OAuth (recommended)
gemini  # Follow the authentication prompts

# Or use an API key
export GEMINI_API_KEY="your-api-key"

# Then start the server
gemini --openai-api
```

## Using with OpenAI Client Libraries

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="not-needed"  # API key not required when using OAuth
)

response = client.chat.completions.create(
    model="gemini-2.0-flash-exp",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

### Node.js

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'not-needed', // API key not required when using OAuth
});

const response = await client.chat.completions.create({
  model: 'gemini-2.0-flash-exp',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```

## Architecture

The OpenAI API server:

1. Accepts OpenAI-formatted requests
2. Transforms them to Gemini format using the transformer layer
3. Reuses the existing Gemini CLI `ContentGenerator` for authentication and API
   calls
4. Transforms Gemini responses back to OpenAI format
5. Returns OpenAI-compatible responses

### Components

- **Transformers**: Convert between OpenAI and Gemini formats
  - `openai-to-gemini.ts`: Request transformation
  - `gemini-to-openai.ts`: Response transformation
- **HTTP Server**: Express-based server with OpenAI endpoints
  - `app.ts`: Route handlers and middleware
  - `server.ts`: Server startup and lifecycle management

## License

Copyright 2025 Google LLC SPDX-License-Identifier: Apache-2.0
