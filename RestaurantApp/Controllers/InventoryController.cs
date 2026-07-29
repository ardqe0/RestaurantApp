using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Services;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Kitchen,Admin")]
[Route("api/inventory")]
public class InventoryController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IHubContext<OrderHub> _hubContext;
    private readonly AuditLogService _auditLog;

    public InventoryController(
        RestaurantDbContext dbContext,
        IHubContext<OrderHub> hubContext,
        AuditLogService auditLog)
    {
        _dbContext = dbContext;
        _hubContext = hubContext;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<InventoryItemDto>>> GetInventory()
    {
        return Ok(await _dbContext.MenuItems
            .AsNoTracking()
            .OrderBy(item => item.StockQuantity)
            .ThenBy(item => item.Category!.DisplayOrder)
            .ThenBy(item => item.Name)
            .Select(item => new InventoryItemDto(
                item.Id,
                item.Category!.Name,
                item.Name,
                item.StockQuantity,
                item.IsAvailable))
            .ToListAsync());
    }

    [HttpPut("{id:int}/adjust")]
    public async Task<ActionResult<InventoryItemDto>> AdjustStock(int id, AdjustInventoryRequest request)
    {
        if (request.Delta == 0)
        {
            return BadRequest("Stok değişikliği sıfır olamaz.");
        }

        var before = await FindInventoryItem(id);
        if (before is null)
        {
            return NotFound();
        }

        var query = _dbContext.MenuItems.Where(item => item.Id == id);
        if (request.Delta < 0)
        {
            query = query.Where(item => item.StockQuantity >= -request.Delta);
        }

        var updatedCount = await query.ExecuteUpdateAsync(setters => setters
            .SetProperty(item => item.StockQuantity, item => item.StockQuantity + request.Delta)
            .SetProperty(item => item.IsAvailable, item => item.StockQuantity + request.Delta > 0));

        if (updatedCount == 0)
        {
            return BadRequest("Stok miktarı sıfırın altına düşürülemez.");
        }

        return await CompleteStockChange(before);
    }

    [HttpPut("{id:int}/stock")]
    public async Task<ActionResult<InventoryItemDto>> SetStock(int id, SetInventoryStockRequest request)
    {
        var before = await FindInventoryItem(id);
        if (before is null)
        {
            return NotFound();
        }

        await _dbContext.MenuItems
            .Where(item => item.Id == id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.StockQuantity, request.StockQuantity)
                .SetProperty(item => item.IsAvailable, request.StockQuantity > 0));

        return await CompleteStockChange(before);
    }

    [HttpPut("{id:int}/availability")]
    public async Task<ActionResult<InventoryItemDto>> SetAvailability(
        int id,
        SetInventoryAvailabilityRequest request)
    {
        var before = await FindInventoryItem(id);
        if (before is null)
        {
            return NotFound();
        }

        if (request.IsAvailable && before.StockQuantity <= 0)
        {
            return BadRequest("Satışa açmak için önce stok ekleyin.");
        }

        await _dbContext.MenuItems
            .Where(item => item.Id == id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.IsAvailable, request.IsAvailable));

        return await CompleteStockChange(before);
    }

    private async Task<ActionResult<InventoryItemDto>> CompleteStockChange(InventoryItemDto before)
    {
        var after = await FindInventoryItem(before.Id);
        if (after is null)
        {
            return NotFound();
        }

        _auditLog.Add("StockChange", "MenuItem", after.Id.ToString(), before, after);
        await _dbContext.SaveChangesAsync();
        await _hubContext.SendMenuStockChangedAsync(new MenuStockChangedEvent(
            after.Id,
            after.StockQuantity,
            after.IsAvailable));

        return Ok(after);
    }

    private Task<InventoryItemDto?> FindInventoryItem(int id)
    {
        return _dbContext.MenuItems
            .AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new InventoryItemDto(
                item.Id,
                item.Category!.Name,
                item.Name,
                item.StockQuantity,
                item.IsAvailable))
            .FirstOrDefaultAsync();
    }
}
