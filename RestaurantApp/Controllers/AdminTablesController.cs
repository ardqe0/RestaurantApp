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
[Route("api/admin/tables")]
public class AdminTablesController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly AuditLogService _auditLog;

    public AdminTablesController(RestaurantDbContext dbContext, AuditLogService auditLog)
    {
        _dbContext = dbContext;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<TableDto>>> GetTables()
    {
        var tables = await _dbContext.RestaurantTables
            .AsNoTracking()
            .OrderBy(table => table.Number)
            .Select(table => new TableDto(table.Id, table.Number, table.QRCode, table.Status, table.Capacity))
            .ToListAsync();

        return Ok(tables);
    }

    [HttpPost]
    public async Task<ActionResult<TableDto>> CreateTable(CreateTableRequest request)
    {
        var qrCode = request.QRCode.Trim();
        if (await _dbContext.RestaurantTables.AnyAsync(table =>
                table.Number == request.Number || table.QRCode == qrCode))
        {
            return BadRequest("Masa numarası ve QR kodu benzersiz olmalıdır.");
        }

        var table = new RestaurantTable
        {
            Number = request.Number,
            QRCode = qrCode,
            Capacity = request.Capacity,
            Status = TableStatus.Empty
        };

        _dbContext.RestaurantTables.Add(table);
        await _dbContext.SaveChangesAsync();
        _auditLog.Add("Create", "Table", table.Id.ToString(), after: ToAuditValue(table));
        await _dbContext.SaveChangesAsync();

        var dto = new TableDto(table.Id, table.Number, table.QRCode, table.Status, table.Capacity);
        return CreatedAtAction(nameof(GetTables), dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateTable(int id, UpdateTableRequest request)
    {
        var table = await _dbContext.RestaurantTables.FindAsync(id);
        if (table is null)
        {
            return NotFound();
        }

        var qrCode = request.QRCode.Trim();
        if (await _dbContext.RestaurantTables.AnyAsync(item =>
                item.Id != id && (item.Number == request.Number || item.QRCode == qrCode)))
        {
            return BadRequest("Masa numarası ve QR kodu benzersiz olmalıdır.");
        }

        if (request.Status == TableStatus.Empty
            && table.Status != TableStatus.Empty
            && await _dbContext.Orders.AnyAsync(order =>
                order.TableId == id
                && order.Status != OrderStatus.Delivered
                && order.Status != OrderStatus.Cancelled))
        {
            return BadRequest("Aktif siparişi bulunan masa elle boşaltılamaz.");
        }

        var before = ToAuditValue(table);
        table.Number = request.Number;
        table.QRCode = qrCode;
        table.Status = request.Status;
        table.Capacity = request.Capacity;

        _auditLog.Add("Update", "Table", table.Id.ToString(), before, ToAuditValue(table));
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    private static object ToAuditValue(RestaurantTable table) => new
    {
        table.Number,
        QRCode = table.QRCode,
        table.Status,
        table.Capacity
    };
}
