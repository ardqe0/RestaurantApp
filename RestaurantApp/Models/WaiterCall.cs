namespace RestaurantApp.Models;

public class WaiterCall
{
    public int Id { get; set; }

    public int TableId { get; set; }

    public RestaurantTable? Table { get; set; }

    public string CustomerUserId { get; set; } = string.Empty;

    public AppUser? CustomerUser { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ResolvedAt { get; set; }
}
