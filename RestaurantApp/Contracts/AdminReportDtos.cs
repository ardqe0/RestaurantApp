using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record DailyReportDto(
    DateOnly Date,
    int TotalOrders,
    int CompletedOrders,
    int CancelledOrders,
    decimal TotalRevenue,
    IReadOnlyCollection<PaymentMethodTotalDto> PaymentMethods,
    string? MostSoldItemName,
    int MostSoldItemQuantity);

public record PaymentMethodTotalDto(PaymentMethod Method, decimal Total);

public record DashboardSummaryDto(
    DateOnly Date,
    int DailyOrderCount,
    decimal DailyRevenue,
    int ActiveTableCount,
    int TotalTableCount,
    int ActiveOrderCount);

public record DailyRevenueDto(DateOnly Date, decimal Revenue);

public record RevenueReportDto(
    DateOnly StartDate,
    DateOnly EndDate,
    decimal TotalRevenue,
    IReadOnlyCollection<DailyRevenueDto> DailyRevenue);

public record TopSellingItemDto(
    int MenuItemId,
    string Name,
    int Quantity,
    decimal Revenue);

public record SalesSummaryRowDto(
    DateOnly StartDate,
    DateOnly EndDate,
    int TotalOrders,
    int CompletedOrders,
    int CancelledOrders,
    decimal TotalRevenue);

public record SalesSummaryReportDto(
    DateOnly StartDate,
    DateOnly EndDate,
    IReadOnlyCollection<SalesSummaryRowDto> Daily,
    IReadOnlyCollection<SalesSummaryRowDto> Weekly);
