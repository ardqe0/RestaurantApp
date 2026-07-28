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
[Route("api/admin/campaigns")]
public class AdminCampaignsController : ControllerBase
{
    private readonly RestaurantDbContext _dbContext;
    private readonly AuditLogService _auditLog;

    public AdminCampaignsController(RestaurantDbContext dbContext, AuditLogService auditLog)
    {
        _dbContext = dbContext;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CampaignDto>>> GetCampaigns()
    {
        return Ok(await _dbContext.Campaigns
            .AsNoTracking()
            .OrderByDescending(campaign => campaign.IsActive)
            .ThenByDescending(campaign => campaign.StartsAt)
            .Select(campaign => new CampaignDto(
                campaign.Id,
                campaign.Name,
                campaign.DiscountType,
                campaign.DiscountValue,
                campaign.MinimumOrderAmount,
                campaign.StartsAt,
                campaign.EndsAt,
                campaign.IsActive))
            .ToListAsync());
    }

    [HttpPost]
    public async Task<ActionResult<CampaignDto>> CreateCampaign(UpsertCampaignRequest request)
    {
        var validationError = Validate(request);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        var campaign = new Campaign();
        Apply(campaign, request);
        _dbContext.Campaigns.Add(campaign);
        await _dbContext.SaveChangesAsync();
        _auditLog.Add("Create", "Campaign", campaign.Id.ToString(), after: ToAuditValue(campaign));
        await _dbContext.SaveChangesAsync();
        return CreatedAtAction(nameof(GetCampaigns), ToDto(campaign));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateCampaign(int id, UpsertCampaignRequest request)
    {
        var validationError = Validate(request);
        if (validationError is not null)
        {
            return BadRequest(validationError);
        }

        var campaign = await _dbContext.Campaigns.FindAsync(id);
        if (campaign is null)
        {
            return NotFound();
        }

        var before = ToAuditValue(campaign);
        Apply(campaign, request);
        _auditLog.Add("Update", "Campaign", id.ToString(), before, ToAuditValue(campaign));
        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteCampaign(int id)
    {
        var campaign = await _dbContext.Campaigns.FindAsync(id);
        if (campaign is null)
        {
            return NotFound();
        }

        if (await _dbContext.Orders.AnyAsync(order => order.CampaignId == id))
        {
            campaign.IsActive = false;
            _auditLog.Add("Deactivate", "Campaign", id.ToString(), after: ToAuditValue(campaign));
        }
        else
        {
            _auditLog.Add("Delete", "Campaign", id.ToString(), before: ToAuditValue(campaign));
            _dbContext.Campaigns.Remove(campaign);
        }

        await _dbContext.SaveChangesAsync();
        return NoContent();
    }

    private static string? Validate(UpsertCampaignRequest request)
    {
        if (request.EndsAt <= request.StartsAt)
        {
            return "Bitiş tarihi başlangıç tarihinden sonra olmalıdır.";
        }

        if (request.DiscountType == CampaignDiscountType.Percentage && request.DiscountValue > 100)
        {
            return "Yüzde indirimi 100'den büyük olamaz.";
        }

        return null;
    }

    private static void Apply(Campaign campaign, UpsertCampaignRequest request)
    {
        campaign.Name = request.Name.Trim();
        campaign.DiscountType = request.DiscountType;
        campaign.DiscountValue = request.DiscountValue;
        campaign.MinimumOrderAmount = request.MinimumOrderAmount;
        campaign.StartsAt = request.StartsAt.ToUniversalTime();
        campaign.EndsAt = request.EndsAt.ToUniversalTime();
        campaign.IsActive = request.IsActive;
    }

    private static CampaignDto ToDto(Campaign campaign) => new(
        campaign.Id,
        campaign.Name,
        campaign.DiscountType,
        campaign.DiscountValue,
        campaign.MinimumOrderAmount,
        campaign.StartsAt,
        campaign.EndsAt,
        campaign.IsActive);

    private static object ToAuditValue(Campaign campaign) => new
    {
        campaign.Name,
        campaign.DiscountType,
        campaign.DiscountValue,
        campaign.MinimumOrderAmount,
        campaign.StartsAt,
        campaign.EndsAt,
        campaign.IsActive
    };
}
