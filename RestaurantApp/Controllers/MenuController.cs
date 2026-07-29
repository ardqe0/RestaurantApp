using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;

namespace RestaurantApp.Controllers;

[ApiController]
[Route("api/menu")]
public class MenuController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;

    public MenuController(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<MenuCategoryDto>>> GetMenu()
    {
        var categories = await _dbContext.Categories
            .AsNoTracking()
            .Where(category => category.IsActive)
            .OrderBy(category => category.DisplayOrder)
            .Select(category => new MenuCategoryDto(
                category.Id,
                category.Name,
                category.DisplayOrder,
                category.MenuItems
                    .Where(item => item.IsAvailable && item.StockQuantity > 0)
                    .OrderBy(item => item.Name)
                    .Select(item => new MenuItemDto(
                        item.Id,
                        item.CategoryId,
                        item.Name,
                        item.Description,
                        item.Price,
                        item.ImageUrl,
                        item.IsAvailable,
                        item.PreparationMinutes,
                        item.Options
                            .Where(option => option.IsActive)
                            .OrderBy(option => option.DisplayOrder)
                            .Select(option => new MenuItemOptionDto(
                                option.Id,
                                option.Name,
                                option.AdditionalPrice,
                                option.IsActive,
                                option.DisplayOrder))
                            .ToList(),
                        item.StockQuantity))
                    .ToList()))
            .ToListAsync();

        return Ok(categories);
    }
}
