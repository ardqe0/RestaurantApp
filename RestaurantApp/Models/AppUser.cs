using Microsoft.AspNetCore.Identity;

namespace RestaurantApp.Models;

public class AppUser : IdentityUser
{
    public ICollection<Order> Orders { get; set; } = new List<Order>();

    public ICollection<CustomerFavorite> Favorites { get; set; } = new List<CustomerFavorite>();

    public ICollection<CustomerPushToken> PushTokens { get; set; } = new List<CustomerPushToken>();
}
