using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using RestaurantApp.Models;

namespace RestaurantApp.Data;

public class RestaurantDbContext : IdentityDbContext<AppUser>
{
    public RestaurantDbContext(DbContextOptions<RestaurantDbContext> options)
        : base(options)
    {
    }

    public DbSet<RestaurantTable> RestaurantTables => Set<RestaurantTable>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<MenuItem> MenuItems => Set<MenuItem>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    public DbSet<Payment> Payments => Set<Payment>();

    public DbSet<DailySummary> DailySummaries => Set<DailySummary>();

    public DbSet<MenuItemOption> MenuItemOptions => Set<MenuItemOption>();

    public DbSet<CustomerFavorite> CustomerFavorites => Set<CustomerFavorite>();

    public DbSet<CustomerPushToken> CustomerPushTokens => Set<CustomerPushToken>();

    public DbSet<OrderReview> OrderReviews => Set<OrderReview>();

    public DbSet<WaiterCall> WaiterCalls => Set<WaiterCall>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public DbSet<Campaign> Campaigns => Set<Campaign>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<RestaurantTable>(entity =>
        {
            entity.ToTable("Tables");
            entity.HasIndex(table => table.Number).IsUnique();
            entity.HasIndex(table => table.QRCode).IsUnique();
            entity.Property(table => table.QRCode).HasMaxLength(80).IsRequired();
            entity.Property(table => table.Status).HasConversion<string>().HasMaxLength(30);
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.Property(category => category.Name).HasMaxLength(100).IsRequired();
        });

        modelBuilder.Entity<MenuItem>(entity =>
        {
            entity.Property(item => item.Name).HasMaxLength(150).IsRequired();
            entity.Property(item => item.Description).HasMaxLength(500);
            entity.Property(item => item.ImageUrl).HasMaxLength(500);
            entity.Property(item => item.Price).HasPrecision(18, 2);
            entity.Property(item => item.StockQuantity).HasDefaultValue(100);
        });

