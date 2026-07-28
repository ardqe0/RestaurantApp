namespace RestaurantApp.Models;

public class Order
{
    public int Id { get; set; }

    public int TableId { get; set; }

    public RestaurantTable? Table { get; set; }

    public string? CustomerUserId { get; set; }

    public AppUser? CustomerUser { get; set; }

    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public decimal TotalAmount { get; set; }

    public PaymentMethod? RequestedPaymentMethod { get; set; }

    public string? CancellationReason { get; set; }

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();

    public Payment? Payment { get; set; }

    public OrderReview? Review { get; set; }
}
