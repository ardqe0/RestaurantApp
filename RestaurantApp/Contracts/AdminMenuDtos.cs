using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record CategoryDto(
    int Id,
    string Name,
    int DisplayOrder,
    bool IsActive);

public record CreateCategoryRequest(
    [property: Required, StringLength(100)] string Name,
    [property: Range(0, 10000)] int DisplayOrder,
    bool IsActive = true);

public record UpdateCategoryRequest(
    [property: Required, StringLength(100)] string Name,
    [property: Range(0, 10000)] int DisplayOrder,
    bool IsActive);

public record CreateMenuItemRequest(
    [property: Range(1, int.MaxValue)] int CategoryId,
    [property: Required, StringLength(150)] string Name,
    [property: StringLength(500)] string Description,
    [property: Range(typeof(decimal), "0", "1000000")] decimal Price,
    [property: StringLength(500)] string? ImageUrl,
    bool IsAvailable,
    [property: Range(0, 1440)] int PreparationMinutes);

public record UpdateMenuItemRequest(
    [property: Range(1, int.MaxValue)] int CategoryId,
    [property: Required, StringLength(150)] string Name,
    [property: StringLength(500)] string Description,
    [property: Range(typeof(decimal), "0", "1000000")] decimal Price,
    [property: StringLength(500)] string? ImageUrl,
    bool IsAvailable,
    [property: Range(0, 1440)] int PreparationMinutes);
