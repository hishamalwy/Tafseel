/**
 * Dispute Center copy, generated from `Tafseel-Disputes.dc.html`.
 * Regenerate with `npm run gen:content` if the legacy page changes.
 */
export interface DisputeCopy {
  readonly center: string;
  readonly intro: string;
  readonly trust: string;
  readonly policy: string;
  readonly refresh: string;
  readonly create: string;
  readonly createIntro: string;
  readonly purchase: string;
  readonly choose: string;
  readonly reasonLabel: string;
  readonly reason: string;
  readonly reasonHint: string;
  readonly submit: string;
  /** UX-87: the report is read back before it is sent, and its arrival is confirmed in words. */
  readonly review: string;
  readonly reviewTitle: string;
  readonly reviewBody: string;
  readonly reviewEdit: string;
  readonly missing: string;
  readonly received: string;
  readonly cases: string;
  readonly empty: string;
  readonly back: string;
  readonly select: string;
  readonly conversation: string;
  readonly messagesEmpty: string;
  readonly evidence: string;
  readonly evidenceEmpty: string;
  readonly addMessage: string;
  readonly addEvidence: string;
  readonly fileHint: string;
  readonly send: string;
  readonly decision: string;
  readonly start: string;
  readonly refund: string;
  readonly release: string;
  readonly none: string;
  readonly rationale: string;
  readonly resolve: string;
  readonly final: string;
  readonly resolvedHint: string;
  readonly statuses: readonly string[];
  readonly order: string;
  readonly session: string;
  /** The link from a case to the purchase it is about (UX-06: the case no longer names it by id). */
  readonly viewOrder: string;
  readonly viewSession: string;
  readonly until: string;
  readonly with: string;
  readonly noEligibleTitle: string;
  readonly noEligibleBody: string;
  readonly you: string;
  readonly other: string;
  readonly lang: string;
  readonly theme: string;
}

