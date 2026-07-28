using System.ComponentModel.DataAnnotations;
using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record CreatePaymentRequest(
    [Range(1, int.MaxValue)] int OrderId,
    PaymentMethod Method,
    int? PaymentId = null);

public record PaymentDto(
    int Id,
    int OrderId,
    decimal Amount,
    PaymentMethod Method,
    PaymentStatus Status,
    DateTime CreatedAt,
    DateTime? CompletedAt = null);
