namespace RestaurantApp.Models;

public class Campaign
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public CampaignDiscountType DiscountType { get; set; }

    public decimal DiscountValue { get; set; }

    public decimal MinimumOrderAmount { get; set; }

    public DateTime StartsAt { get; set; }

    public DateTime EndsAt { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
