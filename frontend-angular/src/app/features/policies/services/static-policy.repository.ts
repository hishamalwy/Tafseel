/**
 * Policy copy, generated from `Tafseel-Policies.dc.html` so the wording is the
 * same text users already agreed to — transcribing 12KB of legal copy by hand is
 * exactly how a migration changes terms by accident.
 *
 * Regenerate with `npm run gen:policies` if the legacy page changes.
 */
import { Injectable } from "@angular/core";
import { Policy, PolicyId, POLICY_ORDER } from "@features/policies/models/policy";
import { PolicyRepository } from "@features/policies/services/policy.ports";

interface Chrome {
  readonly policies: string; readonly version: string; readonly effective: string;
  readonly contact: string; readonly skip: string; readonly rights: string;
  readonly about: string; readonly browse: string; readonly post: string;
}

const EN_CHROME: Chrome = {
  "policies": "Policies",
  "version": "Version 2026-08-12",
  "effective": "Effective 12 August 2026",
  "contact": "Questions or formal notices can be sent to",
  "skip": "Skip to content",
  "rights": "© 2026 Tafseel. All rights reserved.",
  "about": "About",
  "browse": "Browse teachers",
  "post": "Post a Request"
};

const EN_POLICIES: Readonly<Record<PolicyId, Policy>> = {
  terms: {
    id: "terms",
    title: "Terms of Service",
    intro: "These terms govern access to Tafseel and the educational marketplace between Students and Teachers.",
    sections: [
      { title: "Accounts and eligibility", body: "You must provide accurate information, protect your account, and use only roles and resources you are authorized to access. Tafseel may suspend accounts involved in fraud, abuse, impersonation, or repeated policy violations." },
      { title: "Marketplace relationship", body: "Teachers are independent education providers. Tafseel provides discovery, booking, communication, payment protection, and governance tools; it does not guarantee a particular academic outcome." },
      { title: "Payments and platform fees", body: "The complete price, platform fee, teacher commission, currency, scope, delivery time, revisions, and cancellation terms are shown before payment. Transaction terms are snapshotted when accepted." },
      { title: "Acceptable use and enforcement", body: "Users must not harass others, move protected transactions off-platform, misuse personal data, upload unlawful material, or circumvent safety controls. Tafseel may preserve evidence, restrict features, or close an account when reasonably required." },
    ]
  },
  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    intro: "This policy explains what Tafseel collects, why it is used, and the choices available to account holders.",
    sections: [
      { title: "Data we collect", body: "Account and profile data; qualification records; requests, bookings, messages, files and reviews; payment and ledger references; device, security, audit, and support records." },
      { title: "How data is used", body: "To operate the marketplace, verify eligibility, fulfil purchases, protect users and funds, prevent abuse, provide support, measure product performance, and comply with legal obligations." },
      { title: "Sharing and retention", body: "Information is shared only with authorized participants, service processors, or authorities where legally required. Transaction, consent, finance, safety, and dispute records may be retained longer than ordinary profile data." },
      { title: "Your choices", body: "You may update profile information, control optional notifications, and request access or deletion where applicable. Records required for finance, fraud prevention, disputes, or law may be retained." },
    ]
  },
  refunds: {
    id: "refunds",
    title: "Refund and Cancellation Policy",
    intro: "Cancellation outcomes depend on purchase type, timing, attendance, delivery, and any open dispute.",
    sections: [
      { title: "Live sessions", body: "A Teacher cancellation or Teacher no-show returns the eligible payment to the Student. A Student cancellation at least 24 hours before the scheduled start is refundable. Inside the 24-hour window, the Teacher is compensated unless an approved dispute determines otherwise." },
      { title: "Asynchronous Orders", body: "Funds remain protected while work is in progress. After delivery, the Student has 72 hours to approve, request an eligible revision, or open a dispute. With no action or open dispute, the Order completes automatically." },
      { title: "Refund method and timing", body: "Approved refunds return through the recorded payment path where supported. Tafseel records the decision, amount, target purchase, actor, and timestamps; financial processing time may vary." },
      { title: "Technical incidents", body: "Document a technical incident promptly through the relevant Session, Order, or Dispute. Tafseel may use attendance, join, message, file, and system audit evidence." },
    ]
  },
  integrity: {
    id: "integrity",
    title: "Academic Integrity Policy",
    intro: "Tafseel supports teaching, explanation, feedback, and legitimate learning assistance—not academic deception.",
    sections: [
      { title: "Allowed help", body: "Tutoring, concept explanation, study planning, practice questions, feedback, language support, and guidance that helps the Student understand and produce their own work." },
      { title: "Prohibited work", body: "Completing an exam, impersonating a Student, fabricating research or evidence, bypassing institutional rules, plagiarism-for-hire, or delivering work represented falsely as the Student’s own." },
      { title: "Teacher duties", body: "Teachers must clarify scope, refuse prohibited requests, avoid unsupported guarantees, and report requests that materially violate this policy." },
      { title: "Enforcement", body: "Tafseel may block submission, cancel a purchase, restrict an account, preserve evidence, or escalate a repeated or serious violation." },
    ]
  },
  teacher: {
    id: "teacher",
    title: "Teacher Agreement",
    intro: "This agreement supplements the Terms for approved Teachers using Tafseel.",
    sections: [
      { title: "Qualifications and profile", body: "Qualifications, identity, services, availability, samples, and claims must remain accurate. Approval for one subject or service does not imply approval for another." },
      { title: "Service quality", body: "Teachers must respond professionally, deliver the agreed scope on time, respect included revisions, attend confirmed sessions, and use Tafseel communication for protected transactions." },
      { title: "Earnings and withdrawals", body: "Net earnings reflect the snapshotted Teacher commission and any authorized refund or dispute adjustment. Withdrawal requests remain subject to identity, destination, risk, and settlement checks." },
      { title: "Conduct and confidentiality", body: "Student data and files may be used only to fulfil the purchase. Harassment, solicitation, credential misrepresentation, sharing private files, and circumvention are prohibited." },
    ]
  },
  disputes: {
    id: "disputes",
    title: "Escrow and Dispute Policy",
    intro: "This policy defines how protected funds and evidence are handled when the parties disagree.",
    sections: [
      { title: "Protected funds", body: "Confirmed payments are recorded against one Order or Live Session. Funds are released or refunded only through an authorized lifecycle or dispute decision." },
      { title: "Opening a dispute", body: "An eligible participant may open a dispute within 7 days of the relevant activity. The reason must be specific; supporting files and messages should be added to the case." },
      { title: "Review and decision", body: "Authorized reviewers can examine purchase terms, delivery, attendance, messages, files, payment and audit records. Possible outcomes are refund to Student, release to Teacher, or no financial action." },
      { title: "Fair process", body: "Both parties can see the case status, add relevant evidence while open, and receive the final rationale. Duplicate cases for the same purchase are prevented and every financial decision is idempotent and audited." },
    ]
  },
};

