using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace RestaurantApp.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomerUserId",
                table: "Orders",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomerFavorites",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    MenuItemId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerFavorites", x => new { x.UserId, x.MenuItemId });
                    table.ForeignKey(
                        name: "FK_CustomerFavorites_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CustomerFavorites_MenuItems_MenuItemId",
                        column: x => x.MenuItemId,
                        principalTable: "MenuItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerPushTokens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Token = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false),
                    Platform = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerPushTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerPushTokens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MenuItemOptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MenuItemId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AdditionalPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MenuItemOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MenuItemOptions_MenuItems_MenuItemId",
                        column: x => x.MenuItemId,
                        principalTable: "MenuItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "MenuItemOptions",
                columns: new[] { "Id", "AdditionalPrice", "DisplayOrder", "IsActive", "MenuItemId", "Name" },
                values: new object[,]
                {
                    { 1, 25m, 1, true, 3, "Ekstra kaşar" },
                    { 2, 10m, 2, true, 3, "Acılı sos" },
                    { 3, 15m, 1, true, 4, "Ekstra lavaş" },
                    { 4, 35m, 2, true, 4, "Ekstra pilav" },
                    { 5, 20m, 1, true, 5, "Büyük boy" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerUserId_CreatedAt",
                table: "Orders",
                columns: new[] { "CustomerUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerFavorites_MenuItemId",
                table: "CustomerFavorites",
                column: "MenuItemId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPushTokens_Token",
                table: "CustomerPushTokens",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPushTokens_UserId",
                table: "CustomerPushTokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MenuItemOptions_MenuItemId",
                table: "MenuItemOptions",
                column: "MenuItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_AspNetUsers_CustomerUserId",
                table: "Orders",
                column: "CustomerUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Orders_AspNetUsers_CustomerUserId",
                table: "Orders");

            migrationBuilder.DropTable(
                name: "CustomerFavorites");

            migrationBuilder.DropTable(
                name: "CustomerPushTokens");

            migrationBuilder.DropTable(
                name: "MenuItemOptions");

            migrationBuilder.DropIndex(
                name: "IX_Orders_CustomerUserId_CreatedAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CustomerUserId",
                table: "Orders");
        }
    }
}
