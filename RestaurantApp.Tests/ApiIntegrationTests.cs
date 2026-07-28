using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using RestaurantApp.Contracts;
using RestaurantApp.Data;
using RestaurantApp.Models;
using Xunit;

namespace RestaurantApp.Tests;

public sealed class ApiIntegrationTests : IClassFixture<RestaurantAppFactory>, IAsyncLifetime
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly RestaurantAppFactory _factory;

    public ApiIntegrationTests(RestaurantAppFactory factory)
    {
        _factory = factory;
    }

    public Task InitializeAsync() => _factory.ResetDatabaseAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task AdminEndpoint_EnforcesAuthenticationAndAdminRole()
    {
        using var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/categories")).StatusCode);

        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/categories")).StatusCode);

        using var kitchen = await CreateAuthenticatedClientAsync("kitchen-test");
        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.GetAsync("/api/admin/categories")).StatusCode);

        using var admin = await CreateAuthenticatedClientAsync("admin-test");
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/categories")).StatusCode);
    }

    [Fact]
    public async Task OrderPaymentFlow_DeliversOrderAndEmptiesTable()
    {
        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(customer, tableId: 1);

        using var kitchen = await CreateAuthenticatedClientAsync("kitchen-test");
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PutAsJsonAsync(
            $"/api/admin/orders/{order.Id}/status",
            new UpdateOrderStatusRequest(OrderStatus.Ready),
            JsonOptions)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await customer.PostAsJsonAsync(
            $"/api/orders/{order.Id}/request-payment",
            new RequestPaymentRequest(PaymentMethod.Cash),
            JsonOptions)).StatusCode);

        var paymentResponse = await kitchen.PostAsJsonAsync(
            "/api/admin/payments",
            new CreatePaymentRequest(order.Id, PaymentMethod.Cash),
            JsonOptions);
        Assert.Equal(HttpStatusCode.Created, paymentResponse.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        Assert.Equal(OrderStatus.Delivered, (await dbContext.Orders.FindAsync(order.Id))!.Status);
        Assert.Equal(TableStatus.Empty, (await dbContext.RestaurantTables.FindAsync(1))!.Status);
        Assert.Single(dbContext.Payments.Where(payment => payment.OrderId == order.Id));
        Assert.Contains(dbContext.AuditLogs, log =>
            log.EntityType == "Payment" && log.EntityId == order.Id.ToString() && log.Action == "Complete");
    }

    [Fact]
    public async Task OccupiedTableAndOtherCustomersOrder_AreRejected()
    {
        using var firstCustomer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(firstCustomer, tableId: 1);

        using var secondCustomer = await CreateAuthenticatedClientAsync("customer-two");
        var secondOrderResponse = await secondCustomer.PostAsJsonAsync(
            "/api/orders",
            NewOrderRequest(1),
            JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, secondOrderResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await secondCustomer.GetAsync($"/api/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await secondCustomer.PostAsJsonAsync(
            $"/api/orders/{order.Id}/request-payment",
            new RequestPaymentRequest(PaymentMethod.CreditCard),
            JsonOptions)).StatusCode);
    }

    [Fact]
    public async Task CancellingOrder_StoresReasonEmptiesTableAndCreatesAuditLog()
    {
        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(customer, tableId: 2);
        using var kitchen = await CreateAuthenticatedClientAsync("kitchen-test");

        var response = await kitchen.PutAsJsonAsync(
            $"/api/admin/orders/{order.Id}/status",
            new UpdateOrderStatusRequest(OrderStatus.Cancelled, "Ürün tükendi"),
            JsonOptions);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        var cancelledOrder = await dbContext.Orders.FindAsync(order.Id);
        Assert.Equal(OrderStatus.Cancelled, cancelledOrder!.Status);
        Assert.Equal("Ürün tükendi", cancelledOrder.CancellationReason);
        Assert.Equal(TableStatus.Empty, (await dbContext.RestaurantTables.FindAsync(2))!.Status);
        Assert.Contains(dbContext.AuditLogs, log =>
            log.EntityType == "Order"
            && log.EntityId == order.Id.ToString()
            && log.Action == "Cancel"
            && log.UserName == "kitchen-test"
            && log.AfterJson!.Contains("Ürün tükendi"));
    }

    [Fact]
    public async Task MenuUpdate_IsVisibleInAdminAuditEndpoint()
    {
        using var admin = await CreateAuthenticatedClientAsync("admin-test");
        var updateResponse = await admin.PutAsJsonAsync(
            "/api/admin/menu-items/1",
            new UpdateMenuItemRequest(1, "Test Çorbası", "Yeni açıklama", 125m, null, true, 9),
            JsonOptions);
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);

        var logs = await admin.GetFromJsonAsync<List<AuditLogDto>>("/api/admin/audit-logs?limit=20", JsonOptions);
        var log = Assert.Single(logs!, item => item.EntityType == "MenuItem" && item.EntityId == "1");
        Assert.Equal("Update", log.Action);
        Assert.Equal("admin-test", log.UserName);
        Assert.Contains("Mercimek", log.BeforeJson);
        Assert.Contains("Test Çorbası", log.AfterJson);
    }

    [Fact]
    public async Task ActiveCampaign_AppliesBestDiscountToNewOrder()
    {
        using var admin = await CreateAuthenticatedClientAsync("admin-test");
        var campaignResponse = await admin.PostAsJsonAsync(
            "/api/admin/campaigns",
            new UpsertCampaignRequest(
                "Test indirimi",
                CampaignDiscountType.Percentage,
                10m,
                50m,
                DateTime.UtcNow.AddHours(-1),
                DateTime.UtcNow.AddDays(1),
                true),
            JsonOptions);
        Assert.Equal(HttpStatusCode.Created, campaignResponse.StatusCode);

        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(customer, tableId: 1);
        Assert.Equal(95m, order.SubtotalAmount);
        Assert.Equal(9.5m, order.DiscountAmount);
        Assert.Equal(85.5m, order.TotalAmount);
        Assert.Equal("Test indirimi", order.CampaignName);
    }

    [Fact]
    public async Task SplitPayment_KeepsTableOccupiedUntilEveryPartIsPaid()
    {
        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(customer, tableId: 1);
        using var kitchen = await CreateAuthenticatedClientAsync("kitchen-test");

        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PutAsJsonAsync(
            $"/api/admin/orders/{order.Id}/status",
            new UpdateOrderStatusRequest(OrderStatus.Ready),
            JsonOptions)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await customer.PostAsJsonAsync(
            $"/api/orders/{order.Id}/request-payment",
            new RequestPaymentRequest(PaymentMethod.Cash, 3),
            JsonOptions)).StatusCode);

        var paymentPlan = await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(3, paymentPlan!.Payments!.Count);
        Assert.Equal(paymentPlan.TotalAmount, paymentPlan.Payments.Sum(payment => payment.Amount));

        var firstPayment = paymentPlan.Payments.First();
        Assert.Equal(HttpStatusCode.Created, (await kitchen.PostAsJsonAsync(
            "/api/admin/payments",
            new CreatePaymentRequest(order.Id, PaymentMethod.Cash, firstPayment.Id),
            JsonOptions)).StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
            Assert.Equal(OrderStatus.Ready, (await dbContext.Orders.FindAsync(order.Id))!.Status);
            Assert.Equal(TableStatus.WaitingForPayment, (await dbContext.RestaurantTables.FindAsync(1))!.Status);
        }

        foreach (var payment in paymentPlan.Payments.Skip(1))
        {
            var response = await kitchen.PostAsJsonAsync(
                "/api/admin/payments",
                new CreatePaymentRequest(order.Id, PaymentMethod.Cash, payment.Id),
                JsonOptions);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        using var finalScope = _factory.Services.CreateScope();
        var finalDbContext = finalScope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        Assert.Equal(OrderStatus.Delivered, (await finalDbContext.Orders.FindAsync(order.Id))!.Status);
        Assert.Equal(TableStatus.Empty, (await finalDbContext.RestaurantTables.FindAsync(1))!.Status);
        Assert.Equal(3, finalDbContext.Payments.Count(payment => payment.OrderId == order.Id && payment.Status == PaymentStatus.Completed));
    }

    [Fact]
    public async Task Kitchen_CanSplitSinglePendingPaymentBeforeCollectionStarts()
    {
        using var customer = await CreateAuthenticatedClientAsync("customer-one");
        var order = await CreateOrderAsync(customer, tableId: 1);
        using var kitchen = await CreateAuthenticatedClientAsync("kitchen-test");

        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PutAsJsonAsync(
            $"/api/admin/orders/{order.Id}/status",
            new UpdateOrderStatusRequest(OrderStatus.Ready),
            JsonOptions)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await customer.PostAsJsonAsync(
            $"/api/orders/{order.Id}/request-payment",
            new RequestPaymentRequest(PaymentMethod.CreditCard),
            JsonOptions)).StatusCode);

        var splitResponse = await kitchen.PutAsJsonAsync(
            $"/api/admin/payments/{order.Id}/split",
            new SplitPaymentRequest(4),
            JsonOptions);
        Assert.Equal(HttpStatusCode.OK, splitResponse.StatusCode);

        var parts = await splitResponse.Content.ReadFromJsonAsync<List<PaymentDto>>(JsonOptions);
        Assert.NotNull(parts);
        Assert.Equal(4, parts.Count);
        Assert.Equal(order.TotalAmount, parts.Sum(payment => payment.Amount));
        Assert.All(parts, payment =>
        {
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(PaymentMethod.CreditCard, payment.Method);
        });
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/native/login",
            new LoginRequest(username, "Test123!"),
            JsonOptions);
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<NativeAuthResponse>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    private static async Task<OrderDto> CreateOrderAsync(HttpClient client, int tableId)
    {
        var response = await client.PostAsJsonAsync("/api/orders", NewOrderRequest(tableId), JsonOptions);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderDto>(JsonOptions))!;
    }

    private static CreateOrderRequest NewOrderRequest(int tableId) =>
        new(tableId, [new CreateOrderItemRequest(1, 1, "Az tuzlu")]);
}
