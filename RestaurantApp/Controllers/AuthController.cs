using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.ComponentModel.DataAnnotations;
using RestaurantApp.Contracts;
using RestaurantApp.Models;
using RestaurantApp.Services;

namespace RestaurantApp.Controllers;

[ApiController]
[EnableRateLimiting("auth")]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly JwtTokenService _jwtTokenService;
    private readonly IWebHostEnvironment _environment;

    public AuthController(UserManager<AppUser> userManager, JwtTokenService jwtTokenService, IWebHostEnvironment environment)
    {
        _userManager = userManager;
        _jwtTokenService = jwtTokenService;
        _environment = environment;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var contactError = await ValidateRegistrationContactAsync(request);
        if (contactError is not null)
        {
            return BadRequest(contactError);
        }

        var user = new AppUser
        {
            UserName = request.Username.Trim(),
            Email = request.Email!.Trim(),
            PhoneNumber = request.PhoneNumber!.Trim()
        };
        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(string.Join(" ", result.Errors.Select(error => error.Description)));
        }

        // Mutfak ve yönetici yetkileri sistem yönetimi tarafından verilir. Normal kayıt
        // olan herkes otomatik olarak müşteri paneline yönlendirilir.
        const string role = "Customer";
        var roleResult = await _userManager.AddToRoleAsync(user, role);
        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(user);
            return BadRequest(string.Join(" ", roleResult.Errors.Select(error => error.Description)));
        }

        SetAuthCookie(_jwtTokenService.CreateToken(user, role));
        return Ok(new AuthResponse(user.UserName!, role, user.Email, user.PhoneNumber));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByNameAsync(request.Username.Trim());
        if (user is null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized("Kullanıcı adı veya şifre hatalı.");
        }

        var role = (await _userManager.GetRolesAsync(user)).FirstOrDefault();
        if (role is null)
        {
            return BadRequest("Kullanıcı rolü bulunamadı.");
        }

        SetAuthCookie(_jwtTokenService.CreateToken(user, role));
        return Ok(new AuthResponse(user.UserName!, role, user.Email, user.PhoneNumber));
    }

    [HttpPost("native/register")]
    public async Task<ActionResult<NativeAuthResponse>> RegisterNative(RegisterRequest request)
    {
        var contactError = await ValidateRegistrationContactAsync(request);
        if (contactError is not null)
        {
            return BadRequest(contactError);
        }

        var user = new AppUser
        {
            UserName = request.Username.Trim(),
            Email = request.Email!.Trim(),
            PhoneNumber = request.PhoneNumber!.Trim()
        };
        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(string.Join(" ", result.Errors.Select(error => error.Description)));
        }

        const string role = "Customer";
        var roleResult = await _userManager.AddToRoleAsync(user, role);
        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(user);
            return BadRequest(string.Join(" ", roleResult.Errors.Select(error => error.Description)));
        }

        var token = _jwtTokenService.CreateToken(user, role);
        return Ok(new NativeAuthResponse(user.UserName!, role, user.Email, user.PhoneNumber, token));
    }

    [HttpPost("native/login")]
    public async Task<ActionResult<NativeAuthResponse>> LoginNative(LoginRequest request)
    {
        var user = await _userManager.FindByNameAsync(request.Username.Trim());
        if (user is null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized("Kullanıcı adı veya şifre hatalı.");
        }

        var role = (await _userManager.GetRolesAsync(user)).FirstOrDefault();
        if (role is null)
        {
            return BadRequest("Kullanıcı rolü bulunamadı.");
        }

        var token = _jwtTokenService.CreateToken(user, role);
        return Ok(new NativeAuthResponse(user.UserName!, role, user.Email, user.PhoneNumber, token));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthResponse>> GetCurrentUser()
    {
        var username = User.Identity?.Name;
        var role = User.Claims.FirstOrDefault(claim => claim.Type.EndsWith("role"))?.Value;
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(role))
        {
            return Unauthorized();
        }

        var user = await _userManager.FindByNameAsync(username);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(new AuthResponse(user.UserName!, role, user.Email, user.PhoneNumber));
    }

    [Authorize]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("restaurant_auth", new CookieOptions { Path = "/" });
        return NoContent();
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult<AuthResponse>> UpdateProfile(UpdateProfileRequest request)
    {
        var user = await GetCurrentAppUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var contactError = await ValidateContactAsync(request.Email, request.PhoneNumber, user.Id);
        if (contactError is not null)
        {
            return BadRequest(contactError);
        }

        user.Email = request.Email!.Trim();
        user.PhoneNumber = request.PhoneNumber!.Trim();
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return BadRequest(string.Join(" ", result.Errors.Select(error => error.Description)));
        }

        var role = (await _userManager.GetRolesAsync(user)).FirstOrDefault() ?? "Customer";
        return Ok(new AuthResponse(user.UserName!, role, user.Email, user.PhoneNumber));
    }

    [Authorize]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await GetCurrentAppUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        if (!IsStrongPassword(request.NewPassword))
        {
            return BadRequest("Yeni şifre en az 8 karakter; büyük harf, küçük harf, rakam ve özel karakter içermelidir.");
        }

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(string.Join(" ", result.Errors.Select(error => error.Description)));
        }

        return NoContent();
    }

    private static bool IsStrongPassword(string? password)
    {
        return !string.IsNullOrWhiteSpace(password)
            && password.Length >= 8
            && password.Any(char.IsUpper)
            && password.Any(char.IsLower)
            && password.Any(char.IsDigit)
            && password.Any(character => !char.IsLetterOrDigit(character));
    }

    private void SetAuthCookie(string token)
    {
        Response.Cookies.Append("restaurant_auth", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            IsEssential = true,
            Path = "/",
            MaxAge = TimeSpan.FromHours(12)
        });
    }

    private async Task<string?> ValidateRegistrationContactAsync(RegisterRequest request)
    {
        return await ValidateContactAsync(request.Email, request.PhoneNumber);
    }

    private async Task<string?> ValidateContactAsync(string? emailValue, string? phoneNumberValue, string? currentUserId = null)
    {
        var email = emailValue?.Trim();
        if (string.IsNullOrWhiteSpace(email) || !new EmailAddressAttribute().IsValid(email))
        {
            return "Geçerli bir e-posta adresi girin.";
        }

        var emailOwner = await _userManager.FindByEmailAsync(email);
        if (emailOwner is not null && emailOwner.Id != currentUserId)
        {
            return "Bu e-posta adresi zaten kullanılıyor.";
        }

        var phoneNumber = phoneNumberValue?.Trim();
        var digitCount = phoneNumber?.Count(char.IsDigit) ?? 0;
        if (string.IsNullOrWhiteSpace(phoneNumber) || digitCount is < 10 or > 15)
        {
            return "Telefon numarası 10 ile 15 rakam arasında olmalıdır.";
        }

        return null;
    }

    private async Task<AppUser?> GetCurrentAppUserAsync()
    {
        var username = User.Identity?.Name;
        return string.IsNullOrWhiteSpace(username) ? null : await _userManager.FindByNameAsync(username);
    }
}
