import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';
import { ExecutionError } from '../ExecutionError';
import { chatCompletion, ChatMessage } from '../../services/llm';

export interface LLMNodeConfig {
  model?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  apiKey?: string;
}

export class LLMNodeExecutor implements NodeExecutor {
  type = 'llm';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: LLMNodeConfig = node.data || {};

    // Resolve variable references in the prompt
    const rawPrompt = config.prompt || inputs.prompt || '';
    const resolvedPrompt = context && 'resolveVariables' in context
      ? (context as any).resolveVariables(rawPrompt)
      : rawPrompt;

    if (!resolvedPrompt) {
      throw new ExecutionError('LLM node requires a prompt', { nodeId: node.id });
    }

    const apiKey = config.apiKey || process.env.DEFAULT_LLM_API_KEY || '';
    if (!apiKey) {
      throw new ExecutionError('LLM node requires an API key', { nodeId: node.id });
    }

    const messages: ChatMessage[] = [{ role: 'user', content: resolvedPrompt }];

    const response = await chatCompletion(messages, {
      model: config.model || 'gpt-4o',
      apiKey,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2048,
      systemPrompt: config.systemPrompt,
    });

    return { text: response };
  }
}
