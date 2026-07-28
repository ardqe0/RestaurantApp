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
[Route("api/admin/payments")]
public class AdminPaymentsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IHubContext<OrderHub> _hubContext;
    private readonly OrderPushNotificationService _notificationService;
    private readonly AuditLogService _auditLog;

    public AdminPaymentsController(
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

    [HttpPost]
    public async Task<ActionResult<PaymentDto>> CreatePayment(CreatePaymentRequest request)
    {
        var order = await _dbContext.Orders
            .Include(order => order.Table)
            .Include(order => order.Payment)
            .FirstOrDefaultAsync(order => order.Id == request.OrderId);

        if (order is null)
        {
            return BadRequest("Sipariş bulunamadı.");
        }

        if (order.Payment is not null)
        {
            return BadRequest("Bu sipariş için ödeme zaten alınmış.");
        }

        if (order.Status == OrderStatus.Cancelled)
        {
            return BadRequest("İptal edilen sipariş için ödeme alınamaz.");
        }

        if (order.Status != OrderStatus.Ready)
        {
            return BadRequest("Ödeme alınabilmesi için sipariş hazır olmalıdır.");
        }

        if (order.Table?.Status != TableStatus.WaitingForPayment || order.RequestedPaymentMethod is null)
        {
            return BadRequest("Müşterinin hesap isteği ve ödeme tercihi bekleniyor.");
        }

        if (request.Method != order.RequestedPaymentMethod)
        {
            return BadRequest("Ödeme yöntemi müşterinin seçtiği yöntemle aynı olmalıdır.");
        }

        var payment = new Payment
        {
            OrderId = order.Id,
            Amount = order.TotalAmount,
            Method = request.Method,
            Status = PaymentStatus.Completed,
            CreatedAt = DateTime.UtcNow
        };

        order.Payment = payment;
        order.Status = OrderStatus.Delivered;
        order.UpdatedAt = DateTime.UtcNow;
        var resolvedWaiterCalls = new List<WaiterCall>();

        if (order.Table is not null)
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
            "Complete",
            "Payment",
            order.Id.ToString(),
            after: new
            {
                OrderId = order.Id,
                payment.Amount,
                payment.Method,
                payment.Status,
                OrderStatus = order.Status,
                TableStatus = order.Table?.Status
            });
        await _dbContext.SaveChangesAsync();

        var dto = new PaymentDto(payment.Id, payment.OrderId, payment.Amount, payment.Method, payment.Status, payment.CreatedAt);

        await _hubContext.SendToOrderAudienceAsync("OrderStatusChanged", new OrderStatusChangedEvent(
            order.Id,
            order.Status,
            order.UpdatedAt),
            order.CustomerUserId);
        await _notificationService.SendOrderStatusAsync(order.Id, order.Status);

        if (order.Table is not null)
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

        return CreatedAtAction(nameof(GetPaymentByOrderId), new { orderId = payment.OrderId }, dto);
    }

    [HttpGet("{orderId:int}")]
    public async Task<ActionResult<PaymentDto>> GetPaymentByOrderId(int orderId)
    {
        var payment = await _dbContext.Payments
            .AsNoTracking()
            .Where(payment => payment.OrderId == orderId)
            .Select(payment => new PaymentDto(
                payment.Id,
                payment.OrderId,
                payment.Amount,
                payment.Method,
                payment.Status,
                payment.CreatedAt))
            .FirstOrDefaultAsync();

        return payment is null ? NotFound() : Ok(payment);
    }
}
