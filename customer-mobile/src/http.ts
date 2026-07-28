const requestTimeoutMs = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchApi(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ApiError("Sunucu 15 saniye içinde yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin.");
    }

    if (error instanceof TypeError || (error instanceof Error && /failed to fetch|network request failed/i.test(error.message))) {
      throw new ApiError("Sunucuya ulaşılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackMessage(status: number) {
  if (status === 401) return "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz yok.";
  if (status === 429) return "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.";
  if (status >= 500) return "Sunucuda geçici bir sorun oluştu. Lütfen tekrar deneyin.";
  return `İstek başarısız oldu: ${status}`;
}

export async function readApiError(response: Response, statusMessages: Partial<Record<number, string>> = {}) {
  const customMessage = statusMessages[response.status];
  if (customMessage) return customMessage;

  const body = await response.text().catch(() => "");
  if (body) {
    try {
      const parsed = JSON.parse(body) as string | {
        title?: string;
        detail?: string;
        errors?: Record<string, string[]>;
      };
      if (typeof parsed === "string") return parsed;
      if (parsed.detail) return parsed.detail;
      if (parsed.errors) return Object.values(parsed.errors).flat().join(" ");
      if (parsed.title) return parsed.title;
    } catch {
      const trimmed = body.trim();
      if (trimmed.length <= 300 && !/<html|<!doctype/i.test(trimmed)) return trimmed;
    }
  }

  return fallbackMessage(response.status);
}
