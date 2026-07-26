using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase6LiveSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LiveSessionBookings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StudentId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    StudentTimeZoneId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TeacherTimeZoneId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    BasePrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    EmergencyPremiumPercent = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: false),
                    EmergencyPremiumAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CancellationWindowHours = table.Column<int>(type: "int", nullable: false),
                    JoinKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RescheduleCount = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LiveSessionBookings", x => x.Id);
                    table.CheckConstraint("CK_LiveSessionBookings_Cancellation", "[CancellationWindowHours] BETWEEN 0 AND 720");
                    table.CheckConstraint("CK_LiveSessionBookings_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                    table.CheckConstraint("CK_LiveSessionBookings_Price", "[BasePrice] > 0 AND [EmergencyPremiumPercent] BETWEEN 0 AND 1000 AND [EmergencyPremiumAmount] = ROUND([BasePrice] * [EmergencyPremiumPercent] / 100, 2) AND [TotalPrice] = [BasePrice] + [EmergencyPremiumAmount]");
                    table.CheckConstraint("CK_LiveSessionBookings_Range", "[EndsAt] > [StartsAt]");
                    table.CheckConstraint("CK_LiveSessionBookings_Status", "[Status] BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "FK_LiveSessionBookings_AspNetUsers_StudentId",
                        column: x => x.StudentId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LiveSessionBookings_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LiveSessionBookings_TeacherServices_TeacherServiceId",
                        column: x => x.TeacherServiceId,
                        principalTable: "TeacherServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Duration",
                table: "LiveSessionBookings",
                sql: "DATEDIFF(MINUTE, [StartsAt], [EndsAt]) IN (30, 60, 90, 120)");

            migrationBuilder.CreateTable(
                name: "LiveSessionAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LiveSessionBookingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadedById = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LiveSessionAttachments", x => x.Id);
                    table.CheckConstraint("CK_LiveSessionAttachment_Size", "[Size] > 0");
                    table.ForeignKey(
                        name: "FK_LiveSessionAttachments_AspNetUsers_UploadedById",
                        column: x => x.UploadedById,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LiveSessionAttachments_LiveSessionBookings_LiveSessionBookingId",
                        column: x => x.LiveSessionBookingId,
                        principalTable: "LiveSessionBookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LiveSessionStatusHistory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LiveSessionBookingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousStatus = table.Column<int>(type: "int", nullable: true),
                    NextStatus = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LiveSessionStatusHistory", x => x.Id);
                    table.CheckConstraint("CK_LiveSessionHistory_Next", "[NextStatus] BETWEEN 0 AND 5");
                    table.CheckConstraint("CK_LiveSessionHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "FK_LiveSessionStatusHistory_LiveSessionBookings_LiveSessionBookingId",
                        column: x => x.LiveSessionBookingId,
                        principalTable: "LiveSessionBookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionAttachments_LiveSessionBookingId",
                table: "LiveSessionAttachments",
                column: "LiveSessionBookingId");

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionAttachments_UploadedById",
                table: "LiveSessionAttachments",
                column: "UploadedById");

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionBookings_StudentId_StartsAt",
                table: "LiveSessionBookings",
                columns: new[] { "StudentId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionBookings_TeacherId_Status_StartsAt_EndsAt",
                table: "LiveSessionBookings",
                columns: new[] { "TeacherId", "Status", "StartsAt", "EndsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionBookings_TeacherServiceId",
                table: "LiveSessionBookings",
                column: "TeacherServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionStatusHistory_LiveSessionBookingId",
                table: "LiveSessionStatusHistory",
                column: "LiveSessionBookingId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LiveSessionAttachments");

            migrationBuilder.DropTable(
                name: "LiveSessionStatusHistory");

            migrationBuilder.DropTable(
                name: "LiveSessionBookings");
        }
    }
}
