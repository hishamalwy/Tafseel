using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OfferScopeAndValidity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "IncludedRevisions",
                table: "TeacherOffers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ValidUntil",
                table: "TeacherOffers",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.CreateIndex(
                name: "IX_TeacherOffers_LearningRequestId_Status_ValidUntil",
                table: "TeacherOffers",
                columns: new[] { "LearningRequestId", "Status", "ValidUntil" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherOffers_Revisions",
                table: "TeacherOffers",
                sql: "[IncludedRevisions] BETWEEN 0 AND 20");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TeacherOffers_LearningRequestId_Status_ValidUntil",
                table: "TeacherOffers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherOffers_Revisions",
                table: "TeacherOffers");

            migrationBuilder.DropColumn(
                name: "IncludedRevisions",
                table: "TeacherOffers");

            migrationBuilder.DropColumn(
                name: "ValidUntil",
                table: "TeacherOffers");
        }
    }
}
