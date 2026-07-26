using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Pass3DomainIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TeacherApplicationReview_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationReview");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherApplicationStatusHistory_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationStatusHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherEvaluationScore_TeacherApplicationReview_TeacherApplicationReviewId",
                table: "TeacherEvaluationScore");

            migrationBuilder.DropIndex(
                name: "IX_Topics_Name",
                table: "Topics");

            migrationBuilder.DropIndex(
                name: "IX_Topics_SubjectId_Name",
                table: "Topics");

            migrationBuilder.DropIndex(
                name: "IX_TeachingLanguages_Name",
                table: "TeachingLanguages");

            migrationBuilder.DropIndex(
                name: "IX_Subjects_Name",
                table: "Subjects");

            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_Name",
                table: "ServiceCatalogItems");

            migrationBuilder.DropIndex(
                name: "IX_QualificationTopics_Name",
                table: "QualificationTopics");

            migrationBuilder.DropIndex(
                name: "IX_QualificationTopics_SubjectId_Name",
                table: "QualificationTopics");

            migrationBuilder.DropIndex(
                name: "IX_EducationLevels_Name",
                table: "EducationLevels");

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "Topics",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "TeachingLanguages",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "Subjects",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "ServiceCatalogItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "QualificationTopics",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "EducationLevels",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.Sql(
                """
                DECLARE @table sysname;
                DECLARE catalog_cursor CURSOR LOCAL FAST_FORWARD FOR
                    SELECT [Name] FROM (VALUES
                        (N'Topics'),
                        (N'TeachingLanguages'),
                        (N'Subjects'),
                        (N'ServiceCatalogItems'),
                        (N'QualificationTopics'),
                        (N'EducationLevels')
                    ) AS CatalogTables([Name]);
                OPEN catalog_cursor;
                FETCH NEXT FROM catalog_cursor INTO @table;
                WHILE @@FETCH_STATUS = 0
                BEGIN
                    DECLARE @sql nvarchar(max) =
                        N'UPDATE ' + QUOTENAME(@table) + N'
                          SET [NormalizedName] = UPPER(
                            LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE([Name],
                              CHAR(9), N'' ''), CHAR(10), N'' ''), CHAR(13), N'' ''), NCHAR(160), N'' '')))
                            COLLATE Latin1_General_100_CI_AS);
                          WHILE EXISTS (SELECT 1 FROM ' + QUOTENAME(@table) + N' WHERE [NormalizedName] LIKE N''%  %'')
                            UPDATE ' + QUOTENAME(@table) + N'
                              SET [NormalizedName] = REPLACE([NormalizedName], N''  '', N'' '')
                              WHERE [NormalizedName] LIKE N''%  %'';';
                    EXEC sp_executesql @sql;
                    FETCH NEXT FROM catalog_cursor INTO @table;
                END
                CLOSE catalog_cursor;
                DEALLOCATE catalog_cursor;

                IF EXISTS (SELECT [NormalizedName] FROM [Subjects] GROUP BY [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized Subject names.', 1;
                IF EXISTS (SELECT [NormalizedName] FROM [EducationLevels] GROUP BY [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized EducationLevel names.', 1;
                IF EXISTS (SELECT [NormalizedName] FROM [TeachingLanguages] GROUP BY [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized TeachingLanguage names.', 1;
                IF EXISTS (SELECT [NormalizedName] FROM [ServiceCatalogItems] GROUP BY [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized Service names.', 1;
                IF EXISTS (SELECT [SubjectId], [NormalizedName] FROM [Topics] GROUP BY [SubjectId], [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized Topic names within a subject.', 1;
                IF EXISTS (SELECT [SubjectId], [NormalizedName] FROM [QualificationTopics] GROUP BY [SubjectId], [NormalizedName] HAVING COUNT(*) > 1)
                    THROW 51000, 'Pass 3 migration stopped: duplicate normalized QualificationTopic names within a subject.', 1;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "Topics",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "TeachingLanguages",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "Subjects",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "ServiceCatalogItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "QualificationTopics",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "NormalizedName",
                table: "EducationLevels",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Topics_SubjectId_NormalizedName",
                table: "Topics",
                columns: new[] { "SubjectId", "NormalizedName" },
                unique: true,
                filter: "[SubjectId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Topic_NormalizedName",
                table: "Topics",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_TeachingLanguages_NormalizedName",
                table: "TeachingLanguages",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeachingLanguage_NormalizedName",
                table: "TeachingLanguages",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherEvaluationScore_Criterion",
                table: "TeacherEvaluationScore",
                sql: "[Criterion] BETWEEN 0 AND 8");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherEvaluationScore_Score",
                table: "TeacherEvaluationScore",
                sql: "[Score] BETWEEN 1 AND 5");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_NextStatus",
                table: "TeacherApplicationStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 6");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_PreviousStatus",
                table: "TeacherApplicationStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 6");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_Transition",
                table: "TeacherApplicationStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplications_DemoDurationSeconds",
                table: "TeacherApplications",
                sql: "[DemoDurationSeconds] IS NULL OR [DemoDurationSeconds] BETWEEN 1 AND 600");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplications_ExperienceYears",
                table: "TeacherApplications",
                sql: "[ExperienceYears] BETWEEN 0 AND 80");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplications_Priority",
                table: "TeacherApplications",
                sql: "[Priority] BETWEEN 0 AND 2");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplications_Status",
                table: "TeacherApplications",
                sql: "[Status] BETWEEN 0 AND 6");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TeacherApplicationReview_Decision",
                table: "TeacherApplicationReview",
                sql: "[Decision] BETWEEN 0 AND 2");

            migrationBuilder.CreateIndex(
                name: "IX_Subjects_NormalizedName",
                table: "Subjects",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Subject_NormalizedName",
                table: "Subjects",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_NormalizedName",
                table: "ServiceCatalogItems",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItem_NormalizedName",
                table: "ServiceCatalogItems",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_QualificationTopics_SubjectId_NormalizedName",
                table: "QualificationTopics",
                columns: new[] { "SubjectId", "NormalizedName" },
                unique: true,
                filter: "[SubjectId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_QualificationTopic_NormalizedName",
                table: "QualificationTopics",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.AddCheckConstraint(
                name: "CK_QualificationTopics_MaxVideoSeconds",
                table: "QualificationTopics",
                sql: "[MaxVideoSeconds] BETWEEN 30 AND 600");

            migrationBuilder.CreateIndex(
                name: "IX_EducationLevels_NormalizedName",
                table: "EducationLevels",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_EducationLevel_NormalizedName",
                table: "EducationLevels",
                sql: "[NormalizedName] <> ''");

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherApplicationReview_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationReview",
                column: "TeacherApplicationId",
                principalTable: "TeacherApplications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherApplicationStatusHistory_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationStatusHistory",
                column: "TeacherApplicationId",
                principalTable: "TeacherApplications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherEvaluationScore_TeacherApplicationReview_TeacherApplicationReviewId",
                table: "TeacherEvaluationScore",
                column: "TeacherApplicationReviewId",
                principalTable: "TeacherApplicationReview",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TeacherApplicationReview_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationReview");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherApplicationStatusHistory_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationStatusHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_TeacherEvaluationScore_TeacherApplicationReview_TeacherApplicationReviewId",
                table: "TeacherEvaluationScore");

            migrationBuilder.DropIndex(
                name: "IX_Topics_SubjectId_NormalizedName",
                table: "Topics");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Topic_NormalizedName",
                table: "Topics");

            migrationBuilder.DropIndex(
                name: "IX_TeachingLanguages_NormalizedName",
                table: "TeachingLanguages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeachingLanguage_NormalizedName",
                table: "TeachingLanguages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherEvaluationScore_Criterion",
                table: "TeacherEvaluationScore");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherEvaluationScore_Score",
                table: "TeacherEvaluationScore");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_NextStatus",
                table: "TeacherApplicationStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_PreviousStatus",
                table: "TeacherApplicationStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplicationStatusHistory_Transition",
                table: "TeacherApplicationStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplications_DemoDurationSeconds",
                table: "TeacherApplications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplications_ExperienceYears",
                table: "TeacherApplications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplications_Priority",
                table: "TeacherApplications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplications_Status",
                table: "TeacherApplications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_TeacherApplicationReview_Decision",
                table: "TeacherApplicationReview");

            migrationBuilder.DropIndex(
                name: "IX_Subjects_NormalizedName",
                table: "Subjects");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Subject_NormalizedName",
                table: "Subjects");

            migrationBuilder.DropIndex(
                name: "IX_ServiceCatalogItems_NormalizedName",
                table: "ServiceCatalogItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItem_NormalizedName",
                table: "ServiceCatalogItems");

            migrationBuilder.DropIndex(
                name: "IX_QualificationTopics_SubjectId_NormalizedName",
                table: "QualificationTopics");

            migrationBuilder.DropCheckConstraint(
                name: "CK_QualificationTopic_NormalizedName",
                table: "QualificationTopics");

            migrationBuilder.DropCheckConstraint(
                name: "CK_QualificationTopics_MaxVideoSeconds",
                table: "QualificationTopics");

            migrationBuilder.DropIndex(
                name: "IX_EducationLevels_NormalizedName",
                table: "EducationLevels");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EducationLevel_NormalizedName",
                table: "EducationLevels");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "Topics");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "TeachingLanguages");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "Subjects");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "QualificationTopics");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "EducationLevels");

            migrationBuilder.CreateIndex(
                name: "IX_Topics_Name",
                table: "Topics",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Topics_SubjectId_Name",
                table: "Topics",
                columns: new[] { "SubjectId", "Name" },
                unique: true,
                filter: "[SubjectId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeachingLanguages_Name",
                table: "TeachingLanguages",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Subjects_Name",
                table: "Subjects",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceCatalogItems_Name",
                table: "ServiceCatalogItems",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QualificationTopics_Name",
                table: "QualificationTopics",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QualificationTopics_SubjectId_Name",
                table: "QualificationTopics",
                columns: new[] { "SubjectId", "Name" },
                unique: true,
                filter: "[SubjectId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EducationLevels_Name",
                table: "EducationLevels",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherApplicationReview_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationReview",
                column: "TeacherApplicationId",
                principalTable: "TeacherApplications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherApplicationStatusHistory_TeacherApplications_TeacherApplicationId",
                table: "TeacherApplicationStatusHistory",
                column: "TeacherApplicationId",
                principalTable: "TeacherApplications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TeacherEvaluationScore_TeacherApplicationReview_TeacherApplicationReviewId",
                table: "TeacherEvaluationScore",
                column: "TeacherApplicationReviewId",
                principalTable: "TeacherApplicationReview",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
