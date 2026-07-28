using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Models;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Customer")]
[Route("api/customer")]
public class CustomerController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly UserManager<AppUser> _userManager;

    public CustomerController(RestaurantDbContext dbContext, UserManager<AppUser> userManager)
    {
        _dbContext = dbContext;
        _userManager = userManager;
    }

    [HttpGet("orders")]
    public async Task<ActionResult<IReadOnlyCollection<OrderDto>>> GetOrderHistory()
    {
        var userId = _userManager.GetUserId(User);
        var orders = await OrderQuery()
            .Where(order => order.CustomerUserId == userId)
            .OrderByDescending(order => order.CreatedAt)
            .Take(50)
            .Select(OrderDtoProjection)
            .ToListAsync();

        return Ok(orders);
    }

    [HttpGet("orders/{id:int}")]
    public async Task<ActionResult<OrderDto>> GetOrder(int id)
    {
        var userId = _userManager.GetUserId(User);
        var order = await OrderQuery()
            .Where(order => order.Id == id && order.CustomerUserId == userId)
            .Select(OrderDtoProjection)
            .FirstOrDefaultAsync();

        return order is null ? NotFound() : Ok(order);
    }

    [HttpPut("orders/{id:int}/review")]
    public async Task<ActionResult<OrderReviewDto>> UpsertOrderReview(int id, UpsertOrderReviewRequest request)
    {
        if (request.Rating is < 1 or > 5)
        {
            return BadRequest("Puan 1 ile 5 arasında olmalıdır.");
        }

        var comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim();
        if (comment?.Length > 1000)
        {
            return BadRequest("Yorum en fazla 1000 karakter olabilir.");
        }

        var userId = _userManager.GetUserId(User);
        var order = await _dbContext.Orders
            .Include(order => order.Review)
            .FirstOrDefaultAsync(order => order.Id == id && order.CustomerUserId == userId);

        if (order is null)
        {
            return NotFound();
        }

        if (order.Status != OrderStatus.Delivered)
        {
            return BadRequest("Yalnızca ödemesi tamamlanan siparişler değerlendirilebilir.");
        }

        var now = DateTime.UtcNow;
        if (order.Review is null)
        {
            order.Review = new OrderReview
            {
                Rating = request.Rating,
                Comment = comment,
                CreatedAt = now,
                UpdatedAt = now
            };
        }
        else
        {
            order.Review.Rating = request.Rating;
            order.Review.Comment = comment;
            order.Review.UpdatedAt = now;
        }

        await _dbContext.SaveChangesAsync();
        var review = order.Review;
        return Ok(new OrderReviewDto(
            review.Id,
            review.OrderId,
            review.Rating,
            review.Comment,
            review.CreatedAt,
            review.UpdatedAt));
    }

    [HttpGet("favorites")]
    public async Task<ActionResult<IReadOnlyCollection<MenuItemDto>>> GetFavorites()
    {
        var userId = _userManager.GetUserId(User);
        var favorites = await _dbContext.CustomerFavorites
            .AsNoTracking()
            .Where(favorite => favorite.UserId == userId && favorite.MenuItem != null)
            .OrderByDescending(favorite => favorite.CreatedAt)
            .Select(favorite => new MenuItemDto(
                favorite.MenuItem!.Id,
                favorite.MenuItem.CategoryId,
                favorite.MenuItem.Name,
                favorite.MenuItem.Description,
                favorite.MenuItem.Price,
                favorite.MenuItem.ImageUrl,
                favorite.MenuItem.IsAvailable,
                favorite.MenuItem.PreparationMinutes,
                favorite.MenuItem.Options
                    .Where(option => option.IsActive)
                    .OrderBy(option => option.DisplayOrder)
                    .Select(option => new MenuItemOptionDto(option.Id, option.Name, option.AdditionalPrice))
                    .ToList()))
            .ToListAsync();

        return Ok(favorites);
    }

    [HttpPut("favorites/{menuItemId:int}")]
    public async Task<IActionResult> AddFavorite(int menuItemId)
    {
        var userId = _userManager.GetUserId(User);
        if (!await _dbContext.MenuItems.AnyAsync(item => item.Id == menuItemId))
        {
            return NotFound();
        }

        if (!await _dbContext.CustomerFavorites.AnyAsync(item => item.UserId == userId && item.MenuItemId == menuItemId))
        {
            _dbContext.CustomerFavorites.Add(new CustomerFavorite
            {
                UserId = userId!,
                MenuItemId = menuItemId,
                CreatedAt = DateTime.UtcNow
            });
            await _dbContext.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("favorites/{menuItemId:int}")]
    public async Task<IActionResult> RemoveFavorite(int menuItemId)
    {
        var userId = _userManager.GetUserId(User);
        var favorite = await _dbContext.CustomerFavorites
            .FirstOrDefaultAsync(item => item.UserId == userId && item.MenuItemId == menuItemId);
        if (favorite is not null)
        {
            _dbContext.CustomerFavorites.Remove(favorite);
            await _dbContext.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpPost("push-tokens")]
    public async Task<IActionResult> RegisterPushToken(RegisterPushTokenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token)
            || (!request.Token.StartsWith("ExpoPushToken[", StringComparison.Ordinal)
                && !request.Token.StartsWith("ExponentPushToken[", StringComparison.Ordinal)))
        {
            return BadRequest("Geçerli bir Expo bildirim anahtarı gönderilmelidir.");
        }

        var userId = _userManager.GetUserId(User);
        var token = await _dbContext.CustomerPushTokens.FirstOrDefaultAsync(item => item.Token == request.Token);
        if (token is null)
        {
            token = new CustomerPushToken { Token = request.Token };
            _dbContext.CustomerPushTokens.Add(token);
        }

        token.UserId = userId!;
        token.Platform = request.Platform.Trim().ToLowerInvariant();
        token.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    private IQueryable<Order> OrderQuery()
    {
        return _dbContext.Orders.AsNoTracking();
    }

    private static readonly Expression<Func<Order, OrderDto>> OrderDtoProjection = order =>
        new OrderDto(
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
            order.Review == null
                ? null
                : new OrderReviewDto(
                    order.Review.Id,
                    order.Review.OrderId,
                    order.Review.Rating,
                    order.Review.Comment,
                    order.Review.CreatedAt,
                    order.Review.UpdatedAt));
}
