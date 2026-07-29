using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record CategoryDto(
    int Id,
    string Name,
    int DisplayOrder,
    bool IsActive);

public record CreateCategoryRequest(
    [Required, StringLength(100)] string Name,
    [Range(0, 10000)] int DisplayOrder,
    bool IsActive = true);

public record UpdateCategoryRequest(
    [Required, StringLength(100)] string Name,
    [Range(0, 10000)] int DisplayOrder,
    bool IsActive);

public record CreateMenuItemRequest(
    [Range(1, int.MaxValue)] int CategoryId,
    [Required, StringLength(150)] string Name,
    [StringLength(500)] string Description,
    [Range(typeof(decimal), "0", "1000000")] decimal Price,
    [StringLength(500)] string? ImageUrl,
    bool IsAvailable,
    [Range(0, 1440)] int PreparationMinutes,
    [Range(0, 1000000)] int StockQuantity = 100);

public record UpdateMenuItemRequest(
    [Range(1, int.MaxValue)] int CategoryId,
    [Required, StringLength(150)] string Name,
    [StringLength(500)] string Description,
    [Range(typeof(decimal), "0", "1000000")] decimal Price,
    [StringLength(500)] string? ImageUrl,
    bool IsAvailable,
    [Range(0, 1440)] int PreparationMinutes,
    [Range(0, 1000000)] int StockQuantity = 100);
