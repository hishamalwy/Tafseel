using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OpenRequestCouponIntent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PendingCouponDiscount",
                table: "Payments",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingCouponId",
                table: "Payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PendingCouponId",
                table: "Payments",
                column: "PendingCouponId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_PendingCoupon",
                table: "Payments",
                sql: "([PendingCouponId] IS NULL AND [PendingCouponDiscount] IS NULL) OR ([PendingCouponId] IS NOT NULL AND [PendingCouponDiscount] > 0)");

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_Coupons_PendingCouponId",
                table: "Payments",
                column: "PendingCouponId",
                principalTable: "Coupons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payments_Coupons_PendingCouponId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_PendingCouponId",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_PendingCoupon",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "PendingCouponDiscount",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "PendingCouponId",
                table: "Payments");
        }
    }
}
