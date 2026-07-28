using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TeacherQualificationLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovedByUserId",
                table: "TeacherTeachingSamples",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QualificationAssignmentId",
                table: "TeacherTeachingSamples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceDemoSubmissionId",
                table: "TeacherTeachingSamples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceTeacherApplicationId",
                table: "TeacherTeachingSamples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApplicationId",
                table: "TeacherSubjectQualifications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovedByUserId",
                table: "TeacherSubjectQualifications",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "TeacherSubjectQualifications",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "QualificationAssignmentId",
                table: "TeacherSubjectQualifications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RevocationReason",
                table: "TeacherSubjectQualifications",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RevokedAt",
                table: "TeacherSubjectQualifications",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RevokedByUserId",
                table: "TeacherSubjectQualifications",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "TeacherSubjectQualifications",
                type: "rowversion",
                rowVersion: true,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "TeacherSubjectQualifications",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "TeacherSubjectQualifications",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "LatestDemoSubmissionId",
                table: "TeacherApplications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "QualificationTopics",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "EvaluationGuidance",
                table: "QualificationTopics",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EvaluationGuidanceAr",
                table: "QualificationTopics",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ExpectedVideoSeconds",
                table: "QualificationTopics",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "InstructionsAr",
                table: "QualificationTopics",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "MinVideoSeconds",
                table: "QualificationTopics",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "QualificationTopics",
                type: "rowversion",
                rowVersion: true,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TitleAr",
                table: "QualificationTopics",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "QualificationAssignmentResources",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QualificationAssignmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ResourceType = table.Column<int>(type: "int", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DisplayNameAr = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Url = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualificationAssignmentResources", x => x.Id);
                    table.CheckConstraint("CK_QualificationAssignmentResources_Size", "[SizeBytes] >= 0");
                    table.CheckConstraint("CK_QualificationAssignmentResources_Type", "[ResourceType] BETWEEN 0 AND 1");
                    table.ForeignKey(
                        name: "FK_QualificationAssignmentResources_QualificationTopics_QualificationAssignmentId",
                        column: x => x.QualificationAssignmentId,
                        principalTable: "QualificationTopics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherDemoSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherApplicationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QualificationAssignmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    SubmissionVersion = table.Column<int>(type: "int", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherDemoSubmissions", x => x.Id);
                    table.CheckConstraint("CK_TeacherDemoSubmissions_Duration", "[DurationSeconds] BETWEEN 1 AND 600");
                    table.CheckConstraint("CK_TeacherDemoSubmissions_Size", "[SizeBytes] > 0");
                    table.CheckConstraint("CK_TeacherDemoSubmissions_Version", "[SubmissionVersion] > 0");
                    table.ForeignKey(
                        name: "FK_TeacherDemoSubmissions_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherDemoSubmissions_QualificationTopics_QualificationAssignmentId",
                        column: x => x.QualificationAssignmentId,
                        principalTable: "QualificationTopics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherDemoSubmissions_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherDemoSubmissions_TeacherApplications_TeacherApplicationId",
                        column: x => x.TeacherApplicationId,
                        principalTable: "TeacherApplications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql(
                """
                UPDATE [QualificationTopics]
                SET [MinVideoSeconds] = 30,
                    [ExpectedVideoSeconds] = CASE WHEN [MaxVideoSeconds] < 30 THEN 30 ELSE [MaxVideoSeconds] END;

                UPDATE q
                SET [CreatedAt] = q.[ApprovedAt],
                    [UpdatedAt] = q.[ApprovedAt],
                    [Status] = 0,
                    [ApplicationId] = approved.[Id],
                    [QualificationAssignmentId] = approved.[QualificationTopicId],
                    [ApprovedByUserId] = approved.[AssignedReviewerId]
                FROM [TeacherSubjectQualifications] q
                OUTER APPLY (
                    SELECT TOP (1) a.[Id], a.[QualificationTopicId], a.[AssignedReviewerId]
                    FROM [TeacherApplications] a
                    WHERE a.[TeacherId] = q.[TeacherId]
                      AND a.[SubjectId] = q.[SubjectId]
                      AND a.[Status] = 4
                    ORDER BY a.[SubmittedAt] DESC, a.[CreatedAt] DESC
                ) approved;

                INSERT INTO [TeacherDemoSubmissions]
                    ([Id], [TeacherApplicationId], [TeacherId], [SubjectId], [QualificationAssignmentId],
                     [StorageKey], [OriginalFileName], [ContentType], [SizeBytes], [DurationSeconds],
                     [SubmissionVersion], [SubmittedAt])
                SELECT NEWID(), a.[Id], a.[TeacherId], a.[SubjectId], a.[QualificationTopicId],
                       a.[DemoStorageKey], N'legacy-qualification-demo.mp4', N'video/mp4', 1,
                       CASE WHEN a.[DemoDurationSeconds] BETWEEN 1 AND 600 THEN a.[DemoDurationSeconds] ELSE 1 END,
                       1, COALESCE(a.[SubmittedAt], a.[CreatedAt])
                FROM [TeacherApplications] a
                WHERE a.[DemoStorageKey] IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM [TeacherDemoSubmissions] d WHERE d.[TeacherApplicationId] = a.[Id]
                  );

                UPDATE a
                SET [LatestDemoSubmissionId] = d.[Id]
                FROM [TeacherApplications] a
                JOIN [TeacherDemoSubmissions] d ON d.[TeacherApplicationId] = a.[Id]
                WHERE d.[SubmissionVersion] = 1;

                INSERT INTO [TeacherSubjectQualifications]
                    ([Id], [TeacherId], [SubjectId], [ApprovedAt], [ApplicationId],
                     [QualificationAssignmentId], [ApprovedByUserId], [CreatedAt], [UpdatedAt], [Status])
                SELECT NEWID(), a.[TeacherId], a.[SubjectId], COALESCE(a.[SubmittedAt], a.[CreatedAt]), a.[Id],
                       a.[QualificationTopicId], a.[AssignedReviewerId],
                       COALESCE(a.[SubmittedAt], a.[CreatedAt]), COALESCE(a.[SubmittedAt], a.[CreatedAt]), 0
                FROM [TeacherApplications] a
                WHERE a.[Status] = 4
                  AND NOT EXISTS (
                      SELECT 1 FROM [TeacherSubjectQualifications] q
                      WHERE q.[TeacherId] = a.[TeacherId] AND q.[SubjectId] = a.[SubjectId]
                  );

                INSERT INTO [TeacherTeachingSamples]
                    ([Id], [TeacherId], [SubjectId], [TopicId], [Title], [StorageKey],
                     [DurationSeconds], [CreatedAt], [PublishedAt], [ApprovedByUserId],
                     [QualificationAssignmentId], [SourceDemoSubmissionId], [SourceTeacherApplicationId])
                SELECT NEWID(), a.[TeacherId], a.[SubjectId], NULL,
                       LEFT(N'Qualification demo — ' + qt.[Name], 200), d.[StorageKey],
                       d.[DurationSeconds], COALESCE(a.[SubmittedAt], a.[CreatedAt]),
                       COALESCE(a.[SubmittedAt], a.[CreatedAt]), a.[AssignedReviewerId],
                       a.[QualificationTopicId], d.[Id], a.[Id]
                FROM [TeacherApplications] a
                JOIN [TeacherDemoSubmissions] d ON d.[Id] = a.[LatestDemoSubmissionId]
                JOIN [QualificationTopics] qt ON qt.[Id] = a.[QualificationTopicId]
                WHERE a.[Status] = 4
                  AND NOT EXISTS (
                      SELECT 1 FROM [TeacherTeachingSamples] s WHERE s.[SourceTeacherApplicationId] = a.[Id]
                  );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_SourceDemoSubmissionId",
                table: "TeacherTeachingSamples",
                column: "SourceDemoSubmissionId",
                unique: true,
                filter: "[SourceDemoSubmissionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherSubjectQualifications_ApplicationId",
                table: "TeacherSubjectQualifications",
                column: "ApplicationId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherSubjectQualifications_QualificationAssignmentId",
                table: "TeacherSubjectQualifications",
                column: "QualificationAssignmentId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherSubjectQualifications_Status",
                table: "TeacherSubjectQualifications",
                sql: "[Status] BETWEEN 0 AND 1");

            migrationBuilder.AddCheckConstraint(
                name: "CK_QualificationTopics_DisplayOrder",
                table: "QualificationTopics",
                sql: "[DisplayOrder] BETWEEN 0 AND 10000");

            migrationBuilder.AddCheckConstraint(
                name: "CK_QualificationTopics_Duration",
                table: "QualificationTopics",
                sql: "[MinVideoSeconds] BETWEEN 30 AND [ExpectedVideoSeconds] AND [ExpectedVideoSeconds] <= [MaxVideoSeconds]");

            migrationBuilder.CreateIndex(
                name: "IX_QualificationAssignmentResources_QualificationAssignmentId_DisplayOrder",
                table: "QualificationAssignmentResources",
                columns: new[] { "QualificationAssignmentId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherDemoSubmissions_QualificationAssignmentId",
                table: "TeacherDemoSubmissions",
                column: "QualificationAssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherDemoSubmissions_SubjectId",
                table: "TeacherDemoSubmissions",
                column: "SubjectId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherDemoSubmissions_TeacherApplicationId_SubmissionVersion",
                table: "TeacherDemoSubmissions",
                columns: new[] { "TeacherApplicationId", "SubmissionVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherDemoSubmissions_TeacherId",
                table: "TeacherDemoSubmissions",
                column: "TeacherId");

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherSubjectQualifications_QualificationTopics_QualificationAssignmentId",
                table: "TeacherSubjectQualifications",
                column: "QualificationAssignmentId",
                principalTable: "QualificationTopics",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherSubjectQualifications_TeacherApplications_ApplicationId",
                table: "TeacherSubjectQualifications",
                column: "ApplicationId",
                principalTable: "TeacherApplications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TeacherSubjectQualifications_QualificationTopics_QualificationAssignmentId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherSubjectQualifications_TeacherApplications_ApplicationId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropTable(
                name: "QualificationAssignmentResources");

            migrationBuilder.DropTable(
                name: "TeacherDemoSubmissions");

            migrationBuilder.DropIndex(
                name: "IX_TeacherTeachingSamples_SourceDemoSubmissionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropIndex(
                name: "IX_TeacherSubjectQualifications_ApplicationId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropIndex(
                name: "IX_TeacherSubjectQualifications_QualificationAssignmentId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherSubjectQualifications_Status",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_QualificationTopics_DisplayOrder",
                table: "QualificationTopics");

            migrationBuilder.DropCheckConstraint(
                name: "CK_QualificationTopics_Duration",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "QualificationAssignmentId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "SourceDemoSubmissionId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "SourceTeacherApplicationId",
                table: "TeacherTeachingSamples");

            migrationBuilder.DropColumn(
                name: "ApplicationId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "QualificationAssignmentId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "RevocationReason",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "RevokedAt",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "RevokedByUserId",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "TeacherSubjectQualifications");

            migrationBuilder.DropColumn(
                name: "LatestDemoSubmissionId",
                table: "TeacherApplications");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "EvaluationGuidance",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "EvaluationGuidanceAr",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "ExpectedVideoSeconds",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "InstructionsAr",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "MinVideoSeconds",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "TitleAr",
                table: "QualificationTopics");
        }
    }
}
