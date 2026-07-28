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
            .Include(order => order.Payments)
            .FirstOrDefaultAsync(order => order.Id == request.OrderId);

        if (order is null)
        {
            return BadRequest("Sipariş bulunamadı.");
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

        // Migration öncesinde hesap istenmiş ancak henüz ödeme kaydı oluşmamış
        // siparişleri eski mobil sürümlerle geriye uyumlu biçimde tamamlar.
        if (order.Payments.Count == 0 && request.PaymentId is null)
        {
            order.Payments.Add(new Payment
            {
                OrderId = order.Id,
                Amount = order.TotalAmount,
                Method = request.Method,
                Status = PaymentStatus.Pending,
                CreatedAt = DateTime.UtcNow
            });
        }

        var payment = request.PaymentId is not null
            ? order.Payments.FirstOrDefault(item => item.Id == request.PaymentId)
            : order.Payments
                .Where(item => item.Status == PaymentStatus.Pending && item.Method == request.Method)
                .OrderBy(item => item.Id)
                .FirstOrDefault();

        if (payment is null)
        {
            return BadRequest("Ödenecek adisyon parçası bulunamadı.");
        }

        if (payment.Status == PaymentStatus.Completed)
        {
            return BadRequest("Bu adisyon parçası daha önce ödendi.");
        }

        if (request.Method != payment.Method)
        {
            return BadRequest("Ödeme yöntemi bu adisyon parçası için seçilen yöntemle aynı olmalıdır.");
        }

        payment.Status = PaymentStatus.Completed;
        payment.CompletedAt = DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;
        var allPaymentsCompleted = order.Payments.All(item =>
            item.Id == payment.Id || item.Status == PaymentStatus.Completed);
        var resolvedWaiterCalls = new List<WaiterCall>();

        if (allPaymentsCompleted)
        {
            order.Status = OrderStatus.Delivered;
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
                TableStatus = order.Table?.Status,
                AllPaymentsCompleted = allPaymentsCompleted
            });
        await _dbContext.SaveChangesAsync();

        var dto = new PaymentDto(
            payment.Id, payment.OrderId, payment.Amount, payment.Method, payment.Status,
            payment.CreatedAt, payment.CompletedAt);

        await _hubContext.SendToOrderAudienceAsync("PaymentStatusChanged", dto, order.CustomerUserId);

        if (allPaymentsCompleted)
        {
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
            .OrderByDescending(payment => payment.CompletedAt)
            .Select(payment => new PaymentDto(
                payment.Id,
                payment.OrderId,
                payment.Amount,
                payment.Method,
                payment.Status,
                payment.CreatedAt,
                payment.CompletedAt))
            .FirstOrDefaultAsync();

        return payment is null ? NotFound() : Ok(payment);
    }
}
