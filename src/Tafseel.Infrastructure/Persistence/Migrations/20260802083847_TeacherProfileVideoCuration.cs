using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TeacherProfileVideoCuration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsProfileFeatured",
                table: "TeacherTeachingSamples",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsProfileVisible",
                table: "TeacherTeachingSamples",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ProfileDisplayOrder",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Compatibility A: preserve currently public eligible visibility; derive order; feature first visible.
            migrationBuilder.Sql("""
                UPDATE s
                SET IsProfileVisible = 1
                FROM TeacherTeachingSamples AS s
                WHERE s.PublishedAt IS NOT NULL
                  AND s.ArchivedAt IS NULL
                  AND (
                        s.SourceType = 0
                     OR (s.SourceType = 1 AND s.ModerationStatus = 4 AND s.ApprovedVersionId IS NOT NULL)
                  );

                ;WITH Ordered AS (
                    SELECT
                        Id,
                        ROW_NUMBER() OVER (
                            PARTITION BY TeacherId
                            ORDER BY SourceType, DisplayOrder, CreatedAt, Id
                        ) - 1 AS Ord
                    FROM TeacherTeachingSamples
                    WHERE IsProfileVisible = 1
                )
                UPDATE s
                SET ProfileDisplayOrder = o.Ord
                FROM TeacherTeachingSamples AS s
                INNER JOIN Ordered AS o ON o.Id = s.Id;

                ;WITH FirstVisible AS (
                    SELECT
                        Id,
                        ROW_NUMBER() OVER (
                            PARTITION BY TeacherId
                            ORDER BY ProfileDisplayOrder, CreatedAt, Id
                        ) AS Rn
                    FROM TeacherTeachingSamples
                    WHERE IsProfileVisible = 1
                )
                UPDATE s
                SET IsProfileFeatured = 1
                FROM TeacherTeachingSamples AS s
                INNER JOIN FirstVisible AS f ON f.Id = s.Id
                WHERE f.Rn = 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_OneFeaturedPerTeacher",
                table: "TeacherTeachingSamples",
                column: "TeacherId",
                unique: true,
                filter: "[IsProfileFeatured] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_TeacherId_IsProfileVisible_ProfileDisplayOrder",
                table: "TeacherTeachingSamples",
                columns: new[] { "TeacherId", "IsProfileVisible", "ProfileDisplayOrder" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_FeaturedRequiresVisible",
                table: "TeacherTeachingSamples",
                sql: "[IsProfileFeatured] = 0 OR [IsProfileVisible] = 1");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_ProfileDisplayOrder",
                table: "TeacherTeachingSamples",
                sql: "[ProfileDisplayOrder] >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_OneFeaturedPerTeacher",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_TeacherId_IsProfileVisible_ProfileDisplayOrder",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_FeaturedRequiresVisible",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_ProfileDisplayOrder",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "IsProfileFeatured",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "IsProfileVisible",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "ProfileDisplayOrder",
                table: "TeacherTeachingSamples");
        }
    }
}
