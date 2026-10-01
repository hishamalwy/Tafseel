using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SupportCases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SupportCases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reference = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    Category = table.Column<int>(type: "int", nullable: false),
                    ReporterId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ContactEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ContactName = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    RelatedReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    OwnerId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    OwnedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Outcome = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ResolvedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ResolvedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportCases", x => x.Id);
                    table.CheckConstraint("CK_SupportCases_Category", "[Category] BETWEEN 0 AND 4");
                    table.CheckConstraint("CK_SupportCases_Reporter", "[ReporterId] IS NOT NULL OR ([ContactEmail] IS NOT NULL AND [Category] = 0)");
                    table.CheckConstraint("CK_SupportCases_Status", "[Status] BETWEEN 0 AND 2");
                    table.ForeignKey(
                        name: "FK_SupportCases_AspNetUsers_ReporterId",
                        column: x => x.ReporterId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupportCaseAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupportCaseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploaderId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    OriginalName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportCaseAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportCaseAttachments_SupportCases_SupportCaseId",
                        column: x => x.SupportCaseId,
                        principalTable: "SupportCases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SupportCaseMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SupportCaseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    FromStaff = table.Column<bool>(type: "bit", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportCaseMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportCaseMessages_SupportCases_SupportCaseId",
                        column: x => x.SupportCaseId,
                        principalTable: "SupportCases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupportCaseAttachments_SupportCaseId",
                table: "SupportCaseAttachments",
                column: "SupportCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_SupportCaseMessages_SupportCaseId_CreatedAt",
                table: "SupportCaseMessages",
                columns: new[] { "SupportCaseId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SupportCases_Reference",
                table: "SupportCases",
                column: "Reference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupportCases_ReporterId_UpdatedAt",
                table: "SupportCases",
                columns: new[] { "ReporterId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SupportCases_Status_CreatedAt",
                table: "SupportCases",
                columns: new[] { "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupportCaseAttachments");

            migrationBuilder.DropTable(
                name: "SupportCaseMessages");

            migrationBuilder.DropTable(
                name: "SupportCases");
        }
    }
}
