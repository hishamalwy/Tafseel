namespace Tafseel.Application.Authorization;

public static class Roles
{
    public const string Admin = nameof(Admin);
    public const string QualityReviewer = nameof(QualityReviewer);
    public const string Teacher = nameof(Teacher);
    public const string Student = nameof(Student);

    public static readonly string[] All = [Admin, QualityReviewer, Teacher, Student];
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
    public const string PaymentsManage = "Payments.Manage";
    public const string WithdrawalsRequest = "Withdrawals.Request";
    public const string WithdrawalsReview = "Withdrawals.Review";
    public const string ReportsView = "Reports.View";
    public const string MessagesUse = "Messages.Use";
    public const string UsersView = "Users.View";
    public const string UsersManage = "Users.Manage";
    public const string ReviewsCreate = "Reviews.Create";
    public const string ReviewsModerate = "Reviews.Moderate";
    public const string DisputesCreate = "Disputes.Create";
    public const string DisputesResolve = "Disputes.Resolve";

    public static readonly string[] All =
    [
        UsersView, UsersManage, TeachersApply, TeachersReviewApplications,
        TeachersManageOwnProfile, TeachersManageOwnServices, StudentsCreateRequests,
        RequestsViewOwn, RequestsAccept, RequestsDecline, RequestsDeliver,
        RequestsRequestRevision, RequestsComplete, SessionsBook, SessionsManageOwn, MessagesUse,
        PaymentsViewOwn, PaymentsManage, WithdrawalsRequest, WithdrawalsReview,
        SubjectsManage, TopicsManage, ReviewsCreate, ReviewsModerate,
        DisputesCreate, DisputesResolve, ReportsView, "PlatformSettings.Manage"
    ];

    public static IReadOnlyCollection<string> ForRole(string role) => role switch
    {
        Roles.Admin => All,
        Roles.QualityReviewer => [TeachersReviewApplications, ReportsView],
        Roles.Teacher =>
        [
            TeachersApply, TeachersManageOwnProfile, TeachersManageOwnServices,
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
