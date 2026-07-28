namespace RestaurantApp.Contracts;

public record MenuCategoryDto(
    int Id,
    string Name,
    int DisplayOrder,
    IReadOnlyCollection<MenuItemDto> Items);

public record MenuItemDto(
    int Id,
    int CategoryId,
    string Name,
    string Description,
    decimal Price,
    string? ImageUrl,
    bool IsAvailable,
    int PreparationMinutes,
    IReadOnlyCollection<MenuItemOptionDto>? Options = null);

public record MenuItemOptionDto(
    int Id,
    string Name,
    decimal AdditionalPrice);
