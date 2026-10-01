/**
 * Landing copy that is not in the translation table.
 *
 * `js/locales.js` covers the strings the whole product shares; the landing page
 * also carries a large amount of prose written only for it, which the legacy
 * page held as inline `ar ? '…' : '…'` ternaries scattered through a 460-line
 * `renderVals`. Collected here, the two languages sit side by side where a
 * missing or drifted translation is visible, and the component is left with
 * behaviour instead of prose.
 */

export interface StoryStepCopy {
  readonly title: string;
  readonly body: string;
}

export interface ServiceCopy {
  readonly nameEnglish: string;
  readonly nameArabic: string;
  readonly descriptionEnglish: string;
  readonly descriptionArabic: string;
}

/**
 * Static marketing fallbacks for the services section only. Subjects never fall
 * back — an invented subject would send a visitor searching for teachers who do
 * not exist, whereas these four are descriptions of what Tafseel sells.
 */
export const FALLBACK_SERVICES: readonly ServiceCopy[] = [
  {
    nameEnglish: 'Custom recorded explanation', nameArabic: 'شرح مسجّل مخصص',
    descriptionEnglish: 'A recorded video walking through your exact topic, step by step.',
    descriptionArabic: 'فيديو مسجّل يشرح لك موضوعك خطوة بخطوة.'
  },
  {
    nameEnglish: 'Assignment guidance', nameArabic: 'إرشاد الواجبات',
    descriptionEnglish: 'Coaching through your assignment, not ghostwriting.',
    descriptionArabic: 'توجيه يساعدك تحل واجبك بنفسك، بدون ما أحد يكتبه عنك.'
  },
  {
    nameEnglish: 'Exam revision', nameArabic: 'مراجعة الاختبار',
    descriptionEnglish: 'Focused revision on your syllabus and past papers.',
    descriptionArabic: 'مراجعة مكثفة لمنهجك وأسئلة الاختبارات السابقة.'
  },
  {
    nameEnglish: 'Live session', nameArabic: 'جلسة مباشرة',
    descriptionEnglish: 'One-to-one video call with a shared whiteboard.',
    descriptionArabic: 'جلسة فيديو فردية مع سبورة مشتركة.'
  }
];

/** The four words the hero headline cycles through. */
export const ROTATE_WORDS = {
  ar: ['احتياجك', 'مستواك', 'قدراتك', 'وقتك'],
  en: ['needs', 'level', 'pace', 'schedule']
} as const;

