using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Models;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Customer")]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IHubContext<OrderHub> _hubContext;
    private readonly UserManager<AppUser> _userManager;

    public OrdersController(
        RestaurantDbContext dbContext,
        IHubContext<OrderHub> hubContext,
        UserManager<AppUser> userManager)
    {
        _dbContext = dbContext;
        _hubContext = hubContext;
        _userManager = userManager;
    }

    [HttpPost]
    [EnableRateLimiting("customer-actions")]
    public async Task<ActionResult<OrderDto>> CreateOrder(CreateOrderRequest request)
    {
        var customerUserId = _userManager.GetUserId(User);
        if (string.IsNullOrWhiteSpace(customerUserId))
        {
            return Unauthorized();
        }

        if (request.Items.Count == 0)
        {
            return BadRequest("Sipariş için en az bir ürün seçilmelidir.");
        }

        if (request.Items.Any(item => item.Quantity <= 0))
        {
            return BadRequest("Ürün adetleri 1 veya daha büyük olmalıdır.");
        }

        var table = await _dbContext.RestaurantTables
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == request.TableId);
        if (table is null)
        {
            return BadRequest("Masa bulunamadı.");
        }

        if (table.Status != TableStatus.Empty)
        {
            return BadRequest("Bu masa dolu. Açık sipariş tamamlanmadan yeni sipariş verilemez.");
        }

        var requestedItemIds = request.Items.Select(item => item.MenuItemId).Distinct().ToList();
        var menuItems = await _dbContext.MenuItems
            .Include(item => item.Options)
            .Where(item => requestedItemIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id);

        if (menuItems.Count != requestedItemIds.Count)
        {
            return BadRequest("Siparişte bulunamayan ürün var.");
        }

        if (menuItems.Values.Any(item => !item.IsAvailable))
        {
            return BadRequest("Pasif veya mevcut olmayan ürün sipariş edilemez.");
        }

        var now = DateTime.UtcNow;
        var order = new Order
        {
            TableId = table.Id,
            Status = OrderStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now,
            CustomerUserId = customerUserId
        };

        foreach (var requestItem in request.Items)
        {
            var menuItem = menuItems[requestItem.MenuItemId];
            var requestedOptionIds = requestItem.OptionIds?.Distinct().ToHashSet() ?? [];
            var selectedOptions = menuItem.Options
                .Where(option => option.IsActive && requestedOptionIds.Contains(option.Id))
                .OrderBy(option => option.DisplayOrder)
                .ToList();

            if (selectedOptions.Count != requestedOptionIds.Count)
            {
                return BadRequest($"{menuItem.Name} için geçersiz veya pasif ekstra seçildi.");
            }

            var optionDescription = selectedOptions.Count == 0
                ? null
                : $"Ekstralar: {string.Join(", ", selectedOptions.Select(option => option.Name))}";
            var noteParts = new[] { requestItem.Note?.Trim(), optionDescription }
                .Where(part => !string.IsNullOrWhiteSpace(part));
            var combinedNote = string.Join(" · ", noteParts);
            if (combinedNote.Length > 300)
            {
                return BadRequest($"{menuItem.Name} için hazırlama notu ve ekstralar toplam 300 karakteri geçemez.");
            }

            order.Items.Add(new OrderItem
            {
                MenuItemId = menuItem.Id,
                Quantity = requestItem.Quantity,
                UnitPrice = menuItem.Price + selectedOptions.Sum(option => option.AdditionalPrice),
                Note = combinedNote,
                Status = OrderItemStatus.Pending
            });
        }

        order.SubtotalAmount = order.Items.Sum(item => item.Quantity * item.UnitPrice);
        var activeCampaigns = await _dbContext.Campaigns
            .AsNoTracking()
            .Where(campaign =>
                campaign.IsActive
                && campaign.StartsAt <= now
                && campaign.EndsAt >= now
                && order.SubtotalAmount >= campaign.MinimumOrderAmount)
            .ToListAsync();
        var appliedCampaign = activeCampaigns
            .Select(campaign => new
            {
                Campaign = campaign,
                Discount = CalculateDiscount(campaign, order.SubtotalAmount)
            })
            .OrderByDescending(item => item.Discount)
            .ThenBy(item => item.Campaign.EndsAt)
            .FirstOrDefault();

        order.DiscountAmount = appliedCampaign?.Discount ?? 0;
        order.TotalAmount = order.SubtotalAmount - order.DiscountAmount;
        order.CampaignId = appliedCampaign?.Campaign.Id;
        order.CampaignName = appliedCampaign?.Campaign.Name;

        var tableClaimed = false;
        var executionStrategy = _dbContext.Database.CreateExecutionStrategy();
        await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync();
            var claimedTableCount = await _dbContext.RestaurantTables
                .Where(item => item.Id == table.Id && item.Status == TableStatus.Empty)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.Status, TableStatus.Occupied));

            if (claimedTableCount == 0)
            {
                await transaction.RollbackAsync();
                return;
            }

            tableClaimed = true;
            _dbContext.Orders.Add(order);
            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();
        });

        if (!tableClaimed)
        {
            return BadRequest("Bu masa dolu. Açık sipariş tamamlanmadan yeni sipariş verilemez.");
        }

        var createdOrder = await GetOrderDto(order.Id, customerUserId);
        if (createdOrder is not null)
        {
            await _hubContext.SendToOperationsAsync("NewOrder", new NewOrderEvent(
                createdOrder.Id,
                createdOrder.TableId,
                createdOrder.TableNumber,
                createdOrder.TotalAmount,
                createdOrder.CreatedAt));

            await _hubContext.SendToOperationsAsync("TableStatusChanged", new TableStatusChangedEvent(
                table.Id,
                table.Number,
                TableStatus.Occupied));
        }

        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, createdOrder);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var customerUserId = _userManager.GetUserId(User);
        if (string.IsNullOrWhiteSpace(customerUserId))
        {
            return Unauthorized();
        }

        var order = await GetOrderDto(id, customerUserId);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpPost("{id:int}/request-payment")]
    [EnableRateLimiting("customer-actions")]
    public async Task<IActionResult> RequestPayment(int id, RequestPaymentRequest request)
    {
        var customerUserId = _userManager.GetUserId(User);
        if (string.IsNullOrWhiteSpace(customerUserId))
        {
            return Unauthorized();
        }

        var order = await _dbContext.Orders
            .Include(order => order.Table)
            .Include(order => order.Payments)
            .FirstOrDefaultAsync(order => order.Id == id && order.CustomerUserId == customerUserId);

        if (order is null || order.Table is null)
        {
            return NotFound();
        }

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Delivered)
        {
            return BadRequest("Kapatılmış sipariş için hesap istenemez.");
        }

        if (order.Status != OrderStatus.Ready)
        {
            return BadRequest("Hesap istemek için sipariş hazır olmalıdır.");
        }

        if (order.Table.Status == TableStatus.WaitingForPayment)
        {
            return BadRequest("Bu sipariş için hesap isteği zaten gönderildi.");
        }

        if (order.Payments.Count != 0)
        {
            return BadRequest("Bu sipariş için ödeme planı zaten oluşturuldu.");
        }

        order.Table.Status = TableStatus.WaitingForPayment;
        order.RequestedPaymentMethod = request.Method;
        order.UpdatedAt = DateTime.UtcNow;
        var splitCount = request.SplitCount;
        var totalCents = decimal.ToInt32(decimal.Round(order.TotalAmount * 100, 0, MidpointRounding.AwayFromZero));
        var baseCents = totalCents / splitCount;
        var remainderCents = totalCents % splitCount;
        for (var index = 0; index < splitCount; index++)
        {
            order.Payments.Add(new Payment
            {
                Amount = (baseCents + (index < remainderCents ? 1 : 0)) / 100m,
                Method = request.Method,
                Status = PaymentStatus.Pending,
                CreatedAt = DateTime.UtcNow
            });
        }
        await _dbContext.SaveChangesAsync();

        await _hubContext.SendToOperationsAsync("TableStatusChanged", new TableStatusChangedEvent(
            order.Table.Id,
            order.Table.Number,
            order.Table.Status));

        return NoContent();
    }

    private async Task<OrderDto?> GetOrderDto(int id, string customerUserId)
    {
        return await _dbContext.Orders
            .AsNoTracking()
            .Where(order => order.Id == id && order.CustomerUserId == customerUserId)
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
                null,
                order.SubtotalAmount,
                order.DiscountAmount,
                order.CampaignName,
                order.Payments.OrderBy(payment => payment.Id).Select(payment => new PaymentDto(
                    payment.Id,
                    payment.OrderId,
                    payment.Amount,
                    payment.Method,
                    payment.Status,
                    payment.CreatedAt,
                    payment.CompletedAt)).ToList()))
            .FirstOrDefaultAsync();
    }

    private static decimal CalculateDiscount(Campaign campaign, decimal subtotal)
    {
        var discount = campaign.DiscountType == CampaignDiscountType.Percentage
            ? decimal.Round(subtotal * campaign.DiscountValue / 100m, 2, MidpointRounding.AwayFromZero)
            : campaign.DiscountValue;
        return Math.Clamp(discount, 0, subtotal);
    }
}
