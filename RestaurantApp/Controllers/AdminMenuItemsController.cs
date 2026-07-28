using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Models;
using RestaurantApp.Services;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/menu-items")]
public class AdminMenuItemsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly AuditLogService _auditLog;

    public AdminMenuItemsController(RestaurantDbContext dbContext, AuditLogService auditLog)
    {
        _dbContext = dbContext;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<MenuItemDto>>> GetMenuItems()
    {
        var items = await _dbContext.MenuItems
            .AsNoTracking()
            .OrderBy(item => item.CategoryId)
            .ThenBy(item => item.Name)
            .Select(item => new MenuItemDto(
                item.Id,
                item.CategoryId,
                item.Name,
                item.Description,
                item.Price,
                item.ImageUrl,
                item.IsAvailable,
                item.PreparationMinutes,
                null))
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<MenuItemDto>> CreateMenuItem(CreateMenuItemRequest request)
    {
        if (!await _dbContext.Categories.AnyAsync(category => category.Id == request.CategoryId))
        {
            return BadRequest("Kategori bulunamadı.");
        }

        var menuItem = new MenuItem
        {
            CategoryId = request.CategoryId,
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Price = request.Price,
            ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim(),
            IsAvailable = request.IsAvailable,
            PreparationMinutes = request.PreparationMinutes
        };

        _dbContext.MenuItems.Add(menuItem);
        await _dbContext.SaveChangesAsync();
        _auditLog.Add("Create", "MenuItem", menuItem.Id.ToString(), after: ToAuditValue(menuItem));
        await _dbContext.SaveChangesAsync();

        var dto = ToDto(menuItem);
        return CreatedAtAction(nameof(GetMenuItems), dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateMenuItem(int id, UpdateMenuItemRequest request)
    {
        var menuItem = await _dbContext.MenuItems.FindAsync(id);
        if (menuItem is null)
        {
            return NotFound();
        }

        if (!await _dbContext.Categories.AnyAsync(category => category.Id == request.CategoryId))
        {
            return BadRequest("Kategori bulunamadı.");
        }

        var before = ToAuditValue(menuItem);
        menuItem.CategoryId = request.CategoryId;
        menuItem.Name = request.Name.Trim();
        menuItem.Description = request.Description.Trim();
        menuItem.Price = request.Price;
        menuItem.ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();
        menuItem.IsAvailable = request.IsAvailable;
        menuItem.PreparationMinutes = request.PreparationMinutes;

        _auditLog.Add("Update", "MenuItem", menuItem.Id.ToString(), before, ToAuditValue(menuItem));
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteMenuItem(int id)
    {
        var menuItem = await _dbContext.MenuItems.FindAsync(id);
        if (menuItem is null)
        {
            return NotFound();
        }

        _auditLog.Add("Delete", "MenuItem", menuItem.Id.ToString(), before: ToAuditValue(menuItem));
        _dbContext.MenuItems.Remove(menuItem);
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    private static MenuItemDto ToDto(MenuItem menuItem)
    {
        return new MenuItemDto(
            menuItem.Id,
            menuItem.CategoryId,
            menuItem.Name,
            menuItem.Description,
            menuItem.Price,
            menuItem.ImageUrl,
            menuItem.IsAvailable,
            menuItem.PreparationMinutes);
    }

    private static object ToAuditValue(MenuItem menuItem) => new
    {
        menuItem.CategoryId,
        menuItem.Name,
        menuItem.Description,
        menuItem.Price,
        menuItem.ImageUrl,
        menuItem.IsAvailable,
        menuItem.PreparationMinutes
    };
}