const ARABIC = {
  heroLead: 'الشرح العام ما يكفيك',
  heroPrefix: 'تفصيل، شرحك على مقاس',
  heroSub: 'ارفع ملفك، اختر الوقت اللي يناسبك، وخذ شرح واضح للجزئية اللي تحتاجها\nبدون تكرار ولا تشتيت',
  heroCta: 'اعرض المعلمين',
  heroJoin: 'انضم كمعلم',
  heroRotateMin: '5.6ch',
  searchLabel: 'ابحث عن معلم أو مادة أو درس',
  searchPlaceholder: 'مادة، درس، أو معلم…',
  searchEmpty: 'اكتب اسم معلم أو مادة أو درس.',
  searchHint: 'البحث يعرض المعلمين المناسبين لك',
  uploadCta: 'أو ارفع ملفك',
  accountActions: 'إجراءات الحساب',
  homeLabel: 'العودة إلى بداية الصفحة',
  browseAll: 'تصفح الكل',

  teacherPrimary: 'استعرض الفرص',
  teacherSecondary: 'لوحة المعلم',
  teacherNote: 'راجع طلبات الطلاب اللي تناسب مؤهلاتك، وقدّم عرضك.',
  staffPrimary: 'فتح لوحة التحكم',
  studentPrimary: 'انشر طلبًا',
  studentSecondary: 'تصفح المعلمين',
  studentNote: 'تعرف معلمك؟ تصفّح الملفات. ما تعرفه؟ اكتب وش تحتاج واستقبل عروض.',

  journeyTitle: 'طلباتك',
  journeyAll: 'عرض الكل',
  journeyFlag: 'إجراء مطلوب',
  journeyPriceLabel: 'السعر',
  journeyPay: 'متابعة الدفع',
  journeyTeacher: 'المعلم',
  journeyDelivery: 'التسليم',
  journeyUntitled: 'طلب تعلّم',
  journeyAwaitingPayment: 'بانتظار الدفع',
  journeyWaitingOffers: 'بانتظار العروض',
  journeyReviewOffers: 'مراجعة العروض',
  journeyView: 'عرض الطلب',
  journeyDuePrefix: 'الموعد ',
  journeyReservationPrefix: 'يتبقى على حجز الدفع ',
  journeyReservationSuffix: ' دقيقة',

  orbsLede: 'مجتمع تفصيل',
  orbStudents: 'طالب',
  orbTeachers: 'معلم',
  orbSessions: 'جلسة مكتملة',

  storyEyebrow: 'كيف تستخدم تفصيل؟',
  storyTitle: 'من سؤالك لشرح مفصّل لك',
  storyLede: 'عندك طريقتين تبدأ: اختر معلمك مباشرة، أو انشر طلبك واستقبل عروض. بعدها أرسل الجزئية اللي ودك تفهمها.',
  storyEntryLabel: 'اختر طريقة البدء',
  storyChooseTitle: 'اختر معلمك',
  storyChooseBody: 'قارن الملفات والأسعار وابدأ مع المعلم المناسب.',
  storyPostTitle: 'انشر طلبك',
  storyPostBody: 'اكتب وش تحتاج واستقبل عروض من معلمين مؤهلين.',
  storyCanvasTitle: 'طلب شرح مخصص',
  storyStepPrefix: 'الخطوة ',
  storyStepSuffix: ' من ٤',
  storyStepsLabel: 'مراحل طلب الشرح',
  storyUploadKicker: 'اللي ودك تفهمه',
  storyUploadTitle: 'اختر الملف أو اكتب سؤالك',
  storyUploadMeta: 'ارفع الجزئية مثل ما هي',
  storyDocName: 'الفصل الثالث — المعادلات',
  storyDocHeading: 'حل المعادلة',
  storyContextKicker: 'تفاصيلك تفرق',
  storyContextQuote: 'أنا فاهم أول الخطوات، بس ماني فاهم ليش تغيّرت الإشارة هنا.',
  storyContextLabel: 'الجزئية المحددة',
  storyContextSelection: 'ليش تغيّرت الإشارة في هالخطوة؟',
  storyTeacherKicker: 'قارن من ملف المعلم',
  storyTeacherEmpty: 'عروض المعلمين المؤهلين تظهر هنا إذا توفرت.',
  storyTeacherChoice: 'راجع التفاصيل واختر اللي يناسبك',
  storyRating: 'التقييم',
  storyDelivery: 'التسليم',
  storyPrice: 'السعر',
  storyCompleteKicker: 'تم التسليم',
  storyCompleteTitle: 'شرح مخصص للنقطة التي حددتها',
  storyCompleteBody: 'راجع الشرح على راحتك، وبعدها اعتمده أو اطلب تعديل.',
  storyOutputVideo: 'شرح مسجل',
  storyOutputNotes: 'ملخص مكتوب',

  kingdomEyebrow: 'المملكة العربية السعودية',
  kingdomTitle: 'ثلاث عشرة منطقة، منصة واحدة',
  kingdomSub: 'من تبوك لجازان، ومن الجوف للشرقية تلقى معلمين معتمدين وين ما كنت.',
  kingdomAria: 'خريطة توضيحية للمملكة العربية السعودية بمناطقها الإدارية الثلاث عشرة.',

  teachersLoading: 'جاري تحميل المعلمين…',
  teachersEmpty: 'لا يوجد معلمون متاحون للعرض الآن.',

  promoOff: 'خصم',
  promoRegion: 'عروض وأخبار المنصة',
  promoCodeLabel: 'استخدم الكود',
  promoCopy: 'نسخ',
  promoCopied: 'تم نسخ كود الخصم.',
  promoCountdown: 'ينتهي العرض خلال',
  promoDays: 'يوم',
  promoHours: 'ساعة',
  promoMinutes: 'دقيقة',
  promoDone: 'تم',
  promoClose: 'إغلاق'
} as const;

