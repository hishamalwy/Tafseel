using Microsoft.EntityFrameworkCore.Migrations;

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    public partial class Allowed_AddColumnAndChecks : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                UPDATE ServiceCatalogItems SET [Code] = 'legacy_x' WHERE [Code] = '';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                column: "Code",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                sql: "[Code] <> ''");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "ServiceCatalogItems");
        }
    }
}
