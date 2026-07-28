import type {
  AnalyticsData,
  AuditLog,
  Campaign,
  Category,
  CurrentUser,
  DailyReport,
  DashboardData,
  DashboardSummary,
  MenuItem,
  Order,
  OrderStatus,
  RestaurantTable,
  RevenueReport,
  SalesSummaryReport,
  TableStatus,
  TopSellingItem
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  let response: Response;

  try {
    response = await fetch(path, {
      credentials: "include",
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers
      }
    });
  } catch (reason) {
    if (controller.signal.aborted) {
      throw new ApiError("Sunucu 15 saniye içinde yanıt vermedi. Lütfen tekrar deneyin.", 0);
    }
    if (reason instanceof TypeError) {
      throw new ApiError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", 0);
    }
    throw reason;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    const safeText = typeof body === "string"
      && body.length <= 300
      && !/<html|<!doctype/i.test(body)
      ? body
      : "";
    const message = typeof body === "string"
      ? safeText
      : body?.detail ?? body?.title ?? "";
    const fallback = response.status === 401
      ? "Oturumunuz sona erdi. Lütfen tekrar giriş yapın."
      : response.status === 403
        ? "Bu işlem için yetkiniz yok."
        : response.status === 429
          ? "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin."
          : response.status >= 500
            ? "Sunucuda geçici bir sorun oluştu. Lütfen tekrar deneyin."
            : `İstek başarısız oldu: ${response.status}`;
    throw new ApiError(message || fallback, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const getCurrentUser = () => request<CurrentUser>("/api/auth/me");
export const logout = () => request<void>("/api/auth/logout", { method: "POST" });

export async function getDashboardData(reportDate: string): Promise<DashboardData> {
  const [tables, activeOrders, categories, menuItems, history, dailyReport, summary, auditLogs, campaigns] = await Promise.all([
    request<RestaurantTable[]>("/api/admin/tables"),
    request<Order[]>("/api/admin/orders/active"),
    request<Category[]>("/api/admin/categories"),
    request<MenuItem[]>("/api/admin/menu-items"),
    request<Order[]>(`/api/admin/orders/history?date=${encodeURIComponent(reportDate)}`),
    request<DailyReport>(`/api/admin/reports/daily?date=${encodeURIComponent(reportDate)}`),
    request<DashboardSummary>("/api/admin/reports/dashboard"),
    request<AuditLog[]>("/api/admin/audit-logs?limit=100"),
    request<Campaign[]>("/api/admin/campaigns")
  ]);

  return { tables, activeOrders, categories, menuItems, history, dailyReport, summary, auditLogs, campaigns };
}

export type CampaignPayload = Omit<Campaign, "id">;
export const createCampaign = (payload: CampaignPayload) =>
  request<Campaign>("/api/admin/campaigns", { method: "POST", body: JSON.stringify(payload) });
export const updateCampaign = (id: number, payload: CampaignPayload) =>
  request<void>(`/api/admin/campaigns/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteCampaign = (id: number) =>
  request<void>(`/api/admin/campaigns/${id}`, { method: "DELETE" });

export async function getAnalytics(startDate: string, endDate: string): Promise<AnalyticsData> {
  const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const [revenue, topItems, bottomItems, summaries] = await Promise.all([
    request<RevenueReport>(`/api/admin/reports/revenue?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
    request<TopSellingItem[]>(`/api/admin/reports/top-items?${query}&limit=5`),
    request<TopSellingItem[]>(`/api/admin/reports/bottom-items?${query}&limit=5`),
    request<SalesSummaryReport>(`/api/admin/reports/summaries?${query}`)
  ]);
  return { revenue, topItems, bottomItems, summaries };
}

export const createCategory = (payload: Omit<Category, "id">) =>
  request<Category>("/api/admin/categories", { method: "POST", body: JSON.stringify(payload) });
export const updateCategory = (id: number, payload: Omit<Category, "id">) =>
  request<void>(`/api/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteCategory = (id: number) =>
  request<void>(`/api/admin/categories/${id}`, { method: "DELETE" });

export type MenuItemPayload = Omit<MenuItem, "id">;
export const createMenuItem = (payload: MenuItemPayload) =>
  request<MenuItem>("/api/admin/menu-items", { method: "POST", body: JSON.stringify(payload) });
export const updateMenuItem = (id: number, payload: MenuItemPayload) =>
  request<void>(`/api/admin/menu-items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteMenuItem = (id: number) =>
  request<void>(`/api/admin/menu-items/${id}`, { method: "DELETE" });

export interface TablePayload {
  number: number;
  qrCode: string;
  capacity: number;
  status: TableStatus;
}

export const createTable = (payload: Omit<TablePayload, "status">) =>
  request<RestaurantTable>("/api/admin/tables", { method: "POST", body: JSON.stringify(payload) });
export const updateTable = (id: number, payload: TablePayload) =>
  request<void>(`/api/admin/tables/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const updateOrderStatus = (id: number, status: OrderStatus, cancellationReason?: string) =>
  request<void>(`/api/admin/orders/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, cancellationReason })
  });
