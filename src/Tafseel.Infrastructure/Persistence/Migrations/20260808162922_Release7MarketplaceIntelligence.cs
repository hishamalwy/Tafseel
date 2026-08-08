using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Release7MarketplaceIntelligence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MarketplaceInteractionEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventName = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    SourceSurface = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    ClientEventId = table.Column<string>(type: "varchar(100)", unicode: false, maxLength: 100, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AuthenticatedUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    AnonymousSessionId = table.Column<string>(type: "varchar(100)", unicode: false, maxLength: 100, nullable: true),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    TeacherServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ServiceCatalogItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResultCount = table.Column<int>(type: "int", nullable: true),
                    QueryPresent = table.Column<bool>(type: "bit", nullable: false),
                    LanguageFilterPresent = table.Column<bool>(type: "bit", nullable: false),
                    PriceFilterPresent = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MarketplaceInteractionEvents", x => x.Id);
                    table.CheckConstraint("CK_MarketplaceInteractionEvents_ResultCount", "[ResultCount] IS NULL OR [ResultCount] BETWEEN 0 AND 10000");
                });

            migrationBuilder.CreateIndex(
                name: "IX_MarketplaceInteractionEvents_ClientEventId",
                table: "MarketplaceInteractionEvents",
                column: "ClientEventId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MarketplaceInteractionEvents_OccurredAtUtc_EventName",
                table: "MarketplaceInteractionEvents",
                columns: new[] { "OccurredAtUtc", "EventName" });

            migrationBuilder.CreateIndex(
                name: "IX_MarketplaceInteractionEvents_SubjectId_ServiceCatalogItemId_OccurredAtUtc",
                table: "MarketplaceInteractionEvents",
                columns: new[] { "SubjectId", "ServiceCatalogItemId", "OccurredAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MarketplaceInteractionEvents");
        }
    }
}
