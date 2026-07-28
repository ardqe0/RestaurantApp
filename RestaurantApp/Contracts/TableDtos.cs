using System.ComponentModel.DataAnnotations;
using RestaurantApp.Models;

namespace RestaurantApp.Contracts;

public record TableDto(
    int Id,
    int Number,
    string QRCode,
    TableStatus Status,
    int Capacity);

public record CreateTableRequest(
    [Range(1, 10000)] int Number,
    [Required, StringLength(80, MinimumLength = 3)] string QRCode,
    [Range(1, 100)] int Capacity);

public record UpdateTableRequest(
    [Range(1, 10000)] int Number,
    [Required, StringLength(80, MinimumLength = 3)] string QRCode,
    TableStatus Status,
    [Range(1, 100)] int Capacity);
