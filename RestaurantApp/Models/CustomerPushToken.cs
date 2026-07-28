namespace RestaurantApp.Models;

public class CustomerPushToken
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    public AppUser? User { get; set; }

    public string Token { get; set; } = string.Empty;

    public string Platform { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; }
}
