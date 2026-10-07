/** Anthropic (Claude) adapter — Messages API. */
import { AIProvider, AIError } from '../AIProvider.js';

export default class AnthropicProvider extends AIProvider {
  static type = 'anthropic';
  static label = 'Anthropic (Claude)';
  static description = 'Claude models via api.anthropic.com. Get a key at console.anthropic.com.';
  static defaultModels = ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'];
  static defaultBaseUrl = 'https://api.anthropic.com';
  static keyPlaceholder = 'sk-ant-...';

  async generate(prompt, options = {}) {
    const body = {
      model: this.model,
      max_tokens: options.maxTokens ?? this.maxTokens,
      temperature: options.temperature ?? this.temperature,
      messages: [{ role: 'user', content: prompt }],
    };
    if (options.system) body.system = options.system;

    const data = await this.postJson(`${this.baseUrl}/v1/messages`, {
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body,
      droppable: ['temperature'],
    });

    if (data.stop_reason === 'refusal') throw new AIError('blocked', 'The model declined to answer this request.');
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      usage: { inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 },
      finishReason: data.stop_reason === 'max_tokens' ? 'length' : data.stop_reason,
    };
  }
}
