/**
 * Generic OpenAI-compatible adapter (Mistral, OpenRouter, Groq, DeepSeek, local Ollama / LM Studio...).
 * Base URL examples:
 *   https://api.mistral.ai/v1 · https://openrouter.ai/api/v1 · https://api.groq.com/openai/v1 · http://localhost:11434/v1
 */
import OpenAIProvider from './openai.js';

export default class OpenAICompatibleProvider extends OpenAIProvider {
  static type = 'openai-compatible';
  static label = 'OpenAI-compatible (other)';
  static description = 'Any service exposing /chat/completions: Mistral, OpenRouter, Groq, Ollama, LM Studio...';
  static defaultModels = ['mistral-large-latest', 'llama3.1', 'openai/gpt-5-mini'];
  static defaultBaseUrl = 'http://localhost:11434/v1';
  static requiresKey = false;
  static requiresBaseUrl = true;
  static keyPlaceholder = 'optional for local servers';

  // Most compatible servers still use the classic parameter name.
  maxTokensParam = 'max_tokens';
}
