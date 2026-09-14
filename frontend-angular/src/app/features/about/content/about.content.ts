/**
 * About-page copy, generated from `Tafseel-About.dc.html` so the wording is
 * carried over rather than retyped.
 *
 * Regenerate with `npm run gen:content` if the legacy page changes.
 */
export interface AboutPrinciple { readonly num: string; readonly title: string; readonly body: string; }

export interface AboutCopy {
  readonly skip: string; readonly home: string; readonly primaryNav: string;
  readonly navBrowse: string; readonly navPost: string; readonly navAbout: string;
  readonly navHow: string; readonly navTeach: string; readonly navTerms: string; readonly navPrivacy: string;
  readonly login: string; readonly langLabel: string; readonly themeLabel: string;
  readonly heroEyebrow: string; readonly heroTitle: string; readonly heroLede: string;
  readonly beliefTitle: string; readonly beliefBody: string;
  readonly principlesKicker: string; readonly principles: readonly AboutPrinciple[];
  readonly originTitle: string; readonly originBody: string;
  readonly ctaTitle: string; readonly ctaBody: string; readonly ctaPrimary: string; readonly ctaSecondary: string;
  readonly footStatement: string; readonly footTag: string; readonly footExplore: string;
  readonly footStart: string; readonly footCompany: string; readonly footRights: string; readonly footOrigin: string;
}

export const ABOUT_COPY: Readonly<Record<"ar" | "en", AboutCopy>> = {
  "en": {
    "skip": "Skip to content",
    "home": "Tafseel home",
    "primaryNav": "Primary",
    "login": "Log in",
    "navBrowse": "Browse teachers",
    "navPost": "Post a Request",
    "navAbout": "About",
    "navTeach": "Become a Teacher",
    "navTerms": "Terms of Service",
    "navPrivacy": "Privacy Policy",
    "navHow": "How it works",
    "langLabel": "العربية",
    "themeLabel": "Toggle theme",
    "heroEyebrow": "About Tafseel",
    "heroTitle": "Education, tailored to you.",
    "heroLede": "Tafseel exists because the generic explanation — the one recorded once for everybody — is rarely the one that works for you.",
    "beliefTitle": "The lesson is not the problem. The fit is.",
    "beliefBody": "Most students who fall behind are not short on effort or ability. They are short on an explanation pitched at their level, in their language, on their timetable. A recorded course cannot do that; it was finished before it ever met you. A teacher can.",
    "principlesKicker": "What we hold to",
    "principles": [
      {
        "num": "01",
        "title": "Start from the gap, not the syllabus",
        "body": "You upload the exact page, question or recording you are stuck on, and set the deadline. Teachers answer that — not a general topic that happens to contain it."
      },
      {
        "num": "02",
        "title": "Qualified before they can accept anything",
        "body": "Identity, credentials and a recorded teaching demo are reviewed before a teacher can take a single request. Being approved for one subject is not approval for another."
      },
      {
        "num": "03",
        "title": "Nobody is asked to trust a stranger",
        "body": "Your payment is held until the work is delivered and your review window has run. Approve it, ask for a revision, or open a dispute — and see the reasoning behind the decision."
      }
    ],
    "originTitle": "Built in Saudi Arabia",
    "originBody": "Tafseel is built in the Kingdom, in Arabic and English, for students from Tabuk to Jazan — and for the teachers who are good at the moment something finally makes sense.",
    "ctaTitle": "Bring the thing you are stuck on.",
    "ctaBody": "Post what you need and receive offers from qualified teachers, or pick your teacher yourself.",
    "ctaPrimary": "Post a Request",
    "ctaSecondary": "Become a Teacher",
    "footStatement": "An explanation that finally fits the way you learn.",
    "footTag": "Education, tailored to you. Personalized explanations from verified teachers.",
    "footExplore": "Explore",
    "footStart": "Start with Tafseel",
    "footCompany": "Company",
    "footRights": "© 2026 Tafseel. All rights reserved.",
    "footOrigin": "Built in Saudi Arabia for every student looking for a clearer explanation."
  },
  "ar": {
    "skip": "تخطَّ إلى المحتوى",
    "home": "الصفحة الرئيسية لتفصيل",
    "primaryNav": "التنقل الرئيسي",
    "login": "تسجيل الدخول",
    "navBrowse": "تصفح المعلمين",
    "navPost": "انشر طلبًا",
    "navAbout": "من نحن",
    "navTeach": "انضم كمعلم",
    "navTerms": "شروط الخدمة",
    "navPrivacy": "سياسة الخصوصية",
    "navHow": "كيف يعمل",
    "langLabel": "English",
    "themeLabel": "تبديل المظهر",
    "heroEyebrow": "من نحن",
    "heroTitle": "درسك على مقاسك.",
    "heroLede": "وُجدت تفصيل لأن الشرح العام — المسجَّل مرة واحدة للجميع — نادرًا ما يكون الشرح الذي ينفع معك أنت.",
    "beliefTitle": "المشكلة ليست في الدرس، بل في المقاس.",
    "beliefBody": "أغلب الطلاب الذين يتأخرون لا ينقصهم اجتهاد ولا قدرة، بل ينقصهم شرح على مستواهم، بلغتهم، وفي وقتهم. الدورة المسجَّلة لا تستطيع ذلك؛ فقد اكتملت قبل أن تعرفك. أما المعلّم فيستطيع.",
    "principlesKicker": "ما نلتزم به",
    "principles": [
      {
        "num": "٠١",
        "title": "نبدأ من موضع التوقف، لا من المنهج",
        "body": "ترفع الصفحة أو السؤال أو التسجيل الذي توقفت عنده بالضبط، وتحدد الموعد. فيجيبك المعلّم عنه هو، لا عن موضوع عام يقع بداخله."
      },
      {
        "num": "٠٢",
        "title": "التأهيل قبل قبول أي طلب",
        "body": "تُراجَع الهوية والمؤهلات ونموذج شرح مسجَّل قبل أن يقبل المعلّم طلبًا واحدًا. واعتماده في مادة لا يعني اعتماده في غيرها."
      },
      {
        "num": "٠٣",
        "title": "لا أحد مطالَب بالثقة في غريب",
        "body": "يبقى مبلغك محفوظًا حتى يُسلَّم العمل وتنتهي مدة مراجعتك. لك أن تعتمد، أو تطلب تعديلًا، أو تفتح نزاعًا — وأن ترى سبب القرار."
      }
    ],
    "originTitle": "صُنعت في السعودية",
    "originBody": "تفصيل مبنية في المملكة، بالعربية والإنجليزية، لطلاب من تبوك إلى جازان — ولمعلمين يجيدون تلك اللحظة التي يتضح فيها كل شيء أخيرًا.",
    "ctaTitle": "احضر معك ما توقفت عنده.",
    "ctaBody": "انشر ما تحتاجه واستقبل عروضًا من معلمين مؤهلين، أو اختر معلمك بنفسك.",
    "ctaPrimary": "انشر طلبًا",
    "ctaSecondary": "انضم كمعلم",
    "footStatement": "شرح يناسب طريقتك في التعلم أخيرًا.",
    "footTag": "درسك على مقاسك. شروحات مخصصة من معلمين موثوقين.",
    "footExplore": "استكشف",
    "footStart": "ابدأ مع تفصيل",
    "footCompany": "تفصيل",
    "footRights": "© 2026 تفصيل. جميع الحقوق محفوظة.",
    "footOrigin": "صُنعت في السعودية لكل طالب يبحث عن شرح أوضح."
  }
};
