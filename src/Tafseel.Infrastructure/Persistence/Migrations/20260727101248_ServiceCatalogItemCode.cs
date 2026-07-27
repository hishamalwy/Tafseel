using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ServiceCatalogItemCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            // Deterministic migration-time backfill for known canonical NormalizedName keys only.
            // Not used at runtime for capability inference. Unknown rows get unique legacy_* codes.
            migrationBuilder.Sql(
                """
                ;WITH ranked AS (
                    SELECT
                        [Id],
                        [NormalizedName],
                        [Code],
                        CASE [NormalizedName]
                            WHEN N'LIVE SESSION' THEN 'live_session'
                            WHEN N'CUSTOM RECORDED EXPLANATION' THEN 'recorded_explanation'
                            WHEN N'RECORDED EXPLANATION' THEN 'recorded_explanation'
                            WHEN N'ASSIGNMENT GUIDANCE' THEN 'assignment_guidance'
                            WHEN N'EXAM REVISION' THEN 'exam_revision'
                            ELSE NULL
                        END AS [CanonicalCode],
                        ROW_NUMBER() OVER (
                            PARTITION BY CASE [NormalizedName]
                                WHEN N'LIVE SESSION' THEN 'live_session'
                                WHEN N'CUSTOM RECORDED EXPLANATION' THEN 'recorded_explanation'
                                WHEN N'RECORDED EXPLANATION' THEN 'recorded_explanation'
                                WHEN N'ASSIGNMENT GUIDANCE' THEN 'assignment_guidance'
                                WHEN N'EXAM REVISION' THEN 'exam_revision'
                                ELSE CONVERT(varchar(36), [Id])
                            END
                            ORDER BY [Id]
                        ) AS [rn]
                    FROM [ServiceCatalogItems]
                    WHERE [Code] = '' OR [Code] IS NULL
                )
                UPDATE s
                SET [Code] = CASE
                    WHEN r.[CanonicalCode] IS NOT NULL AND r.[rn] = 1 THEN r.[CanonicalCode]
                    WHEN r.[CanonicalCode] IS NOT NULL THEN CONCAT('legacy_', r.[CanonicalCode], '_', LOWER(REPLACE(CONVERT(varchar(36), r.[Id]), '-', '')))
                    ELSE CONCAT('legacy_unclassified_', LOWER(REPLACE(CONVERT(varchar(36), r.[Id]), '-', '')))
                END
                FROM [ServiceCatalogItems] s
                INNER JOIN ranked r ON r.[Id] = s.[Id];

                UPDATE [ServiceCatalogItems]
                SET [Code] = LOWER([Code])
                WHERE [Code] <> LOWER([Code]);

                UPDATE [ServiceCatalogItems]
                SET [Code] = CONCAT('legacy_unclassified_', LOWER(REPLACE(CONVERT(varchar(36), [Id]), '-', '')))
                WHERE [Code] = '' OR [Code] IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems",
                column: "Code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_Code",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "ServiceCatalogItems");
        }
    }
}
