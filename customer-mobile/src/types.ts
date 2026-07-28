export type TableStatus = "Empty" | "Occupied" | "WaitingForPayment";

export type OrderStatus = "Pending" | "Preparing" | "Ready" | "Delivered" | "Cancelled";

export type OrderItemStatus = "Pending" | "Preparing" | "Ready";
export type PaymentMethod = "Cash" | "CreditCard" | "QrPayment";

export type TableDto = {
  id: number;
  number: number;
  qrCode: string;
  status: TableStatus;
  capacity: number;
};

export type MenuItemDto = {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  preparationMinutes: number;
  options?: MenuItemOptionDto[] | null;
};

export type MenuItemOptionDto = {
  id: number;
  name: string;
  additionalPrice: number;
};

export type MenuCategoryDto = {
  id: number;
  name: string;
  displayOrder: number;
  items: MenuItemDto[];
};

export type CartLine = {
  menuItem: MenuItemDto;
  quantity: number;
  note?: string;
  selectedOptions: MenuItemOptionDto[];
};

export type OrderItemDto = {
  id: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  note?: string | null;
  status: OrderItemStatus;
};

export type OrderDto = {
  id: number;
  tableId: number;
  tableNumber: number;
  tableStatus: TableStatus;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  requestedPaymentMethod?: PaymentMethod | null;
  cancellationReason?: string | null;
  items: OrderItemDto[];
  review?: OrderReviewDto | null;
};

export type OrderReviewDto = {
  id: number;
  orderId: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCategoryDto = {
  id: number;
  name: string;
  displayOrder: number;
  isActive: boolean;
};

export type PaymentMethodTotalDto = {
  method: PaymentMethod;
  total: number;
};

export type DailyReportDto = {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  paymentMethods: PaymentMethodTotalDto[];
  mostSoldItemName: string | null;
  mostSoldItemQuantity: number;
};

export type DashboardSummaryDto = {
  date: string;
  dailyOrderCount: number;
  dailyRevenue: number;
  activeTableCount: number;
  totalTableCount: number;
  activeOrderCount: number;
};

export type DailyRevenueDto = {
  date: string;
  revenue: number;
};

export type RevenueReportDto = {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  dailyRevenue: DailyRevenueDto[];
};

export type SellingItemDto = {
  menuItemId: number;
  name: string;
  quantity: number;
  revenue: number;
};

export type AdminDashboardDto = {
  tables: TableDto[];
  activeOrders: OrderDto[];
  categories: AdminCategoryDto[];
  menuItems: MenuItemDto[];
  dailyReport: DailyReportDto;
  summary: DashboardSummaryDto;
};

export type AdminAnalyticsDto = {
  revenue: RevenueReportDto;
  topItems: SellingItemDto[];
  bottomItems: SellingItemDto[];
};

export type WaiterCallDto = {
  id: number;
  tableId: number;
  tableNumber: number;
  createdAt: string;
  resolvedAt?: string | null;
};

export type AppVersionDto = {
  version: string;
  versionCode: number;
  downloadUrl: string;
  isRequired: boolean;
};
