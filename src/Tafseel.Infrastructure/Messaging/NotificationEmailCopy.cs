namespace Tafseel.Infrastructure.Messaging;

/// <summary>
/// The words of a notification e-mail in the reader's language.
///
/// Notifications are stored with an English system title and body (the in-app bell words them from the
/// notification type instead). E-mails used to put those English sentences inside Arabic chrome for
/// everybody — "Clarification requested" under "إشعار جديد". The language a person signed up in is kept as
/// a user claim (<see cref="UserLanguage"/>); this turns the known system sentences into that language and
/// leaves anything else (a teacher's own question, a reviewer's feedback) exactly as its author wrote it.
/// </summary>
public static class NotificationEmailCopy
{
    public static string Kicker(string lang) => lang == "en" ? "New on Tafseel" : "إشعار جديد";

    public static string Cta(string lang) => lang == "en" ? "Open in Tafseel →" : "عرض التفاصيل ←";

    /// <summary>A known system sentence in the reader's language; anything else unchanged.</summary>
    public static string Text(string text, string lang)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;
        var table = lang == "en" ? English : Arabic;
        return table.TryGetValue(text.Trim(), out var worded) ? worded : text;
    }

    /// <summary>System sentences reworded in plain English where the stored one was internal vocabulary.</summary>
    private static readonly IReadOnlyDictionary<string, string> English = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["Clarification requested"] = "Your teacher has a question",
        ["New learning request"] = "New request from a student",
        ["New Teacher Offer"] = "A teacher sent you an offer",
        ["Your Offer was selected"] = "A student chose your offer",
        ["Order funded"] = "The student paid — you can start",
        ["Session funded"] = "The student paid for the session",
        ["Your payment is protected in escrow."] = "Tafseel is holding your payment safely until the work is done.",
        ["Your live-session payment is protected in escrow."] = "Tafseel is holding your payment safely until the session has taken place.",
        ["Live session settlement confirmed"] = "Live session confirmed",
        ["Live session settlement finalized"] = "Live session closed",
        ["New dispute requires triage"] = "A new problem report needs a first look",
        ["A protected-purchase dispute was opened."] = "A problem was reported on a paid purchase.",
        ["Offer reservation expired"] = "The time to pay for the chosen offer ran out",
        ["Offer selection expired"] = "The student did not pay in time"
    };

    private static readonly IReadOnlyDictionary<string, string> Arabic = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        // titles
        ["Application under review"] = "طلبك قيد المراجعة",
        ["Changes requested on your teaching application"] = "طُلبت تعديلات على طلب التدريس",
        ["Clarification requested"] = "لدى معلمك سؤال",
        ["Complete payment to keep your Offer"] = "أكمل الدفع للاحتفاظ بالعرض",
        ["Confirm the live session"] = "أكّد أن الجلسة المباشرة تمّت",
        ["Delivery extension accepted"] = "قُبل تمديد موعد التسليم",
        ["Delivery extension declined"] = "رُفض تمديد موعد التسليم",
        ["Delivery extension requested"] = "طُلب تمديد موعد التسليم",
        ["Delivery uploaded"] = "وصل التسليم",
        ["Dispute opened"] = "تم الإبلاغ عن مشكلة",
        ["Dispute resolved"] = "صدر قرار تفصيل في البلاغ",
        ["Dispute review is taking longer than expected"] = "مراجعة البلاغ تستغرق وقتًا أطول من المتوقع",
        ["Dispute review started"] = "بدأت تفصيل مراجعة البلاغ",
        ["Earnings available"] = "أرباحك متاحة للسحب",
        ["Live session cancelled"] = "أُلغيت الجلسة المباشرة",
        ["Live session outcome required"] = "أخبرنا بما حدث في الجلسة المباشرة",
        ["Live session outcome requires review"] = "نتيجة الجلسة المباشرة تحتاج مراجعة",
        ["Live session outcome resolved"] = "حُسمت نتيجة الجلسة المباشرة",
        ["Live session outcome under review"] = "نتيجة الجلسة المباشرة قيد المراجعة",
        ["Live session reschedule requested"] = "طُلب موعد آخر للجلسة المباشرة",
        ["Live session rescheduled"] = "تغيّر موعد الجلسة المباشرة",
        ["Live session settlement confirmed"] = "تأكدت الجلسة المباشرة",
        ["Live session settlement finalized"] = "أُغلقت الجلسة المباشرة",
        ["Live session starts soon"] = "جلستك المباشرة تبدأ قريبًا",
        ["Live-session request accepted"] = "قبل المعلم طلب الجلسة",
        ["Live-session request declined"] = "اعتذر المعلم عن طلب الجلسة",
        ["New Teacher Offer"] = "وصلك عرض من معلم",
        ["New dispute evidence"] = "أُضيف ملف إلى البلاغ",
        ["New dispute message"] = "رسالة جديدة في البلاغ",
        ["New dispute requires triage"] = "بلاغ جديد يحتاج نظرة أولى",
        ["New learning request"] = "طلب جديد من طالب",
        ["New live-session request"] = "طلب جلسة مباشرة جديد",
        ["New review received"] = "وصلك تقييم جديد",
        ["New teacher application"] = "طلب تدريس جديد",
        ["Offer reservation expired"] = "انتهت مهلة الدفع للعرض المختار",
        ["Offer selection expired"] = "لم يدفع الطالب في الوقت المحدد",
        ["Order completed"] = "اكتمل الطلب",
        ["Order earning reversed"] = "أُلغيت أرباح هذا الطلب",
        ["Order funded"] = "دفع الطالب — يمكنك البدء",
        ["Order refunded"] = "أُعيد مبلغ الطلب",
        ["Overdue dispute requires action"] = "بلاغ متأخر يحتاج إجراء",
        ["Payment confirmed"] = "تم تأكيد الدفع",
        ["Payment refunded"] = "أُعيد المبلغ",
        ["Payment released"] = "حُوّل المبلغ",
        ["Payout profile needs changes"] = "بيانات التحويل تحتاج تعديلًا",
        ["Payout profile verified"] = "تم التحقق من بيانات التحويل",
        ["Profile published"] = "ملفك منشور للطلاب",
        ["Profile unpublished"] = "ملفك لم يعد ظاهرًا للطلاب",
        ["Request accepted — payment required"] = "قبل المعلم طلبك — أكمل الدفع",
        ["Request declined"] = "اعتذر المعلم عن طلبك",
        ["Request expired"] = "انتهت مدة الطلب",
        ["Reschedule request declined"] = "رُفض طلب تغيير الموعد",
        ["Review a live session no-show claim"] = "راجِع بلاغ عدم حضور في جلسة مباشرة",
        ["Review hidden from public profile"] = "أُخفي تقييمك من الملف العام",
        ["Review restored to public profile"] = "عاد تقييمك إلى الملف العام",
        ["Review submitted"] = "تم إرسال تقييمك",
        ["Reviewer requested information"] = "طلبت تفصيل معلومات إضافية",
        ["Revision requested"] = "طلب الطالب تعديلًا",
        ["Session funded"] = "دفع الطالب ثمن الجلسة",
        ["Session payment refunded"] = "أُعيد مبلغ الجلسة",
        ["Session payment reversed"] = "أُلغيت أرباح هذه الجلسة",
        ["Student replied"] = "رد الطالب على سؤالك",
        ["Subject qualification updated"] = "تحدّث تأهيلك في المادة",
        ["Subject qualification withdrawn"] = "سُحب تأهيلك في إحدى المواد",
        ["New withdrawal to pay out"] = "طلب سحب جديد بانتظار التحويل",
        ["Request cancelled"] = "أُلغي الطلب",
        ["The student cancelled the request before it became an order."] = "ألغى الطالب الطلب قبل أن يتحول إلى طلب خدمة.",
        ["Order cancelled"] = "أُلغي الطلب",
        ["The order was cancelled before it was paid. Nothing was charged."] = "أُلغي الطلب قبل دفعه، ولم يُخصم أي مبلغ.",
        ["Payment did not go through"] = "لم يكتمل الدفع",
        ["Your payment did not go through and nothing was charged. You can try again."] = "لم يكتمل دفعك ولم يُخصم أي مبلغ. يمكنك المحاولة مجددًا.",
        ["Your Tafseel account was suspended"] = "عُلّق حسابك في تفصيل",
        ["Tafseel suspended your account. If you think this is a mistake, tell us through Help."] = "علّق تفصيل حسابك. إن كنت ترى أن ذلك خطأ فأخبرنا عبر صفحة المساعدة.",
        ["Your Tafseel account was restored"] = "أُعيد تفعيل حسابك في تفصيل",
        ["Your account is active again. You can sign in."] = "حسابك فعّال مجددًا، ويمكنك تسجيل الدخول.",
        ["Your access on Tafseel changed"] = "تغيّرت صلاحياتك في تفصيل",
        ["An administrator changed what you can do on Tafseel. Sign in again to see it."] = "غيّر أحد المشرفين ما يمكنك فعله في تفصيل. سجّل الدخول مجددًا لترى ذلك.",
        ["A teacher requested a withdrawal. Check the transfer details and start the transfer."] = "طلب معلم سحب أرباحه. راجع بيانات التحويل ثم ابدأ التحويل.",
        ["Bank details to verify"] = "بيانات بنكية بانتظار التحقق",
        ["A teacher entered or changed their bank details. Verify them before any withdrawal is paid."] = "أدخل معلم بياناته البنكية أو غيّرها. تحقّق منها قبل صرف أي سحب.",
        ["Teacher Showcase submitted"] = "أُرسل نموذج شرح للمراجعة",
        ["Teacher started work"] = "بدأ المعلم العمل",
        ["Withdrawal completed"] = "تم التحويل",
        ["Withdrawal requested"] = "استلمنا طلب السحب",
        ["Transfer started"] = "بدأ التحويل البنكي",
        ["Tafseel's reviewer asked a question"] = "لدى مراجع تفصيل سؤال",
        ["Withdrawal rejected"] = "رُفض طلب السحب",
        ["Your Offer was selected"] = "اختار الطالب عرضك",
        ["Your teaching application was approved"] = "تمت الموافقة على طلب التدريس",
        ["Your teaching application was not approved"] = "لم تتم الموافقة على طلب التدريس",
        // bodies
        ["A Student reviewed a completed Order."] = "قيّم طالب طلبًا مكتملًا.",
        ["A Student reviewed a completed live session."] = "قيّم طالب جلسة مباشرة مكتملة.",
        ["A dispute was opened for your purchase."] = "تم الإبلاغ عن مشكلة في عمليتك.",
        ["A participant added a dispute message."] = "أضاف أحد الطرفين رسالة إلى البلاغ.",
        ["A participant uploaded dispute evidence."] = "أضاف أحد الطرفين ملفًا إلى البلاغ.",
        ["A protected-purchase dispute was opened."] = "تم الإبلاغ عن مشكلة في عملية مدفوعة.",
        ["A quality reviewer has started reviewing your application."] = "بدأ فريق الجودة مراجعة طلبك.",
        ["A resolved dispute reversed this Order earning."] = "ألغى قرار البلاغ أرباح هذا الطلب.",
        ["A resolved dispute reversed this live-session earning."] = "ألغى قرار البلاغ أرباح هذه الجلسة.",
        ["A teacher application is ready for review."] = "طلب تدريس جاهز للمراجعة.",
        ["Cleared earnings are now available to withdraw."] = "أصبحت أرباحك متاحة للسحب.",
        ["The Student approved the delivery."] = "قبل الطالب التسليم.",
        ["The Student live-session payment is confirmed."] = "تأكد دفع الطالب للجلسة المباشرة.",
        ["The Student payment is confirmed. You can begin work."] = "تأكد دفع الطالب. يمكنك بدء العمل.",
        ["The Student payment is confirmed."] = "تأكد دفع الطالب.",
        ["The case remains protected and has been escalated to the operations team."] = "البلاغ ما زال محميًا، وأُحيل إلى فريق العمليات.",
        ["The completed Order payment was refunded after review."] = "أُعيد مبلغ الطلب المكتمل بعد المراجعة.",
        ["The completed live-session payment was refunded after review."] = "أُعيد مبلغ الجلسة المكتملة بعد المراجعة.",
        ["The dispute reviewer added a message to the case."] = "أضاف فريق تفصيل رسالة إلى البلاغ.",
        ["The held live-session payment was refunded."] = "أُعيد مبلغ الجلسة المباشرة.",
        ["The held payment was refunded."] = "أُعيد المبلغ.",
        ["The other party added a message to the dispute."] = "أضاف الطرف الآخر رسالة إلى البلاغ.",
        ["The other party uploaded evidence to the dispute."] = "أضاف الطرف الآخر ملفًا إلى البلاغ.",
        ["The request deadline passed without conversion to an Order."] = "انتهى موعد الطلب دون أن يتحول إلى طلب عمل.",
        ["The request is open for Offers again."] = "طلبك مفتوح لاستقبال العروض مرة أخرى.",
        ["The review window ended and your payment was released."] = "انتهت مدة المراجعة وحُوّل المبلغ.",
        ["The review window ended without a revision or dispute."] = "انتهت مدة المراجعة دون طلب تعديل أو بلاغ.",
        ["The reviewer added a dispute message."] = "أضاف فريق تفصيل رسالة إلى البلاغ.",
        ["You can now request withdrawals."] = "يمكنك الآن طلب السحب.",
        ["You can rate this completed service when ready."] = "يمكنك تقييم هذه الخدمة المكتملة متى شئت.",
        ["Your Offer is available to the Student again."] = "عرضك متاح للطالب مرة أخرى.",
        ["Your application was reviewed."] = "رُوجع طلبك.",
        ["Your dispute is now under review."] = "بلاغك الآن قيد المراجعة.",
        ["Your funds are available again."] = "أموالك متاحة مرة أخرى.",
        ["Your live-session payment is protected in escrow."] = "تحتفظ تفصيل بمبلغك بأمان حتى تتم الجلسة.",
        ["Your order is now in progress."] = "طلبك قيد التنفيذ الآن.",
        ["Your payment is protected in escrow."] = "تحتفظ تفصيل بمبلغك بأمان حتى يكتمل العمل.",
        ["Your rating was saved for this completed Order."] = "حُفظ تقييمك لهذا الطلب المكتمل.",
        ["Your request is now an active Order."] = "أصبح طلبك طلب عمل نشطًا.",
        ["Your review is visible on the teacher profile again."] = "تقييمك ظاهر في ملف المعلم مرة أخرى.",
        ["Your review remains on your completed Order but is not shown publicly."] = "يبقى تقييمك في طلبك المكتمل لكنه لا يظهر للعامة.",
        ["Your teacher profile is no longer public."] = "ملفك كمعلم لم يعد ظاهرًا للطلاب.",
        ["Your teacher profile is now public."] = "ملفك كمعلم ظاهر الآن للطلاب.",
        ["Your teacher uploaded a delivery."] = "رفع معلمك التسليم.",
        ["Your withdrawal was processed."] = "تمت معالجة طلب السحب.",
        ["Your withdrawal was requested and the amount is set aside."] = "استلمنا طلب السحب وحُجز المبلغ له.",
        ["Tafseel's finance team started your bank transfer."] = "بدأ فريق المالية في تفصيل تحويل المبلغ إلى حسابك البنكي.",
        ["Your bank transfer was sent."] = "أُرسل التحويل البنكي إلى حسابك.",
        ["Tafseel's reviewer asked a question about your dispute. Reply on the case."] = "طرح مراجع تفصيل سؤالًا حول بلاغك. ردّ عليه في البلاغ."
    };
}

/// <summary>The language a person uses Tafseel in, kept as an Identity user claim so no schema change is needed.</summary>
public static class UserLanguage
{
    public const string ClaimType = "tafseel:lang";

    public static string Normalize(string? lang) =>
        string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "ar";
}
