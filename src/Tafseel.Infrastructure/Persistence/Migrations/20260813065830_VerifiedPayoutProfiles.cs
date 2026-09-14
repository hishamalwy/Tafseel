using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class VerifiedPayoutProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DestinationLabel",
                table: "WithdrawalRequests",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PayoutMethod",
                table: "WithdrawalRequests",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                table: "WithdrawalRequests",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TeacherPayoutProfiles",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    LegalName = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    CountryCode = table.Column<string>(type: "varchar(2)", unicode: false, maxLength: 2, nullable: false),
                    PayoutMethod = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    DestinationLabel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IdentityLast4 = table.Column<string>(type: "varchar(4)", unicode: false, maxLength: 4, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RejectionReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherPayoutProfiles", x => x.TeacherId);
                    table.CheckConstraint("CK_PayoutProfiles_Status", "[Status] BETWEEN 0 AND 2");
                    table.ForeignKey(
                        name: "FK_TeacherPayoutProfiles_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherPayoutProfiles_Status_SubmittedAt",
                table: "TeacherPayoutProfiles",
                columns: new[] { "Status", "SubmittedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeacherPayoutProfiles");

            migrationBuilder.DropColumn(
                name: "DestinationLabel",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "PayoutMethod",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                table: "WithdrawalRequests");
        }
    }
}