const ENGLISH: Record<keyof typeof ARABIC, string> = {
  heroLead: 'Skip the generic course',
  heroPrefix: 'Learn around your',
  heroSub: 'Upload your material, pick the timing, and get the exact part you need explained clearly',
  heroCta: 'Find teachers',
  heroJoin: 'Become a teacher',
  heroRotateMin: '8.6ch',
  searchLabel: 'Search for a teacher, subject, or lesson',
  searchPlaceholder: 'Subject, lesson, or teacher…',
  searchEmpty: 'Enter a teacher, subject, or lesson.',
  searchHint: 'Search results show matching teachers',
  uploadCta: 'Or upload your file',
  accountActions: 'Account actions',
  homeLabel: 'Back to the top of the page',
  browseAll: 'Browse all',

  teacherPrimary: 'View opportunities',
  teacherSecondary: 'Teacher dashboard',
  teacherNote: 'Review Student requests matched to your qualifications and send an Offer.',
  staffPrimary: 'Open dashboard',
  studentPrimary: 'Post a Request',
  studentSecondary: 'Browse teachers',
  studentNote: 'Already know a teacher? Browse profiles. If not, describe what you need and compare offers.',

  journeyTitle: 'Your requests',
  journeyAll: 'View all requests',
  journeyFlag: 'Action required',
  journeyPriceLabel: 'Price',
  journeyPay: 'Continue to payment',
  journeyTeacher: 'Teacher',
  journeyDelivery: 'Delivery',
  journeyUntitled: 'Learning request',
  journeyAwaitingPayment: 'Awaiting payment',
  journeyWaitingOffers: 'Waiting for Offers',
  journeyReviewOffers: 'Review Offers',
  journeyView: 'View request',
  journeyDuePrefix: 'Due ',
  journeyReservationPrefix: 'Payment reservation ends in ',
  journeyReservationSuffix: ' min',

  orbsLede: 'The Tafseel community',
  orbStudents: 'Students',
  orbTeachers: 'Teachers',
  orbSessions: 'Completed sessions',

  storyEyebrow: 'How Tafseel works',
  storyTitle: 'From your question to an explanation made for you',
  storyLede: 'Choose a teacher directly, or post your request and compare offers. Then share the exact part you want explained.',
  storyEntryLabel: 'Choose how to start',
  storyChooseTitle: 'Choose a teacher',
  storyChooseBody: 'Compare profiles, prices, and delivery, then start directly.',
  storyPostTitle: 'Post your request',
  storyPostBody: 'Describe what you need and receive offers from qualified teachers.',
  storyCanvasTitle: 'Custom explanation request',
  storyStepPrefix: 'Step ',
  storyStepSuffix: ' of 4',
  storyStepsLabel: 'Explanation request stages',
  storyUploadKicker: 'Your material',
  storyUploadTitle: 'Choose a file or question',
  storyUploadMeta: 'Upload exactly what you need to understand',
  storyDocName: 'Chapter 3 — Equations',
  storyDocHeading: 'Solve the equation',
  storyContextKicker: 'Your context matters',
  storyContextQuote: 'I understand the first steps, but I do not understand why the sign changed here.',
  storyContextLabel: 'Selected point',
  storyContextSelection: 'Why did the sign change in this step?',
  storyTeacherKicker: 'Compare from the public profile',
  storyTeacherEmpty: 'Qualified teacher offers appear here when available.',
  storyTeacherChoice: 'Choose after reviewing the details',
  storyRating: 'Rating',
  storyDelivery: 'Delivery',
  storyPrice: 'Price',
  storyCompleteKicker: 'Delivered',
  storyCompleteTitle: 'An explanation focused on the point you selected',
  storyCompleteBody: 'Review the explanation, then approve it or request a revision.',
  storyOutputVideo: 'Recorded explanation',
  storyOutputNotes: 'Written summary',

  kingdomEyebrow: 'Across the Kingdom',
  kingdomTitle: 'Thirteen regions, one platform',
  kingdomSub: 'From Tabuk to Jazan, from Al Jawf to the Eastern Province verified teachers wherever you are.',
  kingdomAria: 'A decorative map of Saudi Arabia showing its thirteen administrative regions.',

  teachersLoading: 'Loading teachers…',
  teachersEmpty: 'No teachers are available to feature right now.',

  promoOff: 'off',
  promoRegion: 'Platform offers and news',
  promoCodeLabel: 'Use the code',
  promoCopy: 'Copy',
  promoCopied: 'Discount code copied.',
  promoCountdown: 'Offer ends in',
  promoDays: 'days',
  promoHours: 'hrs',
  promoMinutes: 'min',
  promoDone: 'Done',
  promoClose: 'Close'
};

