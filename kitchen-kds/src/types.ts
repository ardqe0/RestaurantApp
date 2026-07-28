export type OrderStatus = "Pending" | "Preparing" | "Ready" | "Delivered" | "Cancelled";
export type OrderItemStatus = "Pending" | "Preparing" | "Ready";
export type PaymentMethod = "Cash" | "CreditCard" | "QrPayment";
export type PaymentStatus = "Pending" | "Completed" | "Failed";
export type TableStatus = "Empty" | "Occupied" | "WaitingForPayment";

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
  subtotalAmount: number;
  discountAmount: number;
  campaignName?: string | null;
  requestedPaymentMethod?: PaymentMethod | null;
  cancellationReason?: string | null;
  items: OrderItemDto[];
  payments?: PaymentDto[] | null;
};

export type PaymentDto = {
  id: number;
  orderId: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
  completedAt?: string | null;
};

export type WaiterCallDto = {
  id: number;
  tableId: number;
  tableNumber: number;
  createdAt: string;
  resolvedAt?: string | null;
};