        modelBuilder.Entity<MenuItemOption>(entity =>
        {
            entity.Property(option => option.Name).HasMaxLength(100).IsRequired();
            entity.Property(option => option.AdditionalPrice).HasPrecision(18, 2);
            entity.HasOne(option => option.MenuItem)
                .WithMany(item => item.Options)
                .HasForeignKey(option => option.MenuItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.Property(order => order.Status).HasConversion<string>().HasMaxLength(30);
            entity.Property(order => order.RequestedPaymentMethod).HasConversion<string>().HasMaxLength(30);
            entity.Property(order => order.TotalAmount).HasPrecision(18, 2);
            entity.Property(order => order.SubtotalAmount).HasPrecision(18, 2);
            entity.Property(order => order.DiscountAmount).HasPrecision(18, 2);
            entity.Property(order => order.CampaignName).HasMaxLength(150);
            entity.HasOne(order => order.Table)
                .WithMany(table => table.Orders)
                .HasForeignKey(order => order.TableId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(order => order.CustomerUser)
                .WithMany(user => user.Orders)
                .HasForeignKey(order => order.CustomerUserId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(order => new { order.CustomerUserId, order.CreatedAt });
            entity.HasOne(order => order.Campaign)
                .WithMany(campaign => campaign.Orders)
                .HasForeignKey(order => order.CampaignId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OrderReview>(entity =>
        {
            entity.Property(review => review.Comment).HasMaxLength(1000);
            entity.HasIndex(review => review.OrderId).IsUnique();
            entity.HasOne(review => review.Order)
                .WithOne(order => order.Review)
                .HasForeignKey<OrderReview>(review => review.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerFavorite>(entity =>
        {
            entity.HasKey(favorite => new { favorite.UserId, favorite.MenuItemId });
            entity.HasOne(favorite => favorite.User)
                .WithMany(user => user.Favorites)
                .HasForeignKey(favorite => favorite.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(favorite => favorite.MenuItem)
                .WithMany(item => item.FavoritedBy)
                .HasForeignKey(favorite => favorite.MenuItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WaiterCall>(entity =>
        {
            entity.HasIndex(call => call.TableId)
                .IsUnique()
                .HasFilter("[ResolvedAt] IS NULL");
            entity.HasIndex(call => call.CustomerUserId);
            entity.HasOne(call => call.Table)
                .WithMany()
                .HasForeignKey(call => call.TableId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(call => call.CustomerUser)
                .WithMany()
                .HasForeignKey(call => call.CustomerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CustomerPushToken>(entity =>
        {
            entity.Property(token => token.Token).HasMaxLength(250).IsRequired();
            entity.Property(token => token.Platform).HasMaxLength(20).IsRequired();
            entity.HasIndex(token => token.Token).IsUnique();
            entity.HasOne(token => token.User)
                .WithMany(user => user.PushTokens)
                .HasForeignKey(token => token.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.Property(item => item.UnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.Note).HasMaxLength(300);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(30);
            entity.HasOne(item => item.MenuItem)
                .WithMany(menuItem => menuItem.OrderItems)
                .HasForeignKey(item => item.MenuItemId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.Property(payment => payment.Amount).HasPrecision(18, 2);
            entity.Property(payment => payment.Method).HasConversion<string>().HasMaxLength(30);
            entity.Property(payment => payment.Status).HasConversion<string>().HasMaxLength(30);
            entity.HasIndex(payment => new { payment.OrderId, payment.Status });
            entity.HasOne(payment => payment.Order)
                .WithMany(order => order.Payments)
                .HasForeignKey(payment => payment.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Campaign>(entity =>
        {
            entity.Property(campaign => campaign.Name).HasMaxLength(150).IsRequired();
            entity.Property(campaign => campaign.DiscountType).HasConversion<string>().HasMaxLength(30);
            entity.Property(campaign => campaign.DiscountValue).HasPrecision(18, 2);
            entity.Property(campaign => campaign.MinimumOrderAmount).HasPrecision(18, 2);
            entity.HasIndex(campaign => new { campaign.IsActive, campaign.StartsAt, campaign.EndsAt });
        });

        modelBuilder.Entity<DailySummary>(entity =>
        {
            entity.HasKey(summary => summary.Date);
            entity.Property(summary => summary.TotalRevenue).HasPrecision(18, 2);
            entity.HasOne(summary => summary.MostSoldItem)
                .WithMany()
                .HasForeignKey(summary => summary.MostSoldItemId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.Property(log => log.UserId).HasMaxLength(450);
            entity.Property(log => log.UserName).HasMaxLength(256).IsRequired();
            entity.Property(log => log.Role).HasMaxLength(50).IsRequired();
            entity.Property(log => log.Action).HasMaxLength(80).IsRequired();
            entity.Property(log => log.EntityType).HasMaxLength(80).IsRequired();
            entity.Property(log => log.EntityId).HasMaxLength(100);
            entity.Property(log => log.BeforeJson).HasMaxLength(4000);
            entity.Property(log => log.AfterJson).HasMaxLength(4000);
            entity.Property(log => log.IpAddress).HasMaxLength(64);
            entity.HasIndex(log => log.CreatedAt);
            entity.HasIndex(log => new { log.EntityType, log.EntityId });
        });

        SeedInitialData(modelBuilder);
    }

    private static void SeedInitialData(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RestaurantTable>().HasData(
            new RestaurantTable { Id = 1, Number = 1, QRCode = "table-001-qr", Status = TableStatus.Empty, Capacity = 2 },
            new RestaurantTable { Id = 2, Number = 2, QRCode = "table-002-qr", Status = TableStatus.Empty, Capacity = 4 },
            new RestaurantTable { Id = 3, Number = 3, QRCode = "table-003-qr", Status = TableStatus.Empty, Capacity = 4 },
            new RestaurantTable { Id = 4, Number = 4, QRCode = "table-004-qr", Status = TableStatus.Empty, Capacity = 6 });

        modelBuilder.Entity<Category>().HasData(
            new Category { Id = 1, Name = "Başlangıçlar", DisplayOrder = 1, IsActive = true },
            new Category { Id = 2, Name = "Ana Yemekler", DisplayOrder = 2, IsActive = true },
            new Category { Id = 3, Name = "İçecekler", DisplayOrder = 3, IsActive = true },
            new Category { Id = 4, Name = "Tatlılar", DisplayOrder = 4, IsActive = true });

        modelBuilder.Entity<MenuItem>().HasData(
            new MenuItem
            {
                Id = 1,
                CategoryId = 1,
                Name = "Mercimek Çorbası",
                Description = "Günlük hazırlanan klasik mercimek çorbası.",
                Price = 95m,
                ImageUrl = "/images/menu/mercimek-corbasi.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 8
            },
            new MenuItem
            {
                Id = 2,
                CategoryId = 1,
                Name = "Patates Kızartması",
                Description = "Çıtır patates kızartması ve ev sosu.",
                Price = 120m,
                ImageUrl = "/images/menu/patates-kizartmasi.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 10
            },
            new MenuItem
            {
                Id = 3,
                CategoryId = 2,
                Name = "Izgara Köfte",
                Description = "Pirinç pilavı ve mevsim salatası ile servis edilir.",
                Price = 285m,
                ImageUrl = "/images/menu/izgara-kofte.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 18
            },
            new MenuItem
            {
                Id = 4,
                CategoryId = 2,
                Name = "Tavuk Şiş",
                Description = "Marine tavuk şiş, köz biber ve lavaş ile.",
                Price = 260m,
                ImageUrl = "/images/menu/tavuk-sis.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 16
            },
            new MenuItem
            {
                Id = 5,
                CategoryId = 3,
                Name = "Ayran",
                Description = "Soğuk ayran.",
                Price = 45m,
                ImageUrl = "/images/menu/ayran.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 2
            },
            new MenuItem
            {
                Id = 6,
                CategoryId = 3,
                Name = "Limonata",
                Description = "Ev yapımı ferah limonata.",
                Price = 70m,
                ImageUrl = "/images/menu/limonata.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 3
            },
            new MenuItem
            {
                Id = 7,
                CategoryId = 4,
                Name = "Sütlaç",
                Description = "Fırınlanmış geleneksel sütlaç.",
                Price = 110m,
                ImageUrl = "/images/menu/sutlac.jpg",
                IsAvailable = true,
                StockQuantity = 100,
                PreparationMinutes = 5
            });

        modelBuilder.Entity<MenuItemOption>().HasData(
            new MenuItemOption { Id = 1, MenuItemId = 3, Name = "Ekstra kaşar", AdditionalPrice = 25m, IsActive = true, DisplayOrder = 1 },
            new MenuItemOption { Id = 2, MenuItemId = 3, Name = "Acılı sos", AdditionalPrice = 10m, IsActive = true, DisplayOrder = 2 },
            new MenuItemOption { Id = 3, MenuItemId = 4, Name = "Ekstra lavaş", AdditionalPrice = 15m, IsActive = true, DisplayOrder = 1 },
            new MenuItemOption { Id = 4, MenuItemId = 4, Name = "Ekstra pilav", AdditionalPrice = 35m, IsActive = true, DisplayOrder = 2 },
            new MenuItemOption { Id = 5, MenuItemId = 5, Name = "Büyük boy", AdditionalPrice = 20m, IsActive = true, DisplayOrder = 1 });
    }
}
