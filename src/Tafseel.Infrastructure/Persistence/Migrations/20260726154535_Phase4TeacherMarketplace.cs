using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase4TeacherMarketplace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FavoriteTeachers",
                columns: table => new
                {
                    StudentId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FavoriteTeachers", x => new { x.StudentId, x.TeacherId });
                    table.ForeignKey(
                        name: "FK_FavoriteTeachers_AspNetUsers_StudentId",
                        column: x => x.StudentId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FavoriteTeachers_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherAvailabilityExceptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherAvailabilityExceptions", x => x.Id);
                    table.CheckConstraint("CK_TeacherAvailabilityExceptions_Range", "[EndsAt] > [StartsAt]");
                    table.ForeignKey(
                        name: "FK_TeacherAvailabilityExceptions_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherAvailabilityRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    DayOfWeek = table.Column<int>(type: "int", nullable: false),
                    Start = table.Column<TimeOnly>(type: "time", nullable: false),
                    End = table.Column<TimeOnly>(type: "time", nullable: false),
                    TimeZoneId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SlotMinutes = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherAvailabilityRules", x => x.Id);
                    table.CheckConstraint("CK_TeacherAvailabilityRules_Day", "[DayOfWeek] BETWEEN 0 AND 6");
                    table.CheckConstraint("CK_TeacherAvailabilityRules_Slot", "[SlotMinutes] IS NULL OR [SlotMinutes] BETWEEN 15 AND 240");
                    table.CheckConstraint("CK_TeacherAvailabilityRules_Time", "[End] > [Start]");
                    table.ForeignKey(
                        name: "FK_TeacherAvailabilityRules_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherCredential",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Organization = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    From = table.Column<DateOnly>(type: "date", nullable: true),
                    To = table.Column<DateOnly>(type: "date", nullable: true),
                    CredentialType = table.Column<string>(type: "nvarchar(21)", maxLength: 21, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherCredential", x => x.Id);
                    table.CheckConstraint("CK_TeacherCredential_DateRange", "[To] IS NULL OR [From] IS NULL OR [To] >= [From]");
                    table.ForeignKey(
                        name: "FK_TeacherCredential_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherEducationLevels",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    EducationLevelId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherEducationLevels", x => new { x.TeacherId, x.EducationLevelId });
                    table.ForeignKey(
                        name: "FK_TeacherEducationLevels_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherEducationLevels_EducationLevels_EducationLevelId",
                        column: x => x.EducationLevelId,
                        principalTable: "EducationLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherLanguages",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    LanguageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherLanguages", x => new { x.TeacherId, x.LanguageId });
                    table.ForeignKey(
                        name: "FK_TeacherLanguages_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherLanguages_TeachingLanguages_LanguageId",
                        column: x => x.LanguageId,
                        principalTable: "TeachingLanguages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherProfiles",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Headline = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Bio = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    Country = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    City = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    TimeZoneId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ResponseTimeMinutes = table.Column<int>(type: "int", nullable: false),
                    IsPublished = table.Column<bool>(type: "bit", nullable: false),
                    AverageRating = table.Column<decimal>(type: "decimal(3,2)", precision: 3, scale: 2, nullable: false),
                    RatingCount = table.Column<int>(type: "int", nullable: false),
                    CompletedOrders = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherProfiles", x => x.TeacherId);
                    table.CheckConstraint("CK_TeacherProfiles_Counts", "[RatingCount] >= 0 AND [CompletedOrders] >= 0");
                    table.CheckConstraint("CK_TeacherProfiles_Rating", "[AverageRating] BETWEEN 0 AND 5");
                    table.CheckConstraint("CK_TeacherProfiles_ResponseTime", "[ResponseTimeMinutes] BETWEEN 0 AND 43200");
                    table.ForeignKey(
                        name: "FK_TeacherProfiles_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherServices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ServiceCatalogItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Price = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    DeliveryHours = table.Column<int>(type: "int", nullable: false),
                    Revisions = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherServices", x => x.Id);
                    table.CheckConstraint("CK_TeacherServices_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                    table.CheckConstraint("CK_TeacherServices_DeliveryHours", "[DeliveryHours] BETWEEN 1 AND 8760");
                    table.CheckConstraint("CK_TeacherServices_Price", "[Price] > 0");
                    table.CheckConstraint("CK_TeacherServices_Revisions", "[Revisions] BETWEEN 0 AND 20");
                    table.ForeignKey(
                        name: "FK_TeacherServices_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherServices_ServiceCatalogItems_ServiceCatalogItemId",
                        column: x => x.ServiceCatalogItemId,
                        principalTable: "ServiceCatalogItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherServices_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherTeachingSamples",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TopicId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DurationSeconds = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherTeachingSamples", x => x.Id);
                    table.CheckConstraint("CK_TeacherTeachingSamples_Duration", "[DurationSeconds] BETWEEN 1 AND 3600");
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSamples_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSamples_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTeachingSamples_Topics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "Topics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeacherTopics",
                columns: table => new
                {
                    TeacherId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TopicId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherTopics", x => new { x.TeacherId, x.TopicId });
                    table.ForeignKey(
                        name: "FK_TeacherTopics_AspNetUsers_TeacherId",
                        column: x => x.TeacherId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TeacherTopics_Topics_TopicId",
                        column: x => x.TopicId,
                        principalTable: "Topics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FavoriteTeachers_TeacherId",
                table: "FavoriteTeachers",
                column: "TeacherId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherAvailabilityExceptions_TeacherId_StartsAt_EndsAt",
                table: "TeacherAvailabilityExceptions",
                columns: new[] { "TeacherId", "StartsAt", "EndsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherAvailabilityRules_TeacherId_DayOfWeek_Start_End",
                table: "TeacherAvailabilityRules",
                columns: new[] { "TeacherId", "DayOfWeek", "Start", "End" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherCredential_TeacherId",
                table: "TeacherCredential",
                column: "TeacherId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherEducationLevels_EducationLevelId",
                table: "TeacherEducationLevels",
                column: "EducationLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherLanguages_LanguageId",
                table: "TeacherLanguages",
                column: "LanguageId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherProfiles_IsPublished_AverageRating",
                table: "TeacherProfiles",
                columns: new[] { "IsPublished", "AverageRating" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherServices_ServiceCatalogItemId",
                table: "TeacherServices",
                column: "ServiceCatalogItemId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherServices_SubjectId_ServiceCatalogItemId_IsActive_Price",
                table: "TeacherServices",
                columns: new[] { "SubjectId", "ServiceCatalogItemId", "IsActive", "Price" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherServices_TeacherId_IsActive",
                table: "TeacherServices",
                columns: new[] { "TeacherId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_SubjectId",
                table: "TeacherTeachingSamples",
                column: "SubjectId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_TeacherId_PublishedAt",
                table: "TeacherTeachingSamples",
                columns: new[] { "TeacherId", "PublishedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTeachingSamples_TopicId",
                table: "TeacherTeachingSamples",
                column: "TopicId");

            migrationBuilder.CreateIndex(
                name: "IX_TeacherTopics_TopicId",
                table: "TeacherTopics",
                column: "TopicId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FavoriteTeachers");

            migrationBuilder.DropTable(
                name: "TeacherAvailabilityExceptions");

            migrationBuilder.DropTable(
                name: "TeacherAvailabilityRules");

            migrationBuilder.DropTable(
                name: "TeacherCredential");

            migrationBuilder.DropTable(
                name: "TeacherEducationLevels");

            migrationBuilder.DropTable(
                name: "TeacherLanguages");

            migrationBuilder.DropTable(
                name: "TeacherProfiles");

            migrationBuilder.DropTable(
                name: "TeacherServices");

            migrationBuilder.DropTable(
                name: "TeacherTeachingSamples");

            migrationBuilder.DropTable(
                name: "TeacherTopics");
        }
    }
}
