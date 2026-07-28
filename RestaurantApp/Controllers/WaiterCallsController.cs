using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Models;

namespace RestaurantApp.Controllers;

[ApiController]
[Route("api")]
public class WaiterCallsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly UserManager<AppUser> _userManager;
    private readonly IHubContext<OrderHub> _hubContext;

    public WaiterCallsController(
        RestaurantDbContext dbContext,
        UserManager<AppUser> userManager,
        IHubContext<OrderHub> hubContext)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _hubContext = hubContext;
    }

    [Authorize(Roles = "Customer")]
    [HttpPost("customer/waiter-calls")]
    public async Task<ActionResult<WaiterCallDto>> Create(CreateWaiterCallRequest request)
    {
        var userId = _userManager.GetUserId(User);
        var table = await _dbContext.RestaurantTables.FindAsync(request.TableId);
        if (table is null)
        {
            return NotFound("Masa bulunamadı.");
        }

        var hasActiveOrder = await _dbContext.Orders.AnyAsync(order =>
            order.TableId == request.TableId
            && order.CustomerUserId == userId
            && order.Status != OrderStatus.Delivered
            && order.Status != OrderStatus.Cancelled);
        if (!hasActiveOrder)
        {
            return BadRequest("Garson çağırmak için aktif bir siparişiniz olmalıdır.");
        }

        var existing = await _dbContext.WaiterCalls
            .AsNoTracking()
            .Where(call => call.TableId == request.TableId && call.ResolvedAt == null)
            .Select(call => new WaiterCallDto(call.Id, call.TableId, table.Number, call.CreatedAt, call.ResolvedAt))
            .FirstOrDefaultAsync();
        if (existing is not null)
        {
            return Ok(existing);
        }

        var waiterCall = new WaiterCall
        {
            TableId = request.TableId,
            CustomerUserId = userId!,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.WaiterCalls.Add(waiterCall);
        await _dbContext.SaveChangesAsync();

        var dto = new WaiterCallDto(waiterCall.Id, waiterCall.TableId, table.Number, waiterCall.CreatedAt, null);
        await _hubContext.SendToOperationsAsync("WaiterCallCreated", dto);
        return Ok(dto);
    }

    [Authorize(Roles = "Customer")]
    [HttpGet("customer/waiter-calls/{tableId:int}/active")]
    public async Task<ActionResult<WaiterCallDto?>> GetCustomerActive(int tableId)
    {
        var userId = _userManager.GetUserId(User);
        var activeCall = await _dbContext.WaiterCalls
            .AsNoTracking()
            .Where(call => call.TableId == tableId
                && call.CustomerUserId == userId
                && call.ResolvedAt == null)
            .Select(call => new WaiterCallDto(
                call.Id,
                call.TableId,
                call.Table == null ? 0 : call.Table.Number,
                call.CreatedAt,
                call.ResolvedAt))
            .FirstOrDefaultAsync();

        return Ok(activeCall);
    }

    [Authorize(Roles = "Kitchen,Admin")]
    [HttpGet("admin/waiter-calls/active")]
    public async Task<ActionResult<IReadOnlyCollection<WaiterCallDto>>> GetActive()
    {
        var calls = await _dbContext.WaiterCalls
            .AsNoTracking()
            .Where(call => call.ResolvedAt == null)
            .OrderBy(call => call.CreatedAt)
            .Select(call => new WaiterCallDto(
                call.Id,
                call.TableId,
                call.Table == null ? 0 : call.Table.Number,
                call.CreatedAt,
                call.ResolvedAt))
            .ToListAsync();
        return Ok(calls);
    }

    [Authorize(Roles = "Kitchen,Admin")]
    [HttpPut("admin/waiter-calls/{id:int}/resolve")]
    public async Task<IActionResult> Resolve(int id)
    {
        var waiterCall = await _dbContext.WaiterCalls.FindAsync(id);
        if (waiterCall is null)
        {
            return NotFound();
        }

        if (waiterCall.ResolvedAt is null)
        {
            waiterCall.ResolvedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();
            await _hubContext.SendToOrderAudienceAsync(
                "WaiterCallResolved",
                new { waiterCall.Id, waiterCall.TableId },
                waiterCall.CustomerUserId);
        }

        return NoContent();
    }
}
