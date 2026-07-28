export type TableStatus = "Empty" | "Occupied" | "WaitingForPayment";
export type OrderStatus = "Pending" | "Preparing" | "Ready" | "Delivered" | "Cancelled";
export type OrderItemStatus = "Pending" | "Preparing" | "Ready";
export type PaymentMethod = "Cash" | "CreditCard" | "QrPayment";

export interface CurrentUser {
  username: string;
  role: string;
}

export interface Category {
  id: number;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  preparationMinutes: number;
}

export interface RestaurantTable {
  id: number;
  number: number;
  qrCode: string;
  status: TableStatus;
  capacity: number;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  status: OrderItemStatus;
}

export interface Order {
  id: number;
  tableId: number;
  tableNumber: number;
  tableStatus: TableStatus;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  requestedPaymentMethod: PaymentMethod | null;
  cancellationReason: string | null;
  items: OrderItem[];
}

export interface PaymentMethodTotal {
  method: PaymentMethod;
  total: number;
}

export interface DailyReport {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  paymentMethods: PaymentMethodTotal[];
  mostSoldItemName: string | null;
  mostSoldItemQuantity: number;
}

export interface DashboardSummary {
  date: string;
  dailyOrderCount: number;
  dailyRevenue: number;
  activeTableCount: number;
  totalTableCount: number;
  activeOrderCount: number;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
}

export interface RevenueReport {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  dailyRevenue: DailyRevenue[];
}

export interface TopSellingItem {
  menuItemId: number;
  name: string;
  quantity: number;
  revenue: number;
}

export interface SalesSummaryRow {
  startDate: string;
  endDate: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
}

export interface SalesSummaryReport {
  startDate: string;
  endDate: string;
  daily: SalesSummaryRow[];
  weekly: SalesSummaryRow[];
}

export interface DashboardData {
  tables: RestaurantTable[];
  activeOrders: Order[];
  categories: Category[];
  menuItems: MenuItem[];
  history: Order[];
  dailyReport: DailyReport;
  summary: DashboardSummary;
}

export interface AnalyticsData {
  revenue: RevenueReport;
  topItems: TopSellingItem[];
  bottomItems: TopSellingItem[];
  summaries: SalesSummaryReport;
}
