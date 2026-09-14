using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase1LiveSessionSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Refunds",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "LiveSessionBookingId",
                table: "Refunds",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TeacherCommissionAmount",
                table: "LiveSessionBookings",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TeacherCommissionPercent",
                table: "LiveSessionBookings",
                type: "decimal(9,4)",
                precision: 9,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TeacherNet",
                table: "LiveSessionBookings",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            // Existing bookings keep their original economics: no retroactive commission.
            migrationBuilder.Sql("UPDATE [LiveSessionBookings] SET [TeacherNet] = [TotalPrice]");

            migrationBuilder.CreateIndex(
                name: "IX_Refunds_LiveSessionBookingId",
                table: "Refunds",
                column: "LiveSessionBookingId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Refunds_Target",
                table: "Refunds",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Commission",
                table: "LiveSessionBookings",
                sql: "[TeacherCommissionPercent] BETWEEN 0 AND 100 AND [TeacherCommissionAmount] = ROUND([TotalPrice] * [TeacherCommissionPercent] / 100, 2) AND [TeacherNet] = [TotalPrice] - [TeacherCommissionAmount]");

            migrationBuilder.AddForeignKey(
                name: "FK_Refunds_LiveSessionBookings_LiveSessionBookingId",
                table: "Refunds",
                column: "LiveSessionBookingId",
                principalTable: "LiveSessionBookings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Refunds_LiveSessionBookings_LiveSessionBookingId",
                table: "Refunds");

            migrationBuilder.DropIndex(
                name: "IX_Refunds_LiveSessionBookingId",
                table: "Refunds");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Refunds_Target",
                table: "Refunds");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_Commission",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "LiveSessionBookingId",
                table: "Refunds");

            migrationBuilder.DropColumn(
                name: "TeacherCommissionAmount",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "TeacherCommissionPercent",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "TeacherNet",
                table: "LiveSessionBookings");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Refunds",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
