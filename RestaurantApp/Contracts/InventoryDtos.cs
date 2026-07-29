using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record InventoryItemDto(
    int Id,
    string CategoryName,
    string Name,
    int StockQuantity,
    bool IsAvailable);

public record AdjustInventoryRequest(
    [Range(-1000, 1000)] int Delta);

public record SetInventoryStockRequest(
    [Range(0, 100000)] int StockQuantity);

public record SetInventoryAvailabilityRequest(bool IsAvailable);
