using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;

namespace RestaurantApp.Controllers;

[ApiController]
[Route("api/tables")]
public class TablesController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;

    public TablesController(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IReadOnlyCollection<TableDto>>> GetTables()
    {
        var tables = await _dbContext.RestaurantTables
            .AsNoTracking()
            .OrderBy(table => table.Number)
            .Select(table => new TableDto(table.Id, table.Number, table.QRCode, table.Status, table.Capacity))
            .ToListAsync();

        return Ok(tables);
    }

    [HttpGet("{qrCode}")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<TableDto>> GetByQrCode(string qrCode)
    {
        var normalizedQrCode = qrCode.Trim();
        var shortCodeQrVariant = $"{normalizedQrCode.ToLowerInvariant()}-qr";

        var table = await _dbContext.RestaurantTables
            .AsNoTracking()
            // Seed verisindeki fiziksel QR kodu (table-001-qr) ile ekranda
            // kullanılan kısa kodu (TABLE-001) birlikte destekler.
            .Where(table => table.QRCode == normalizedQrCode || table.QRCode == shortCodeQrVariant)
            .Select(table => new TableDto(table.Id, table.Number, table.QRCode, table.Status, table.Capacity))
            .FirstOrDefaultAsync();

        return table is null ? NotFound() : Ok(table);
    }
}