export const DISPUTE_COPY: Readonly<Record<"ar" | "en", DisputeCopy>> = {
  "en": {
    "center": "Problems with a purchase",
    "intro": "If something went wrong with an order or a live session, tell Tafseel here. The other person can reply, you can both add files, and Tafseel’s team decides what happens to the payment. You can follow everything on this page.",
    "trust": "Protection and fair resolution",
    "policy": "Escrow policy",
    "refresh": "Refresh",
    "create": "Report a problem",
    "createIntro": "Choose the purchase. Only purchases you can still report are listed: after a delivery arrives or after a live session ends, for a limited time.",
    "purchase": "Purchase",
    "choose": "Choose an eligible purchase",
    "reasonLabel": "What happened?",
    "reason": "Explain what happened, what outcome you expect, and reference any relevant delivery, session, or message.",
    "reasonHint": "Do not include passwords, payment-card details, or unrelated personal information.",
    "submit": "Send to Tafseel",
    "review": "Check my report",
    "reviewTitle": "Check your report before sending",
    "reviewBody": "After you send it, the other person can reply, you can both add files, and Tafseel’s team decides what happens to the payment.",
    "reviewEdit": "Change it",
    "missing": "Choose the purchase and describe the problem first.",
    "received": "Tafseel received your report. You will get a notification when someone replies or the team decides; you can follow it below.",
    "cases": "Your reports",
    "empty": "You have not reported any problem.",
    "back": "Back to dashboard",
    "select": "Choose a report to see its messages, files and status.",
    "conversation": "Messages about this problem",
    "messagesEmpty": "No messages have been added.",
    "evidence": "Evidence",
    "evidenceEmpty": "No evidence has been uploaded.",
    "addMessage": "Add a message",
    "addEvidence": "Add a file (photo, PDF or text)",
    "fileHint": "PDF, JPG, PNG, or text — up to 50 MB.",
    "send": "Send message",
    "decision": "Case decision",
    "start": "Start review",
    "refund": "Refunded to the student",
    "release": "Paid to the teacher",
    "none": "No change to the payment",
    "rationale": "Explain the evidence and reason for this decision.",
    "resolve": "Resolve case",
    "final": "Tafseel’s decision",
    "resolvedHint": "This report is closed. Its messages and files stay here for reference.",
    "statuses": [
      "Open",
      "Being reviewed by Tafseel",
      "Resolved"
    ],
    "order": "Order",
    "session": "Live session",
    "viewOrder": "View the order",
    "viewSession": "View the session",
    "until": "Eligible until",
    "with": "with",
    "noEligibleTitle": "Nothing else can be reported right now",
    "noEligibleBody": "You can report a problem after a delivery arrives or after a live session ends, for a limited time. Anything you already reported is listed below.",
    "you": "You",
    "other": "Other party",
    "lang": "العربية",
    "theme": "Toggle theme"
  },
  "ar": {
    "center": "مشكلات الشراء",
    "intro": "إذا حدثت مشكلة في طلب أو جلسة مباشرة فأخبر تفصيل هنا. يستطيع الطرف الآخر الرد، ويمكن لكل منكما إضافة ملفات، ثم يقرر فريق تفصيل ما يحدث للمبلغ. تابع كل شيء من هذه الصفحة.",
    "trust": "حماية وتسوية عادلة",
    "policy": "سياسة الضمان",
    "refresh": "تحديث",
    "create": "الإبلاغ عن مشكلة",
    "createIntro": "اختر العملية. تظهر هنا فقط العمليات التي ما زال يمكن الإبلاغ عنها: بعد وصول التسليم أو بعد انتهاء الجلسة المباشرة، ولمدة محدودة.",
    "purchase": "العملية",
    "choose": "اختر عملية مؤهلة",
    "reasonLabel": "ماذا حدث؟",
    "reason": "اشرح ما حدث والنتيجة التي تطلبها، وأشر إلى أي تسليم أو جلسة أو رسالة مرتبطة.",
    "reasonHint": "لا تضف كلمات مرور أو بيانات بطاقة الدفع أو معلومات شخصية لا تخص القضية.",
    "submit": "أرسل البلاغ إلى تفصيل",
    "review": "راجع بلاغي",
    "reviewTitle": "راجع بلاغك قبل الإرسال",
    "reviewBody": "بعد الإرسال يمكن للطرف الآخر الرد، ويمكنكما إضافة ملفات، ويقرر فريق تفصيل ما يحدث للمبلغ المدفوع.",
    "reviewEdit": "تعديل",
    "missing": "اختر العملية واكتب المشكلة أولًا.",
    "received": "استلم فريق تفصيل بلاغك. سيصلك إشعار عند وجود رد أو قرار، ويمكنك متابعته أدناه.",
    "cases": "بلاغاتك",
    "empty": "لم تبلغ عن أي مشكلة.",
    "back": "العودة للوحة التحكم",
    "select": "اختر بلاغًا لرؤية الرسائل والملفات والحالة.",
    "conversation": "الرسائل حول هذه المشكلة",
    "messagesEmpty": "لم تُضف رسائل بعد.",
    "evidence": "الأدلة",
    "evidenceEmpty": "لم تُرفع أدلة بعد.",
    "addMessage": "أضف رسالة",
    "addEvidence": "أضف ملفًا (صورة أو PDF أو نص)",
    "fileHint": "PDF أو JPG أو PNG أو ملف نصي — بحد أقصى 50 ميجابايت.",
    "send": "إرسال الرسالة",
    "decision": "قرار القضية",
    "start": "بدء المراجعة",
    "refund": "أُعيد المبلغ للطالب",
    "release": "صُرف المبلغ للمعلم",
    "none": "دون تغيير في الدفع",
    "rationale": "اشرح الأدلة وسبب القرار.",
    "resolve": "حسم القضية",
    "final": "قرار تفصيل",
    "resolvedHint": "أُغلق هذا البلاغ. تبقى رسائله وملفاته هنا للرجوع إليها.",
    "statuses": [
      "مفتوح",
      "قيد المراجعة لدى تفصيل",
      "محسوم"
    ],
    "order": "طلب",
    "session": "جلسة مباشرة",
    "viewOrder": "عرض الطلب",
    "viewSession": "عرض الجلسة",
    "until": "متاح حتى",
    "with": "مع",
    "noEligibleTitle": "لا يوجد شيء آخر يمكن الإبلاغ عنه الآن",
    "noEligibleBody": "يمكنك الإبلاغ عن مشكلة بعد وصول التسليم أو بعد انتهاء الجلسة المباشرة، ولمدة محدودة. البلاغات التي أرسلتها تظهر بالأسفل.",
    "you": "أنت",
    "other": "الطرف الآخر",
    "lang": "English",
    "theme": "تبديل المظهر"
  }
};
