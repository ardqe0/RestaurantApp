using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantApp.Migrations
{
    /// <inheritdoc />
    public partial class AddRequestedPaymentMethod : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RequestedPaymentMethod",
                table: "Orders",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequestedPaymentMethod",
                table: "Orders");
        }
    }
}
