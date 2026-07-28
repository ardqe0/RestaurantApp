using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record NewOrderEvent(
    int OrderId,
    int TableId,
    int TableNumber,
    decimal TotalAmount,
    DateTime CreatedAt);

public record OrderStatusChangedEvent(
    int OrderId,
    OrderStatus Status,
    DateTime UpdatedAt);

public record OrderItemStatusChangedEvent(
    int OrderId,
    int OrderItemId,
    OrderItemStatus Status,
    DateTime UpdatedAt);

public record TableStatusChangedEvent(
    int TableId,
    int TableNumber,
    TableStatus Status);
