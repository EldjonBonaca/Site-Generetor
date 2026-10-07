/** OpenAI (ChatGPT) adapter — Chat Completions API. */
import { AIProvider, AIError } from '../AIProvider.js';

export default class OpenAIProvider extends AIProvider {
  static type = 'openai';
  static label = 'OpenAI (ChatGPT)';
  static description = 'GPT models via api.openai.com. Get a key at platform.openai.com.';
  static defaultModels = ['gpt-5', 'gpt-5-mini', 'gpt-4.1'];
  static defaultBaseUrl = 'https://api.openai.com/v1';
  static keyPlaceholder = 'sk-...';

  /** Name of the max-tokens parameter (newer OpenAI models only accept max_completion_tokens). */
  maxTokensParam = 'max_completion_tokens';

  async generate(prompt, options = {}) {
    const messages = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.model,
      messages,
      temperature: options.temperature ?? this.temperature,
      [this.maxTokensParam]: options.maxTokens ?? this.maxTokens,
    };
    if (options.json) body.response_format = { type: 'json_object' };

    const headers = this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, {
      headers,
      body,
      droppable: ['temperature', 'response_format'],
    });

    const choice = data.choices?.[0];
    if (!choice) throw new AIError('server', 'The provider returned no choices.');
    if (choice.message?.refusal) throw new AIError('blocked', `The model refused: ${choice.message.refusal}`);
    const content = choice.message?.content;
    const text = Array.isArray(content) ? content.map((c) => c.text || '').join('') : content || '';
    return {
      text,
      usage: { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 },
      finishReason: choice.finish_reason,
    };
  }
}
