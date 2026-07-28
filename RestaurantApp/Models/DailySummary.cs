namespace RestaurantApp.Models;

public class DailySummary
{
    public DateOnly Date { get; set; }

    public int TotalOrders { get; set; }

    public decimal TotalRevenue { get; set; }

    public int? MostSoldItemId { get; set; }

    public MenuItem? MostSoldItem { get; set; }
}
