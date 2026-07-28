namespace RestaurantApp.Models;

public class MenuItem
{
    public int Id { get; set; }

    public int CategoryId { get; set; }

    public Category? Category { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public decimal Price { get; set; }

    public string? ImageUrl { get; set; }

    public bool IsAvailable { get; set; } = true;

    public int PreparationMinutes { get; set; }

    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

    public ICollection<MenuItemOption> Options { get; set; } = new List<MenuItemOption>();

    public ICollection<CustomerFavorite> FavoritedBy { get; set; } = new List<CustomerFavorite>();
}
