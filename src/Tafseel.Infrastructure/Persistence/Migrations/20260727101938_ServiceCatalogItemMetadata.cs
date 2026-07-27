using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ServiceCatalogItemMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AllowedDurationsCsv",
                table: "ServiceCatalogItems",
                type: "varchar(100)",
                unicode: false,
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "ServiceCatalogItems",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MaxPrice",
                table: "ServiceCatalogItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MinPrice",
                table: "ServiceCatalogItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresScheduling",
                table: "ServiceCatalogItems",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "TeacherSelectable",
                table: "ServiceCatalogItems",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE ServiceCatalogItems
                SET [Type] = CASE
                        WHEN NULLIF([Code], '') IS NOT NULL THEN [Code]
                        ELSE 'recorded_explanation'
                    END,
                    [IsPublic] = 1,
                    [TeacherSelectable] = 1,
                    [RequiresScheduling] = CASE WHEN [Code] = 'live_session' THEN 1 ELSE 0 END,
                    [AllowedDurationsCsv] = CASE WHEN [Code] = 'live_session' THEN '30,60,90,120' ELSE '' END,
                    [MinPrice] = CASE WHEN [Code] = 'live_session' THEN 30 ELSE NULL END,
                    [DisplayOrder] = CASE [Code]
                        WHEN 'recorded_explanation' THEN 10
                        WHEN 'assignment_guidance' THEN 20
                        WHEN 'exam_revision' THEN 30
                        WHEN 'live_session' THEN 40
                        ELSE 100
                    END
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_DisplayOrder",
                table: "ServiceCatalogItems",
                sql: "[DisplayOrder] BETWEEN 0 AND 10000");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_PriceBounds",
                table: "ServiceCatalogItems",
                sql: "([MinPrice] IS NULL OR [MinPrice] > 0) AND ([MaxPrice] IS NULL OR [MaxPrice] > 0) AND ([MinPrice] IS NULL OR [MaxPrice] IS NULL OR [MinPrice] <= [MaxPrice])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                sql: "[Code] <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_DisplayOrder",
                table: "ServiceCatalogItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_PriceBounds",
                table: "ServiceCatalogItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "AllowedDurationsCsv",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "MaxPrice",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "MinPrice",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "RequiresScheduling",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "TeacherSelectable",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "ServiceCatalogItems");
        }
    }
}
