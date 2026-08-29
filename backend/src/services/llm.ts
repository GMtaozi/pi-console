import https from 'https';

export interface LLMConfig {
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<string> {
  const { model, apiKey, temperature, maxTokens, systemPrompt } = config;

  if (!apiKey) {
    throw new Error('API Key is not configured. Please set it in Agent Config.');
  }

  const isClaude = model.startsWith('claude');

  if (isClaude) {
    return callClaude(messages, apiKey, model, temperature, maxTokens, systemPrompt);
  }

  return callOpenAI(messages, apiKey, model, temperature, maxTokens, systemPrompt);
}

function callOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt?: string
): Promise<string> {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const body = JSON.stringify({
    model,
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || 'OpenAI API error'));
              return;
            }
            resolve(json.choices?.[0]?.message?.content || '');
          } catch {
            reject(new Error('Failed to parse OpenAI response'));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function callClaude(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt?: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt || undefined,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || 'Claude API error'));
              return;
            }
            const content = json.content?.[0];
            resolve(content?.text || content?.content || '');
          } catch {
            reject(new Error('Failed to parse Claude API response'));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ========== Streaming support ==========

export async function* chatCompletionStream(
  messages: ChatMessage[],
  config: LLMConfig
): AsyncGenerator<string> {
  const { model, apiKey, temperature, maxTokens, systemPrompt } = config;

  if (!apiKey) {
    throw new Error('API Key is not configured. Please set it in Agent Config.');
  }

  const isClaude = model.startsWith('claude');

  if (isClaude) {
    yield* callClaudeStream(messages, apiKey, model, temperature, maxTokens, systemPrompt);
  } else {
    yield* callOpenAIStream(messages, apiKey, model, temperature, maxTokens, systemPrompt);
  }
}

async function* callOpenAIStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt?: string
): AsyncGenerator<string> {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const body = JSON.stringify({
    model,
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  const res = await new Promise<import('http').IncomingMessage>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'text/event-stream',
        },
      },
      (res) => resolve(res)
    );
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });

  if (res.statusCode && res.statusCode >= 400) {
    let errorData = '';
    for await (const chunk of res) {
      errorData += chunk;
    }
    throw new Error(`OpenAI stream error: ${errorData}`);
  }

  const decoder = new (require('util').TextDecoder)('utf-8');
  let buffer = '';

  for await (const chunk of res) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore malformed JSON
      }
    }
  }
}

async function* callClaudeStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt?: string
): AsyncGenerator<string> {
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt || undefined,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

  const res = await new Promise<import('http').IncomingMessage>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          Accept: 'text/event-stream',
        },
      },
      (res) => resolve(res)
    );
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });

  if (res.statusCode && res.statusCode >= 400) {
    let errorData = '';
    for await (const chunk of res) {
      errorData += chunk;
    }
    throw new Error(`Claude stream error: ${errorData}`);
  }

  const decoder = new (require('util').TextDecoder)('utf-8');
  let buffer = '';

  for await (const chunk of res) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          yield json.delta.text;
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }
}
