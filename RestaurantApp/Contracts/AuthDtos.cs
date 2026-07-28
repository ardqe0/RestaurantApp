using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record RegisterRequest(
    [Required, StringLength(50, MinimumLength = 3)] string Username,
    [Required, StringLength(100, MinimumLength = 6)] string Password,
    [EmailAddress, StringLength(256)] string? Email,
    [StringLength(30)] string? PhoneNumber);

public record LoginRequest(
    [Required, StringLength(50)] string Username,
    [Required, StringLength(100)] string Password);

public record UpdateProfileRequest(
    [EmailAddress, StringLength(256)] string? Email,
    [StringLength(30)] string? PhoneNumber);

public record ChangePasswordRequest(
    [Required, StringLength(100)] string CurrentPassword,
    [Required, StringLength(100, MinimumLength = 6)] string NewPassword);

public record AuthResponse(string Username, string Role, string? Email, string? PhoneNumber);

public record NativeAuthResponse(string Username, string Role, string? Email, string? PhoneNumber, string AccessToken);
