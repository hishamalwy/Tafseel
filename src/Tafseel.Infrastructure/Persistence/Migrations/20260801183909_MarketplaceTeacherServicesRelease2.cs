using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MarketplaceTeacherServicesRelease2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApproachAr",
                table: "TeacherServices",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ApproachEn",
                table: "TeacherServices",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "SupersededByTeacherServiceId",
                table: "TeacherServices",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [LearningRequests] r
                    LEFT JOIN [TeacherServices] s ON s.[Id] = r.[TeacherServiceId]
                    WHERE s.[Id] IS NULL)
                    OR EXISTS (
                    SELECT 1
                    FROM [Orders] o
                    LEFT JOIN [TeacherServices] s ON s.[Id] = o.[TeacherServiceId]
                    WHERE s.[Id] IS NULL)
                    OR EXISTS (
                    SELECT 1
                    FROM [LiveSessionBookings] b
                    LEFT JOIN [TeacherServices] s ON s.[Id] = b.[TeacherServiceId]
                    WHERE s.[Id] IS NULL)
                    THROW 51000, 'Release 2 aborted: broken TeacherService references require repair.', 1;

                UPDATE [TeacherServices]
                SET [ApproachEn] = LEFT(LTRIM(RTRIM([Description])), 1000)
                WHERE [ApproachEn] = N'' AND LTRIM(RTRIM([Description])) <> N'';

                ;WITH [ReferenceCounts] AS (
                    SELECT
                        s.[Id],
                        (SELECT COUNT_BIG(*) FROM [LearningRequests] r
                            WHERE r.[TeacherServiceId] = s.[Id] AND r.[Status] IN (0, 1, 2))
                        + (SELECT COUNT_BIG(*) FROM [Orders] o
                            WHERE o.[TeacherServiceId] = s.[Id] AND o.[Status] IN (0, 1, 2, 3))
                        + (SELECT COUNT_BIG(*) FROM [LiveSessionBookings] b
                            WHERE b.[TeacherServiceId] = s.[Id] AND b.[Status] IN (0, 1)) AS [NonTerminalReferences],
                        (SELECT COUNT_BIG(*) FROM [LearningRequests] r WHERE r.[TeacherServiceId] = s.[Id])
                        + (SELECT COUNT_BIG(*) FROM [Orders] o WHERE o.[TeacherServiceId] = s.[Id])
                        + (SELECT COUNT_BIG(*) FROM [LiveSessionBookings] b WHERE b.[TeacherServiceId] = s.[Id]) AS [TotalReferences]
                    FROM [TeacherServices] s
                ),
                [Ranked] AS (
                    SELECT
                        s.[Id],
                        FIRST_VALUE(s.[Id]) OVER (
                            PARTITION BY s.[TeacherId], s.[SubjectId], s.[ServiceCatalogItemId]
                            ORDER BY rc.[NonTerminalReferences] DESC, rc.[TotalReferences] DESC,
                                s.[IsActive] DESC, s.[UpdatedAt] DESC, s.[Id] ASC) AS [CanonicalId],
                        ROW_NUMBER() OVER (
                            PARTITION BY s.[TeacherId], s.[SubjectId], s.[ServiceCatalogItemId]
                            ORDER BY rc.[NonTerminalReferences] DESC, rc.[TotalReferences] DESC,
                                s.[IsActive] DESC, s.[UpdatedAt] DESC, s.[Id] ASC) AS [Rank]
                    FROM [TeacherServices] s
                    INNER JOIN [ReferenceCounts] rc ON rc.[Id] = s.[Id]
                )
                UPDATE s
                SET s.[IsActive] = CAST(0 AS bit),
                    s.[SupersededByTeacherServiceId] = r.[CanonicalId],
                    s.[UpdatedAt] = SYSDATETIMEOFFSET()
                FROM [TeacherServices] s
                INNER JOIN [Ranked] r ON r.[Id] = s.[Id]
                WHERE r.[Rank] > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherServices_SupersededByTeacherServiceId",
                table: "TeacherServices",
                column: "SupersededByTeacherServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherServices_TeacherId_SubjectId_ServiceCatalogItemId",
                table: "TeacherServices",
                columns: new[] { "TeacherId", "SubjectId", "ServiceCatalogItemId" },
                unique: true,
                filter: "[SupersededByTeacherServiceId] IS NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherServices_NotSelfSuperseded",
                table: "TeacherServices",
                sql: "[SupersededByTeacherServiceId] IS NULL OR [SupersededByTeacherServiceId] <> [Id]");

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherServices_TeacherServices_SupersededByTeacherServiceId",
                table: "TeacherServices",
                column: "SupersededByTeacherServiceId",
                principalTable: "TeacherServices",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TeacherServices_TeacherServices_SupersededByTeacherServiceId",
                table: "TeacherServices");

            migrationBuilder.DropIndex(
                name: "IX_TeacherServices_SupersededByTeacherServiceId",
                table: "TeacherServices");

            migrationBuilder.DropIndex(
                name: "IX_TeacherServices_TeacherId_SubjectId_ServiceCatalogItemId",
                table: "TeacherServices");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherServices_NotSelfSuperseded",
                table: "TeacherServices");

            migrationBuilder.DropColumn(
                name: "ApproachAr",
                table: "TeacherServices");

            migrationBuilder.DropColumn(
                name: "ApproachEn",
                table: "TeacherServices");

            migrationBuilder.DropColumn(
                name: "SupersededByTeacherServiceId",
                table: "TeacherServices");
        }
    }
}
