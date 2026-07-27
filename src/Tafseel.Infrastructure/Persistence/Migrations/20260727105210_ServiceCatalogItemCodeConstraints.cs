using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ServiceCatalogItemCodeConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                column: "Code",
                unique: true,
                filter: "[Code] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                column: "Code",
                unique: true);
        }
    }
}
