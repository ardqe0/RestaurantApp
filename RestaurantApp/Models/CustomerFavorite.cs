namespace RestaurantApp.Models;

public class CustomerFavorite
{
    public string UserId { get; set; } = string.Empty;

    public AppUser? User { get; set; }

    public int MenuItemId { get; set; }

    public MenuItem? MenuItem { get; set; }

    public DateTime CreatedAt { get; set; }
}
