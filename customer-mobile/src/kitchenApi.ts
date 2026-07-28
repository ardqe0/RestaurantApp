import { getAuthorizationHeaders } from "./auth";
import type { OrderDto, OrderItemStatus, PaymentMethod, WaiterCallDto } from "./types";

async function request<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const authorizationHeaders = await getAuthorizationHeaders();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authorizationHeaders,
      ...options?.headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `İstek başarısız oldu: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getActiveOrders(baseUrl: string) {
  return request<unknown>(baseUrl, "/api/admin/orders/active").then((response) => {
    if (!Array.isArray(response)) {
      throw new Error("Mutfak siparişleri beklenmeyen bir biçimde geldi.");
    }

    return response as OrderDto[];
  });
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

export function getActiveWaiterCalls(baseUrl: string) {
  return request<WaiterCallDto[]>(baseUrl, "/api/admin/waiter-calls/active");
}

export function resolveWaiterCall(baseUrl: string, id: number) {
  return request<void>(baseUrl, `/api/admin/waiter-calls/${id}/resolve`, { method: "PUT" });
}
