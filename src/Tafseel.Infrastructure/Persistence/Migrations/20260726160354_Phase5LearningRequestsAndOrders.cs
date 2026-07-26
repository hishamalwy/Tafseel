using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase5LearningRequestsAndOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LearningRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StudentId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", maxLength: 5000, nullable: false),
                    PreferredDeliveryAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Budget = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    AcceptanceIdempotencyKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningRequests", x => x.Id);
                    table.CheckConstraint("CK_LearningRequests_Budget", "[Budget] IS NULL OR [Budget] > 0");
                    table.CheckConstraint("CK_LearningRequests_Status", "[Status] BETWEEN 0 AND 4");
                    table.ForeignKey(
                        name: "FK_LearningRequests_AspNetUsers_StudentId",
                        column: x => x.StudentId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearningRequests_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearningRequests_TeacherServices_TeacherServiceId",
                        column: x => x.TeacherServiceId,
                        principalTable: "TeacherServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningRequestAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LearningRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningRequestAttachments", x => x.Id);
                    table.CheckConstraint("CK_LearningRequestAttachment_Size", "[Size] > 0");
                    table.ForeignKey(
                        name: "FK_LearningRequestAttachments_LearningRequests_LearningRequestId",
                        column: x => x.LearningRequestId,
                        principalTable: "LearningRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningRequestStatusHistory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LearningRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousStatus = table.Column<int>(type: "int", nullable: true),
                    NextStatus = table.Column<int>(type: "int", nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningRequestStatusHistory", x => x.Id);
                    table.CheckConstraint("CK_LearningRequestHistory_Next", "[NextStatus] BETWEEN 0 AND 4");
                    table.CheckConstraint("CK_LearningRequestHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 4");
                    table.CheckConstraint("CK_LearningRequestHistory_Transition", "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");
                    table.ForeignKey(
                        name: "FK_LearningRequestStatusHistory_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearningRequestStatusHistory_LearningRequests_LearningRequestId",
                        column: x => x.LearningRequestId,
                        principalTable: "LearningRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LearningRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StudentId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Price = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    StudentFeePercent = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: false),
                    TeacherCommissionPercent = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: false),
                    StudentFeeAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TeacherCommissionAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    StudentTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TeacherNet = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AgreedDeliveryAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RevisionAllowance = table.Column<int>(type: "int", nullable: false),
                    RevisionsUsed = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    PaymentStatus = table.Column<int>(type: "int", nullable: false),
                    DeliveryState = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Orders", x => x.Id);
                    table.CheckConstraint("CK_Orders_Amounts", "[StudentFeeAmount] >= 0 AND [TeacherCommissionAmount] >= 0 AND [StudentTotal] >= [Price] AND [TeacherNet] >= 0");
                    table.CheckConstraint("CK_Orders_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                    table.CheckConstraint("CK_Orders_DeliveryState", "[DeliveryState] BETWEEN 0 AND 3");
                    table.CheckConstraint("CK_Orders_Fees", "[StudentFeePercent] BETWEEN 0 AND 100 AND [TeacherCommissionPercent] BETWEEN 0 AND 100");
                    table.CheckConstraint("CK_Orders_FinancialSnapshot", "[StudentFeeAmount] = ROUND([Price] * [StudentFeePercent] / 100, 2) AND [TeacherCommissionAmount] = ROUND([Price] * [TeacherCommissionPercent] / 100, 2) AND [StudentTotal] = [Price] + [StudentFeeAmount] AND [TeacherNet] = [Price] - [TeacherCommissionAmount]");
                    table.CheckConstraint("CK_Orders_PaymentStatus", "[PaymentStatus] BETWEEN 0 AND 3");
                    table.CheckConstraint("CK_Orders_Price", "[Price] > 0");
                    table.CheckConstraint("CK_Orders_Revisions", "[RevisionAllowance] BETWEEN 0 AND 20 AND [RevisionsUsed] BETWEEN 0 AND [RevisionAllowance]");
                    table.CheckConstraint("CK_Orders_Status", "[Status] BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "FK_Orders_AspNetUsers_StudentId",
                        column: x => x.StudentId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Orders_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Orders_LearningRequests_LearningRequestId",
                        column: x => x.LearningRequestId,
                        principalTable: "LearningRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Orders_TeacherServices_TeacherServiceId",
                        column: x => x.TeacherServiceId,
                        principalTable: "TeacherServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RequestClarification",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LearningRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SenderId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequestClarification", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequestClarification_AspNetUsers_SenderId",
                        column: x => x.SenderId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RequestClarification_LearningRequests_LearningRequestId",
                        column: x => x.LearningRequestId,
                        principalTable: "LearningRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrderDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderDeliveries", x => x.Id);
                    table.CheckConstraint("CK_OrderDelivery_Size", "[Size] > 0");
                    table.ForeignKey(
                        name: "FK_OrderDeliveries_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrderStatusHistory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousStatus = table.Column<int>(type: "int", nullable: true),
                    NextStatus = table.Column<int>(type: "int", nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderStatusHistory", x => x.Id);
                    table.CheckConstraint("CK_OrderHistory_Next", "[NextStatus] BETWEEN 0 AND 5");
                    table.CheckConstraint("CK_OrderHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 5");
                    table.CheckConstraint("CK_OrderHistory_Transition", "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");
                    table.ForeignKey(
                        name: "FK_OrderStatusHistory_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderStatusHistory_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RevisionRequest",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RevisionRequest", x => x.Id);
                    table.CheckConstraint("CK_RevisionRequests_Sequence", "[Sequence] > 0");
                    table.ForeignKey(
                        name: "FK_RevisionRequest_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequestAttachments_LearningRequestId",
                table: "LearningRequestAttachments",
                column: "LearningRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_StudentId_CreatedAt",
                table: "LearningRequests",
                columns: new[] { "StudentId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_TeacherId_Status_CreatedAt",
                table: "LearningRequests",
                columns: new[] { "TeacherId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_TeacherServiceId",
                table: "LearningRequests",
                column: "TeacherServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequestStatusHistory_ActorId",
                table: "LearningRequestStatusHistory",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequestStatusHistory_LearningRequestId",
                table: "LearningRequestStatusHistory",
                column: "LearningRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderDeliveries_OrderId",
                table: "OrderDeliveries",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_LearningRequestId",
                table: "Orders",
                column: "LearningRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_StudentId_CreatedAt",
                table: "Orders",
                columns: new[] { "StudentId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_TeacherId_Status_CreatedAt",
                table: "Orders",
                columns: new[] { "TeacherId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_TeacherServiceId",
                table: "Orders",
                column: "TeacherServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderStatusHistory_ActorId",
                table: "OrderStatusHistory",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderStatusHistory_OrderId",
                table: "OrderStatusHistory",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestClarification_LearningRequestId",
                table: "RequestClarification",
                column: "LearningRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestClarification_SenderId",
                table: "RequestClarification",
                column: "SenderId");

            migrationBuilder.CreateIndex(
                name: "IX_RevisionRequest_OrderId_Sequence",
                table: "RevisionRequest",
                columns: new[] { "OrderId", "Sequence" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LearningRequestAttachments");

            migrationBuilder.DropTable(
                name: "LearningRequestStatusHistory");

            migrationBuilder.DropTable(
                name: "OrderDeliveries");

            migrationBuilder.DropTable(
                name: "OrderStatusHistory");

            migrationBuilder.DropTable(
                name: "RequestClarification");

            migrationBuilder.DropTable(
                name: "RevisionRequest");

            migrationBuilder.DropTable(
                name: "Orders");

            migrationBuilder.DropTable(
                name: "LearningRequests");
        }
    }
}
