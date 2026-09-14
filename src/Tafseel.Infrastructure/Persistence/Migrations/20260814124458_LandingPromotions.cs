using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LandingPromotions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Promotions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    EyebrowEn = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    EyebrowAr = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    TitleEn = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    TitleAr = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    BodyEn = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    BodyAr = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    HighlightEn = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    HighlightAr = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CouponCode = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    CtaLabelEn = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    CtaLabelAr = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    CtaHref = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    Accent = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Promotions", x => x.Id);
                    table.CheckConstraint("CK_Promotions_DisplayOrder", "[DisplayOrder] BETWEEN 0 AND 10000");
                    table.CheckConstraint("CK_Promotions_Kind", "[Kind] BETWEEN 0 AND 4");
                    table.CheckConstraint("CK_Promotions_TitleAr", "[TitleAr] <> ''");
                    table.CheckConstraint("CK_Promotions_TitleEn", "[TitleEn] <> ''");
                    table.CheckConstraint("CK_Promotions_Window", "[StartsAt] IS NULL OR [EndsAt] IS NULL OR [EndsAt] > [StartsAt]");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Promotions_IsActive_DisplayOrder",
                table: "Promotions",
                columns: new[] { "IsActive", "DisplayOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Promotions");
        }
    }
}
