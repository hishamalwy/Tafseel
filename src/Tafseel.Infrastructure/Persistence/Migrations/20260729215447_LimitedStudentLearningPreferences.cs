using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LimitedStudentLearningPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudentLearningPreferences",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ExplanationStyle = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    PreferredTeachingLanguageId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudentLearningPreferences", x => x.UserId);
                    table.CheckConstraint("CK_StudentLearningPreferences_ExplanationStyle", "[ExplanationStyle] IS NULL OR [ExplanationStyle] IN ('step_by_step','short_direct','detailed','visual','exam_focused','practice_focused')");
                    table.ForeignKey(
                        name: "FK_StudentLearningPreferences_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StudentLearningPreferences_TeachingLanguages_PreferredTeachingLanguageId",
                        column: x => x.PreferredTeachingLanguageId,
                        principalTable: "TeachingLanguages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudentLearningPreferences_PreferredTeachingLanguageId",
                table: "StudentLearningPreferences",
                column: "PreferredTeachingLanguageId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudentLearningPreferences");
        }
    }
}
