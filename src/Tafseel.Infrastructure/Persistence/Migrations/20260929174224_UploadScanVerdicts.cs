using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UploadScanVerdicts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FileScanRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Engine = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Signature = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ScannedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FileScanRecords", x => x.Id);
                    table.CheckConstraint("CK_FileScanRecords_Status", "[Status] BETWEEN 0 AND 2");
                });

            migrationBuilder.CreateIndex(
                name: "IX_FileScanRecords_StorageKey",
                table: "FileScanRecords",
                column: "StorageKey",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FileScanRecords");
        }
    }
}
