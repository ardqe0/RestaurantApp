using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace RestaurantApp.Hubs;

[Authorize]
public class OrderHub : Hub
{
    public const string OperationsGroup = "restaurant-operations";

    public static string CustomerGroup(string userId) => $"customer:{userId}";

    public override async Task OnConnectedAsync()
    {
        if (Context.User?.IsInRole("Admin") == true || Context.User?.IsInRole("Kitchen") == true)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, OperationsGroup);
        }

        if (Context.User?.IsInRole("Customer") == true)
        {
            var userId = Context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? Context.User.FindFirstValue("sub");
            if (!string.IsNullOrWhiteSpace(userId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, CustomerGroup(userId));
            }
        }

        await base.OnConnectedAsync();
    }
}
