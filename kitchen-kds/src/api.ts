import { Platform } from "react-native";
import type { OrderDto, OrderItemStatus, PaymentMethod, WaiterCallDto } from "./types";

export const defaultApiBaseUrl = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "http://10.0.2.2:5223";

async function request<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `İstek başarısız oldu: ${response.status}`);
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

export function getActiveWaiterCalls(baseUrl: string) {
  return request<WaiterCallDto[]>(baseUrl, "/api/admin/waiter-calls/active");
}

export function resolveWaiterCall(baseUrl: string, id: number) {
  return request<void>(baseUrl, `/api/admin/waiter-calls/${id}/resolve`, { method: "PUT" });
}
