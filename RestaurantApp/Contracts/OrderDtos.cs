using System.ComponentModel.DataAnnotations;
using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record CreateOrderRequest(
    [property: Range(1, int.MaxValue)] int TableId,
    [property: Required, MinLength(1), MaxLength(100)] IReadOnlyCollection<CreateOrderItemRequest> Items);

public record CreateOrderItemRequest(
    [property: Range(1, int.MaxValue)] int MenuItemId,
    [property: Range(1, 100)] int Quantity,
    [property: StringLength(300)] string? Note,
    IReadOnlyCollection<int>? OptionIds = null);

public record OrderDto(
    int Id,
    int TableId,
    int TableNumber,
    TableStatus TableStatus,
    OrderStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    decimal TotalAmount,
    PaymentMethod? RequestedPaymentMethod,
    string? CancellationReason,
    IReadOnlyCollection<OrderItemDto> Items,
    OrderReviewDto? Review);

public record OrderItemDto(
    int Id,
    int MenuItemId,
    string MenuItemName,
    int Quantity,
    decimal UnitPrice,
    string? Note,
    OrderItemStatus Status);

public record UpdateOrderStatusRequest(
    OrderStatus Status,
    [property: StringLength(500)] string? CancellationReason = null);

public record UpdateOrderItemStatusRequest(OrderItemStatus Status);

public record RequestPaymentRequest(PaymentMethod Method);

public record UpsertOrderReviewRequest(int Rating, string? Comment);

public record OrderReviewDto(
    int Id,
    int OrderId,
    int Rating,
    string? Comment,
    DateTime CreatedAt,
    DateTime UpdatedAt);
