using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/audit-logs")]
public class AdminAuditLogsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;

    public AdminAuditLogsController(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<AuditLogDto>>> GetAuditLogs(
        [FromQuery] int limit = 100,
        [FromQuery] string? entityType = null)
    {
        limit = Math.Clamp(limit, 1, 200);
        var query = _dbContext.AuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(entityType))
        {
            query = query.Where(log => log.EntityType == entityType.Trim());
        }

        var logs = await query
            .OrderByDescending(log => log.CreatedAt)
            .ThenByDescending(log => log.Id)
            .Take(limit)
            .Select(log => new AuditLogDto(
                log.Id,
                log.UserName,
                log.Role,
                log.Action,
                log.EntityType,
                log.EntityId,
                log.BeforeJson,
                log.AfterJson,
                log.IpAddress,
                log.CreatedAt))
            .ToListAsync();

        return Ok(logs);
    }
}
