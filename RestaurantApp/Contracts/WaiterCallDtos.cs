using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record CreateWaiterCallRequest([Range(1, int.MaxValue)] int TableId);

public record WaiterCallDto(
    int Id,
    int TableId,
    int TableNumber,
    DateTime CreatedAt,
    DateTime? ResolvedAt);
