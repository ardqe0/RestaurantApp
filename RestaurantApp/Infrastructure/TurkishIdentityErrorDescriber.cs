using Microsoft.AspNetCore.Identity;

namespace RestaurantApp.Infrastructure;

public sealed class TurkishIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError DefaultError() => Error(nameof(DefaultError), "Beklenmeyen bir hata oluştu.");
    public override IdentityError ConcurrencyFailure() => Error(nameof(ConcurrencyFailure), "Kayıt başka bir işlem tarafından değiştirildi. Lütfen yeniden deneyin.");
    public override IdentityError PasswordMismatch() => Error(nameof(PasswordMismatch), "Şifre hatalı.");
    public override IdentityError InvalidToken() => Error(nameof(InvalidToken), "Geçersiz işlem anahtarı.");
    public override IdentityError LoginAlreadyAssociated() => Error(nameof(LoginAlreadyAssociated), "Bu giriş bilgisi başka bir hesapla ilişkilendirilmiş.");
    public override IdentityError InvalidUserName(string? userName) => Error(nameof(InvalidUserName), $"'{userName}' geçerli bir kullanıcı adı değil.");
    public override IdentityError InvalidEmail(string? email) => Error(nameof(InvalidEmail), $"'{email}' geçerli bir e-posta adresi değil.");
    public override IdentityError DuplicateUserName(string userName) => Error(nameof(DuplicateUserName), $"'{userName}' kullanıcı adı zaten kullanılıyor.");
    public override IdentityError DuplicateEmail(string email) => Error(nameof(DuplicateEmail), $"'{email}' e-posta adresi zaten kullanılıyor.");
    public override IdentityError InvalidRoleName(string? role) => Error(nameof(InvalidRoleName), $"'{role}' geçerli bir rol adı değil.");
    public override IdentityError DuplicateRoleName(string role) => Error(nameof(DuplicateRoleName), $"'{role}' rolü zaten mevcut.");
    public override IdentityError UserAlreadyHasPassword() => Error(nameof(UserAlreadyHasPassword), "Kullanıcının zaten bir şifresi var.");
    public override IdentityError UserLockoutNotEnabled() => Error(nameof(UserLockoutNotEnabled), "Bu kullanıcı için hesap kilitleme etkin değil.");
    public override IdentityError UserAlreadyInRole(string role) => Error(nameof(UserAlreadyInRole), $"Kullanıcı zaten '{role}' rolünde.");
    public override IdentityError UserNotInRole(string role) => Error(nameof(UserNotInRole), $"Kullanıcı '{role}' rolünde değil.");
    public override IdentityError PasswordTooShort(int length) => Error(nameof(PasswordTooShort), $"Şifre en az {length} karakter olmalıdır.");
    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => Error(nameof(PasswordRequiresUniqueChars), $"Şifre en az {uniqueChars} farklı karakter içermelidir.");
    public override IdentityError PasswordRequiresNonAlphanumeric() => Error(nameof(PasswordRequiresNonAlphanumeric), "Şifre en az bir özel karakter içermelidir.");
    public override IdentityError PasswordRequiresDigit() => Error(nameof(PasswordRequiresDigit), "Şifre en az bir rakam içermelidir.");
    public override IdentityError PasswordRequiresLower() => Error(nameof(PasswordRequiresLower), "Şifre en az bir küçük harf içermelidir.");
    public override IdentityError PasswordRequiresUpper() => Error(nameof(PasswordRequiresUpper), "Şifre en az bir büyük harf içermelidir.");
    public override IdentityError RecoveryCodeRedemptionFailed() => Error(nameof(RecoveryCodeRedemptionFailed), "Kurtarma kodu kullanılamadı.");

    private static IdentityError Error(string code, string description) => new() { Code = code, Description = description };
}
