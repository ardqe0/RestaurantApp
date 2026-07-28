using System.ComponentModel.DataAnnotations;

namespace RestaurantApp.Contracts;

public record RegisterRequest(
    [property: Required, StringLength(50, MinimumLength = 3)] string Username,
    [property: Required, StringLength(100, MinimumLength = 6)] string Password,
    [property: EmailAddress, StringLength(256)] string? Email,
    [property: StringLength(30)] string? PhoneNumber);

public record LoginRequest(
    [property: Required, StringLength(50)] string Username,
    [property: Required, StringLength(100)] string Password);

public record UpdateProfileRequest(
    [property: EmailAddress, StringLength(256)] string? Email,
    [property: StringLength(30)] string? PhoneNumber);

public record ChangePasswordRequest(
    [property: Required, StringLength(100)] string CurrentPassword,
    [property: Required, StringLength(100, MinimumLength = 6)] string NewPassword);

public record AuthResponse(string Username, string Role, string? Email, string? PhoneNumber);

public record NativeAuthResponse(string Username, string Role, string? Email, string? PhoneNumber, string AccessToken);
