using Microsoft.AspNetCore.SignalR;

namespace RestaurantApp.Hubs;

public static class OrderHubClientExtensions
{
    public static Task SendToOperationsAsync(
        this IHubContext<OrderHub> hubContext,
        string eventName,
        object payload)
    {
        return hubContext.Clients
            .Group(OrderHub.OperationsGroup)
            .SendAsync(eventName, payload);
    }

    public static async Task SendToOrderAudienceAsync(
        this IHubContext<OrderHub> hubContext,
        string eventName,
        object payload,
        string? customerUserId)
    {
        var sends = new List<Task>
        {
            hubContext.Clients
                .Group(OrderHub.OperationsGroup)
                .SendAsync(eventName, payload)
        };

        if (!string.IsNullOrWhiteSpace(customerUserId))
        {
            sends.Add(hubContext.Clients
                .Group(OrderHub.CustomerGroup(customerUserId))
                .SendAsync(eventName, payload));
        }

        await Task.WhenAll(sends);
    }
}
