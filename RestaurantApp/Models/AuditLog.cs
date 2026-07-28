namespace RestaurantApp.Models;

public class AuditLog
{
    public long Id { get; set; }

    public string? UserId { get; set; }

    public string UserName { get; set; } = "system";

    public string Role { get; set; } = "System";

    public string Action { get; set; } = string.Empty;

    public string EntityType { get; set; } = string.Empty;

    public string? EntityId { get; set; }

    public string? BeforeJson { get; set; }

    public string? AfterJson { get; set; }

    public string? IpAddress { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
