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
[Authorize(Roles = "Admin")]
public class AdminMenuItemOptionsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly AuditLogService _auditLog;
    private readonly IHubContext<OrderHub> _hubContext;

    public AdminMenuItemOptionsController(
        RestaurantDbContext dbContext,
        AuditLogService auditLog,
        IHubContext<OrderHub> hubContext)
    {
        _dbContext = dbContext;
        _auditLog = auditLog;
        _hubContext = hubContext;
    }

    [HttpPost("api/admin/menu-items/{menuItemId:int}/options")]
    public async Task<ActionResult<MenuItemOptionDto>> CreateOption(
        int menuItemId,
        CreateMenuItemOptionRequest request)
    {
        var menuItem = await _dbContext.MenuItems.FindAsync(menuItemId);
        if (menuItem is null)
        {
            return NotFound();
        }

        var option = new MenuItemOption
        {
            MenuItemId = menuItemId,
            Name = request.Name.Trim(),
            AdditionalPrice = request.AdditionalPrice,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive
        };
        _dbContext.MenuItemOptions.Add(option);
        await _dbContext.SaveChangesAsync();

        _auditLog.Add("Create", "MenuItemOption", option.Id.ToString(), after: ToAuditValue(option));
        await _dbContext.SaveChangesAsync();
        await NotifyMenuChanged(menuItem);

        return CreatedAtAction(nameof(CreateOption), new { menuItemId }, ToDto(option));
    }

    [HttpPut("api/admin/menu-item-options/{id:int}")]
    public async Task<IActionResult> UpdateOption(int id, UpdateMenuItemOptionRequest request)
    {
        var option = await _dbContext.MenuItemOptions
            .Include(item => item.MenuItem)
            .FirstOrDefaultAsync(item => item.Id == id);
        if (option is null || option.MenuItem is null)
        {
            return NotFound();
        }

        var before = ToAuditValue(option);
        option.Name = request.Name.Trim();
        option.AdditionalPrice = request.AdditionalPrice;
        option.DisplayOrder = request.DisplayOrder;
        option.IsActive = request.IsActive;

        _auditLog.Add("Update", "MenuItemOption", option.Id.ToString(), before, ToAuditValue(option));
        await _dbContext.SaveChangesAsync();
        await NotifyMenuChanged(option.MenuItem);
        return NoContent();
    }

    private Task NotifyMenuChanged(MenuItem menuItem)
    {
        return _hubContext.SendMenuStockChangedAsync(new MenuStockChangedEvent(
            menuItem.Id,
            menuItem.StockQuantity,
            menuItem.IsAvailable));
    }

    private static MenuItemOptionDto ToDto(MenuItemOption option) => new(
        option.Id,
        option.Name,
        option.AdditionalPrice,
        option.IsActive,
        option.DisplayOrder);

    private static object ToAuditValue(MenuItemOption option) => new
    {
        option.MenuItemId,
        option.Name,
        option.AdditionalPrice,
        option.DisplayOrder,
        option.IsActive
    };
}
