using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CompleteTrustCycles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TeacherReviews_OrderId",
                table: "TeacherReviews");

            migrationBuilder.DropIndex(
                name: "IX_Disputes_OrderId",
                table: "Disputes");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "TeacherReviews",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "LiveSessionBookingId",
                table: "TeacherReviews",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Disputes",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "LiveSessionBookingId",
                table: "Disputes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherReviews_LiveSessionBookingId",
                table: "TeacherReviews",
                column: "LiveSessionBookingId",
                unique: true,
                filter: "[LiveSessionBookingId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherReviews_OrderId",
                table: "TeacherReviews",
                column: "OrderId",
                unique: true,
                filter: "[OrderId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherReviews_Target",
                table: "TeacherReviews",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_Disputes_LiveSessionBookingId",
                table: "Disputes",
                column: "LiveSessionBookingId",
                unique: true,
                filter: "[LiveSessionBookingId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Disputes_OrderId",
                table: "Disputes",
                column: "OrderId",
                unique: true,
                filter: "[OrderId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Disputes_Target",
                table: "Disputes",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_Disputes_LiveSessionBookings_LiveSessionBookingId",
                table: "Disputes",
                column: "LiveSessionBookingId",
                principalTable: "LiveSessionBookings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherReviews_LiveSessionBookings_LiveSessionBookingId",
                table: "TeacherReviews",
                column: "LiveSessionBookingId",
                principalTable: "LiveSessionBookings",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Disputes_LiveSessionBookings_LiveSessionBookingId",
                table: "Disputes");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherReviews_LiveSessionBookings_LiveSessionBookingId",
                table: "TeacherReviews");

            migrationBuilder.DropIndex(
                name: "IX_TeacherReviews_LiveSessionBookingId",
                table: "TeacherReviews");

            migrationBuilder.DropIndex(
                name: "IX_TeacherReviews_OrderId",
                table: "TeacherReviews");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherReviews_Target",
                table: "TeacherReviews");

            migrationBuilder.DropIndex(
                name: "IX_Disputes_LiveSessionBookingId",
                table: "Disputes");

            migrationBuilder.DropIndex(
                name: "IX_Disputes_OrderId",
                table: "Disputes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Disputes_Target",
                table: "Disputes");

            migrationBuilder.DropColumn(
                name: "LiveSessionBookingId",
                table: "TeacherReviews");

            migrationBuilder.DropColumn(
                name: "LiveSessionBookingId",
                table: "Disputes");

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "TeacherReviews",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "OrderId",
                table: "Disputes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherReviews_OrderId",
                table: "TeacherReviews",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Disputes_OrderId",
                table: "Disputes",
                column: "OrderId",
                unique: true);
        }
    }
}
