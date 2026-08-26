export const LOVABLE_AI_MODEL = "google/gemini-3.7-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

export class LovableAiGatewayError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "LovableAiGatewayError";
  }
}

export interface GatewayResult {
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  finishReason?: string;
  runId?: string;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(attempt: number, retryAfter?: string) {
  const headerSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(headerSeconds) && headerSeconds >= 0) return headerSeconds * 1000;
  return Math.min(8_000, 750 * 2 ** attempt) + Math.floor(Math.random() * 300);
}

export async function callLovableAiGateway(options: {
  messages: GatewayMessage[];
  maxTokens?: number;
  temperature?: number;
  initialRunId?: string;
  maxRetries?: number;
}): Promise<GatewayResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new LovableAiGatewayError(401, "Lovable AI is not configured.");

  const maxRetries = options.maxRetries ?? 2;
  let runId = options.initialRunId?.trim() || undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
        ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
      },
      body: JSON.stringify({
        model: LOVABLE_AI_MODEL,
        messages: options.messages,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        reasoning: { effort: "low" },
      }),
    });

    runId = response.headers.get("X-Lovable-AIG-Run-ID")?.trim() || runId;
    if (response.ok) {
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        throw new LovableAiGatewayError(502, "The AI response was empty.");
      }
      return {
        text: text.trim(),
        usage: data.usage,
        finishReason: data?.choices?.[0]?.finish_reason,
        runId,
      };
    }

    const body = await response.text();
    let message = body || `Lovable AI request failed (${response.status}).`;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.message === "string") message = parsed.message;
      else if (typeof parsed?.error?.message === "string") message = parsed.error.message;
    } catch {
      // Keep the upstream text when it is not JSON.
    }

    const retryable = response.status === 429 || response.status >= 500;
    const retryAfter = response.headers.get("Retry-After") || undefined;
    if (!retryable || attempt === maxRetries) {
      throw new LovableAiGatewayError(response.status, message, retryAfter);
    }
    await wait(retryDelay(attempt, retryAfter));
  }

  throw new LovableAiGatewayError(502, "Lovable AI request failed.");
}

export function gatewayErrorResponse(error: unknown) {
  const gatewayError = error instanceof LovableAiGatewayError ? error : null;
  const status = gatewayError?.status ?? 500;
  const message = gatewayError?.message || "JEEnie could not answer right now. Please try again.";
  const requires = status === 402 ? "top_up" : status === 403 ? "admin_action" : undefined;

  return {
    status: status >= 400 && status < 600 ? status : 500,
    body: {
      error: message,
      response: message,
      content: "",
      suggestions: [],
      retryable: status === 429 || status >= 500,
      ...(requires ? { requires } : {}),
    },
  };
}