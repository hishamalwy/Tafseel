namespace Tafseel.Application.Common;

/// <summary>
/// The client paths the server links to, in one place.
///
/// Notifications, emails and payment returns all hand the reader a URL into the
/// web client. Those used to be string literals spread across nine files
/// (<c>"/app/Tafseel-Teacher-Dashboard.dc.html?section=profile"</c>), so moving
/// the client meant finding every one of them; this is that list, named for what
/// the destination does rather than for the file that used to serve it.
///
/// The site currently serves the .dc.html pages, so that is what these point
/// at. When the Angular client becomes the site, this file is the only place
/// that changes - and the constants keep their names, because what each link
/// is for does not change with the page that serves it.
/// </summary>
public static class AppRoutes
{
    public const string Home = "/app/Tafseel-Landing.dc.html";
    public const string About = "/app/Tafseel-About.dc.html";
    public const string SignIn = "/app/Tafseel-Auth.dc.html";
    public const string ConfirmEmail = "/app/Tafseel-Confirm-Email.dc.html";
    public const string Terms = "/app/Tafseel-Policies.dc.html";

    public const string BrowseTeachers = "/app/Tafseel-Browse-Teachers.dc.html";
    public static string TeacherProfile(Guid teacherId) => $"/app/Tafseel-Teacher-Profile.dc.html?id={teacherId}";
    public static string TeacherProfile(string teacherId) => $"/app/Tafseel-Teacher-Profile.dc.html?id={teacherId}";

    public const string OpenRequests = "/app/Tafseel-Open-Marketplace.dc.html";
    public const string NewRequest = "/app/Tafseel-Request.dc.html";
    public const string BookSession = "/app/Tafseel-Book-Session.dc.html";
    public const string Disputes = "/app/Tafseel-Disputes.dc.html";

    public const string Checkout = "/app/Tafseel-Payment.dc.html";
    public static string CheckoutOrder(Guid orderId) => $"/app/Tafseel-Payment.dc.html?orderId={orderId}";
    public static string CheckoutLiveSession(Guid sessionId) => $"/app/Tafseel-Payment.dc.html?liveSessionId={sessionId}";
    /// <summary>The mock PSP's hosted page, which the provider returns the payer to.</summary>
    public const string CheckoutSimulator = "/app/Tafseel-Mock-Checkout.dc.html";

    public const string TeacherApply = "/app/Tafseel-Teacher-Apply.dc.html";
    public static string TeacherApplyForSubject(Guid subjectId) =>
        $"/app/Tafseel-Teacher-Apply.dc.html?mode=additional&subjectId={subjectId}";

    // ---- dashboards: /{role}/{area}, with ?tab= for an area that has several ----
    public const string StudentHome = "/app/Tafseel-Student-Dashboard.dc.html";
    public const string StudentMessages = "/app/Tafseel-Student-Dashboard.dc.html?section=messages";
    public const string StudentPayments = "/app/Tafseel-Student-Dashboard.dc.html?section=payments";

    public const string TeacherHome = "/app/Tafseel-Teacher-Dashboard.dc.html";
    public const string TeacherProfileArea = "/app/Tafseel-Teacher-Dashboard.dc.html?section=profile";
    public const string TeacherVideos = "/app/Tafseel-Teacher-Dashboard.dc.html?section=samples";
    public const string TeacherServices = "/app/Tafseel-Teacher-Dashboard.dc.html?section=services";
    public const string TeacherEarnings = "/app/Tafseel-Teacher-Dashboard.dc.html";

    public const string QualityApplications = "/app/Tafseel-Quality-Dashboard.dc.html?section=applications";
    public const string QualityShowcases = "/app/Tafseel-Quality-Dashboard.dc.html?section=showcases";

    /// <summary>
    /// A reviewer's notification is about one item, so its link carries that
    /// item's id. The dashboard does not preselect from it yet - it opens the
    /// right queue - but dropping the id would throw away the one thing that
    /// makes the link specific, and there would be nothing to restore later.
    /// </summary>
    public static string QualityApplication(Guid applicationId) =>
        $"{QualityApplications}&selectedId={applicationId}";
    public static string QualityShowcase(Guid sampleId) =>
        $"{QualityShowcases}&selectedId={sampleId}";

    public const string AdminHome = "/app/Tafseel-Admin-Dashboard.dc.html";
}
