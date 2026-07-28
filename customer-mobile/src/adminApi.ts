import { getAuthorizationHeaders } from "./auth";
import type {
  AdminAnalyticsDto,
  AdminCategoryDto,
  AdminDashboardDto,
  DailyReportDto,
  DashboardSummaryDto,
  MenuItemDto,
  OrderDto,
  RevenueReportDto,
  SellingItemDto,
  TableDto
} from "./types";

async function readError(response: Response) {
  const body = await response.text();
  if (!body) return `İstek başarısız oldu: ${response.status}`;

  try {
    const parsed = JSON.parse(body) as string | { detail?: string; title?: string };
    if (typeof parsed === "string") return parsed;
    return parsed.detail ?? parsed.title ?? body;
  } catch {
    return body;
  }
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const authorizationHeaders = await getAuthorizationHeaders();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...authorizationHeaders,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) throw new Error(await readError(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type CategoryInput = {
  name: string;
  displayOrder: number;
  isActive: boolean;
};

export type MenuItemInput = {
  categoryId: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  preparationMinutes: number;
};

function queryDate(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function getAdminDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(0, days - 1));
  return { startDate: queryDate(start), endDate: queryDate(end) };
}

export async function getAdminDashboard(baseUrl: string): Promise<AdminDashboardDto> {
  const today = queryDate(new Date());
  const [tables, activeOrders, categories, menuItems, dailyReport, summary] = await Promise.all([
    request<TableDto[]>(baseUrl, "/api/admin/tables"),
    request<OrderDto[]>(baseUrl, "/api/admin/orders/active"),
    request<AdminCategoryDto[]>(baseUrl, "/api/admin/categories"),
    request<MenuItemDto[]>(baseUrl, "/api/admin/menu-items"),
    request<DailyReportDto>(baseUrl, `/api/admin/reports/daily?date=${today}`),
    request<DashboardSummaryDto>(baseUrl, "/api/admin/reports/dashboard")
  ]);

  return { tables, activeOrders, categories, menuItems, dailyReport, summary };
}

export async function getAdminAnalytics(baseUrl: string, days: number): Promise<AdminAnalyticsDto> {
  const { startDate, endDate } = getAdminDateRange(days);
  const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const [revenue, topItems, bottomItems] = await Promise.all([
    request<RevenueReportDto>(baseUrl, `/api/admin/reports/revenue?${query}`),
    request<SellingItemDto[]>(baseUrl, `/api/admin/reports/top-items?${query}&limit=5`),
    request<SellingItemDto[]>(baseUrl, `/api/admin/reports/bottom-items?${query}&limit=5`)
  ]);

  return { revenue, topItems, bottomItems };
}

export function createCategory(baseUrl: string, input: CategoryInput) {
  return request<AdminCategoryDto>(baseUrl, "/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCategory(baseUrl: string, id: number, input: CategoryInput) {
  return request<void>(baseUrl, `/api/admin/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteCategory(baseUrl: string, id: number) {
  return request<void>(baseUrl, `/api/admin/categories/${id}`, { method: "DELETE" });
}

export function createMenuItem(baseUrl: string, input: MenuItemInput) {
  return request<MenuItemDto>(baseUrl, "/api/admin/menu-items", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMenuItem(baseUrl: string, id: number, input: MenuItemInput) {
  return request<void>(baseUrl, `/api/admin/menu-items/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteMenuItem(baseUrl: string, id: number) {
  return request<void>(baseUrl, `/api/admin/menu-items/${id}`, { method: "DELETE" });
}
