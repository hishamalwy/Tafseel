using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MarketplaceServiceCatalogRelease1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CategoryCode",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                table: "ServiceCatalogItems",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "DefaultDeliveryHours",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DefaultPrice",
                table: "ServiceCatalogItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "DefaultRevisions",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "IconCode",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "MaximumDeliveryHours",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaximumRevisions",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MinimumDeliveryHours",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OrderType",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "QualificationPolicy",
                table: "ServiceCatalogItems",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "RecommendedDeliveryHours",
                table: "ServiceCatalogItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RecommendedPrice",
                table: "ServiceCatalogItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "CatalogCode",
                table: "Orders",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CategoryCode",
                table: "Orders",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrderType",
                table: "Orders",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ServiceCatalogItemId",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameArabic",
                table: "Orders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameEnglish",
                table: "Orders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CatalogCode",
                table: "LiveSessionBookings",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CategoryCode",
                table: "LiveSessionBookings",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrderType",
                table: "LiveSessionBookings",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ServiceCatalogItemId",
                table: "LiveSessionBookings",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameArabic",
                table: "LiveSessionBookings",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameEnglish",
                table: "LiveSessionBookings",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CatalogCode",
                table: "LearningRequests",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CategoryCode",
                table: "LearningRequests",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OrderType",
                table: "LearningRequests",
                type: "varchar(50)",
                unicode: false,
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ServiceCatalogItemId",
                table: "LearningRequests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameArabic",
                table: "LearningRequests",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameEnglish",
                table: "LearningRequests",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                IF EXISTS (
                    SELECT 1 FROM [ServiceCatalogItems]
                    WHERE ([Code] = 'live_session' AND [RequiresScheduling] <> 1)
                       OR ([Code] <> 'live_session' AND [RequiresScheduling] = 1))
                    THROW 51000, 'catalog_policy_backfill_contradictory_scheduling', 1;

                IF EXISTS (SELECT 1 FROM [ServiceCatalogItems] WHERE [Code] = 'live_session' AND NULLIF([AllowedDurationsCsv], '') IS NULL)
                    THROW 51000, 'catalog_policy_backfill_live_duration_missing', 1;

                UPDATE [ServiceCatalogItems]
                SET [CategoryCode] = CASE [Code]
                        WHEN 'recorded_explanation' THEN 'recorded_explanation'
                        WHEN 'assignment_guidance' THEN 'academic_support'
                        WHEN 'exam_revision' THEN 'revision_exam_preparation'
                        WHEN 'live_session' THEN 'live_learning'
                        ELSE 'academic_support' END,
                    [IconCode] = CASE [Code]
                        WHEN 'recorded_explanation' THEN 'video'
                        WHEN 'exam_revision' THEN 'exam'
                        WHEN 'live_session' THEN 'live'
                        ELSE 'academic_support' END,
                    [OrderType] = CASE WHEN [Code] = 'live_session' THEN 'live_session' ELSE 'async_request' END,
                    [QualificationPolicy] = 'subject_qualification_required',
                    [CurrencyCode] = 'SAR',
                    [MinPrice] = COALESCE(NULLIF([MinPrice], 0), CASE WHEN [Code] = 'live_session' THEN 30.00 ELSE 0.01 END),
                    [MaxPrice] = CASE
                        WHEN [MaxPrice] IS NULL OR [MaxPrice] < COALESCE(NULLIF([MinPrice], 0), CASE WHEN [Code] = 'live_session' THEN 30.00 ELSE 0.01 END)
                            THEN 1000000.00 ELSE [MaxPrice] END,
                    [DefaultDeliveryHours] = CASE WHEN [Code] = 'live_session' THEN NULL ELSE 48 END,
                    [MinimumDeliveryHours] = CASE WHEN [Code] = 'live_session' THEN NULL ELSE 1 END,
                    [RecommendedDeliveryHours] = CASE WHEN [Code] = 'live_session' THEN NULL ELSE 48 END,
                    [MaximumDeliveryHours] = CASE WHEN [Code] = 'live_session' THEN NULL ELSE 8760 END,
                    [DefaultRevisions] = CASE WHEN [Code] = 'live_session' THEN 0 ELSE 2 END,
                    [MaximumRevisions] = CASE WHEN [Code] = 'live_session' THEN 0 ELSE 20 END,
                    [AllowedDurationsCsv] = CASE WHEN [Code] = 'live_session' THEN [AllowedDurationsCsv] ELSE '' END;

                UPDATE [ServiceCatalogItems]
                SET [DefaultPrice] = CASE WHEN 120.00 < [MinPrice] THEN [MinPrice] WHEN 120.00 > [MaxPrice] THEN [MaxPrice] ELSE 120.00 END,
                    [RecommendedPrice] = CASE WHEN 120.00 < [MinPrice] THEN [MinPrice] WHEN 120.00 > [MaxPrice] THEN [MaxPrice] ELSE 120.00 END;

                IF EXISTS (SELECT 1 FROM [LearningRequests] r LEFT JOIN [TeacherServices] ts ON ts.[Id] = r.[TeacherServiceId] LEFT JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId] WHERE c.[Id] IS NULL)
                    THROW 51000, 'catalog_snapshot_backfill_broken_learning_request', 1;
                IF EXISTS (SELECT 1 FROM [Orders] o LEFT JOIN [TeacherServices] ts ON ts.[Id] = o.[TeacherServiceId] LEFT JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId] WHERE c.[Id] IS NULL)
                    THROW 51000, 'catalog_snapshot_backfill_broken_order', 1;
                IF EXISTS (SELECT 1 FROM [LiveSessionBookings] b LEFT JOIN [TeacherServices] ts ON ts.[Id] = b.[TeacherServiceId] LEFT JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId] WHERE c.[Id] IS NULL)
                    THROW 51000, 'catalog_snapshot_backfill_broken_booking', 1;

                UPDATE r SET r.[ServiceCatalogItemId] = c.[Id], r.[CatalogCode] = c.[Code], r.[CategoryCode] = c.[CategoryCode],
                    r.[OrderType] = c.[OrderType], r.[ServiceNameEnglish] = c.[Name], r.[ServiceNameArabic] = c.[NameAr]
                FROM [LearningRequests] r JOIN [TeacherServices] ts ON ts.[Id] = r.[TeacherServiceId]
                JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId];

                UPDATE o SET o.[ServiceCatalogItemId] = c.[Id], o.[CatalogCode] = c.[Code], o.[CategoryCode] = c.[CategoryCode],
                    o.[OrderType] = c.[OrderType], o.[ServiceNameEnglish] = c.[Name], o.[ServiceNameArabic] = c.[NameAr]
                FROM [Orders] o JOIN [TeacherServices] ts ON ts.[Id] = o.[TeacherServiceId]
                JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId];

                UPDATE b SET b.[ServiceCatalogItemId] = c.[Id], b.[CatalogCode] = c.[Code], b.[CategoryCode] = c.[CategoryCode],
                    b.[OrderType] = c.[OrderType], b.[ServiceNameEnglish] = c.[Name], b.[ServiceNameArabic] = c.[NameAr]
                FROM [LiveSessionBookings] b JOIN [TeacherServices] ts ON ts.[Id] = b.[TeacherServiceId]
                JOIN [ServiceCatalogItems] c ON c.[Id] = ts.[ServiceCatalogItemId];
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_DeliveryPolicy",
                table: "ServiceCatalogItems",
                sql: "([OrderType] = 'live_session' AND [RequiresScheduling] = 1 AND [AllowedDurationsCsv] <> '' AND [MinimumDeliveryHours] IS NULL AND [DefaultDeliveryHours] IS NULL AND [RecommendedDeliveryHours] IS NULL AND [MaximumDeliveryHours] IS NULL AND [DefaultRevisions] = 0 AND [MaximumRevisions] = 0) OR ([OrderType] = 'async_request' AND [RequiresScheduling] = 0 AND [AllowedDurationsCsv] = '' AND [MinimumDeliveryHours] BETWEEN 1 AND 8760 AND [MaximumDeliveryHours] BETWEEN 1 AND 8760 AND [MinimumDeliveryHours] <= [DefaultDeliveryHours] AND [DefaultDeliveryHours] <= [MaximumDeliveryHours] AND [MinimumDeliveryHours] <= [RecommendedDeliveryHours] AND [RecommendedDeliveryHours] <= [MaximumDeliveryHours] AND [DefaultRevisions] BETWEEN 0 AND 20 AND [MaximumRevisions] BETWEEN 0 AND 20 AND [DefaultRevisions] <= [MaximumRevisions])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_PolicyCodes",
                table: "ServiceCatalogItems",
                sql: "[CategoryCode] IN ('recorded_explanation','academic_support','live_learning','revision_exam_preparation','study_materials','project_guidance') AND [IconCode] IN ('video','academic_support','live','exam','notes','project') AND [OrderType] IN ('async_request','live_session') AND [QualificationPolicy] = 'subject_qualification_required' AND [CurrencyCode] = 'SAR'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ServiceCatalogItems_PricePolicy",
                table: "ServiceCatalogItems",
                sql: "[MinPrice] > 0 AND [MinPrice] <= [DefaultPrice] AND [DefaultPrice] <= [MaxPrice] AND [MinPrice] <= [RecommendedPrice] AND [RecommendedPrice] <= [MaxPrice]");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_ServiceCatalogItemId",
                table: "Orders",
                column: "ServiceCatalogItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LiveSessionBookings_ServiceCatalogItemId",
                table: "LiveSessionBookings",
                column: "ServiceCatalogItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningRequests_ServiceCatalogItemId",
                table: "LearningRequests",
                column: "ServiceCatalogItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_LearningRequests_ServiceCatalogItems_ServiceCatalogItemId",
                table: "LearningRequests",
                column: "ServiceCatalogItemId",
                principalTable: "ServiceCatalogItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_LiveSessionBookings_ServiceCatalogItems_ServiceCatalogItemId",
                table: "LiveSessionBookings",
                column: "ServiceCatalogItemId",
                principalTable: "ServiceCatalogItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_ServiceCatalogItems_ServiceCatalogItemId",
                table: "Orders",
                column: "ServiceCatalogItemId",
                principalTable: "ServiceCatalogItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_LearningRequests_ServiceCatalogItems_ServiceCatalogItemId",
                table: "LearningRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_LiveSessionBookings_ServiceCatalogItems_ServiceCatalogItemId",
                table: "LiveSessionBookings");

            migrationBuilder.DropForeignKey(
                name: "FK_Orders_ServiceCatalogItems_ServiceCatalogItemId",
                table: "Orders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_DeliveryPolicy",
                table: "ServiceCatalogItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_PolicyCodes",
                table: "ServiceCatalogItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ServiceCatalogItems_PricePolicy",
                table: "ServiceCatalogItems");

            migrationBuilder.DropIndex(
                name: "IX_Orders_ServiceCatalogItemId",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_LiveSessionBookings_ServiceCatalogItemId",
                table: "LiveSessionBookings");

            migrationBuilder.DropIndex(
                name: "IX_LearningRequests_ServiceCatalogItemId",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "CategoryCode",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "DefaultDeliveryHours",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "DefaultPrice",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "DefaultRevisions",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "IconCode",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "MaximumDeliveryHours",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "MaximumRevisions",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "MinimumDeliveryHours",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "OrderType",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "QualificationPolicy",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "RecommendedDeliveryHours",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "RecommendedPrice",
                table: "ServiceCatalogItems");

            migrationBuilder.DropColumn(
                name: "CatalogCode",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CategoryCode",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "OrderType",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServiceCatalogItemId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServiceNameArabic",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServiceNameEnglish",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CatalogCode",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "CategoryCode",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "OrderType",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "ServiceCatalogItemId",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "ServiceNameArabic",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "ServiceNameEnglish",
                table: "LiveSessionBookings");

            migrationBuilder.DropColumn(
                name: "CatalogCode",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "CategoryCode",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "OrderType",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "ServiceCatalogItemId",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "ServiceNameArabic",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "ServiceNameEnglish",
                table: "LearningRequests");
        }
    }
}
