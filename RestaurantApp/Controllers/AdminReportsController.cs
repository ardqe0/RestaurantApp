using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Infrastructure;
using RestaurantApp.Models;

namespace RestaurantApp.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/reports")]
public class AdminReportsController : ControllerBase
{
    private const int MaximumReportDays = 366;
    private readonly RestaurantDbContext _dbContext;
    private readonly ILogger<AdminReportsController> _logger;

    public AdminReportsController(RestaurantDbContext dbContext, ILogger<AdminReportsController> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpGet("daily")]
    public async Task<ActionResult<DailyReportDto>> GetDailyReport([FromQuery] DateOnly? date, CancellationToken cancellationToken)
    {
        return Ok(await BuildDailyReport(date ?? RestaurantTime.Today(), cancellationToken));
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<DashboardSummaryDto>> GetDashboardSummary(
        [FromQuery] DateOnly? date,
        CancellationToken cancellationToken)
    {
        var reportDate = date ?? RestaurantTime.Today();
        var (start, end) = RestaurantTime.ToUtcRange(reportDate, reportDate);

        var dailyOrderCount = await _dbContext.Orders.AsNoTracking()
            .CountAsync(order => order.CreatedAt >= start && order.CreatedAt < end, cancellationToken);
        var dailyRevenue = await _dbContext.Payments.AsNoTracking()
            .Where(payment =>
                payment.Status == PaymentStatus.Completed &&
                payment.CreatedAt >= start &&
                payment.CreatedAt < end)
            .SumAsync(payment => (decimal?)payment.Amount, cancellationToken) ?? 0;
        var totalTableCount = await _dbContext.RestaurantTables.AsNoTracking().CountAsync(cancellationToken);
        var activeTableCount = await _dbContext.RestaurantTables.AsNoTracking()
            .CountAsync(table => table.Status != TableStatus.Empty, cancellationToken);
        var activeOrderCount = await _dbContext.Orders.AsNoTracking()
            .CountAsync(order => order.Status != OrderStatus.Delivered && order.Status != OrderStatus.Cancelled, cancellationToken);

        return Ok(new DashboardSummaryDto(
            reportDate,
            dailyOrderCount,
            dailyRevenue,
            activeTableCount,
            totalTableCount,
            activeOrderCount));
    }

    [HttpGet("revenue")]
    public async Task<ActionResult<RevenueReportDto>> GetRevenue(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        CancellationToken cancellationToken)
    {
        var effectiveEndDate = endDate ?? RestaurantTime.Today();
        var effectiveStartDate = startDate ?? effectiveEndDate.AddDays(-6);
        var validationError = ValidateDateRange(effectiveStartDate, effectiveEndDate);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        return Ok(await BuildRevenueReport(effectiveStartDate, effectiveEndDate, cancellationToken));
    }

    [HttpGet("top-items")]
    public async Task<ActionResult<IReadOnlyCollection<TopSellingItemDto>>> GetTopSellingItems(
        [FromQuery] int days = 7,
        [FromQuery] int limit = 5,
        [FromQuery] DateOnly? startDate = null,
        [FromQuery] DateOnly? endDate = null,
        CancellationToken cancellationToken = default)
    {
        DateOnly effectiveStartDate;
        DateOnly effectiveEndDate;
        if (startDate is not null || endDate is not null)
        {
            effectiveEndDate = endDate ?? RestaurantTime.Today();
            effectiveStartDate = startDate ?? effectiveEndDate.AddDays(-6);
            var validationError = ValidateDateRange(effectiveStartDate, effectiveEndDate);
            if (validationError is not null)
            {
                return BadRequest(validationError);
            }
        }
        else
        {
            if (days is < 1 or > MaximumReportDays)
            {
                return BadRequest($"Gün sayısı 1 ile {MaximumReportDays} arasında olmalıdır.");
            }

            effectiveEndDate = RestaurantTime.Today();
            effectiveStartDate = effectiveEndDate.AddDays(-(days - 1));
        }

        if (limit is < 1 or > 20)
        {
            return BadRequest("Ürün sınırı 1 ile 20 arasında olmalıdır.");
        }

        return Ok(await BuildTopSellingItems(effectiveStartDate, effectiveEndDate, limit, cancellationToken));
    }

    [HttpGet("bottom-items")]
    public async Task<ActionResult<IReadOnlyCollection<TopSellingItemDto>>> GetBottomSellingItems(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] int limit = 5,
        CancellationToken cancellationToken = default)
    {
        var effectiveEndDate = endDate ?? RestaurantTime.Today();
        var effectiveStartDate = startDate ?? effectiveEndDate.AddDays(-6);
        var validationError = ValidateDateRange(effectiveStartDate, effectiveEndDate);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        if (limit is < 1 or > 20)
        {
            return BadRequest("Ürün sınırı 1 ile 20 arasında olmalıdır.");
        }

        return Ok(await BuildBottomSellingItems(effectiveStartDate, effectiveEndDate, limit, cancellationToken));
    }

