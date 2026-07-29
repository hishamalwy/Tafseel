using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LimitedTeacherShowcaseMvp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_Duration",
                table: "TeacherTeachingSamples");

            migrationBuilder.AlterColumn<string>(
                name: "StorageKey",
                table: "TeacherTeachingSamples",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(500)",
                oldMaxLength: 500);

            migrationBuilder.AlterColumn<int>(
                name: "DurationSeconds",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedVersionId",
                table: "TeacherTeachingSamples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "TeacherTeachingSamples",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CurrentVersionId",
                table: "TeacherTeachingSamples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ModerationStatus",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "TeacherTeachingSamples",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<int>(
                name: "SourceType",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "TeacherTeachingSamples",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.CreateTable(
                name: "TeacherTeachingSampleVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherTeachingSampleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    TopicId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    OriginalFileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    FileSize = table.Column<long>(type: "bigint", nullable: true),
                    DurationSeconds = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    SubmittedByUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AssignedReviewerId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    ReviewStartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DecidedByUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    DecidedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DecisionReasonCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    TeacherVisibleNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    InternalNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherTeachingSampleVersions", x => x.Id);
                    table.CheckConstraint("CK_TeacherTeachingSampleVersions_Duration", "[DurationSeconds] IS NULL OR [DurationSeconds] BETWEEN 1 AND 3600");
                    table.CheckConstraint("CK_TeacherTeachingSampleVersions_Number", "[VersionNumber] > 0");
                    table.CheckConstraint("CK_TeacherTeachingSampleVersions_Size", "[FileSize] IS NULL OR [FileSize] > 0");
                    table.CheckConstraint("CK_TeacherTeachingSampleVersions_Status", "[Status] BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSampleVersions_AspNetUsers_AssignedReviewerId",
                        column: x => x.AssignedReviewerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSampleVersions_AspNetUsers_DecidedByUserId",
                        column: x => x.DecidedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSampleVersions_AspNetUsers_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSampleVersions_TeacherTeachingSamples_TeacherTeachingSampleId",
                        column: x => x.TeacherTeachingSampleId,
                        principalTable: "TeacherTeachingSamples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSampleVersions_Topics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "Topics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql(
                """
                UPDATE [TeacherTeachingSamples]
                SET [UpdatedAt] = [CreatedAt];

                UPDATE [TeacherTeachingSamples]
                SET [SourceType] = 1,
                    [ModerationStatus] = CASE WHEN [PublishedAt] IS NULL THEN 0 ELSE 1 END
                WHERE [SourceDemoSubmissionId] IS NULL;

                INSERT INTO [TeacherTeachingSampleVersions]
                    ([Id], [TeacherTeachingSampleId], [VersionNumber], [TopicId], [Title], [Description],
                     [StorageKey], [OriginalFileName], [ContentType], [FileSize], [DurationSeconds],
                     [Status], [SubmittedByUserId], [SubmittedAt], [CreatedAt])
                SELECT
                    [Id], [Id], 1, [TopicId], [Title], N'', [StorageKey], N'legacy-sample.mp4',
                    N'video/mp4', NULL, [DurationSeconds],
                    CASE WHEN [PublishedAt] IS NULL THEN 0 ELSE 1 END,
                    CASE WHEN [PublishedAt] IS NULL THEN NULL ELSE [TeacherId] END,
                    [PublishedAt], [CreatedAt]
                FROM [TeacherTeachingSamples]
                WHERE [SourceDemoSubmissionId] IS NULL;

                UPDATE [TeacherTeachingSamples]
                SET [CurrentVersionId] = [Id],
                    [PublishedAt] = NULL
                WHERE [SourceType] = 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_ApprovedVersionId",
                table: "TeacherTeachingSamples",
                column: "ApprovedVersionId",
                unique: true,
                filter: "[ApprovedVersionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_CurrentVersionId",
                table: "TeacherTeachingSamples",
                column: "CurrentVersionId",
                unique: true,
                filter: "[CurrentVersionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_TeacherId_SourceType_ModerationStatus_ArchivedAt",
                table: "TeacherTeachingSamples",
                columns: new[] { "TeacherId", "SourceType", "ModerationStatus", "ArchivedAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_Duration",
                table: "TeacherTeachingSamples",
                sql: "[DurationSeconds] IS NULL OR [DurationSeconds] BETWEEN 1 AND 3600");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_ShowcasePublication",
                table: "TeacherTeachingSamples",
                sql: "[SourceType] = 0 OR [PublishedAt] IS NULL OR ([ModerationStatus] = 4 AND [ApprovedVersionId] IS NOT NULL AND [ArchivedAt] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_Source",
                table: "TeacherTeachingSamples",
                sql: "([SourceType] = 0 AND [ModerationStatus] IS NULL) OR ([SourceType] = 1 AND [ModerationStatus] BETWEEN 0 AND 6)");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_AssignedReviewerId",
                table: "TeacherTeachingSampleVersions",
                column: "AssignedReviewerId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_DecidedByUserId",
                table: "TeacherTeachingSampleVersions",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_Status_SubmittedAt_Id",
                table: "TeacherTeachingSampleVersions",
                columns: new[] { "Status", "SubmittedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_SubmittedByUserId",
                table: "TeacherTeachingSampleVersions",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_TeacherTeachingSampleId_VersionNumber",
                table: "TeacherTeachingSampleVersions",
                columns: new[] { "TeacherTeachingSampleId", "VersionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSampleVersions_TopicId",
                table: "TeacherTeachingSampleVersions",
                column: "TopicId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM [TeacherTeachingSamples] WHERE [SourceType] = 1)
                    THROW 51000, 'Rollback requires an explicit Teacher Showcase data export because the previous schema cannot represent immutable versions or media-less drafts.', 1;
                """);

            migrationBuilder.DropTable(
                name: "TeacherTeachingSampleVersions");

            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_ApprovedVersionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_CurrentVersionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_TeacherId_SourceType_ModerationStatus_ArchivedAt",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_Duration",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_ShowcasePublication",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherTeachingSamples_Source",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "ApprovedVersionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "CurrentVersionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "ModerationStatus",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "SourceType",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "TeacherTeachingSamples");

            migrationBuilder.AlterColumn<string>(
                name: "StorageKey",
                table: "TeacherTeachingSamples",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(500)",
                oldMaxLength: 500,
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "DurationSeconds",
                table: "TeacherTeachingSamples",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherTeachingSamples_Duration",
                table: "TeacherTeachingSamples",
                sql: "[DurationSeconds] BETWEEN 1 AND 3600");
        }
    }
}
