namespace RestaurantApp.Contracts;

public record AuditLogDto(
    long Id,
    string UserName,
    string Role,
    string Action,
    string EntityType,
    string? EntityId,
    string? BeforeJson,
    string? AfterJson,
    string? IpAddress,
    DateTime CreatedAt);
