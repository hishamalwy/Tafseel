using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MutualLiveSessionSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProposedEndsAt",
                table: "LiveSessionBookings",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ProposedStartsAt",
                table: "LiveSessionBookings",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RescheduleRequestedAt",
                table: "LiveSessionBookings",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RescheduleRequestedById",
                table: "LiveSessionBookings",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 8");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 8");

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionBookings_RescheduleRequestedById",
                table: "LiveSessionBookings",
                column: "RescheduleRequestedById");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_RescheduleRequest",
                table: "LiveSessionBookings",
                sql: "([RescheduleRequestedAt] IS NULL AND [RescheduleRequestedById] IS NULL AND [ProposedStartsAt] IS NULL AND [ProposedEndsAt] IS NULL) OR ([RescheduleRequestedAt] IS NOT NULL AND [RescheduleRequestedById] IS NOT NULL AND [ProposedStartsAt] IS NOT NULL AND [ProposedEndsAt] > [ProposedStartsAt])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings",
                sql: "[Status] BETWEEN 0 AND 8");

            migrationBuilder.AddForeignKey(
                name: "FK_LiveSessionBookings_AspNetUsers_RescheduleRequestedById",
                table: "LiveSessionBookings",
                column: "RescheduleRequestedById",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_LiveSessionBookings_AspNetUsers_RescheduleRequestedById",
                table: "LiveSessionBookings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropIndex(
                name: "IX_LiveSessionBookings_RescheduleRequestedById",
                table: "LiveSessionBookings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_RescheduleRequest",
                table: "LiveSessionBookings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "ProposedEndsAt",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "ProposedStartsAt",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "RescheduleRequestedAt",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "RescheduleRequestedById",
                table: "LiveSessionBookings");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings",
                sql: "[Status] BETWEEN 0 AND 5");
        }
    }
}
