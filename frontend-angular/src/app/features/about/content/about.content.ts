/**
 * About-page copy. It started as a port of `Tafseel-About.dc.html`; it is now
 * edited here directly. The Arabic is written in Saudi dialect, not Modern
 * Standard Arabic, and the page carries the brand line "تفصيل — درسك على مقاسك".
 *
 * Every claim below is one the product already makes elsewhere (escrow until
 * approval, quality review before a teacher can accept work, per-subject
 * approval). Nothing here may promise more than that.
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
    "heroTitle": "Tafseel — education, tailored to you.",
    "heroLede": "We built Tafseel because the generic explanation — the one recorded once for everybody — is rarely the one that works for you.",
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
        "body": "Tafseel's quality team watches a recorded teaching demo and reads the teacher's stated experience before they can take a single request. Being approved for one subject is not approval for another."
      },
      {
        "num": "03",
        "title": "Nobody is asked to trust a stranger",
        "body": "Your payment is held until the work is delivered and your review window has run. Approve it, ask for a revision, or open a dispute — and see the reasoning behind the decision."
      }
    ],
    "originTitle": "Why the name Tafseel?",
    "originBody": "In Arabic, tafseel is what a tailor does: cutting a garment to your measurements. That is the whole idea. The explanation is cut to your level, your timetable and the exact question you bring — because one size never fits everyone.",
    "ctaTitle": "Bring the thing you are stuck on.",
    "ctaBody": "Post what you need and receive offers from qualified teachers, or pick your teacher yourself.",
    "ctaPrimary": "Post a Request",
    "ctaSecondary": "Become a Teacher",
    "footStatement": "An explanation that finally fits the way you learn.",
    "footTag": "Personalized explanations from verified teachers.",
    "footExplore": "Explore",
    "footStart": "Start with Tafseel",
    "footCompany": "Company",
    "footRights": "© 2026 Tafseel. All rights reserved.",
    "footOrigin": "Tafseel — education, tailored to you."
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
    "heroEyebrow": "عن تفصيل",
    "heroTitle": "تفصيل — درسك على مقاسك.",
    "heroLede": "سوّينا تفصيل لأن الشرح العام، اللي ينسجل مرة وحدة للكل، نادر يجي على مقاسك أنت.",
    "beliefTitle": "المشكلة مو في الدرس، المشكلة في المقاس.",
    "beliefBody": "أغلب الطلاب اللي يتأخرون ما ينقصهم اجتهاد ولا قدرة، ينقصهم شرح على قد مستواهم، بلغتهم، وفي الوقت اللي يناسبهم. الدورة المسجّلة ما تقدر تسوي كذا؛ خلصت قبل لا تعرفك. أما المعلم فيقدر.",
    "principlesKicker": "اللي نمشي عليه",
    "principles": [
      {
        "num": "٠١",
        "title": "نبدأ من المكان اللي وقفت عنده، مو من المنهج",
        "body": "ترفع الصفحة أو السؤال أو التسجيل اللي وقفت عنده بالضبط، وتحدد الموعد. والمعلم يشرح لك هذا بالذات، مو موضوع عام يدخل فيه."
      },
      {
        "num": "٠٢",
        "title": "ما يقبل المعلم أي طلب قبل لا يتأهل",
        "body": "فريق الجودة في تفصيل يشوف نموذج شرح مسجّل ويقرأ الخبرة اللي يذكرها المعلم، قبل لا يقبل ولا طلب. واعتماده في مادة ما يعني إنه معتمد في غيرها."
      },
      {
        "num": "٠٣",
        "title": "ما نطلب منك تثق في أحد ما تعرفه",
        "body": "مبلغك يبقى محفوظ عند تفصيل لين يوصلك الشغل وتخلص مدة مراجعتك. بعدها لك الخيار: تعتمد، أو تطلب تعديل، أو تفتح نزاع، وتشوف سبب القرار بنفسك."
      }
    ],
    "originTitle": "ليش سمّيناها تفصيل؟",
    "originBody": "مثل الثوب اللي ينفصّل على مقاسك، الشرح عندنا ينفصّل على مستواك ووقتك والسؤال اللي معك بالضبط. ما فيه مقاس واحد يناسب الكل، وعشان كذا نبدأ منك أنت.",
    "ctaTitle": "جيب معك الشي اللي وقفت عنده.",
    "ctaBody": "انشر وش تحتاج واستقبل عروض من معلمين مؤهلين، أو اختار معلمك بنفسك.",
    "ctaPrimary": "انشر طلبك",
    "ctaSecondary": "انضم كمعلم",
    "footStatement": "شرح يجي على طريقتك في التعلّم.",
    "footTag": "شرح مخصص لك من معلمين موثوقين.",
    "footExplore": "استكشف",
    "footStart": "ابدأ مع تفصيل",
    "footCompany": "تفصيل",
    "footRights": "© 2026 تفصيل. جميع الحقوق محفوظة.",
    "footOrigin": "تفصيل — درسك على مقاسك."
  }
};
