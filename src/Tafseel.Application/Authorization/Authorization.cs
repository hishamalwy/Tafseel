namespace Tafseel.Application.Authorization;

public static class Roles
{
    public const string Admin = nameof(Admin);
    /// <summary>
    /// Money operations only: payments, refunds, payout details, transfers, reconciliation and the financial
    /// audit. No users, roles, catalog, quality, reviews, dispute decisions or messages.
    /// </summary>
    public const string Finance = nameof(Finance);
    public const string QualityReviewer = nameof(QualityReviewer);
    public const string Teacher = nameof(Teacher);
    public const string Student = nameof(Student);

    public static readonly string[] All = [Admin, Finance, QualityReviewer, Teacher, Student];
    public static readonly string[] PublicRegistration = [Student, Teacher];
}

public static class Permissions
{
    public const string ClaimType = "permission";
    public const string SubjectsManage = "Subjects.Manage";
    public const string TopicsManage = "Topics.Manage";
    public const string TeachersApply = "Teachers.Apply";
    public const string TeachersReviewApplications = "Teachers.ReviewApplications";
    public const string TeachersManageOwnProfile = "Teachers.ManageOwnProfile";
    public const string TeachersManageOwnServices = "Teachers.ManageOwnServices";
    public const string TeachersManageOwnShowcases = "Teachers.ManageOwnShowcases";
    public const string TeachersReviewShowcases = "Teachers.ReviewShowcases";
    public const string StudentsCreateRequests = "Students.CreateRequests";
    public const string RequestsViewOwn = "Requests.ViewOwn";
    public const string RequestsAccept = "Requests.Accept";
    public const string RequestsDecline = "Requests.Decline";
    public const string RequestsDeliver = "Requests.Deliver";
    public const string RequestsRequestRevision = "Requests.RequestRevision";
    public const string RequestsComplete = "Requests.Complete";
    public const string SessionsBook = "Sessions.Book";
    public const string SessionsManageOwn = "Sessions.ManageOwn";
    public const string PaymentsViewOwn = "Payments.ViewOwn";
    public const string WithdrawalsRequest = "Withdrawals.Request";
    public const string ReportsView = "Reports.View";
    // Money operations, one permission per duty so a Finance operator never needs Admin (least privilege).
    public const string FinancePaymentsView = "Finance.Payments.View";
    public const string FinanceRefundsExecute = "Finance.Refunds.Execute";
    public const string FinancePayoutProfilesReview = "Finance.PayoutProfiles.Review";
    public const string FinanceWithdrawalsExecute = "Finance.Withdrawals.Execute";
    public const string FinanceReconciliationView = "Finance.Reconciliation.View";
    /// <summary>Acknowledge and resolve reconciliation exception cases (notes only; no balance repair).</summary>
    public const string FinanceReconciliationResolve = "Finance.Reconciliation.Resolve";
    public const string FinanceAuditView = "Finance.Audit.View";
    public const string MarketplaceIntelligenceView = "MarketplaceIntelligence.View";
    public const string MessagesUse = "Messages.Use";
    public const string UsersView = "Users.View";
    public const string UsersManage = "Users.Manage";
    public const string ReviewsCreate = "Reviews.Create";
    public const string ReviewsModerate = "Reviews.Moderate";
    public const string DisputesCreate = "Disputes.Create";
    public const string DisputesResolve = "Disputes.Resolve";
    /// <summary>Own and resolve help and abuse reports. Admin only at launch; a Support role would take it later.</summary>
    public const string SupportCasesManage = "Support.Cases.Manage";

    public static readonly string[] All =
    [
        UsersView, UsersManage, TeachersApply, TeachersReviewApplications, TeachersReviewShowcases,
        TeachersManageOwnProfile, TeachersManageOwnServices, TeachersManageOwnShowcases, StudentsCreateRequests,
        RequestsViewOwn, RequestsAccept, RequestsDecline, RequestsDeliver,
        RequestsRequestRevision, RequestsComplete, SessionsBook, SessionsManageOwn, MessagesUse,
        PaymentsViewOwn, WithdrawalsRequest,
        SubjectsManage, TopicsManage, ReviewsCreate, ReviewsModerate,
        DisputesCreate, DisputesResolve, SupportCasesManage, ReportsView, MarketplaceIntelligenceView, PlatformSettingsManage,
        FinancePaymentsView, FinanceRefundsExecute, FinancePayoutProfilesReview, FinanceWithdrawalsExecute,
        FinanceReconciliationView, FinanceReconciliationResolve, FinanceAuditView
    ];

    public const string PlatformSettingsManage = "PlatformSettings.Manage";

    /// <summary>Exactly the money duties. Admin keeps them too, as the owner's emergency access.</summary>
    public static readonly string[] Finance =
    [
        FinancePaymentsView, FinanceRefundsExecute, FinancePayoutProfilesReview, FinanceWithdrawalsExecute,
        FinanceReconciliationView, FinanceReconciliationResolve, FinanceAuditView
    ];

    public static IReadOnlyCollection<string> ForRole(string role) => role switch
    {
        Roles.Admin => All,
        Roles.Finance => Finance,
        Roles.QualityReviewer => [TeachersReviewApplications, TeachersReviewShowcases],
        Roles.Teacher =>
        [
            TeachersApply, TeachersManageOwnProfile, TeachersManageOwnServices, TeachersManageOwnShowcases,
            RequestsViewOwn, RequestsAccept, RequestsDecline, RequestsDeliver,
            SessionsManageOwn, MessagesUse, PaymentsViewOwn, WithdrawalsRequest, DisputesCreate
        ],
        Roles.Student =>
        [
            StudentsCreateRequests, RequestsViewOwn, RequestsRequestRevision,
            RequestsComplete, SessionsBook, SessionsManageOwn, MessagesUse, PaymentsViewOwn,
            ReviewsCreate, DisputesCreate
        ],
        _ => []
    };
}
