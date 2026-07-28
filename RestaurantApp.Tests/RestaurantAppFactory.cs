using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using RestaurantApp.Data;
using RestaurantApp.Models;

namespace RestaurantApp.Tests;

public sealed class RestaurantAppFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public RestaurantAppFactory()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "integration-test-key-at-least-32-characters-long");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "RestaurantApp.Tests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "RestaurantApp.Tests");
        Environment.SetEnvironmentVariable("Database__ApplyMigrationsOnStartup", "false");
        Environment.SetEnvironmentVariable("Database__SeedAuthOnStartup", "false");
        Environment.SetEnvironmentVariable("Security__UseHttpsRedirection", "false");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();
        builder.UseEnvironment("Production");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "integration-test-key-at-least-32-characters-long",
                ["Jwt:Issuer"] = "RestaurantApp.Tests",
                ["Jwt:Audience"] = "RestaurantApp.Tests",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Database:SeedAuthOnStartup"] = "false",
                ["Security:UseHttpsRedirection"] = "false"
            });
        });
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<RestaurantDbContext>>();
            services.AddDbContext<RestaurantDbContext>(options => options.UseSqlite(_connection));
        });
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        await dbContext.Database.EnsureDeletedAsync();
        await dbContext.Database.EnsureCreatedAsync();

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "Admin", "Kitchen", "Customer" })
        {
            await roleManager.CreateAsync(new IdentityRole(role));
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        await CreateUserAsync(userManager, "admin-test", "Admin");
        await CreateUserAsync(userManager, "kitchen-test", "Kitchen");
        await CreateUserAsync(userManager, "customer-one", "Customer");
        await CreateUserAsync(userManager, "customer-two", "Customer");
    }

    private static async Task CreateUserAsync(UserManager<AppUser> userManager, string username, string role)
    {
        var user = new AppUser
        {
            UserName = username,
            Email = $"{username}@example.test",
            PhoneNumber = "5551234567"
        };
        var result = await userManager.CreateAsync(user, "Test123!");
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(" ", result.Errors.Select(error => error.Description)));
        }

        await userManager.AddToRoleAsync(user, role);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
            Environment.SetEnvironmentVariable("Jwt__Key", null);
            Environment.SetEnvironmentVariable("Jwt__Issuer", null);
            Environment.SetEnvironmentVariable("Jwt__Audience", null);
            Environment.SetEnvironmentVariable("Database__ApplyMigrationsOnStartup", null);
            Environment.SetEnvironmentVariable("Database__SeedAuthOnStartup", null);
            Environment.SetEnvironmentVariable("Security__UseHttpsRedirection", null);
        }
    }
}
