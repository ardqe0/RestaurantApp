using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Encodings.Web;
using RestaurantApp.Data;
using RestaurantApp.Models;

namespace RestaurantApp.Services;

public class AuditLogService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly RestaurantDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditLogService(RestaurantDbContext dbContext, IHttpContextAccessor httpContextAccessor)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
    }

    public void Add(string action, string entityType, string? entityId, object? before = null, object? after = null)
    {
        var context = _httpContextAccessor.HttpContext;
        var user = context?.User;

        _dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = user?.FindFirstValue(ClaimTypes.NameIdentifier),
            UserName = user?.Identity?.Name ?? "system",
            Role = user?.FindFirstValue(ClaimTypes.Role) ?? "System",
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            BeforeJson = Serialize(before),
            AfterJson = Serialize(after),
            IpAddress = context?.Connection.RemoteIpAddress?.ToString(),
            CreatedAt = DateTime.UtcNow
        });
    }

    private static string? Serialize(object? value)
    {
        if (value is null)
        {
            return null;
        }

        var json = JsonSerializer.Serialize(value, JsonOptions);
        return json.Length <= 4000 ? json : json[..4000];
    }
}
