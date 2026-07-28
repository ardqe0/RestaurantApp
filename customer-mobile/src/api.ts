import type { MenuCategoryDto, OrderDto, OrderReviewDto, PaymentMethod, TableDto, WaiterCallDto } from "./types";
import { getAuthorizationHeaders } from "./auth";
export { defaultApiBaseUrl } from "./config";

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
    if (response.status === 404) {
      throw new Error("QR kodundaki masa bulunamadı. Lütfen masadaki güncel QR kodunu okutun.");
    }

    const message = await response.text();
    throw new Error(message || `İstek başarısız oldu: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function signOut(baseUrl: string) {
  return request<void>(baseUrl, "/api/auth/logout", { method: "POST" });
}

export function getTable(baseUrl: string, qrCode: string) {
  return request<TableDto>(baseUrl, `/api/tables/${encodeURIComponent(qrCode)}`);
}

export function getMenu(baseUrl: string) {
  return request<MenuCategoryDto[]>(baseUrl, "/api/menu");
}

export function createOrder(
  baseUrl: string,
  tableId: number,
  items: Array<{ menuItemId: number; quantity: number; note?: string; optionIds?: number[] }>
) {
  return request<OrderDto>(baseUrl, "/api/orders", {
    method: "POST",
    body: JSON.stringify({ tableId, items })
  });
}

export function getCustomerOrderHistory(baseUrl: string) {
  return request<OrderDto[]>(baseUrl, "/api/customer/orders");
}

export function upsertOrderReview(baseUrl: string, orderId: number, rating: number, comment: string) {
  return request<OrderReviewDto>(baseUrl, `/api/customer/orders/${orderId}/review`, {
    method: "PUT",
    body: JSON.stringify({ rating, comment })
  });
}

export function getFavorites(baseUrl: string) {
  return request<import("./types").MenuItemDto[]>(baseUrl, "/api/customer/favorites");
}

export function addFavorite(baseUrl: string, menuItemId: number) {
  return request<void>(baseUrl, `/api/customer/favorites/${menuItemId}`, { method: "PUT" });
}

export function removeFavorite(baseUrl: string, menuItemId: number) {
  return request<void>(baseUrl, `/api/customer/favorites/${menuItemId}`, { method: "DELETE" });
}

export function registerPushToken(baseUrl: string, token: string, platform: string) {
  return request<void>(baseUrl, "/api/customer/push-tokens", {
    method: "POST",
    body: JSON.stringify({ token, platform })
  });
}

export function callWaiter(baseUrl: string, tableId: number) {
  return request<WaiterCallDto>(baseUrl, "/api/customer/waiter-calls", {
    method: "POST",
    body: JSON.stringify({ tableId })
  });
}

export function getActiveWaiterCall(baseUrl: string, tableId: number) {
  return request<WaiterCallDto | null>(baseUrl, `/api/customer/waiter-calls/${tableId}/active`);
}

export function getOrder(baseUrl: string, orderId: number) {
  return request<OrderDto>(baseUrl, `/api/orders/${orderId}`);
}

export function requestPayment(baseUrl: string, orderId: number, method: PaymentMethod, splitCount = 1) {
  return request<void>(baseUrl, `/api/orders/${orderId}/request-payment`, {
    method: "POST",
    body: JSON.stringify({ method, splitCount })
  });
}
