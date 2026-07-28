namespace RestaurantApp.Models;

public class MenuItemOption
{
    public int Id { get; set; }

    public int MenuItemId { get; set; }

    public MenuItem? MenuItem { get; set; }

    public string Name { get; set; } = string.Empty;

    public decimal AdditionalPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public int DisplayOrder { get; set; }
}
