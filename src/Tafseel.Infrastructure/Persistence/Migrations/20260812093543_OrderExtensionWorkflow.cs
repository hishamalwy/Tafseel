using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OrderExtensionWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderExtensionRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedById = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    RespondedById = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ProposedDeliveryAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Response = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderExtensionRequests", x => x.Id);
                    table.CheckConstraint("CK_OrderExtensionRequests_Status", "[Status] BETWEEN 0 AND 2");
                    table.ForeignKey(
                        name: "FK_OrderExtensionRequests_AspNetUsers_RequestedById",
                        column: x => x.RequestedById,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderExtensionRequests_AspNetUsers_RespondedById",
                        column: x => x.RespondedById,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderExtensionRequests_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderExtensionRequests_OrderId_Status_CreatedAt",
                table: "OrderExtensionRequests",
                columns: new[] { "OrderId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OrderExtensionRequests_RequestedById",
                table: "OrderExtensionRequests",
                column: "RequestedById");

            migrationBuilder.CreateIndex(
                name: "IX_OrderExtensionRequests_RespondedById",
                table: "OrderExtensionRequests",
                column: "RespondedById");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderExtensionRequests");
        }
    }
}