export type LandingCopy = Record<keyof typeof ARABIC, string>;

export function landingCopy(isArabic: boolean): LandingCopy {
  return isArabic ? ARABIC : ENGLISH;
}

/** The four narrative steps beside the story canvas. */
export function storySteps(isArabic: boolean): readonly StoryStepCopy[] {
  return isArabic
    ? [
      { title: 'ارفع الجزئية اللي وقفتك', body: 'ملف PDF، سلايدات، صورة شاشة، أو حتى سؤال محدد.' },
      { title: 'وضّح وين تحتاج الشرح', body: 'قل لنا وش فهمت، ووين بالضبط وقفت.' },
      { title: 'قارن واختر معلمك', body: 'شيّك على المؤهل والسعر ووقت التسليم قبل تختار.' },
      { title: 'استلم شرحًا على احتياجك', body: 'راجع النتيجة، وإذا احتجت اطلب تعديل.' }
    ]
    : [
      { title: 'Upload the part that stopped you', body: 'A PDF, slides, screenshot, or one focused question.' },
      { title: 'Show where you need help', body: 'Explain what you understand and the exact point where you got stuck.' },
      { title: 'Compare and choose your teacher', body: 'Review qualification, price, and delivery before choosing.' },
      { title: 'Receive an explanation made for you', body: 'Review the result and request a revision when needed.' }
    ];
}

/** How a payment moves, as the trust section draws it. */
export function escrowSteps(isArabic: boolean): readonly string[] {
  return isArabic
    ? [
      'تدفع بعد ما تقبل العرض',
      'تفصيل تحتفظ بالمبلغ بأمان',
      'المعلم يسلّم الخدمة',
      'تراجع النتيجة: تعتمدها، تطلب تعديل، أو تفتح نزاع',
      'بعد اعتمادك، يتحوّل المبلغ للمعلم'
    ]
    : [
      'Student pays when the offer is accepted',
      'Tafseel holds the payment securely',
      'Teacher delivers the service',
      'Student reviews: approve, request a revision, or open a dispute',
      'Payment is released to the teacher'
    ];
}

/**
 * The one figure the hero orbs do not carry. Student and teacher totals are
 * already the orbs, so repeating them here would be the same claim twice.
 */
export function scaleNote(subjects: string, isArabic: boolean): string {
  return isArabic
    ? `عندنا معلمون في ${subjects} مادة نشطة، وكل معلم يجتاز مراجعة الجودة قبل يستقبل الطلبات.`
    : `Across ${subjects} active subjects, with every teacher passing a quality review before taking requests.`;
}

/** The worked example on the story canvas: real, correct working, not greeked bars. */
export const STORY_DOC_LINES = [
  { text: '−2x + 8 = 14', marked: false },
  { text: '−2x = 14 − 8', marked: true },
  { text: '−2x = 6', marked: false },
  { text: 'x = −3', marked: false }
] as const;

export const STORY_FORMATS = ['PDF', 'PPT', 'PNG', 'JPG'] as const;
