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
    "center": "Dispute Center",
    "intro": "Open and follow a protected case for an eligible order or completed live session. Both parties can add evidence and see the final rationale.",
    "trust": "Protection and fair resolution",
    "policy": "Escrow policy",
    "refresh": "Refresh",
    "create": "Open a dispute",
    "createIntro": "Choose the purchase first. Tafseel only shows purchases that are currently within the dispute window.",
    "purchase": "Purchase",
    "choose": "Choose an eligible purchase",
    "reasonLabel": "What happened?",
    "reason": "Explain what happened, what outcome you expect, and reference any relevant delivery, session, or message.",
    "reasonHint": "Do not include passwords, payment-card details, or unrelated personal information.",
    "submit": "Open case",
    "cases": "Your cases",
    "empty": "No disputes yet.",
    "back": "Back to dashboard",
    "select": "Select a case to review its evidence and status.",
    "conversation": "Case messages",
    "messagesEmpty": "No messages have been added.",
    "evidence": "Evidence",
    "evidenceEmpty": "No evidence has been uploaded.",
    "addMessage": "Add a case message",
    "addEvidence": "Upload evidence",
    "fileHint": "PDF, JPG, PNG, or text — up to 50 MB.",
    "send": "Send message",
    "decision": "Case decision",
    "start": "Start review",
    "refund": "Refund Student",
    "release": "Release to Teacher",
    "none": "No financial action",
    "rationale": "Explain the evidence and reason for this decision.",
    "resolve": "Resolve case",
    "final": "Final decision",
    "resolvedHint": "This case is closed. Its messages and evidence remain available for reference.",
    "statuses": [
      "Open",
      "Under review",
      "Resolved"
    ],
    "order": "Order",
    "session": "Live session",
    "until": "Eligible until",
    "with": "with",
    "noEligibleTitle": "No purchase is eligible right now",
    "noEligibleBody": "A dispute can be opened after an order delivery or after a live session ends, within the policy window.",
    "you": "You",
    "other": "Other party",
    "lang": "العربية",
    "theme": "Toggle theme"
  },
  "ar": {
    "center": "مركز النزاعات",
    "intro": "افتح وتابع قضية محمية لطلب مؤهل أو جلسة مباشرة انتهت. يمكن للطرفين إضافة الأدلة ورؤية سبب القرار النهائي.",
    "trust": "حماية وتسوية عادلة",
    "policy": "سياسة الضمان",
    "refresh": "تحديث",
    "create": "فتح نزاع",
    "createIntro": "اختر العملية أولاً. تعرض تفصيل فقط العمليات الموجودة حالياً داخل مدة الاعتراض.",
    "purchase": "العملية",
    "choose": "اختر عملية مؤهلة",
    "reasonLabel": "ماذا حدث؟",
    "reason": "اشرح ما حدث والنتيجة التي تطلبها، وأشر إلى أي تسليم أو جلسة أو رسالة مرتبطة.",
    "reasonHint": "لا تضف كلمات مرور أو بيانات بطاقة الدفع أو معلومات شخصية لا تخص القضية.",
    "submit": "فتح القضية",
    "cases": "قضاياك",
    "empty": "لا توجد نزاعات حتى الآن.",
    "back": "العودة للوحة التحكم",
    "select": "اختر قضية لمراجعة الأدلة والحالة.",
    "conversation": "رسائل القضية",
    "messagesEmpty": "لم تُضف رسائل بعد.",
    "evidence": "الأدلة",
    "evidenceEmpty": "لم تُرفع أدلة بعد.",
    "addMessage": "إضافة رسالة للقضية",
    "addEvidence": "رفع دليل",
    "fileHint": "PDF أو JPG أو PNG أو ملف نصي — بحد أقصى 50 ميجابايت.",
    "send": "إرسال الرسالة",
    "decision": "قرار القضية",
    "start": "بدء المراجعة",
    "refund": "استرداد للطالب",
    "release": "تحرير للمعلم",
    "none": "دون إجراء مالي",
    "rationale": "اشرح الأدلة وسبب القرار.",
    "resolve": "حسم القضية",
    "final": "القرار النهائي",
    "resolvedHint": "هذه القضية مغلقة. تظل رسائلها وأدلتها متاحة للرجوع إليها.",
    "statuses": [
      "مفتوح",
      "قيد المراجعة",
      "محسوم"
    ],
    "order": "طلب",
    "session": "جلسة مباشرة",
    "until": "متاح حتى",
    "with": "مع",
    "noEligibleTitle": "لا توجد عملية مؤهلة الآن",
    "noEligibleBody": "يمكن فتح نزاع بعد تسليم الطلب أو انتهاء الجلسة المباشرة، وخلال المدة المحددة في السياسة.",
    "you": "أنت",
    "other": "الطرف الآخر",
    "lang": "English",
    "theme": "تبديل المظهر"
  }
};
