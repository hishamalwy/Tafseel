using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TeacherQualificationAssignmentSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssignmentInstructionsSnapshot",
                table: "TeacherDemoSubmissions",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssignmentResourceManifest",
                table: "TeacherDemoSubmissions",
                type: "nvarchar(max)",
                maxLength: 12000,
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "AssignmentTitleSnapshot",
                table: "TeacherDemoSubmissions",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                UPDATE d
                SET [AssignmentTitleSnapshot] = a.[Name],
                    [AssignmentInstructionsSnapshot] = a.[Instructions],
                    [AssignmentResourceManifest] = N'[]'
                FROM [TeacherDemoSubmissions] d
                JOIN [QualificationTopics] a ON a.[Id] = d.[QualificationAssignmentId];
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssignmentInstructionsSnapshot",
                table: "TeacherDemoSubmissions");

            migrationBuilder.DropColumn(
                name: "AssignmentResourceManifest",
                table: "TeacherDemoSubmissions");

            migrationBuilder.DropColumn(
                name: "AssignmentTitleSnapshot",
                table: "TeacherDemoSubmissions");
        }
    }
}
