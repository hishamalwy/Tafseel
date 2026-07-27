using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LiveSessionPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_OrderId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_EscrowEntries_OrderId_Type",
                table: "EscrowEntries");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Payments",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "LiveSessionBookingId",
                table: "Payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "EscrowEntries",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "LiveSessionBookingId",
                table: "EscrowEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_LiveSessionBookingId",
                table: "Payments",
                column: "LiveSessionBookingId",
                unique: true,
                filter: "[LiveSessionBookingId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_OrderId",
                table: "Payments",
                column: "OrderId",
                unique: true,
                filter: "[OrderId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_EscrowEntries_LiveSessionBookingId_Type",
                table: "EscrowEntries",
                columns: new[] { "LiveSessionBookingId", "Type" },
                filter: "[LiveSessionBookingId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EscrowEntries_OrderId_Type",
                table: "EscrowEntries",
                columns: new[] { "OrderId", "Type" },
                filter: "[OrderId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EscrowEntries_Target",
                table: "EscrowEntries",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_EscrowEntries_LiveSessionBookings_LiveSessionBookingId",
                table: "EscrowEntries",
                column: "LiveSessionBookingId",
                principalTable: "LiveSessionBookings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_LiveSessionBookings_LiveSessionBookingId",
                table: "Payments",
                column: "LiveSessionBookingId",
                principalTable: "LiveSessionBookings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EscrowEntries_LiveSessionBookings_LiveSessionBookingId",
                table: "EscrowEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_Payments_LiveSessionBookings_LiveSessionBookingId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_LiveSessionBookingId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_OrderId",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_EscrowEntries_LiveSessionBookingId_Type",
                table: "EscrowEntries");

            migrationBuilder.DropIndex(
                name: "IX_EscrowEntries_OrderId_Type",
                table: "EscrowEntries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EscrowEntries_Target",
                table: "EscrowEntries");

            migrationBuilder.DropColumn(
                name: "LiveSessionBookingId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "LiveSessionBookingId",
                table: "EscrowEntries");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Payments",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "EscrowEntries",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_OrderId",
                table: "Payments",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EscrowEntries_OrderId_Type",
                table: "EscrowEntries",
                columns: new[] { "OrderId", "Type" });
        }
    }
}
