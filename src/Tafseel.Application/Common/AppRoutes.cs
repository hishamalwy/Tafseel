namespace Tafseel.Application.Common;

/// <summary>
/// The client paths the server links to, in one place.
///
/// Notifications, emails and payment returns all hand the reader a URL into the
/// web client. This is that list, named for what the destination does rather than
/// for the screen that serves it.
///
/// Every value is a route of the Angular client (<c>frontend-angular/src/app/app.routes.ts</c>)
/// and none carries a locale: the host negotiates <c>/ar/</c> or <c>/en/</c> for a link
/// without one, and the client keeps a reader who is already inside the app in the
/// language they chose. <c>AppRoutesTests</c> fails when a value stops matching a route.
///
/// Links that name one thing (<see cref="Order"/>, <see cref="LiveSession"/> …) do not
/// know who will open them; the client sends each reader to the screen for their role.
/// </summary>
public static class AppRoutes
{
    public const string Home = "/";
    public const string About = "/about";
    public const string SignIn = "/auth";
    public const string ConfirmEmail = "/auth/confirm-email";
    public const string Terms = "/policies/terms";

    public const string BrowseTeachers = "/teachers";
    public static string TeacherProfile(Guid teacherId) => $"/teachers/{teacherId}";
    public static string TeacherProfile(string teacherId) => $"/teachers/{Uri.EscapeDataString(teacherId)}";

    public const string OpenRequests = "/requests";
    public const string NewRequest = "/requests/new";
    public static string Request(Guid requestId) => $"/requests/{requestId}";
    public static string RequestOffers(Guid requestId) => $"/requests/{requestId}/offers";
    public const string BookSession = "/sessions/book";
    public const string Disputes = "/disputes";
    public static string Dispute(Guid disputeId) => $"/disputes/{disputeId}";

    public static string Order(Guid orderId) => $"/orders/{orderId}";
    public static string LiveSession(Guid sessionId) => $"/live-sessions/{sessionId}";
    public const string Messages = "/messages";
    public static string Conversation(Guid conversationId) => $"/conversations/{conversationId}";

    public const string Checkout = "/checkout";
    public static string CheckoutOrder(Guid orderId) => $"/checkout?orderId={orderId}";
    public static string CheckoutLiveSession(Guid sessionId) => $"/checkout?liveSessionId={sessionId}";
    /// <summary>The mock PSP's hosted page, which the provider returns the payer to.</summary>
    public const string CheckoutSimulator = "/checkout/simulator";

    public const string TeacherApply = "/teach/apply";
    public static string TeacherApplyForSubject(Guid subjectId) =>
        $"/teach/apply?mode=additional&subjectId={subjectId}";

    // ---- dashboards: /{role}/{area}, with ?tab= for an area that has several ----
    public const string StudentHome = "/student/overview";
    public const string StudentMessages = "/student/messages";
    public const string StudentPayments = "/student/payments";

    public const string TeacherHome = "/teacher/home";
    public const string TeacherProfileArea = "/teacher/profile";
    /// <summary>
    /// Videos and showcases are not a tab in V1 navigation (UX-03; the capability returns with B11-05),
    /// so a notification about one opens the qualifications screen it belongs to rather than a tab that
    /// is no longer rendered.
    /// </summary>
    public const string TeacherVideos = "/teacher/qualifications";
    public const string TeacherServices = "/teacher/services";
    public const string TeacherPublication = "/teacher/publication";
    public const string TeacherEarnings = "/teacher/earnings";
    public static string TeacherReview(Guid reviewId) => $"/teacher/reviews/{reviewId}";

    public const string QualityApplications = "/quality/applications";
    /// <summary>
    /// Showcase moderation is hidden in V1 navigation (UX-03; it returns with B11-05), so a reviewer's
    /// showcase notification lands on the queue they do have rather than on a screen V1 does not show.
    /// </summary>
    public const string QualityShowcases = QualityApplications;

    /// <summary>
    /// A reviewer's notification is about one item: an application opens its review
    /// screen; a showcase opens the queue with that item named, for when moderation returns.
    /// </summary>
    public static string QualityApplication(Guid applicationId) =>
        $"{QualityApplications}/{applicationId}";
    public static string QualityShowcase(Guid sampleId) =>
        $"{QualityShowcases}?selectedId={sampleId}";

    public const string AdminHome = "/admin/home";
    public const string AdminSessions = "/admin/operations?tab=sessions";
}
