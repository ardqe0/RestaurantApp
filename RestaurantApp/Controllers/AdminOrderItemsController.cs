using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Models;
using RestaurantApp.Services;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Kitchen,Admin")]
[Route("api/admin/order-items")]
public class AdminOrderItemsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IHubContext<OrderHub> _hubContext;
    private readonly OrderPushNotificationService _notificationService;
    private readonly AuditLogService _auditLog;

    public AdminOrderItemsController(
        RestaurantDbContext dbContext,
        IHubContext<OrderHub> hubContext,
        OrderPushNotificationService notificationService,
        AuditLogService auditLog)
    {
        _dbContext = dbContext;
        _hubContext = hubContext;
        _notificationService = notificationService;
        _auditLog = auditLog;
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateOrderItemStatus(int id, UpdateOrderItemStatusRequest request)
    {
        var orderItem = await _dbContext.OrderItems
            .Include(item => item.Order)
            .FirstOrDefaultAsync(item => item.Id == id);

        if (orderItem is null || orderItem.Order is null)
        {
            return NotFound();
        }

        if (orderItem.Order.Status is OrderStatus.Delivered or OrderStatus.Cancelled)
        {
            return BadRequest("Kapatılmış siparişin kalem durumu değiştirilemez.");
        }

        if (!CanChangeOrderItemStatus(orderItem.Status, request.Status))
        {
            return BadRequest($"Sipariş kalemi {orderItem.Status} durumundan {request.Status} durumuna geçirilemez.");
        }

        var previousItemStatus = orderItem.Status;
        var previousOrderStatus = orderItem.Order.Status;
        orderItem.Status = request.Status;
        orderItem.Order.UpdatedAt = DateTime.UtcNow;

        var otherItemStatuses = await _dbContext.OrderItems
            .Where(item => item.OrderId == orderItem.OrderId && item.Id != orderItem.Id)
            .Select(item => item.Status)
            .ToListAsync();

        var allItemStatuses = otherItemStatuses.Append(request.Status).ToList();
        if (allItemStatuses.All(status => status == OrderItemStatus.Ready))
        {
            orderItem.Order.Status = OrderStatus.Ready;
        }
        else if (allItemStatuses.Any(status => status != OrderItemStatus.Pending))
        {
            orderItem.Order.Status = OrderStatus.Preparing;
        }

        _auditLog.Add(
            "StatusChange",
            "OrderItem",
            orderItem.Id.ToString(),
            new { Status = previousItemStatus, OrderStatus = previousOrderStatus },
            new { orderItem.Status, OrderStatus = orderItem.Order.Status, orderItem.OrderId });
        await _dbContext.SaveChangesAsync();

        await _hubContext.SendToOrderAudienceAsync("OrderItemStatusChanged", new OrderItemStatusChangedEvent(
            orderItem.OrderId,
            orderItem.Id,
            orderItem.Status,
            orderItem.Order.UpdatedAt),
            orderItem.Order.CustomerUserId);

        await _hubContext.SendToOrderAudienceAsync("OrderStatusChanged", new OrderStatusChangedEvent(
            orderItem.OrderId,
            orderItem.Order.Status,
            orderItem.Order.UpdatedAt),
            orderItem.Order.CustomerUserId);
        if (orderItem.Order.Status != previousOrderStatus)
        {
            await _notificationService.SendOrderStatusAsync(orderItem.OrderId, orderItem.Order.Status);
        }

        return NoContent();
    }

    private static bool CanChangeOrderItemStatus(OrderItemStatus currentStatus, OrderItemStatus nextStatus)
    {
        if (currentStatus == nextStatus)
        {
            return true;
        }

        return currentStatus switch
        {
            OrderItemStatus.Pending => nextStatus is OrderItemStatus.Preparing or OrderItemStatus.Ready,
            OrderItemStatus.Preparing => nextStatus == OrderItemStatus.Ready,
            _ => false
        };
    }
}
