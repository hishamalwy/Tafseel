using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OpenRequestMarketplace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequestHistory_Next",
                table: "LearningRequestStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequestHistory_Previous",
                table: "LearningRequestStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequests_Status",
                table: "LearningRequests");

            migrationBuilder.AddColumn<Guid>(
                name: "LearningRequestId",
                table: "Payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "TeacherServiceId",
                table: "LearningRequests",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<string>(
                name: "TeacherId",
                table: "LearningRequests",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldMaxLength: 450);

            migrationBuilder.AddColumn<decimal>(
                name: "BudgetMax",
                table: "LearningRequests",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BudgetMin",
                table: "LearningRequests",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PaymentReservationExpiresAt",
                table: "LearningRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PublishedAt",
                table: "LearningRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SelectedOfferId",
                table: "LearningRequests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourcingMode",
                table: "LearningRequests",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "SubjectId",
                table: "LearningRequests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TeacherOffers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LearningRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    DeliveryHours = table.Column<int>(type: "int", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SelectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    WithdrawnAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherOffers", x => x.Id);
                    table.CheckConstraint("CK_TeacherOffers_Amount", "[Amount] > 0");
                    table.CheckConstraint("CK_TeacherOffers_Currency", "[Currency] = 'SAR'");
                    table.CheckConstraint("CK_TeacherOffers_DeliveryHours", "[DeliveryHours] BETWEEN 1 AND 8760");
                    table.CheckConstraint("CK_TeacherOffers_Status", "[Status] BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "FK_TeacherOffers_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherOffers_LearningRequests_LearningRequestId",
                        column: x => x.LearningRequestId,
                        principalTable: "LearningRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherOffers_TeacherServices_TeacherServiceId",
                        column: x => x.TeacherServiceId,
                        principalTable: "TeacherServices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Payments_LearningRequestId_CreatedAt",
                table: "Payments",
                columns: new[] { "LearningRequestId", "CreatedAt" },
                filter: "[LearningRequestId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL AND [LearningRequestId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NULL AND [LearningRequestId] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequestHistory_Next",
                table: "LearningRequestStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 8");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequestHistory_Previous",
                table: "LearningRequestStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 8");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_SelectedOfferId",
                table: "LearningRequests",
                column: "SelectedOfferId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_SourcingMode_Status_SubjectId_CreatedAt",
                table: "LearningRequests",
                columns: new[] { "SourcingMode", "Status", "SubjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_SubjectId",
                table: "LearningRequests",
                column: "SubjectId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequests_BudgetRange",
                table: "LearningRequests",
                sql: "([BudgetMin] IS NULL AND [BudgetMax] IS NULL) OR ([BudgetMin] >= 0 AND [BudgetMax] >= [BudgetMin])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequests_Status",
                table: "LearningRequests",
                sql: "[Status] BETWEEN 0 AND 8");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherOffers_LearningRequestId_TeacherId",
                table: "TeacherOffers",
                columns: new[] { "LearningRequestId", "TeacherId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherOffers_TeacherId_Status_UpdatedAt",
                table: "TeacherOffers",
                columns: new[] { "TeacherId", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherOffers_TeacherServiceId",
                table: "TeacherOffers",
                column: "TeacherServiceId");

            migrationBuilder.AddForeignKey(
                name: "FK_LearningRequests_Subjects_SubjectId",
                table: "LearningRequests",
                column: "SubjectId",
                principalTable: "Subjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_LearningRequests_TeacherOffers_SelectedOfferId",
                table: "LearningRequests",
                column: "SelectedOfferId",
                principalTable: "TeacherOffers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_LearningRequests_LearningRequestId",
                table: "Payments",
                column: "LearningRequestId",
                principalTable: "LearningRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_LearningRequests_Subjects_SubjectId",
                table: "LearningRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_LearningRequests_TeacherOffers_SelectedOfferId",
                table: "LearningRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_Payments_LearningRequests_LearningRequestId",
                table: "Payments");

            migrationBuilder.DropTable(
                name: "TeacherOffers");

            migrationBuilder.DropIndex(
                name: "IX_Payments_LearningRequestId_CreatedAt",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequestHistory_Next",
                table: "LearningRequestStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequestHistory_Previous",
                table: "LearningRequestStatusHistory");

            migrationBuilder.DropIndex(
                name: "IX_LearningRequests_SelectedOfferId",
                table: "LearningRequests");

            migrationBuilder.DropIndex(
                name: "IX_LearningRequests_SourcingMode_Status_SubjectId_CreatedAt",
                table: "LearningRequests");

            migrationBuilder.DropIndex(
                name: "IX_LearningRequests_SubjectId",
                table: "LearningRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequests_BudgetRange",
                table: "LearningRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequests_Status",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "LearningRequestId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "BudgetMax",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "BudgetMin",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "PaymentReservationExpiresAt",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "PublishedAt",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "SelectedOfferId",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "SourcingMode",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "SubjectId",
                table: "LearningRequests");

            migrationBuilder.AlterColumn<Guid>(
                name: "TeacherServiceId",
                table: "LearningRequests",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "TeacherId",
                table: "LearningRequests",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldMaxLength: 450,
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Target",
                table: "Payments",
                sql: "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequestHistory_Next",
                table: "LearningRequestStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 4");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequestHistory_Previous",
                table: "LearningRequestStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 4");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequests_Status",
                table: "LearningRequests",
                sql: "[Status] BETWEEN 0 AND 4");
        }
    }
}
