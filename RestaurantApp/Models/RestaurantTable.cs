namespace RestaurantApp.Models;

public class RestaurantTable
{
    public int Id { get; set; }

    public int Number { get; set; }

    public string QRCode { get; set; } = string.Empty;

    public TableStatus Status { get; set; } = TableStatus.Empty;

    public int Capacity { get; set; }

    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
