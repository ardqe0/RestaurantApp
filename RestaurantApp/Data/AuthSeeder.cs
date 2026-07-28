using Microsoft.AspNetCore.Identity;
using RestaurantApp.Models;

namespace RestaurantApp.Data;

public static class AuthSeeder
{
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration configuration)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = services.GetRequiredService<UserManager<AppUser>>();

        foreach (var role in new[] { "Customer", "Kitchen", "Admin" })
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        await CreateConfiguredUserAsync(userManager, configuration, "Kitchen");
        await CreateConfiguredUserAsync(userManager, configuration, "Admin");
    }

    private static async Task CreateConfiguredUserAsync(
        UserManager<AppUser> userManager,
        IConfiguration configuration,
        string role)
    {
        var username = configuration[$"BootstrapUsers:{role}:Username"]?.Trim();
        var password = configuration[$"BootstrapUsers:{role}:Password"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var user = await userManager.FindByNameAsync(username);
        if (user is null)
        {
            user = new AppUser { UserName = username };
            var createResult = await userManager.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"{role} başlangıç kullanıcısı oluşturulamadı: "
                    + string.Join(" ", createResult.Errors.Select(error => error.Description)));
            }
        }

        if (!await userManager.IsInRoleAsync(user, role))
        {
            var roleResult = await userManager.AddToRoleAsync(user, role);
            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"{role} rolü başlangıç kullanıcısına atanamadı: "
                    + string.Join(" ", roleResult.Errors.Select(error => error.Description)));
            }
        }
    }
}
