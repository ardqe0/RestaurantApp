using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Models;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/categories")]
public class AdminCategoriesController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;

    public AdminCategoriesController(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CategoryDto>>> GetCategories()
    {
        var categories = await _dbContext.Categories
            .AsNoTracking()
            .OrderBy(category => category.DisplayOrder)
            .Select(category => new CategoryDto(category.Id, category.Name, category.DisplayOrder, category.IsActive))
            .ToListAsync();

        return Ok(categories);
    }

    [HttpPost]
    public async Task<ActionResult<CategoryDto>> CreateCategory(CreateCategoryRequest request)
    {
        var category = new Category
        {
            Name = request.Name.Trim(),
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive
        };

        _dbContext.Categories.Add(category);
        await _dbContext.SaveChangesAsync();

        var dto = new CategoryDto(category.Id, category.Name, category.DisplayOrder, category.IsActive);
        return CreatedAtAction(nameof(GetCategories), dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateCategory(int id, UpdateCategoryRequest request)
    {
        var category = await _dbContext.Categories.FindAsync(id);
        if (category is null)
        {
            return NotFound();
        }

        category.Name = request.Name.Trim();
        category.DisplayOrder = request.DisplayOrder;
        category.IsActive = request.IsActive;

        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        var category = await _dbContext.Categories.FindAsync(id);
        if (category is null)
        {
            return NotFound();
        }

        _dbContext.Categories.Remove(category);
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }
}
