using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Messaging;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Identity;

namespace Tafseel.Infrastructure.Persistence;

public sealed class TafseelDbContext(DbContextOptions<TafseelDbContext> options)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<QualificationTopic> QualificationTopics => Set<QualificationTopic>();
    public DbSet<QualificationAssignmentResource> QualificationAssignmentResources => Set<QualificationAssignmentResource>();
    public DbSet<EducationLevel> EducationLevels => Set<EducationLevel>();
    public DbSet<TeachingLanguage> TeachingLanguages => Set<TeachingLanguage>();
    public DbSet<ServiceCatalogItem> ServiceCatalogItems => Set<ServiceCatalogItem>();
    public DbSet<TeacherApplication> TeacherApplications => Set<TeacherApplication>();
    public DbSet<TeacherSubjectQualification> TeacherSubjectQualifications => Set<TeacherSubjectQualification>();
    public DbSet<TeacherDemoSubmission> TeacherDemoSubmissions => Set<TeacherDemoSubmission>();
    public DbSet<TeacherProfile> TeacherProfiles => Set<TeacherProfile>();
    public DbSet<TeacherTopic> TeacherTopics => Set<TeacherTopic>();
    public DbSet<TeacherLanguage> TeacherLanguages => Set<TeacherLanguage>();
    public DbSet<TeacherEducationLevel> TeacherEducationLevels => Set<TeacherEducationLevel>();
    public DbSet<TeacherService> TeacherServices => Set<TeacherService>();
    public DbSet<TeacherTeachingSample> TeacherTeachingSamples => Set<TeacherTeachingSample>();
    public DbSet<TeacherAvailabilityRule> TeacherAvailabilityRules => Set<TeacherAvailabilityRule>();
    public DbSet<TeacherAvailabilityException> TeacherAvailabilityExceptions => Set<TeacherAvailabilityException>();
    public DbSet<TeacherCertification> TeacherCertifications => Set<TeacherCertification>();
    public DbSet<TeacherExperience> TeacherExperiences => Set<TeacherExperience>();
    public DbSet<FavoriteTeacher> FavoriteTeachers => Set<FavoriteTeacher>();
    public DbSet<LearningRequest> LearningRequests => Set<LearningRequest>();
    public DbSet<LearningRequestAttachment> LearningRequestAttachments => Set<LearningRequestAttachment>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderDelivery> OrderDeliveries => Set<OrderDelivery>();
    public DbSet<LiveSessionBooking> LiveSessionBookings => Set<LiveSessionBooking>();
    public DbSet<LiveSessionAttachment> LiveSessionAttachments => Set<LiveSessionAttachment>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();
    public DbSet<PaymentWebhookRecord> PaymentWebhookRecords => Set<PaymentWebhookRecord>();
    public DbSet<Coupon> Coupons => Set<Coupon>();
    public DbSet<CouponRedemption> CouponRedemptions => Set<CouponRedemption>();
    public DbSet<EscrowEntry> EscrowEntries => Set<EscrowEntry>();
    public DbSet<LedgerAccount> LedgerAccounts => Set<LedgerAccount>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<WithdrawalRequest> WithdrawalRequests => Set<WithdrawalRequest>();
    public DbSet<FinancialAuditRecord> FinancialAuditRecords => Set<FinancialAuditRecord>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<UserNotificationPreference> UserNotificationPreferences => Set<UserNotificationPreference>();
    public DbSet<NotificationOutbox> NotificationOutbox => Set<NotificationOutbox>();
    public DbSet<TeacherReview> TeacherReviews => Set<TeacherReview>();
    public DbSet<Dispute> Disputes => Set<Dispute>();
    public DbSet<DisputeEvidence> DisputeEvidence => Set<DisputeEvidence>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(user =>
        {
            user.Property(x => x.FullName).HasMaxLength(200);
            user.Property(x => x.FullNameEnglish).HasMaxLength(200);
            user.HasMany(x => x.RefreshTokens).WithOne(x => x.User).HasForeignKey(x => x.UserId);
        });

        builder.Entity<RefreshToken>(token =>
        {
            token.HasKey(x => x.Id);
            token.Property(x => x.TokenHash).HasMaxLength(64);
            token.Property(x => x.FamilyId).HasMaxLength(36);
            token.Property(x => x.ReplacedByTokenHash).HasMaxLength(64);
            token.HasIndex(x => x.TokenHash).IsUnique();
            token.HasIndex(x => new { x.UserId, x.FamilyId });
            token.Property<byte[]>("RowVersion").IsRowVersion();
        });

        builder.Entity<CatalogItem>().UseTpcMappingStrategy();
        ConfigureCatalog<Subject>(builder, true);
        ConfigureCatalog<Topic>(builder, false);
        ConfigureCatalog<QualificationTopic>(builder, false);
        ConfigureCatalog<EducationLevel>(builder, true);
        ConfigureCatalog<TeachingLanguage>(builder, true);
        ConfigureCatalog<ServiceCatalogItem>(builder, true);
        builder.Entity<Subject>().Property(x => x.Icon).HasMaxLength(100);
        builder.Entity<Topic>().Property(x => x.Difficulty).HasMaxLength(50);
        builder.Entity<Topic>().HasIndex(x => new { x.SubjectId, x.NormalizedName }).IsUnique();
        builder.Entity<Topic>().HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QualificationTopic>().Property(x => x.Instructions).HasMaxLength(2000);
        builder.Entity<QualificationTopic>().Property(x => x.TitleAr).HasMaxLength(200);
        builder.Entity<QualificationTopic>().Property(x => x.InstructionsAr).HasMaxLength(2000);
        builder.Entity<QualificationTopic>().Property(x => x.EvaluationGuidance).HasMaxLength(4000);
        builder.Entity<QualificationTopic>().Property(x => x.EvaluationGuidanceAr).HasMaxLength(4000);
        builder.Entity<QualificationTopic>().Property(x => x.RowVersion).IsRowVersion().IsRequired(false);
        builder.Entity<QualificationTopic>().HasIndex(x => new { x.SubjectId, x.NormalizedName }).IsUnique();
        builder.Entity<QualificationTopic>().HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QualificationTopic>().ToTable(table =>
        {
            table.HasCheckConstraint("CK_QualificationTopics_MaxVideoSeconds", "[MaxVideoSeconds] BETWEEN 30 AND 600");
            table.HasCheckConstraint("CK_QualificationTopics_Duration",
                "[MinVideoSeconds] BETWEEN 30 AND [ExpectedVideoSeconds] AND [ExpectedVideoSeconds] <= [MaxVideoSeconds]");
            table.HasCheckConstraint("CK_QualificationTopics_DisplayOrder", "[DisplayOrder] BETWEEN 0 AND 10000");
        });
        builder.Entity<QualificationAssignmentResource>(resource =>
        {
            resource.Property(x => x.Id).ValueGeneratedNever();
            resource.Property(x => x.DisplayName).HasMaxLength(200);
            resource.Property(x => x.DisplayNameAr).HasMaxLength(200);
            resource.Property(x => x.OriginalFileName).HasMaxLength(255);
            resource.Property(x => x.StorageKey).HasMaxLength(500);
            resource.Property(x => x.ContentType).HasMaxLength(150);
            resource.Property(x => x.Url).HasMaxLength(2000);
            resource.HasIndex(x => new { x.QualificationAssignmentId, x.DisplayOrder });
            resource.HasOne<QualificationTopic>().WithMany().HasForeignKey(x => x.QualificationAssignmentId)
                .OnDelete(DeleteBehavior.Restrict);
            resource.ToTable(table =>
            {
                table.HasCheckConstraint("CK_QualificationAssignmentResources_Type", "[ResourceType] BETWEEN 0 AND 1");
                table.HasCheckConstraint("CK_QualificationAssignmentResources_Size", "[SizeBytes] >= 0");
            });
        });
        builder.Entity<TeachingLanguage>().Property(x => x.Code).HasMaxLength(10);
        builder.Entity<TeachingLanguage>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<ServiceCatalogItem>().Property(x => x.Description).HasMaxLength(1000);
        builder.Entity<ServiceCatalogItem>().Property(x => x.Code).HasMaxLength(50).IsUnicode(false);
        builder.Entity<ServiceCatalogItem>().HasIndex(x => x.Code).IsUnique();
        builder.Entity<ServiceCatalogItem>().Property(x => x.Type).HasMaxLength(50).IsUnicode(false);
        builder.Entity<ServiceCatalogItem>().Property(x => x.AllowedDurationsCsv).HasMaxLength(100).IsUnicode(false);
        builder.Entity<ServiceCatalogItem>().Property(x => x.MinPrice).HasPrecision(18, 2);
        builder.Entity<ServiceCatalogItem>().Property(x => x.MaxPrice).HasPrecision(18, 2);
        builder.Entity<ServiceCatalogItem>().ToTable(table =>
        {
            table.HasCheckConstraint("CK_ServiceCatalogItems_DisplayOrder", "[DisplayOrder] BETWEEN 0 AND 10000");
            table.HasCheckConstraint("CK_ServiceCatalogItems_PriceBounds",
                "([MinPrice] IS NULL OR [MinPrice] > 0) AND ([MaxPrice] IS NULL OR [MaxPrice] > 0) AND ([MinPrice] IS NULL OR [MaxPrice] IS NULL OR [MinPrice] <= [MaxPrice])");
            table.HasCheckConstraint("CK_ServiceCatalogItems_Code", "[Code] <> ''");
        });

        builder.Entity<TeacherApplication>(application =>
        {
            application.Property(x => x.Id).ValueGeneratedNever();
            application.Property(x => x.TeacherId).HasMaxLength(450);
            application.Property(x => x.City).HasMaxLength(150);
            application.Property(x => x.Degree).HasMaxLength(300);
            application.Property(x => x.DemoStorageKey).HasMaxLength(500);
            application.Property(x => x.RowVersion).IsRowVersion().IsRequired(false);
            application.HasIndex(x => new { x.TeacherId, x.SubjectId })
                .IsUnique()
                .HasFilter("[Status] IN (0, 1, 2, 3)");
            application.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            application.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
            application.HasOne<QualificationTopic>().WithMany().HasForeignKey(x => x.QualificationTopicId).OnDelete(DeleteBehavior.Restrict);
            application.HasMany(x => x.History).WithOne().HasForeignKey(x => x.TeacherApplicationId).OnDelete(DeleteBehavior.Restrict);
            application.HasMany(x => x.Reviews).WithOne().HasForeignKey(x => x.TeacherApplicationId).OnDelete(DeleteBehavior.Restrict);
            application.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherApplications_ExperienceYears", "[ExperienceYears] BETWEEN 0 AND 80");
                table.HasCheckConstraint("CK_TeacherApplications_DemoDurationSeconds", "[DemoDurationSeconds] IS NULL OR [DemoDurationSeconds] BETWEEN 1 AND 600");
                table.HasCheckConstraint("CK_TeacherApplications_Status", "[Status] BETWEEN 0 AND 6");
                table.HasCheckConstraint("CK_TeacherApplications_Priority", "[Priority] BETWEEN 0 AND 2");
            });
        });

        builder.Entity<TeacherApplicationStatusHistory>(history =>
        {
            history.Property(x => x.Id).ValueGeneratedNever();
            history.Property(x => x.ActorId).HasMaxLength(450);
            history.Property(x => x.Note).HasMaxLength(2000);
            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherApplicationStatusHistory_PreviousStatus", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 6");
                table.HasCheckConstraint("CK_TeacherApplicationStatusHistory_NextStatus", "[NextStatus] BETWEEN 0 AND 6");
                table.HasCheckConstraint("CK_TeacherApplicationStatusHistory_Transition", "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");
            });
        });

        builder.Entity<TeacherApplicationReview>(review =>
        {
            review.Property(x => x.Id).ValueGeneratedNever();
            review.Property(x => x.ReviewerId).HasMaxLength(450);
            review.Property(x => x.Comment).HasMaxLength(2000);
            review.Property(x => x.InternalNotes).HasMaxLength(4000);
            review.Ignore(x => x.OverallScore);
            review.HasMany(x => x.Scores).WithOne().HasForeignKey(x => x.TeacherApplicationReviewId).OnDelete(DeleteBehavior.Restrict);
            review.ToTable(table =>
                table.HasCheckConstraint("CK_TeacherApplicationReview_Decision", "[Decision] BETWEEN 0 AND 2"));
        });
        builder.Entity<TeacherEvaluationScore>(score =>
        {
            score.Property(x => x.Id).ValueGeneratedNever();
            score.HasIndex(x => new { x.TeacherApplicationReviewId, x.Criterion }).IsUnique();
            score.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherEvaluationScore_Criterion", "[Criterion] BETWEEN 0 AND 8");
                table.HasCheckConstraint("CK_TeacherEvaluationScore_Score", "[Score] BETWEEN 1 AND 5");
            });
        });
        builder.Entity<TeacherSubjectQualification>(qualification =>
        {
            qualification.Property(x => x.Id).ValueGeneratedNever();
            qualification.Property(x => x.ApprovedByUserId).HasMaxLength(450);
            qualification.Property(x => x.RevokedByUserId).HasMaxLength(450);
            qualification.Property(x => x.RevocationReason).HasMaxLength(2000);
            qualification.Property(x => x.RowVersion).IsRowVersion().IsRequired(false);
            qualification.Ignore(x => x.IsActive);
            qualification.HasIndex(x => new { x.TeacherId, x.SubjectId }).IsUnique();
            qualification.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            qualification.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
            qualification.HasOne<TeacherApplication>().WithMany().HasForeignKey(x => x.ApplicationId)
                .IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            qualification.HasOne<QualificationTopic>().WithMany().HasForeignKey(x => x.QualificationAssignmentId)
                .IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            qualification.ToTable(table =>
                table.HasCheckConstraint("CK_TeacherSubjectQualifications_Status", "[Status] BETWEEN 0 AND 1"));
        });
        builder.Entity<TeacherDemoSubmission>(submission =>
        {
            submission.Property(x => x.Id).ValueGeneratedNever();
            submission.Property(x => x.TeacherId).HasMaxLength(450);
            submission.Property(x => x.StorageKey).HasMaxLength(500);
            submission.Property(x => x.OriginalFileName).HasMaxLength(255);
            submission.Property(x => x.ContentType).HasMaxLength(150);
            submission.Property(x => x.AssignmentTitleSnapshot).HasMaxLength(200);
            submission.Property(x => x.AssignmentInstructionsSnapshot).HasMaxLength(2000);
            submission.Property(x => x.AssignmentResourceManifest).HasMaxLength(12000);
            submission.HasIndex(x => new { x.TeacherApplicationId, x.SubmissionVersion }).IsUnique();
            submission.HasOne<TeacherApplication>().WithMany().HasForeignKey(x => x.TeacherApplicationId)
                .OnDelete(DeleteBehavior.Restrict);
            submission.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId)
                .OnDelete(DeleteBehavior.Restrict);
            submission.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
            submission.HasOne<QualificationTopic>().WithMany().HasForeignKey(x => x.QualificationAssignmentId)
                .OnDelete(DeleteBehavior.Restrict);
            submission.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherDemoSubmissions_Duration", "[DurationSeconds] BETWEEN 1 AND 600");
                table.HasCheckConstraint("CK_TeacherDemoSubmissions_Size", "[SizeBytes] > 0");
                table.HasCheckConstraint("CK_TeacherDemoSubmissions_Version", "[SubmissionVersion] > 0");
            });
        });

        builder.Entity<TeacherProfile>(profile =>
        {
            profile.HasKey(x => x.TeacherId);
            profile.Property(x => x.TeacherId).HasMaxLength(450);
            profile.Property(x => x.Headline).HasMaxLength(200);
            profile.Property(x => x.Bio).HasMaxLength(4000);
            profile.Property(x => x.Country).HasMaxLength(100);
            profile.Property(x => x.City).HasMaxLength(150);
            profile.Property(x => x.TimeZoneId).HasMaxLength(100);
            profile.Property(x => x.AverageRating).HasPrecision(3, 2);
            profile.HasIndex(x => new { x.IsPublished, x.AverageRating });
            profile.HasOne<ApplicationUser>().WithOne().HasForeignKey<TeacherProfile>(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            profile.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherProfiles_ResponseTime", "[ResponseTimeMinutes] BETWEEN 0 AND 43200");
                table.HasCheckConstraint("CK_TeacherProfiles_Rating", "[AverageRating] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_TeacherProfiles_Counts", "[RatingCount] >= 0 AND [CompletedOrders] >= 0");
            });
        });
        builder.Entity<TeacherTopic>(item =>
        {
            item.HasKey(x => new { x.TeacherId, x.TopicId });
            item.Property(x => x.TeacherId).HasMaxLength(450);
            item.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            item.HasOne<Topic>().WithMany().HasForeignKey(x => x.TopicId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<TeacherLanguage>(item =>
        {
            item.HasKey(x => new { x.TeacherId, x.LanguageId });
            item.Property(x => x.TeacherId).HasMaxLength(450);
            item.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            item.HasOne<TeachingLanguage>().WithMany().HasForeignKey(x => x.LanguageId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<TeacherEducationLevel>(item =>
        {
            item.HasKey(x => new { x.TeacherId, x.EducationLevelId });
            item.Property(x => x.TeacherId).HasMaxLength(450);
            item.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            item.HasOne<EducationLevel>().WithMany().HasForeignKey(x => x.EducationLevelId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<TeacherService>(service =>
        {
            service.Property(x => x.Id).ValueGeneratedNever();
            service.Property(x => x.TeacherId).HasMaxLength(450);
            service.Property(x => x.Title).HasMaxLength(200);
            service.Property(x => x.Description).HasMaxLength(2000);
            service.Property(x => x.Price).HasPrecision(18, 2);
            service.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            service.Property(x => x.RowVersion).IsRowVersion();
            service.HasIndex(x => new { x.TeacherId, x.IsActive });
            service.HasIndex(x => new { x.SubjectId, x.ServiceCatalogItemId, x.IsActive, x.Price });
            service.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            service.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
            service.HasOne<ServiceCatalogItem>().WithMany().HasForeignKey(x => x.ServiceCatalogItemId).OnDelete(DeleteBehavior.Restrict);
            service.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherServices_Price", "[Price] > 0");
                table.HasCheckConstraint("CK_TeacherServices_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                table.HasCheckConstraint("CK_TeacherServices_DeliveryHours", "[DeliveryHours] BETWEEN 1 AND 8760");
                table.HasCheckConstraint("CK_TeacherServices_Revisions", "[Revisions] BETWEEN 0 AND 20");
            });
        });
        builder.Entity<TeacherTeachingSample>(sample =>
        {
            sample.Property(x => x.Id).ValueGeneratedNever();
            sample.Property(x => x.TeacherId).HasMaxLength(450);
            sample.Property(x => x.Title).HasMaxLength(200);
            sample.Property(x => x.StorageKey).HasMaxLength(500);
            sample.Property(x => x.ApprovedByUserId).HasMaxLength(450);
            sample.Ignore(x => x.IsPublished);
            sample.HasIndex(x => new { x.TeacherId, x.PublishedAt });
            sample.HasIndex(x => x.SourceDemoSubmissionId).IsUnique().HasFilter("[SourceDemoSubmissionId] IS NOT NULL");
            sample.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            sample.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
            sample.HasOne<Topic>().WithMany().HasForeignKey(x => x.TopicId).OnDelete(DeleteBehavior.Restrict);
            sample.ToTable(table =>
                table.HasCheckConstraint("CK_TeacherTeachingSamples_Duration", "[DurationSeconds] BETWEEN 1 AND 3600"));
        });
        builder.Entity<TeacherAvailabilityRule>(rule =>
        {
            rule.Property(x => x.Id).ValueGeneratedNever();
            rule.Property(x => x.TeacherId).HasMaxLength(450);
            rule.Property(x => x.TimeZoneId).HasMaxLength(100);
            rule.HasIndex(x => new { x.TeacherId, x.DayOfWeek, x.Start, x.End }).IsUnique();
            rule.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            rule.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherAvailabilityRules_Day", "[DayOfWeek] BETWEEN 0 AND 6");
                table.HasCheckConstraint("CK_TeacherAvailabilityRules_Time", "[End] > [Start]");
                table.HasCheckConstraint("CK_TeacherAvailabilityRules_Slot", "[SlotMinutes] IS NULL OR [SlotMinutes] BETWEEN 15 AND 240");
            });
        });
        builder.Entity<TeacherAvailabilityException>(exception =>
        {
            exception.Property(x => x.Id).ValueGeneratedNever();
            exception.Property(x => x.TeacherId).HasMaxLength(450);
            exception.Property(x => x.Reason).HasMaxLength(500);
            exception.HasIndex(x => new { x.TeacherId, x.StartsAt, x.EndsAt });
            exception.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            exception.ToTable(table =>
                table.HasCheckConstraint("CK_TeacherAvailabilityExceptions_Range", "[EndsAt] > [StartsAt]"));
        });
        builder.Entity<TeacherCredential>().HasDiscriminator<string>("CredentialType")
            .HasValue<TeacherCertification>("Certification")
            .HasValue<TeacherExperience>("Experience");
        builder.Entity<TeacherCredential>(credential =>
        {
            credential.Property(x => x.Id).ValueGeneratedNever();
            credential.Property(x => x.TeacherId).HasMaxLength(450);
            credential.Property(x => x.Title).HasMaxLength(200);
            credential.Property(x => x.Organization).HasMaxLength(200);
            credential.HasIndex(x => x.TeacherId);
            credential.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            credential.ToTable(table =>
                table.HasCheckConstraint("CK_TeacherCredential_DateRange", "[To] IS NULL OR [From] IS NULL OR [To] >= [From]"));
        });
        builder.Entity<FavoriteTeacher>(favorite =>
        {
            favorite.HasKey(x => new { x.StudentId, x.TeacherId });
            favorite.Property(x => x.StudentId).HasMaxLength(450);
            favorite.Property(x => x.TeacherId).HasMaxLength(450);
            favorite.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            favorite.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<LearningRequest>(request =>
        {
            request.Property(x => x.Id).ValueGeneratedNever();
            request.Property(x => x.StudentId).HasMaxLength(450);
            request.Property(x => x.TeacherId).HasMaxLength(450);
            request.Property(x => x.Title).HasMaxLength(200);
            request.Property(x => x.Description).HasMaxLength(5000);
            request.Property(x => x.Budget).HasPrecision(18, 2);
            request.Property(x => x.AcceptanceIdempotencyKey).HasMaxLength(100);
            request.Property(x => x.RowVersion).IsRowVersion();
            request.HasIndex(x => new { x.StudentId, x.CreatedAt });
            request.HasIndex(x => new { x.TeacherId, x.Status, x.CreatedAt });
            request.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            request.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            request.HasOne<TeacherService>().WithMany().HasForeignKey(x => x.TeacherServiceId).OnDelete(DeleteBehavior.Restrict);
            request.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.LearningRequestId).OnDelete(DeleteBehavior.Restrict);
            request.HasMany(x => x.Clarifications).WithOne().HasForeignKey(x => x.LearningRequestId).OnDelete(DeleteBehavior.Restrict);
            request.HasMany(x => x.History).WithOne().HasForeignKey(x => x.LearningRequestId).OnDelete(DeleteBehavior.Restrict);
            request.ToTable(table =>
            {
                table.HasCheckConstraint("CK_LearningRequests_Status", "[Status] BETWEEN 0 AND 4");
                table.HasCheckConstraint("CK_LearningRequests_Budget", "[Budget] IS NULL OR [Budget] > 0");
            });
        });
        builder.Entity<LearningRequestAttachment>(attachment =>
        {
            attachment.Property(x => x.Id).ValueGeneratedNever();
            ConfigurePrivateFile(attachment);
        });
        builder.Entity<RequestClarification>(item =>
        {
            item.Property(x => x.Id).ValueGeneratedNever();
            item.Property(x => x.SenderId).HasMaxLength(450);
            item.Property(x => x.Message).HasMaxLength(2000);
            item.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<LearningRequestStatusHistory>(history =>
        {
            history.Property(x => x.Id).ValueGeneratedNever();
            history.Property(x => x.ActorId).HasMaxLength(450);
            history.Property(x => x.Note).HasMaxLength(2000);
            history.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_LearningRequestHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 4");
                table.HasCheckConstraint("CK_LearningRequestHistory_Next", "[NextStatus] BETWEEN 0 AND 4");
                table.HasCheckConstraint("CK_LearningRequestHistory_Transition", "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");
            });
        });
        builder.Entity<Order>(order =>
        {
            order.Property(x => x.Id).ValueGeneratedNever();
            order.Property(x => x.StudentId).HasMaxLength(450);
            order.Property(x => x.TeacherId).HasMaxLength(450);
            foreach (var property in new[]
                     {
                         nameof(Order.Price), nameof(Order.StudentFeeAmount), nameof(Order.TeacherCommissionAmount),
                         nameof(Order.StudentTotal), nameof(Order.TeacherNet)
                     })
                order.Property<decimal>(property).HasPrecision(18, 2);
            order.Property(x => x.StudentFeePercent).HasPrecision(9, 4);
            order.Property(x => x.TeacherCommissionPercent).HasPrecision(9, 4);
            order.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            order.Property(x => x.RowVersion).IsRowVersion();
            order.HasIndex(x => x.LearningRequestId).IsUnique();
            order.HasIndex(x => new { x.StudentId, x.CreatedAt });
            order.HasIndex(x => new { x.TeacherId, x.Status, x.CreatedAt });
            order.HasOne<LearningRequest>().WithOne().HasForeignKey<Order>(x => x.LearningRequestId).OnDelete(DeleteBehavior.Restrict);
            order.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            order.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            order.HasOne<TeacherService>().WithMany().HasForeignKey(x => x.TeacherServiceId).OnDelete(DeleteBehavior.Restrict);
            order.HasMany(x => x.History).WithOne().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            order.HasMany(x => x.Deliveries).WithOne().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            order.HasMany(x => x.Revisions).WithOne().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            order.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Orders_Price", "[Price] > 0");
                table.HasCheckConstraint("CK_Orders_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                table.HasCheckConstraint("CK_Orders_Fees", "[StudentFeePercent] BETWEEN 0 AND 100 AND [TeacherCommissionPercent] BETWEEN 0 AND 100");
                table.HasCheckConstraint("CK_Orders_Amounts", "[StudentFeeAmount] >= 0 AND [TeacherCommissionAmount] >= 0 AND [StudentTotal] >= [Price] AND [TeacherNet] >= 0");
                table.HasCheckConstraint("CK_Orders_FinancialSnapshot",
                    "[StudentFeeAmount] = ROUND([Price] * [StudentFeePercent] / 100, 2) AND " +
                    "[TeacherCommissionAmount] = ROUND([Price] * [TeacherCommissionPercent] / 100, 2) AND " +
                    "[StudentTotal] = [Price] + [StudentFeeAmount] AND [TeacherNet] = [Price] - [TeacherCommissionAmount]");
                table.HasCheckConstraint("CK_Orders_Revisions", "[RevisionAllowance] BETWEEN 0 AND 20 AND [RevisionsUsed] BETWEEN 0 AND [RevisionAllowance]");
                table.HasCheckConstraint("CK_Orders_Status", "[Status] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_Orders_PaymentStatus", "[PaymentStatus] BETWEEN 0 AND 3");
                table.HasCheckConstraint("CK_Orders_DeliveryState", "[DeliveryState] BETWEEN 0 AND 3");
            });
        });
        builder.Entity<OrderStatusHistory>(history =>
        {
            history.Property(x => x.Id).ValueGeneratedNever();
            history.Property(x => x.ActorId).HasMaxLength(450);
            history.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_OrderHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_OrderHistory_Next", "[NextStatus] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_OrderHistory_Transition", "[PreviousStatus] IS NULL OR [PreviousStatus] <> [NextStatus]");
            });
        });
        builder.Entity<OrderDelivery>(delivery =>
        {
            delivery.Property(x => x.Id).ValueGeneratedNever();
            ConfigurePrivateFile(delivery);
            delivery.Property(x => x.Message).HasMaxLength(2000);
        });
        builder.Entity<RevisionRequest>(revision =>
        {
            revision.Property(x => x.Id).ValueGeneratedNever();
            revision.Property(x => x.Reason).HasMaxLength(2000);
            revision.HasIndex(x => new { x.OrderId, x.Sequence }).IsUnique();
            revision.ToTable(table => table.HasCheckConstraint("CK_RevisionRequests_Sequence", "[Sequence] > 0"));
        });
        builder.Entity<LiveSessionBooking>(booking =>
        {
            booking.Property(x => x.Id).ValueGeneratedNever();
            booking.Property(x => x.StudentId).HasMaxLength(450);
            booking.Property(x => x.TeacherId).HasMaxLength(450);
            booking.Property(x => x.Title).HasMaxLength(200);
            booking.Property(x => x.Notes).HasMaxLength(2000);
            booking.Property(x => x.StudentTimeZoneId).HasMaxLength(100);
            booking.Property(x => x.TeacherTimeZoneId).HasMaxLength(100);
            booking.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            booking.Property(x => x.JoinKey).HasMaxLength(100);
            booking.Property(x => x.BasePrice).HasPrecision(18, 2);
            booking.Property(x => x.EmergencyPremiumPercent).HasPrecision(9, 4);
            booking.Property(x => x.EmergencyPremiumAmount).HasPrecision(18, 2);
            booking.Property(x => x.TotalPrice).HasPrecision(18, 2);
            booking.Property(x => x.RowVersion).IsRowVersion();
            booking.HasIndex(x => new { x.TeacherId, x.Status, x.StartsAt, x.EndsAt });
            booking.HasIndex(x => new { x.StudentId, x.StartsAt });
            booking.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            booking.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            booking.HasOne<TeacherService>().WithMany().HasForeignKey(x => x.TeacherServiceId).OnDelete(DeleteBehavior.Restrict);
            booking.HasMany(x => x.History).WithOne().HasForeignKey(x => x.LiveSessionBookingId).OnDelete(DeleteBehavior.Restrict);
            booking.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.LiveSessionBookingId).OnDelete(DeleteBehavior.Restrict);
            booking.ToTable(table =>
            {
                table.HasCheckConstraint("CK_LiveSessionBookings_Range", "[EndsAt] > [StartsAt]");
                table.HasCheckConstraint("CK_LiveSessionBookings_Status", "[Status] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_LiveSessionBookings_Price", "[BasePrice] > 0 AND [EmergencyPremiumPercent] BETWEEN 0 AND 1000 AND [EmergencyPremiumAmount] = ROUND([BasePrice] * [EmergencyPremiumPercent] / 100, 2) AND [TotalPrice] = [BasePrice] + [EmergencyPremiumAmount]");
                table.HasCheckConstraint("CK_LiveSessionBookings_Cancellation", "[CancellationWindowHours] BETWEEN 0 AND 720");
                table.HasCheckConstraint("CK_LiveSessionBookings_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
            });
        });
        builder.Entity<LiveSessionAttachment>(attachment =>
        {
            attachment.Property(x => x.Id).ValueGeneratedNever();
            attachment.Property(x => x.UploadedById).HasMaxLength(450);
            ConfigurePrivateFile(attachment);
            attachment.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<LiveSessionStatusHistory>(history =>
        {
            history.Property(x => x.Id).ValueGeneratedNever();
            history.Property(x => x.Action).HasMaxLength(50);
            history.Property(x => x.ActorId).HasMaxLength(450);
            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_LiveSessionHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 5");
                table.HasCheckConstraint("CK_LiveSessionHistory_Next", "[NextStatus] BETWEEN 0 AND 5");
            });
        });

        builder.Entity<Payment>(payment =>
        {
            payment.Property(x => x.Id).ValueGeneratedNever();
            payment.Property(x => x.StudentId).HasMaxLength(450);
            payment.Property(x => x.Amount).HasPrecision(18, 2);
            payment.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            payment.Property(x => x.Provider).HasMaxLength(50);
            payment.Property(x => x.ProviderReference).HasMaxLength(200);
            payment.Property(x => x.InitiationIdempotencyKey).HasMaxLength(100);
            payment.Property(x => x.RowVersion).IsRowVersion();
            payment.HasIndex(x => x.OrderId).IsUnique().HasFilter("[OrderId] IS NOT NULL");
            payment.HasIndex(x => x.LiveSessionBookingId).IsUnique().HasFilter("[LiveSessionBookingId] IS NOT NULL");
            payment.HasIndex(x => new { x.Provider, x.ProviderReference }).IsUnique();
            payment.HasIndex(x => new { x.StudentId, x.InitiationIdempotencyKey }).IsUnique();
            payment.HasOne<Order>().WithOne().HasForeignKey<Payment>(x => x.OrderId).IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
            payment.HasOne<LiveSessionBooking>().WithMany().HasForeignKey(x => x.LiveSessionBookingId)
                .IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            payment.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            payment.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Payments_Amount", "[Amount] > 0");
                table.HasCheckConstraint("CK_Payments_Status", "[Status] BETWEEN 0 AND 3");
                table.HasCheckConstraint("CK_Payments_Currency", "[Currency] LIKE '___' AND [Currency] NOT LIKE '____%'");
                table.HasCheckConstraint("CK_Payments_Target",
                    "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");
            });
        });
        builder.Entity<PaymentAttempt>(attempt =>
        {
            attempt.Property(x => x.Id).ValueGeneratedNever();
            attempt.Property(x => x.ProviderReference).HasMaxLength(200);
            attempt.Property(x => x.FailureCode).HasMaxLength(100);
            attempt.HasIndex(x => new { x.PaymentId, x.CreatedAt });
            attempt.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<PaymentWebhookRecord>(record =>
        {
            record.Property(x => x.Id).ValueGeneratedNever();
            record.Property(x => x.Provider).HasMaxLength(50);
            record.Property(x => x.EventId).HasMaxLength(200);
            record.Property(x => x.PayloadHash).HasMaxLength(64).IsUnicode(false);
            record.Property(x => x.ProviderReference).HasMaxLength(200);
            record.HasIndex(x => new { x.Provider, x.EventId }).IsUnique();
        });
        builder.Entity<Coupon>(coupon =>
        {
            coupon.Property(x => x.Id).ValueGeneratedNever();
            coupon.Property(x => x.Name).HasMaxLength(200);
            coupon.Property(x => x.Code).HasMaxLength(40).IsUnicode(false);
            coupon.Property(x => x.DiscountValue).HasPrecision(18, 2);
            coupon.Property(x => x.RowVersion).IsRowVersion();
            coupon.HasIndex(x => x.Code).IsUnique();
            coupon.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Coupons_DiscountType", "[DiscountType] BETWEEN 0 AND 1");
                table.HasCheckConstraint("CK_Coupons_DiscountValue", "[DiscountValue] > 0");
                table.HasCheckConstraint("CK_Coupons_Code", "[Code] <> ''");
            });
        });
        builder.Entity<CouponRedemption>(redemption =>
        {
            redemption.Property(x => x.Id).ValueGeneratedNever();
            redemption.Property(x => x.StudentId).HasMaxLength(450);
            redemption.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            redemption.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            redemption.HasIndex(x => x.PaymentId).IsUnique();
            redemption.HasIndex(x => new { x.CouponId, x.StudentId });
            redemption.HasOne<Coupon>().WithMany().HasForeignKey(x => x.CouponId).OnDelete(DeleteBehavior.Restrict);
            redemption.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            redemption.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            redemption.ToTable(table =>
            {
                table.HasCheckConstraint("CK_CouponRedemptions_DiscountAmount", "[DiscountAmount] > 0");
                table.HasCheckConstraint("CK_CouponRedemptions_Target",
                    "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");
            });
        });
        builder.Entity<EscrowEntry>(entry =>
        {
            entry.Property(x => x.Id).ValueGeneratedNever();
            entry.Property(x => x.Amount).HasPrecision(18, 2);
            entry.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            entry.Property(x => x.BusinessKey).HasMaxLength(200);
            entry.HasIndex(x => x.BusinessKey).IsUnique();
            entry.HasIndex(x => new { x.OrderId, x.Type }).HasFilter("[OrderId] IS NOT NULL");
            entry.HasIndex(x => new { x.LiveSessionBookingId, x.Type }).HasFilter("[LiveSessionBookingId] IS NOT NULL");
            entry.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            entry.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
            entry.HasOne<LiveSessionBooking>().WithMany().HasForeignKey(x => x.LiveSessionBookingId)
                .IsRequired(false).OnDelete(DeleteBehavior.Restrict);
            entry.ToTable(table =>
            {
                table.HasCheckConstraint("CK_EscrowEntries_Amount", "[Amount] > 0");
                table.HasCheckConstraint("CK_EscrowEntries_Type", "[Type] BETWEEN 0 AND 2");
                table.HasCheckConstraint("CK_EscrowEntries_Target",
                    "([OrderId] IS NOT NULL AND [LiveSessionBookingId] IS NULL) OR ([OrderId] IS NULL AND [LiveSessionBookingId] IS NOT NULL)");
            });
        });
        builder.Entity<LedgerAccount>(account =>
        {
            account.Property(x => x.Id).ValueGeneratedNever();
            account.Property(x => x.OwnerId).HasMaxLength(450);
            account.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            account.HasIndex(x => new { x.Kind, x.OwnerId, x.Currency }).IsUnique();
            account.ToTable(table => table.HasCheckConstraint("CK_LedgerAccounts_Kind", "[Kind] BETWEEN 0 AND 6"));
        });
        builder.Entity<LedgerEntry>(entry =>
        {
            entry.Property(x => x.Id).ValueGeneratedNever();
            entry.Property(x => x.BusinessKey).HasMaxLength(200);
            entry.Property(x => x.Amount).HasPrecision(18, 2);
            entry.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            entry.Property(x => x.ReferenceType).HasMaxLength(50);
            entry.Property(x => x.ReferenceId).HasMaxLength(200);
            entry.HasIndex(x => x.BusinessKey).IsUnique();
            entry.HasIndex(x => new { x.ReferenceType, x.ReferenceId });
            entry.HasOne<LedgerAccount>().WithMany().HasForeignKey(x => x.DebitAccountId).OnDelete(DeleteBehavior.Restrict);
            entry.HasOne<LedgerAccount>().WithMany().HasForeignKey(x => x.CreditAccountId).OnDelete(DeleteBehavior.Restrict);
            entry.ToTable(table =>
            {
                table.HasCheckConstraint("CK_LedgerEntries_Amount", "[Amount] > 0");
                table.HasCheckConstraint("CK_LedgerEntries_Accounts", "[DebitAccountId] <> [CreditAccountId]");
            });
        });
        builder.Entity<Refund>(refund =>
        {
            refund.Property(x => x.Id).ValueGeneratedNever();
            refund.Property(x => x.Amount).HasPrecision(18, 2);
            refund.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            refund.Property(x => x.IdempotencyKey).HasMaxLength(100);
            refund.Property(x => x.ActorId).HasMaxLength(450);
            refund.HasIndex(x => new { x.PaymentId, x.IdempotencyKey }).IsUnique();
            refund.HasIndex(x => x.PaymentId).IsUnique();
            refund.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            refund.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            refund.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
            refund.ToTable(table => table.HasCheckConstraint("CK_Refunds_Amount", "[Amount] > 0"));
        });
        builder.Entity<WithdrawalRequest>(withdrawal =>
        {
            withdrawal.Property(x => x.Id).ValueGeneratedNever();
            withdrawal.Property(x => x.TeacherId).HasMaxLength(450);
            withdrawal.Property(x => x.Amount).HasPrecision(18, 2);
            withdrawal.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            withdrawal.Property(x => x.IdempotencyKey).HasMaxLength(100);
            withdrawal.Property(x => x.ProviderReference).HasMaxLength(200);
            withdrawal.Property(x => x.RowVersion).IsRowVersion();
            withdrawal.HasIndex(x => new { x.TeacherId, x.IdempotencyKey }).IsUnique();
            withdrawal.HasIndex(x => new { x.Status, x.CreatedAt });
            withdrawal.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            withdrawal.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Withdrawals_Amount", "[Amount] > 0");
                table.HasCheckConstraint("CK_Withdrawals_Status", "[Status] BETWEEN 0 AND 2");
            });
        });
        builder.Entity<FinancialAuditRecord>(audit =>
        {
            audit.Property(x => x.Id).ValueGeneratedNever();
            audit.Property(x => x.Action).HasMaxLength(100);
            audit.Property(x => x.ActorId).HasMaxLength(450);
            audit.Property(x => x.EntityType).HasMaxLength(50);
            audit.Property(x => x.EntityId).HasMaxLength(200);
            audit.Property(x => x.CorrelationKey).HasMaxLength(200);
            audit.HasIndex(x => new { x.EntityType, x.EntityId, x.CreatedAt });
        });
        builder.Entity<Conversation>(conversation =>
        {
            conversation.Property(x => x.Id).ValueGeneratedNever();
            conversation.Property(x => x.RowVersion).IsRowVersion();
            conversation.HasIndex(x => new { x.Scope, x.ResourceId }).IsUnique()
                .HasFilter("[ResourceId] IS NOT NULL");
            conversation.HasMany(x => x.Participants).WithOne().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Restrict);
            conversation.HasMany(x => x.Messages).WithOne().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Restrict);
            conversation.ToTable(table => table.HasCheckConstraint("CK_Conversations_Scope", "[Scope] BETWEEN 0 AND 3"));
        });
        builder.Entity<ConversationParticipant>(participant =>
        {
            participant.HasKey(x => new { x.ConversationId, x.UserId });
            participant.Property(x => x.UserId).HasMaxLength(450);
            participant.HasIndex(x => new { x.UserId, x.ConversationId });
            participant.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Message>(message =>
        {
            message.Property(x => x.Id).ValueGeneratedNever();
            message.Property(x => x.SenderId).HasMaxLength(450);
            message.Property(x => x.Body).HasMaxLength(4000);
            message.HasIndex(x => new { x.ConversationId, x.CreatedAt, x.Id });
            message.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
            message.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<MessageAttachment>(attachment =>
        {
            attachment.Property(x => x.Id).ValueGeneratedNever();
            ConfigurePrivateFile(attachment);
        });
        builder.Entity<Notification>(notification =>
        {
            notification.Property(x => x.Id).ValueGeneratedNever();
            notification.Property(x => x.UserId).HasMaxLength(450);
            notification.Property(x => x.Type).HasMaxLength(100);
            notification.Property(x => x.Title).HasMaxLength(200);
            notification.Property(x => x.Body).HasMaxLength(1000);
            notification.Property(x => x.Link).HasMaxLength(500);
            notification.Property(x => x.DeduplicationKey).HasMaxLength(200);
            notification.HasIndex(x => new { x.UserId, x.DeduplicationKey }).IsUnique();
            notification.HasIndex(x => new { x.UserId, x.ReadAt, x.CreatedAt });
            notification.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<UserNotificationPreference>(preference =>
        {
            preference.HasKey(x => x.UserId);
            preference.Property(x => x.UserId).HasMaxLength(450);
            preference.HasOne<ApplicationUser>().WithOne().HasForeignKey<UserNotificationPreference>(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<NotificationOutbox>(outbox =>
        {
            outbox.Property(x => x.Id).ValueGeneratedNever();
            outbox.Property(x => x.DeduplicationKey).HasMaxLength(200);
            outbox.Property(x => x.LastError).HasMaxLength(500);
            outbox.Property(x => x.RowVersion).IsRowVersion();
            outbox.HasIndex(x => x.DeduplicationKey).IsUnique();
            outbox.HasIndex(x => new { x.Status, x.NextAttemptAt });
            outbox.HasOne<Notification>().WithOne().HasForeignKey<NotificationOutbox>(x => x.NotificationId).OnDelete(DeleteBehavior.Restrict);
            outbox.ToTable(table =>
            {
                table.HasCheckConstraint("CK_NotificationOutbox_Status", "[Status] BETWEEN 0 AND 3");
                table.HasCheckConstraint("CK_NotificationOutbox_Attempts", "[Attempts] BETWEEN 0 AND 5");
            });
        });
        builder.Entity<TeacherReview>(review =>
        {
            review.Property(x => x.Id).ValueGeneratedNever();
            review.Property(x => x.StudentId).HasMaxLength(450);
            review.Property(x => x.TeacherId).HasMaxLength(450);
            review.Property(x => x.OverallScore).HasPrecision(3, 2);
            review.Property(x => x.OriginalComment).HasMaxLength(2000);
            review.HasIndex(x => x.OrderId).IsUnique();
            review.HasIndex(x => new { x.TeacherId, x.IsVisible, x.CreatedAt });
            review.HasOne<Order>().WithOne().HasForeignKey<TeacherReview>(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            review.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            review.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            review.HasMany(x => x.Moderation).WithOne().HasForeignKey(x => x.TeacherReviewId).OnDelete(DeleteBehavior.Restrict);
            review.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TeacherReviews_Scores",
                    "[ExplanationClarity] BETWEEN 1 AND 5 AND [SubjectKnowledge] BETWEEN 1 AND 5 AND " +
                    "[Communication] BETWEEN 1 AND 5 AND [OnTimeDelivery] BETWEEN 1 AND 5 AND [ValueForMoney] BETWEEN 1 AND 5");
                table.HasCheckConstraint("CK_TeacherReviews_Overall",
                    "[OverallScore] = ROUND(([ExplanationClarity]+[SubjectKnowledge]+[Communication]+[OnTimeDelivery]+[ValueForMoney])/5.0,2)");
            });
        });
        builder.Entity<ReviewModerationRecord>(record =>
        {
            record.Property(x => x.Id).ValueGeneratedNever();
            record.Property(x => x.ActorId).HasMaxLength(450);
            record.Property(x => x.Reason).HasMaxLength(1000);
            record.HasIndex(x => new { x.TeacherReviewId, x.CreatedAt });
            record.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Dispute>(dispute =>
        {
            dispute.Property(x => x.Id).ValueGeneratedNever();
            dispute.Property(x => x.StudentId).HasMaxLength(450);
            dispute.Property(x => x.TeacherId).HasMaxLength(450);
            dispute.Property(x => x.OpenedById).HasMaxLength(450);
            dispute.Property(x => x.Reason).HasMaxLength(2000);
            dispute.Property(x => x.RowVersion).IsRowVersion();
            dispute.HasIndex(x => x.OrderId).IsUnique();
            dispute.HasIndex(x => new { x.Status, x.UpdatedAt });
            dispute.HasOne<Order>().WithOne().HasForeignKey<Dispute>(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.OpenedById).OnDelete(DeleteBehavior.Restrict);
            dispute.HasMany(x => x.Messages).WithOne().HasForeignKey(x => x.DisputeId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasMany(x => x.Evidence).WithOne().HasForeignKey(x => x.DisputeId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasMany(x => x.Decisions).WithOne().HasForeignKey(x => x.DisputeId).OnDelete(DeleteBehavior.Restrict);
            dispute.HasMany(x => x.History).WithOne().HasForeignKey(x => x.DisputeId).OnDelete(DeleteBehavior.Restrict);
            dispute.ToTable(table => table.HasCheckConstraint("CK_Disputes_Status", "[Status] BETWEEN 0 AND 2"));
        });
        builder.Entity<DisputeMessage>(message =>
        {
            message.Property(x => x.Id).ValueGeneratedNever();
            message.Property(x => x.SenderId).HasMaxLength(450);
            message.Property(x => x.Body).HasMaxLength(2000);
            message.HasIndex(x => new { x.DisputeId, x.CreatedAt });
            message.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<DisputeEvidence>(evidence =>
        {
            evidence.Property(x => x.Id).ValueGeneratedNever();
            evidence.Property(x => x.UploadedById).HasMaxLength(450);
            ConfigurePrivateFile(evidence);
            evidence.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<DisputeDecision>(decision =>
        {
            decision.Property(x => x.Id).ValueGeneratedNever();
            decision.Property(x => x.ActorId).HasMaxLength(450);
            decision.Property(x => x.Rationale).HasMaxLength(2000);
            decision.Property(x => x.IdempotencyKey).HasMaxLength(100);
            decision.HasIndex(x => x.DisputeId).IsUnique();
            decision.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
            decision.ToTable(table => table.HasCheckConstraint("CK_DisputeDecisions_Resolution", "[Resolution] BETWEEN 0 AND 2"));
        });
        builder.Entity<DisputeStatusHistory>(history =>
        {
            history.Property(x => x.Id).ValueGeneratedNever();
            history.Property(x => x.ActorId).HasMaxLength(450);
            history.HasIndex(x => new { x.DisputeId, x.CreatedAt });
            history.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_DisputeHistory_Previous", "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 2");
                table.HasCheckConstraint("CK_DisputeHistory_Next", "[NextStatus] BETWEEN 0 AND 2");
            });
        });
        builder.Entity<AuditLogEntry>(audit =>
        {
            audit.Property(x => x.Id).ValueGeneratedNever();
            audit.Property(x => x.ActorId).HasMaxLength(450);
            audit.Property(x => x.Action).HasMaxLength(100);
            audit.Property(x => x.EntityType).HasMaxLength(100);
            audit.Property(x => x.EntityId).HasMaxLength(200);
            audit.Property(x => x.Summary).HasMaxLength(2000);
            audit.Property(x => x.CorrelationId).HasMaxLength(200);
            audit.HasIndex(x => new { x.EntityType, x.EntityId, x.CreatedAt });
            audit.HasIndex(x => x.CreatedAt);
        });
    }

    private static void ConfigureCatalog<T>(ModelBuilder builder, bool globallyUnique) where T : CatalogItem =>
        builder.Entity<T>(item =>
        {
            item.Property(x => x.Id).ValueGeneratedNever();
            item.Property(x => x.Name).HasMaxLength(200);
            item.Property(x => x.NameAr).HasMaxLength(200);
            item.Property(x => x.NormalizedName).HasMaxLength(200);
            item.ToTable(table =>
                table.HasCheckConstraint($"CK_{typeof(T).Name}_NormalizedName", "[NormalizedName] <> ''"));
            if (globallyUnique)
                item.HasIndex(x => x.NormalizedName).IsUnique();
        });

    private static void ConfigurePrivateFile<T>(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<T> file)
        where T : class
    {
        file.Property<string>("StorageKey").HasMaxLength(500);
        file.Property<string>("OriginalName").HasMaxLength(255);
        file.Property<string>("ContentType").HasMaxLength(150);
        file.ToTable(table => table.HasCheckConstraint($"CK_{typeof(T).Name}_Size", "[Size] > 0"));
    }
}
