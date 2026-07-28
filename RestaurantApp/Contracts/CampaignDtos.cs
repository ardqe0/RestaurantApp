using System.ComponentModel.DataAnnotations;
using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record CampaignDto(
    int Id,
    string Name,
    CampaignDiscountType DiscountType,
    decimal DiscountValue,
    decimal MinimumOrderAmount,
    DateTime StartsAt,
    DateTime EndsAt,
    bool IsActive);

public record UpsertCampaignRequest(
    [Required, StringLength(150)] string Name,
    CampaignDiscountType DiscountType,
    [Range(0.01, 1000000)] decimal DiscountValue,
    [Range(0, 1000000)] decimal MinimumOrderAmount,
    DateTime StartsAt,
    DateTime EndsAt,
    bool IsActive);
