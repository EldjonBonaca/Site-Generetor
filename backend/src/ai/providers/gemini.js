/** Google Gemini adapter — Google AI Studio (Generative Language API). */
import { AIProvider, AIError } from '../AIProvider.js';

export default class GeminiProvider extends AIProvider {
  static type = 'gemini';
  static label = 'Google Gemini (AI Studio)';
  static description = 'Gemini models via generativelanguage.googleapis.com. Get a key at aistudio.google.com.';
  static defaultModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
  static defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  static keyPlaceholder = 'AIza...';

  async generate(prompt, options = {}) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? this.temperature,
        maxOutputTokens: options.maxTokens ?? this.maxTokens,
        ...(options.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (options.system) body.systemInstruction = { parts: [{ text: options.system }] };

    // Key sent as header (not query string) so it never ends up in URLs/logs.
    const data = await this.postJson(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
      headers: { 'x-goog-api-key': this.apiKey },
      body,
    });

    if (data.promptFeedback?.blockReason) throw new AIError('blocked', `Request blocked by Gemini: ${data.promptFeedback.blockReason}`);
    const candidate = data.candidates?.[0];
    if (!candidate) throw new AIError('server', 'Gemini returned no candidates.');
    const text = (candidate.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    const u = data.usageMetadata || {};
    return {
      text,
      usage: { inputTokens: u.promptTokenCount || 0, outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
      finishReason: candidate.finishReason === 'MAX_TOKENS' ? 'length' : candidate.finishReason,
    };
  }
}
