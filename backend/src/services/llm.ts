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
            reject(new Error('Failed to parse Claude response'));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}
