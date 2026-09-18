const messages = {
  configuration:
    'Configure EMAIL_SEQUENCER_OPENAI_API_KEY and EMAIL_SEQUENCER_OPENAI_MODEL, then restart the server.',
  context_too_large: 'Generation context exceeds the supported size.',
  authentication: 'OpenAI authentication failed. Check the project API key.',
  access:
    'OpenAI denied access. Check the configured model and project permissions.',
  quota: 'OpenAI quota is exhausted. Check API billing and project limits.',
  rate_limit:
    'OpenAI rate limit reached. Wait before starting another preparation.',
  request_rejected:
    'OpenAI rejected the request. Check the configured model and request settings.',
  unavailable: 'OpenAI is temporarily unavailable.',
  timeout: 'Generation exceeded the 60-second timeout.',
  cancelled: 'Generation was cancelled.',
  transport: 'Cannot reach OpenAI. Check server network connectivity.',
  invalid_response: 'OpenAI returned an unexpected response format.',
  output_limit: 'Generation reached the output token limit before completing.',
  incomplete: 'OpenAI did not complete generation.',
  refused: 'OpenAI refused generation.',
  empty: 'OpenAI returned no email body.',
} as const;

// Only application-owned messages cross into operator-facing errors.
export class TextGenerationError extends Error {
  constructor(
    readonly code: keyof typeof messages,
    readonly requestId?: string,
  ) {
    super(`${messages[code]}${requestId ? ` Request ID: ${requestId}.` : ''}`);
    this.name = 'TextGenerationError';
  }
}
