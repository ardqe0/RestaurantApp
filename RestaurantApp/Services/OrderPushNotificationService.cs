using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Data;
using RestaurantApp.Models;

namespace RestaurantApp.Services;

public class OrderPushNotificationService
{
    private static readonly Uri ExpoPushEndpoint = new("https://exp.host/--/api/v2/push/send");
    private readonly RestaurantDbContext _dbContext;
    private readonly HttpClient _httpClient;
    private readonly ILogger<OrderPushNotificationService> _logger;

    public OrderPushNotificationService(
        RestaurantDbContext dbContext,
        HttpClient httpClient,
        ILogger<OrderPushNotificationService> logger)
    {
        _dbContext = dbContext;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task SendOrderStatusAsync(int orderId, OrderStatus status, string? cancellationReason = null)
    {
        var orderInfo = await _dbContext.Orders
            .AsNoTracking()
            .Where(order => order.Id == orderId)
            .Select(order => new
            {
                order.CustomerUserId,
                TableNumber = order.Table == null ? 0 : order.Table.Number
            })
            .FirstOrDefaultAsync();
        var content = NotificationContent(status, cancellationReason);
        if (content is null || orderInfo is null || string.IsNullOrWhiteSpace(orderInfo.CustomerUserId))
        {
            return;
        }

        var tokens = await _dbContext.CustomerPushTokens
            .AsNoTracking()
            .Where(token => token.UserId == orderInfo.CustomerUserId)
            .Select(token => token.Token)
            .ToListAsync();
        if (tokens.Count == 0)
        {
            return;
        }

        var messages = tokens.Select(token => new
        {
            to = token,
            sound = "default",
            priority = "high",
            channelId = "orders",
            title = content.Value.Title,
            body = $"Sipariş #{orderId} · Masa {orderInfo.TableNumber}\n{content.Value.Body}",
            data = new { orderId, tableNumber = orderInfo.TableNumber, status = status.ToString() }
        });

        try
        {
            using var response = await _httpClient.PostAsJsonAsync(ExpoPushEndpoint, messages);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Expo push servisi {StatusCode} döndürdü.", response.StatusCode);
            }
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Sipariş {OrderId} bildirimi gönderilemedi.", orderId);
        }
    }

    private static (string Title, string Body)? NotificationContent(OrderStatus status, string? cancellationReason)
    {
        return status switch
        {
            OrderStatus.Preparing => ("Siparişiniz hazırlanıyor", "Mutfak siparişinizi hazırlamaya başladı."),
            OrderStatus.Ready => ("Siparişiniz hazır", "Siparişiniz hazırlandı. Afiyet olsun!"),
            OrderStatus.Cancelled => ("Siparişiniz iptal edildi", cancellationReason ?? "Restoran siparişinizi iptal etti."),
            OrderStatus.Delivered => ("Ödeme tamamlandı", "Ödemeniz alındı. Bizi tercih ettiğiniz için teşekkür ederiz."),
            _ => null
        };
    }
}