const AR_CHROME: Chrome = {
  "policies": "السياسات",
  "version": "الإصدار 2026-08-12",
  "effective": "سارية من 12 أغسطس 2026",
  "contact": "للاستفسارات والإخطارات الرسمية تواصل عبر",
  "skip": "تخطَّ إلى المحتوى",
  "rights": "© 2026 تفصيل. جميع الحقوق محفوظة.",
  "about": "من نحن",
  "browse": "تصفح المعلمين",
  "post": "انشر طلبًا"
};

const AR_POLICIES: Readonly<Record<PolicyId, Policy>> = {
  terms: {
    id: "terms",
    title: "شروط الخدمة",
    intro: "تنظم هذه الشروط استخدام تفصيل والسوق التعليمي بين الطلاب والمعلمين.",
    sections: [
      { title: "الحساب والأهلية", body: "يجب تقديم بيانات صحيحة وحماية الحساب واستخدام الصلاحيات المصرح بها فقط. يجوز لتفصيل تعليق الحساب عند الاحتيال أو الإساءة أو انتحال الهوية أو تكرار المخالفات." },
      { title: "علاقة السوق", body: "المعلمون مقدمو خدمات تعليمية مستقلون. توفر تفصيل الاكتشاف والحجز والتواصل وحماية الدفع والحوكمة، ولا تضمن نتيجة أكاديمية بعينها." },
      { title: "المدفوعات والرسوم", body: "يظهر السعر الكامل ورسوم المنصة وعمولة المعلم والعملة والنطاق والموعد والتعديلات وسياسة الإلغاء قبل الدفع، وتُحفظ شروط المعاملة عند قبولها." },
      { title: "الاستخدام المقبول", body: "يُحظر التحرش ونقل المعاملات المحمية خارج المنصة وإساءة استخدام البيانات ورفع محتوى غير قانوني أو تجاوز وسائل الأمان. يجوز حفظ الأدلة أو تقييد الحساب عند الحاجة." },
    ]
  },
  privacy: {
    id: "privacy",
    title: "سياسة الخصوصية",
    intro: "توضح هذه السياسة البيانات التي تجمعها تفصيل وأسباب استخدامها وحقوق صاحب الحساب.",
    sections: [
      { title: "البيانات التي نجمعها", body: "بيانات الحساب والملف والمؤهلات والطلبات والحجوزات والرسائل والملفات والتقييمات، ومراجع الدفع والدفاتر، وسجلات الأجهزة والأمان والدعم." },
      { title: "أغراض الاستخدام", body: "تشغيل السوق والتحقق من الأهلية وتنفيذ المشتريات وحماية المستخدمين والأموال ومنع الإساءة وتقديم الدعم وقياس الأداء والالتزام بالنظام." },
      { title: "المشاركة والاحتفاظ", body: "تُشارك البيانات مع الأطراف المصرح لهم ومعالجي الخدمة أو الجهات الرسمية عند وجود التزام قانوني. قد تُحفظ سجلات المعاملات والموافقات والمال والنزاعات مدة أطول." },
      { title: "اختياراتك", body: "يمكن تحديث بيانات الملف والتحكم في الإشعارات الاختيارية وطلب الوصول أو الحذف حيث ينطبق، مع الاحتفاظ بما يلزم للمال والنزاعات ومنع الاحتيال." },
    ]
  },
  refunds: {
    id: "refunds",
    title: "سياسة الاسترداد والإلغاء",
    intro: "تتحدد نتيجة الإلغاء حسب نوع الشراء والتوقيت والحضور والتسليم ووجود نزاع.",
    sections: [
      { title: "الجلسات المباشرة", body: "إلغاء المعلم أو غيابه يعيد الدفعة المستحقة للطالب. إلغاء الطالب قبل الموعد بـ24 ساعة على الأقل قابل للاسترداد، وداخل النافذة يُعوّض المعلم ما لم يقرر نزاع مقبول خلاف ذلك." },
      { title: "الطلبات غير المتزامنة", body: "تبقى الأموال محمية أثناء التنفيذ. بعد التسليم أمام الطالب 72 ساعة للاعتماد أو طلب تعديل مستحق أو فتح نزاع، وإلا يكتمل الطلب تلقائيًا عند عدم وجود نزاع." },
      { title: "طريقة ومدة الاسترداد", body: "تعود المبالغ المعتمدة عبر مسار الدفع المسجل حيث يتوفر. تسجل تفصيل القرار والمبلغ والشراء والفاعل والتوقيت، وقد تختلف مدة المعالجة." },
      { title: "المشكلات التقنية", body: "يجب توثيق المشكلة فورًا داخل الجلسة أو الطلب أو النزاع، وقد تستخدم تفصيل أدلة الحضور والانضمام والرسائل والملفات وسجلات النظام." },
    ]
  },
  integrity: {
    id: "integrity",
    title: "سياسة النزاهة الأكاديمية",
    intro: "تدعم تفصيل الشرح والتدريس والتغذية الراجعة والمساعدة التعليمية المشروعة، ولا تدعم الخداع الأكاديمي.",
    sections: [
      { title: "المساعدة المسموحة", body: "التدريس وشرح المفاهيم وخطط المذاكرة وأسئلة التدريب والمراجعة والدعم اللغوي والإرشاد الذي يساعد الطالب على إنتاج عمله بنفسه." },
      { title: "الأعمال المحظورة", body: "أداء اختبار بدل الطالب أو انتحال شخصيته أو اختلاق البحث والأدلة أو تجاوز لوائح المؤسسة أو بيع الانتحال أو تسليم عمل يُنسب كذبًا للطالب." },
      { title: "واجب المعلم", body: "توضيح النطاق ورفض الطلبات المحظورة وتجنب الوعود غير المدعومة والإبلاغ عن المخالفات الجوهرية." },
      { title: "التنفيذ", body: "يجوز منع الإرسال أو إلغاء الشراء أو تقييد الحساب أو حفظ الأدلة أو تصعيد المخالفة الجسيمة أو المتكررة." },
    ]
  },
  teacher: {
    id: "teacher",
    title: "اتفاقية المعلم",
    intro: "تكمل هذه الاتفاقية شروط الخدمة للمعلمين المعتمدين على تفصيل.",
    sections: [
      { title: "المؤهلات والملف", body: "يجب أن تظل بيانات الهوية والمؤهلات والخدمات والمواعيد والنماذج والادعاءات صحيحة. اعتماد مادة أو خدمة لا يعني اعتماد غيرها." },
      { title: "جودة الخدمة", body: "يلتزم المعلم بالرد المهني وتسليم النطاق في موعده واحترام التعديلات والحضور للجلسات واستخدام تواصل تفصيل للمعاملات المحمية." },
      { title: "الأرباح والسحب", body: "تعكس الأرباح الصافية العمولة المحفوظة وأي استرداد أو تسوية نزاع مصرح بها، ويخضع السحب للتحقق من الهوية والوجهة والمخاطر والتسوية." },
      { title: "السلوك والسرية", body: "تستخدم بيانات وملفات الطالب لتنفيذ الشراء فقط. يُحظر التحرش والاستدراج وتزييف المؤهلات ومشاركة الملفات الخاصة والتحايل." },
    ]
  },
  disputes: {
    id: "disputes",
    title: "سياسة الضمان والنزاعات",
    intro: "تحدد هذه السياسة معالجة الأموال والأدلة عند اختلاف الطرفين.",
    sections: [
      { title: "الأموال المحمية", body: "ترتبط كل دفعة مؤكدة بطلب أو جلسة واحدة، ولا تُحرر أو تُسترد إلا عبر دورة معتمدة أو قرار نزاع مصرح." },
      { title: "فتح النزاع", body: "يمكن للطرف المؤهل فتح نزاع خلال 7 أيام من النشاط المرتبط، مع سبب محدد وإضافة الرسائل والملفات الداعمة." },
      { title: "المراجعة والقرار", body: "يراجع المختص شروط الشراء والتسليم والحضور والرسائل والملفات والدفع والتدقيق. النتائج: استرداد للطالب أو تحرير للمعلم أو عدم إجراء مالي." },
      { title: "إجراء عادل", body: "يرى الطرفان الحالة ويمكنهما إضافة الأدلة أثناء فتح القضية ويستلمان سبب القرار. تُمنع القضايا المكررة وتُسجل القرارات المالية وتنفذ مرة واحدة." },
    ]
  },
};

/**
 * In-memory adapter. The copy ships with the policies page chunk, not the initial bundle:
 * nothing outside that page injects it. There is no network call.
 */
@Injectable({ providedIn: 'root' })
export class StaticPolicyRepository implements PolicyRepository {
  all(lang: "ar" | "en"): readonly Policy[] {
    const table = lang === "ar" ? AR_POLICIES : EN_POLICIES;
    return POLICY_ORDER.map(id => table[id]);
  }

  byId(id: PolicyId, lang: "ar" | "en"): Policy | null {
    const table = lang === "ar" ? AR_POLICIES : EN_POLICIES;
    return table[id] ?? null;
  }

  /** Page furniture that travels with the documents. */
  chrome(lang: "ar" | "en"): Chrome {
    return lang === "ar" ? AR_CHROME : EN_CHROME;
  }
}
