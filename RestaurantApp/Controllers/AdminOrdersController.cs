using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Infrastructure;
using RestaurantApp.Models;
using RestaurantApp.Services;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Kitchen,Admin")]
[Route("api/admin/orders")]
public class AdminOrdersController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IHubContext<OrderHub> _hubContext;
    private readonly OrderPushNotificationService _notificationService;
    private readonly AuditLogService _auditLog;

    public AdminOrdersController(
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

    [HttpGet("active")]
    public async Task<ActionResult<IReadOnlyCollection<OrderDto>>> GetActiveOrders()
    {
        var orders = await _dbContext.Orders
            .AsNoTracking()
            .Where(order => order.Status != OrderStatus.Delivered && order.Status != OrderStatus.Cancelled)
            .OrderBy(order => order.CreatedAt)
            .Select(order => new OrderDto(
                order.Id,
                order.TableId,
                order.Table == null ? 0 : order.Table.Number,
                order.Table == null ? TableStatus.Empty : order.Table.Status,
                order.Status,
                order.CreatedAt,
                order.UpdatedAt,
                order.TotalAmount,
                order.RequestedPaymentMethod,
                order.CancellationReason,
                order.Items.Select(item => new OrderItemDto(
                    item.Id,
                    item.MenuItemId,
                    item.MenuItem == null ? string.Empty : item.MenuItem.Name,
                    item.Quantity,
                    item.UnitPrice,
                    item.Note,
                    item.Status)).ToList(),
                null))
            .ToListAsync();

        return Ok(orders);
    }

    [HttpGet("history")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IReadOnlyCollection<OrderDto>>> GetOrderHistory([FromQuery] DateOnly? date)
    {
        var query = _dbContext.Orders.AsNoTracking()
            .Where(order => order.Status == OrderStatus.Delivered || order.Status == OrderStatus.Cancelled);

        if (date is not null)
        {
            var (start, end) = RestaurantTime.ToUtcRange(date.Value, date.Value);
            query = query.Where(order => order.CreatedAt >= start && order.CreatedAt < end);
        }

        var orders = await query
            .OrderByDescending(order => order.CreatedAt)
            .Take(100)
            .Select(order => new OrderDto(
                order.Id, order.TableId, order.Table == null ? 0 : order.Table.Number,
                order.Table == null ? TableStatus.Empty : order.Table.Status, order.Status,
                order.CreatedAt, order.UpdatedAt, order.TotalAmount, order.RequestedPaymentMethod,
                order.CancellationReason,
                order.Items.Select(item => new OrderItemDto(item.Id, item.MenuItemId,
                    item.MenuItem == null ? string.Empty : item.MenuItem.Name, item.Quantity,
                    item.UnitPrice, item.Note, item.Status)).ToList(),
                null))
            .ToListAsync();

        return Ok(orders);
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateOrderStatus(int id, UpdateOrderStatusRequest request)
    {
        var order = await _dbContext.Orders
            .Include(order => order.Table)
            .Include(order => order.Items)
            .FirstOrDefaultAsync(order => order.Id == id);

        if (order is null)
        {
            return NotFound();
        }

        if (order.Status is OrderStatus.Delivered or OrderStatus.Cancelled)
        {
            return BadRequest("Kapatılmış siparişin durumu değiştirilemez.");
        }

        if (request.Status == OrderStatus.Delivered)
        {
            return BadRequest("Teslim edildi durumuna ödeme işlemiyle geçilmelidir.");
        }

        if (!CanChangeOrderStatus(order.Status, request.Status))
        {
            return BadRequest($"Sipariş durumu {order.Status} durumundan {request.Status} durumuna geçirilemez.");
        }

        var previousStatus = order.Status;
        var previousCancellationReason = order.CancellationReason;
        var changedItems = new List<OrderItem>();
        if (request.Status == OrderStatus.Preparing)
        {
            foreach (var item in order.Items.Where(item => item.Status == OrderItemStatus.Pending))
            {
                item.Status = OrderItemStatus.Preparing;
                changedItems.Add(item);
            }
        }
        else if (request.Status == OrderStatus.Ready)
        {
            foreach (var item in order.Items.Where(item => item.Status != OrderItemStatus.Ready))
            {
                item.Status = OrderItemStatus.Ready;
                changedItems.Add(item);
            }
        }

        order.Status = request.Status;
        if (request.Status == OrderStatus.Cancelled)
        {
            if (string.IsNullOrWhiteSpace(request.CancellationReason))
            {
                return BadRequest("İptal sebebi zorunludur.");
            }

            order.CancellationReason = request.CancellationReason.Trim();
        }
        order.UpdatedAt = DateTime.UtcNow;
        var resolvedWaiterCalls = new List<WaiterCall>();

        if (request.Status == OrderStatus.Cancelled && order.Table is not null)
        {
            order.Table.Status = TableStatus.Empty;
            resolvedWaiterCalls = await _dbContext.WaiterCalls
                .Where(call => call.TableId == order.Table.Id && call.ResolvedAt == null)
                .ToListAsync();
            foreach (var waiterCall in resolvedWaiterCalls)
            {
                waiterCall.ResolvedAt = DateTime.UtcNow;
            }
        }

        _auditLog.Add(
            request.Status == OrderStatus.Cancelled ? "Cancel" : "StatusChange",
            "Order",
            order.Id.ToString(),
            new { Status = previousStatus, CancellationReason = previousCancellationReason },
            new { order.Status, order.CancellationReason });
        await _dbContext.SaveChangesAsync();

        foreach (var item in changedItems)
        {
            await _hubContext.SendToOrderAudienceAsync("OrderItemStatusChanged", new OrderItemStatusChangedEvent(
                order.Id,
                item.Id,
                item.Status,
                order.UpdatedAt),
                order.CustomerUserId);
        }

        await _hubContext.SendToOrderAudienceAsync("OrderStatusChanged", new OrderStatusChangedEvent(
            order.Id,
            order.Status,
            order.UpdatedAt),
            order.CustomerUserId);
        await _notificationService.SendOrderStatusAsync(order.Id, order.Status, order.CancellationReason);

        if (order.Table is not null && request.Status == OrderStatus.Cancelled)
        {
            await _hubContext.SendToOperationsAsync("TableStatusChanged", new TableStatusChangedEvent(
                order.Table.Id,
                order.Table.Number,
                order.Table.Status));
        }
        foreach (var waiterCall in resolvedWaiterCalls)
        {
            await _hubContext.SendToOrderAudienceAsync(
                "WaiterCallResolved",
                new { waiterCall.Id, waiterCall.TableId },
                waiterCall.CustomerUserId);
        }

        return NoContent();
    }

    private static bool CanChangeOrderStatus(OrderStatus currentStatus, OrderStatus nextStatus)
    {
        if (currentStatus == nextStatus)
        {
            return true;
        }

        return currentStatus switch
        {
            OrderStatus.Pending => nextStatus is OrderStatus.Preparing or OrderStatus.Ready or OrderStatus.Cancelled,
            OrderStatus.Preparing => nextStatus is OrderStatus.Ready or OrderStatus.Cancelled,
            OrderStatus.Ready => nextStatus == OrderStatus.Cancelled,
            _ => false
        };
    }
}
