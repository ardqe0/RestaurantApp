import { Platform } from "react-native";
import type { InventoryItemDto, OrderDto, OrderItemStatus, PaymentMethod, WaiterCallDto } from "./types";

export const defaultApiBaseUrl = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "http://10.0.2.2:5223";

async function request<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      credentials: "include",
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options?.headers }
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Sunucu 15 saniye içinde yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin.");
    }
    if (error instanceof TypeError || (error instanceof Error && /failed to fetch|network request failed/i.test(error.message))) {
      throw new Error("Sunucuya ulaşılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = "";
    try {
      const parsed = JSON.parse(body) as { detail?: string; title?: string };
      message = parsed.detail ?? parsed.title ?? "";
    } catch {
      if (body.length <= 300 && !/<html|<!doctype/i.test(body)) message = body;
    }
    const fallback = response.status === 401
      ? "Oturumunuz sona erdi. Lütfen tekrar giriş yapın."
      : response.status === 403
        ? "Bu işlem için yetkiniz yok."
        : response.status === 429
          ? "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin."
          : response.status >= 500
            ? "Sunucuda geçici bir sorun oluştu. Lütfen tekrar deneyin."
            : `İstek başarısız oldu: ${response.status}`;
    throw new Error(message || fallback);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getCurrentUser(baseUrl: string) {
  return request<{ username: string; role: string }>(baseUrl, "/api/auth/me");
}

export function signOut(baseUrl: string) {
  return request<void>(baseUrl, "/api/auth/logout", { method: "POST" });
}

export function getActiveOrders(baseUrl: string) {
  return request<OrderDto[]>(baseUrl, "/api/admin/orders/active");
}

export function updateItemStatus(baseUrl: string, itemId: number, status: OrderItemStatus) {
  return request<void>(baseUrl, `/api/admin/order-items/${itemId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
}

export function cancelOrder(baseUrl: string, orderId: number, reason: string) {
  return request<void>(baseUrl, `/api/admin/orders/${orderId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: "Cancelled", cancellationReason: reason })
  });
}

export function createPayment(baseUrl: string, orderId: number, method: PaymentMethod, paymentId?: number) {
  return request<void>(baseUrl, "/api/admin/payments", {
    method: "POST",
    body: JSON.stringify({ orderId, method, paymentId })
  });
}

export function splitPayment(baseUrl: string, orderId: number, splitCount: number) {
  return request<void>(baseUrl, `/api/admin/payments/${orderId}/split`, {
    method: "PUT",
    body: JSON.stringify({ splitCount })
  });
}

export function getActiveWaiterCalls(baseUrl: string) {
  return request<WaiterCallDto[]>(baseUrl, "/api/admin/waiter-calls/active");
}

export function resolveWaiterCall(baseUrl: string, id: number) {
  return request<void>(baseUrl, `/api/admin/waiter-calls/${id}/resolve`, { method: "PUT" });
}

export function getInventory(baseUrl: string) {
  return request<InventoryItemDto[]>(baseUrl, "/api/inventory");
}

export function adjustInventory(baseUrl: string, id: number, delta: number) {
  return request<InventoryItemDto>(baseUrl, `/api/inventory/${id}/adjust`, {
    method: "PUT",
    body: JSON.stringify({ delta })
  });
}

export function setInventoryStock(baseUrl: string, id: number, stockQuantity: number) {
  return request<InventoryItemDto>(baseUrl, `/api/inventory/${id}/stock`, {
    method: "PUT",
    body: JSON.stringify({ stockQuantity })
  });
}

export function setInventoryAvailability(baseUrl: string, id: number, isAvailable: boolean) {
  return request<InventoryItemDto>(baseUrl, `/api/inventory/${id}/availability`, {
    method: "PUT",
    body: JSON.stringify({ isAvailable })
  });
}
