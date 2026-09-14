using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TeacherEarningsClearance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TeacherEarningMaturities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LiveSessionBookingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    MaturesAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SettledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    BusinessKey = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherEarningMaturities", x => x.Id);
                    table.CheckConstraint("CK_EarningMaturities_Amount", "[Amount] > 0");
                    table.CheckConstraint("CK_EarningMaturities_Status", "[Status] BETWEEN 0 AND 2");
                    table.CheckConstraint("CK_EarningMaturities_Target", "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_TeacherEarningMaturities_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherEarningMaturities_LiveSessionBookings_LiveSessionBookingId",
                        column: x => x.LiveSessionBookingId,
                        principalTable: "LiveSessionBookings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherEarningMaturities_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherEarningMaturities_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_BusinessKey",
                table: "TeacherEarningMaturities",
                column: "BusinessKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_LiveSessionBookingId",
                table: "TeacherEarningMaturities",
                column: "LiveSessionBookingId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_OrderId",
                table: "TeacherEarningMaturities",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_PaymentId",
                table: "TeacherEarningMaturities",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_Status_MaturesAt",
                table: "TeacherEarningMaturities",
                columns: new[] { "Status", "MaturesAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEarningMaturities_TeacherId_Status",
                table: "TeacherEarningMaturities",
                columns: new[] { "TeacherId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeacherEarningMaturities");
        }
    }
}