    [HttpGet("summaries")]
    public async Task<ActionResult<SalesSummaryReportDto>> GetSalesSummaries(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        CancellationToken cancellationToken)
    {
        var effectiveEndDate = endDate ?? RestaurantTime.Today();
        var effectiveStartDate = startDate ?? effectiveEndDate.AddDays(-6);
        var validationError = ValidateDateRange(effectiveStartDate, effectiveEndDate);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        return Ok(await BuildSalesSummaries(effectiveStartDate, effectiveEndDate, cancellationToken));
    }

    [HttpGet("revenue.pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> DownloadSalesAnalysisReport(
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        CancellationToken cancellationToken)
    {
        var effectiveEndDate = endDate ?? RestaurantTime.Today();
        var effectiveStartDate = startDate ?? effectiveEndDate.AddDays(-6);
        var validationError = ValidateDateRange(effectiveStartDate, effectiveEndDate);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        try
        {
            var report = await BuildRevenueReport(effectiveStartDate, effectiveEndDate, cancellationToken);
            var topItems = await BuildTopSellingItems(effectiveStartDate, effectiveEndDate, 5, cancellationToken);
            var bottomItems = await BuildBottomSellingItems(effectiveStartDate, effectiveEndDate, 5, cancellationToken);
            var summaries = await BuildSalesSummaries(effectiveStartDate, effectiveEndDate, cancellationToken);
            var (start, end) = RestaurantTime.ToUtcRange(effectiveStartDate, effectiveEndDate);
            var completedOrderCount = await _dbContext.Orders.AsNoTracking()
                .CountAsync(order =>
                    order.Status == OrderStatus.Delivered &&
                    order.CreatedAt >= start &&
                    order.CreatedAt < end,
                    cancellationToken);
            var pdf = SalesAnalysisPdfExporter.Create(report, topItems, bottomItems, summaries, completedOrderCount);

            PreparePdfDownloadResponse();
            return File(
                pdf,
                "application/pdf",
                $"satis-analizi-{effectiveStartDate:yyyy-MM-dd}-{effectiveEndDate:yyyy-MM-dd}.pdf");
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "{StartDate}-{EndDate} tarih aralığı satış analizi PDF raporu oluşturulamadı.",
                effectiveStartDate,
                effectiveEndDate);
            return Problem(
                "Satış analizi PDF raporu oluşturulamadı. Backend çalışmaya devam ediyor.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    private async Task<IReadOnlyCollection<TopSellingItemDto>> BuildTopSellingItems(
        DateOnly startDate,
        DateOnly endDate,
        int limit,
        CancellationToken cancellationToken)
    {
        var (start, end) = RestaurantTime.ToUtcRange(startDate, endDate);
        var soldItemRows = await _dbContext.OrderItems.AsNoTracking()
            .Where(item =>
                item.Order != null &&
                item.Order.Status == OrderStatus.Delivered &&
                item.Order.CreatedAt >= start &&
                item.Order.CreatedAt < end)
            .Select(item => new
            {
                item.MenuItemId,
                Name = item.MenuItem == null ? string.Empty : item.MenuItem.Name,
                item.Quantity,
                item.UnitPrice
            })
            .ToListAsync(cancellationToken);

        // Gruplamayı bellekte yapmak SQL sağlayıcısının record projection + decimal
        // aggregation çevirisine bağımlılığı kaldırır. Yalnızca seçili dönemin dört
        // küçük alanı çekildiği için rapor yükü de sınırlı kalır.
        var items = soldItemRows
            .GroupBy(item => new { item.MenuItemId, item.Name })
            .Select(group => new TopSellingItemDto(
                group.Key.MenuItemId,
                group.Key.Name,
                group.Sum(item => item.Quantity),
                group.Sum(item => item.UnitPrice * item.Quantity)))
            .OrderByDescending(item => item.Quantity)
            .ThenByDescending(item => item.Revenue)
            .Take(limit)
            .ToList();

        return items;
    }

    private async Task<IReadOnlyCollection<TopSellingItemDto>> BuildBottomSellingItems(
        DateOnly startDate,
        DateOnly endDate,
        int limit,
        CancellationToken cancellationToken)
    {
        var menuItems = await _dbContext.MenuItems.AsNoTracking()
            .Select(item => new { item.Id, item.Name })
            .ToListAsync(cancellationToken);
        var (start, end) = RestaurantTime.ToUtcRange(startDate, endDate);
        var soldItemRows = await _dbContext.OrderItems.AsNoTracking()
            .Where(item =>
                item.Order != null &&
                item.Order.Status == OrderStatus.Delivered &&
                item.Order.CreatedAt >= start &&
                item.Order.CreatedAt < end)
            .Select(item => new { item.MenuItemId, item.Quantity, item.UnitPrice })
            .ToListAsync(cancellationToken);

        var salesByMenuItem = soldItemRows
            .GroupBy(item => item.MenuItemId)
            .ToDictionary(
                group => group.Key,
                group => new
                {
                    Quantity = group.Sum(item => item.Quantity),
                    Revenue = group.Sum(item => item.UnitPrice * item.Quantity)
                });

        return menuItems
            .Select(item =>
            {
                var hasSales = salesByMenuItem.TryGetValue(item.Id, out var sales);
                return new TopSellingItemDto(
                    item.Id,
                    item.Name,
                    hasSales ? sales!.Quantity : 0,
                    hasSales ? sales!.Revenue : 0);
            })
            .OrderBy(item => item.Quantity)
            .ThenBy(item => item.Revenue)
            .ThenBy(item => item.Name)
            .Take(limit)
            .ToList();
    }

    private async Task<SalesSummaryReportDto> BuildSalesSummaries(
        DateOnly startDate,
        DateOnly endDate,
        CancellationToken cancellationToken)
    {
        var (start, end) = RestaurantTime.ToUtcRange(startDate, endDate);
        var orders = await _dbContext.Orders.AsNoTracking()
            .Where(order => order.CreatedAt >= start && order.CreatedAt < end)
            .Select(order => new { order.CreatedAt, order.Status })
            .ToListAsync(cancellationToken);
        var payments = await _dbContext.Payments.AsNoTracking()
            .Where(payment =>
                payment.Status == PaymentStatus.Completed &&
                payment.CreatedAt >= start &&
                payment.CreatedAt < end)
            .Select(payment => new { payment.CreatedAt, payment.Amount })
            .ToListAsync(cancellationToken);

        var ordersByDate = orders.GroupBy(order => RestaurantTime.ToDate(order.CreatedAt))
            .ToDictionary(group => group.Key, group => group.ToList());
        var revenueByDate = payments.GroupBy(payment => RestaurantTime.ToDate(payment.CreatedAt))
            .ToDictionary(group => group.Key, group => group.Sum(payment => payment.Amount));

        var daily = Enumerable.Range(0, endDate.DayNumber - startDate.DayNumber + 1)
            .Select(offset => startDate.AddDays(offset))
            .Select(date =>
            {
                var dailyOrders = ordersByDate.GetValueOrDefault(date) ?? [];
                return new SalesSummaryRowDto(
                    date,
                    date,
                    dailyOrders.Count,
                    dailyOrders.Count(order => order.Status == OrderStatus.Delivered),
                    dailyOrders.Count(order => order.Status == OrderStatus.Cancelled),
                    revenueByDate.GetValueOrDefault(date));
            })
            .ToList();

        var weekly = daily
            .GroupBy(day => StartOfWeek(day.StartDate))
            .Select(group =>
            {
                var periodStart = group.Key < startDate ? startDate : group.Key;
                var weekEnd = group.Key.AddDays(6);
                var periodEnd = weekEnd > endDate ? endDate : weekEnd;
                return new SalesSummaryRowDto(
                    periodStart,
                    periodEnd,
                    group.Sum(day => day.TotalOrders),
                    group.Sum(day => day.CompletedOrders),
                    group.Sum(day => day.CancelledOrders),
                    group.Sum(day => day.TotalRevenue));
            })
            .OrderBy(row => row.StartDate)
            .ToList();

        return new SalesSummaryReportDto(startDate, endDate, daily, weekly);
    }

    [HttpGet("daily.pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> DownloadDailyReport([FromQuery] DateOnly? date, CancellationToken cancellationToken)
    {
        var reportDate = date ?? RestaurantTime.Today();

        try
        {
            var report = await BuildDailyReport(reportDate, cancellationToken);
            var (start, end) = RestaurantTime.ToUtcRange(reportDate, reportDate);
            var orders = await _dbContext.Orders.AsNoTracking()
                .Where(order =>
                    (order.Status == OrderStatus.Delivered || order.Status == OrderStatus.Cancelled) &&
                    order.CreatedAt >= start &&
                    order.CreatedAt < end)
                .OrderByDescending(order => order.CreatedAt)
                .Take(10)
                .Select(order => new DailyReportOrderRow(
                    order.Id,
                    order.Table == null ? 0 : order.Table.Number,
                    order.Status,
                    order.TotalAmount,
                    order.CreatedAt,
                    order.CancellationReason))
                .ToListAsync(cancellationToken);

            var pdf = DailyReportPdfExporter.Create(report, orders);

            // İndirme gizli ve aynı kaynaklı bir iframe üzerinden yapılır. Ana admin
            // sayfası yönlenmez; Visual Studio'nun tarayıcı/debug oturumu etkilenmez.
            PreparePdfDownloadResponse();

            return File(pdf, "application/pdf", $"gunluk-rapor-{reportDate:yyyy-MM-dd}.pdf");
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "{ReportDate} tarihli günlük PDF raporu oluşturulamadı.", reportDate);
            return Problem(
                "PDF raporu oluşturulamadı. Backend çalışmaya devam ediyor.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    private async Task<DailyReportDto> BuildDailyReport(DateOnly reportDate, CancellationToken cancellationToken)
    {
        var (start, end) = RestaurantTime.ToUtcRange(reportDate, reportDate);

        var orders = _dbContext.Orders.AsNoTracking().Where(order => order.CreatedAt >= start && order.CreatedAt < end);
        var totalOrders = await orders.CountAsync(cancellationToken);
        var completedOrders = await orders.CountAsync(order => order.Status == OrderStatus.Delivered, cancellationToken);
        var cancelledOrders = await orders.CountAsync(order => order.Status == OrderStatus.Cancelled, cancellationToken);

        var payments = _dbContext.Payments.AsNoTracking()
            .Where(payment => payment.Status == PaymentStatus.Completed && payment.CreatedAt >= start && payment.CreatedAt < end);
        var totalRevenue = await payments.SumAsync(payment => (decimal?)payment.Amount, cancellationToken) ?? 0;
        var paymentMethods = await payments
            .GroupBy(payment => payment.Method)
            .Select(group => new PaymentMethodTotalDto(group.Key, group.Sum(payment => payment.Amount)))
            .ToListAsync(cancellationToken);

        var mostSoldItem = await _dbContext.OrderItems.AsNoTracking()
            .Where(item => item.Order != null && item.Order.Status == OrderStatus.Delivered && item.Order.CreatedAt >= start && item.Order.CreatedAt < end)
            .GroupBy(item => new { item.MenuItemId, Name = item.MenuItem == null ? string.Empty : item.MenuItem.Name })
            .Select(group => new { group.Key.Name, Quantity = group.Sum(item => item.Quantity) })
            .OrderByDescending(item => item.Quantity)
            .FirstOrDefaultAsync(cancellationToken);

        return new DailyReportDto(reportDate, totalOrders, completedOrders, cancelledOrders, totalRevenue, paymentMethods, mostSoldItem?.Name, mostSoldItem?.Quantity ?? 0);
    }

    private async Task<RevenueReportDto> BuildRevenueReport(
        DateOnly startDate,
        DateOnly endDate,
        CancellationToken cancellationToken)
    {
        var (start, end) = RestaurantTime.ToUtcRange(startDate, endDate);
        var payments = await _dbContext.Payments.AsNoTracking()
            .Where(payment =>
                payment.Status == PaymentStatus.Completed &&
                payment.CreatedAt >= start &&
                payment.CreatedAt < end)
            .Select(payment => new { payment.CreatedAt, payment.Amount })
            .ToListAsync(cancellationToken);

        var revenueByDate = payments
            .GroupBy(payment => RestaurantTime.ToDate(payment.CreatedAt))
            .ToDictionary(group => group.Key, group => group.Sum(payment => payment.Amount));
        var dailyRevenue = Enumerable.Range(0, endDate.DayNumber - startDate.DayNumber + 1)
            .Select(dayOffset => startDate.AddDays(dayOffset))
            .Select(day => new DailyRevenueDto(day, revenueByDate.GetValueOrDefault(day)))
            .ToList();

        return new RevenueReportDto(
            startDate,
            endDate,
            dailyRevenue.Sum(day => day.Revenue),
            dailyRevenue);
    }

    private void PreparePdfDownloadResponse()
    {
        Response.Headers.Remove("X-Frame-Options");
        Response.Headers["Content-Security-Policy"] = "frame-ancestors 'self'";
        Response.Headers["Cache-Control"] = "no-store, no-cache";
    }

    private static DateOnly StartOfWeek(DateOnly date)
    {
        var daysSinceMonday = ((int)date.DayOfWeek + 6) % 7;
        return date.AddDays(-daysSinceMonday);
    }

    private static string? ValidateDateRange(DateOnly startDate, DateOnly endDate)
    {
        if (startDate > endDate)
        {
            return "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
        }

        return endDate.DayNumber - startDate.DayNumber + 1 > MaximumReportDays
            ? $"Rapor aralığı en fazla {MaximumReportDays} gün olabilir."
            : null;
    }

}
