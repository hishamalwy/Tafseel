using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PayoutTransferLoop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Withdrawals_Status",
                table: "WithdrawalRequests");

            migrationBuilder.AddColumn<byte[]>(
                name: "DestinationCiphertext",
                table: "WithdrawalRequests",
                type: "varbinary(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationKeyId",
                table: "WithdrawalRequests",
                type: "varchar(32)",
                unicode: false,
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DestinationVerifiedAt",
                table: "WithdrawalRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationVerifiedBy",
                table: "WithdrawalRequests",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitiationIdempotencyKey",
                table: "WithdrawalRequests",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitiationReference",
                table: "WithdrawalRequests",
                type: "varchar(64)",
                unicode: false,
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PayoutProvider",
                table: "WithdrawalRequests",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TransferInitiatedAt",
                table: "WithdrawalRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TransferInitiatedBy",
                table: "WithdrawalRequests",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TransferredAt",
                table: "WithdrawalRequests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "DestinationCiphertext",
                table: "TeacherPayoutProfiles",
                type: "varbinary(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationKeyId",
                table: "TeacherPayoutProfiles",
                type: "varchar(32)",
                unicode: false,
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PayoutTransferEvidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WithdrawalId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "varchar(30)", unicode: false, maxLength: 30, nullable: false),
                    RecordedBy = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SourceInstitution = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    BankReference = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    TransferredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    Attestation = table.Column<string>(type: "varchar(50)", unicode: false, maxLength: 50, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayoutTransferEvidence", x => x.Id);
                    table.CheckConstraint("CK_PayoutTransferEvidence_Amount", "[Amount] > 0");
                    table.CheckConstraint("CK_PayoutTransferEvidence_Kind", "[Kind] = 'ManualAttestation'");
                    table.ForeignKey(
                        name: "FK_PayoutTransferEvidence_AspNetUsers_RecordedBy",
                        column: x => x.RecordedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PayoutTransferEvidence_WithdrawalRequests_WithdrawalId",
                        column: x => x.WithdrawalId,
                        principalTable: "WithdrawalRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WithdrawalRequests_InitiationReference",
                table: "WithdrawalRequests",
                column: "InitiationReference",
                unique: true,
                filter: "[InitiationReference] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Withdrawals_Destination",
                table: "WithdrawalRequests",
                sql: "([DestinationKeyId] IS NULL AND [DestinationCiphertext] IS NULL) OR ([DestinationKeyId] IS NOT NULL AND [DestinationCiphertext] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Withdrawals_Initiated",
                table: "WithdrawalRequests",
                sql: "[Status] <> 3 OR ([DestinationCiphertext] IS NOT NULL AND [TransferInitiatedAt] IS NOT NULL AND [TransferInitiatedBy] IS NOT NULL AND [InitiationReference] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Withdrawals_Status",
                table: "WithdrawalRequests",
                sql: "[Status] BETWEEN 0 AND 3");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Withdrawals_TransferEvidence",
                table: "WithdrawalRequests",
                sql: "[Status] <> 1 OR [TransferInitiatedAt] IS NULL OR ([ProviderReference] IS NOT NULL AND [TransferredAt] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PayoutProfiles_Destination",
                table: "TeacherPayoutProfiles",
                sql: "([DestinationKeyId] IS NULL AND [DestinationCiphertext] IS NULL) OR ([DestinationKeyId] IS NOT NULL AND [DestinationCiphertext] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_PayoutTransferEvidence_BankReference",
                table: "PayoutTransferEvidence",
                column: "BankReference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayoutTransferEvidence_RecordedBy",
                table: "PayoutTransferEvidence",
                column: "RecordedBy");

            migrationBuilder.CreateIndex(
                name: "IX_PayoutTransferEvidence_WithdrawalId",
                table: "PayoutTransferEvidence",
                column: "WithdrawalId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PayoutTransferEvidence");

            migrationBuilder.DropIndex(
                name: "IX_WithdrawalRequests_InitiationReference",
                table: "WithdrawalRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Withdrawals_Destination",
                table: "WithdrawalRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Withdrawals_Initiated",
                table: "WithdrawalRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Withdrawals_Status",
                table: "WithdrawalRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Withdrawals_TransferEvidence",
                table: "WithdrawalRequests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PayoutProfiles_Destination",
                table: "TeacherPayoutProfiles");

            migrationBuilder.DropColumn(
                name: "DestinationCiphertext",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "DestinationKeyId",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "DestinationVerifiedAt",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "DestinationVerifiedBy",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "InitiationIdempotencyKey",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "InitiationReference",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "PayoutProvider",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "TransferInitiatedAt",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "TransferInitiatedBy",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "TransferredAt",
                table: "WithdrawalRequests");

            migrationBuilder.DropColumn(
                name: "DestinationCiphertext",
                table: "TeacherPayoutProfiles");

            migrationBuilder.DropColumn(
                name: "DestinationKeyId",
                table: "TeacherPayoutProfiles");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Withdrawals_Status",
                table: "WithdrawalRequests",
                sql: "[Status] BETWEEN 0 AND 2");
        }
    }
}
