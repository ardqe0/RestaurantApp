using System.Text;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;
using RestaurantApp.Data;
using RestaurantApp.Hubs;
using RestaurantApp.Infrastructure;
using RestaurantApp.Models;
using RestaurantApp.Services;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment())
{
    var developmentCertificate = FindDevelopmentCertificate();
    builder.WebHost.ConfigureKestrel(options =>
    {
        options.ListenAnyIP(5223);
        options.ListenAnyIP(7094, listenOptions =>
        {
            if (developmentCertificate is null)
            {
                listenOptions.UseHttps();
                return;
            }

            listenOptions.UseHttps(developmentCertificate);
        });
    });
}

static X509Certificate2? FindDevelopmentCertificate()
{
    using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
    store.Open(OpenFlags.ReadOnly);

    var now = DateTimeOffset.UtcNow;
    var certificate = store.Certificates
        .Find(X509FindType.FindBySubjectName, "localhost", validOnly: false)
        .OfType<X509Certificate2>()
        .Where(item => item.HasPrivateKey
            && item.NotBefore.ToUniversalTime() <= now.UtcDateTime
            && item.NotAfter.ToUniversalTime() > now.UtcDateTime)
        .OrderByDescending(item => item.NotAfter)
        .FirstOrDefault();

    return certificate is null ? null : new X509Certificate2(certificate);
}

QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key üretim ortamında çevre değişkeni ile tanımlanmalıdır.");
if (jwtKey.Length < 32)
{
    throw new InvalidOperationException("Jwt:Key en az 32 karakter olmalıdır.");
}

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
    });
builder.Services.AddProblemDetails();
builder.Services.AddDbContext<RestaurantDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));
builder.Services.AddIdentityCore<AppUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Password.RequiredUniqueChars = 4;
    })
    .AddRoles<IdentityRole>()
    .AddErrorDescriber<TurkishIdentityErrorDescriber>()
    .AddEntityFrameworkStores<RestaurantDbContext>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwt = builder.Configuration.GetSection("Jwt");
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt["Issuer"],
            ValidAudience = jwt["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrWhiteSpace(accessToken)
                    && context.HttpContext.Request.Path.StartsWithSegments("/hubs/orders"))
                {
                    context.Token = accessToken;
                    return Task.CompletedTask;
                }

                var cookieToken = context.Request.Cookies["restaurant_auth"];
                if (!string.IsNullOrWhiteSpace(cookieToken))
                {
                    context.Token = cookieToken;
                }

                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimiting:AuthPermitLimit", 10),
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("customer-actions", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimiting:CustomerActionPermitLimit", 30),
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddHttpClient<OrderPushNotificationService>();
builder.Services.AddSignalR();
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendApps", policy => policy
        .WithOrigins("http://localhost:5223", "http://localhost:8082", "http://localhost:8083")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    if (builder.Configuration.GetValue("Database:ApplyMigrationsOnStartup", true))
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        await dbContext.Database.MigrateAsync();
    }

    if (builder.Configuration.GetValue("Database:SeedAuthOnStartup", true))
    {
        await AuthSeeder.InitializeAsync(scope.ServiceProvider, builder.Configuration);
    }
}

// Configure the HTTP request pipeline.
// Geliştirme ortamında da istisnaların stack trace ve Authorization başlığıyla
// birlikte istemciye sızmasını önleyip standart ProblemDetails yanıtı döndürür.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Expo web, Android emulator ve yerel ağdaki cihazlar geliştirme sertifikasına
// güvenmeyebileceği için geliştirmede HTTP API'yi doğrudan sunuyoruz.
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    if (builder.Configuration.GetValue("Security:UseHttpsRedirection", true))
    {
        app.UseHttpsRedirection();
    }
}

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/auth"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.Pragma = "no-cache";
    }

    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-Request-ID", context.TraceIdentifier);
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Append("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    context.Response.Headers.Append(
        "Content-Security-Policy",
        "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: https:; "
        + "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; "
        + "font-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    await next();
});

app.UseCors("FrontendApps");

app.UseAuthentication();

app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var requestedRole =
        path.Equals("/admin.html", StringComparison.OrdinalIgnoreCase)
        || path.StartsWithSegments("/admin", StringComparison.OrdinalIgnoreCase)
            ? "Admin"
            : path.StartsWithSegments("/kitchen", StringComparison.OrdinalIgnoreCase)
                ? "Kitchen"
                : path.StartsWithSegments("/customer", StringComparison.OrdinalIgnoreCase)
                    ? "Customer"
                    : null;

    if (requestedRole is not null)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            context.Response.Redirect("/");
            return;
        }

        if (!context.User.IsInRole(requestedRole))
        {
            var roleDestination = context.User.IsInRole("Admin")
                ? "/admin/"
                : context.User.IsInRole("Kitchen")
                    ? "/kitchen/"
                    : context.User.IsInRole("Customer")
                        ? "/customer/"
                        : "/";
            context.Response.Redirect(roleDestination);
            return;
        }
    }

    if (path.Equals("/admin.html", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect("/admin/");
        return;
    }

    if (path.Equals("/admin", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect("/admin/");
        return;
    }

    if (path.Equals("/kitchen", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect("/kitchen/");
        return;
    }

    if (path.Equals("/customer", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect("/customer/");
        return;
    }

    if (path.Equals("/", StringComparison.OrdinalIgnoreCase)
        && context.User.Identity?.IsAuthenticated == true)
    {
        var roleDestination = context.User.IsInRole("Admin")
            ? "/admin/"
            : context.User.IsInRole("Kitchen")
                ? "/kitchen/"
                : context.User.IsInRole("Customer")
                    ? "/customer/"
                    : null;
        if (roleDestination is not null)
        {
            context.Response.Redirect(roleDestination);
            return;
        }
    }

    await next();
});

app.UseAuthorization();
app.UseRateLimiter();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();
app.MapHub<OrderHub>("/hubs/orders");
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
app.MapFallbackToFile("/admin/{*path:nonfile}", "admin/index.html");
app.MapFallbackToFile("/customer/{*path:nonfile}", "customer/index.html");
app.MapFallbackToFile("/kitchen/{*path:nonfile}", "kitchen/index.html");

app.Run();

public partial class Program;
