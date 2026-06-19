import type { LandingLangCode } from './landingLanguages';
import { LANDING_LANGUAGES } from './landingLanguages';

export type LandingCopy = {
  metaTitle: string;
  metaDescription: string;
  navHome: string;
  navFeatures: string;
  navRoles: string;
  navContact: string;
  signIn: string;
  signUp: string;
  heroBadge: string;
  heroTitle1: string;
  heroTitle2: string;
  heroSubtitle: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  rolesTitle: string;
  roleCompanyTitle: string;
  roleCompanyText: string;
  roleGuideTitle: string;
  roleGuideText: string;
  roleHostTitle: string;
  roleHostTitleAccent: string;
  roleHostText: string;
  roleJobSeekerTitle: string;
  roleJobSeekerText: string;
  servicesLabel: string;
  servicesTitle: string;
  servicesSubtitle: string;
  serviceTransferTitle: string;
  serviceTransferDesc: string;
  serviceTransferF1: string;
  serviceTransferF2: string;
  serviceTransferF3: string;
  serviceTransferF4: string;
  serviceOneDayTitle: string;
  serviceOneDayDesc: string;
  serviceOneDayF1: string;
  serviceOneDayF2: string;
  serviceOneDayF3: string;
  serviceOneDayF4: string;
  serviceMultiDayTitle: string;
  serviceMultiDayDesc: string;
  serviceMultiDayF1: string;
  serviceMultiDayF2: string;
  serviceMultiDayF3: string;
  serviceMultiDayF4: string;
  featuresTitle: string;
  featureGpsTitle: string;
  featureGpsText: string;
  featureVoucherTitle: string;
  featureVoucherText: string;
  featureChatTitle: string;
  featureChatText: string;
  featureTourTitle: string;
  featureTourText: string;
  featureRatingTitle: string;
  featureRatingText: string;
  featureLangTitle: string;
  featureLangText: string;
  ctaTitle1: string;
  ctaTitle2: string;
  ctaSubtitle: string;
  ctaButton: string;
  footerTagline: string;
  footerCeo: string;
  footerCofounder: string;
  footerContact: string;
  footerSupportChat: string;
  footerRights: string;
  footerPrivacy: string;
  footerTerms: string;
};

const EN: LandingCopy = {
  metaTitle: 'KEKE Manager — B2B tourism ecosystem',
  metaDescription:
    'One platform for tourism companies, guide-drivers, hosts with own vehicles, and drivers seeking work. Bookings, GPS, vouchers, chat.',
  navHome: 'Home',
  navFeatures: 'Features',
  navRoles: 'Roles',
  navContact: 'Contact',
  signIn: 'Sign in',
  signUp: 'Register',
  heroBadge: 'B2B ecosystem in tourism',
  heroTitle1: 'One platform,',
  heroTitle2: 'unlimited possibilities',
  heroSubtitle:
    'Tourism companies, guide-drivers, drivers with own vehicles (hosts), and drivers looking for work — all together in one ecosystem.',
  heroCtaPrimary: 'Start for free →',
  heroCtaSecondary: '▶ See how it works',
  rolesTitle: '4 roles, one platform',
  roleCompanyTitle: 'Tourism company',
  roleCompanyText:
    'Create bookings, choose drivers, control your fleet in real time. Voucher, GPS and chat — together.',
  roleGuideTitle: 'Guide driver',
  roleGuideText:
    'Driver with own vehicle who is also a licensed guide. Speaks languages and leads tourists on the route.',
  roleHostTitle: 'Driver with own vehicle',
  roleHostTitleAccent: '(host)',
  roleHostText:
    'Speaks languages at a communicative level. Own several vehicles — find and assign drivers to your fleet.',
  roleJobSeekerTitle: 'Driver — job search',
  roleJobSeekerText:
    'Have experience but no vehicle? Hosts are looking for reliable drivers for their fleet.',
  servicesLabel: 'Services',
  servicesTitle: '3 services on one platform',
  servicesSubtitle: 'Choose the service you need — we guide you through the entire process',
  serviceTransferTitle: 'Transfer',
  serviceTransferDesc: 'From point A to B — fast, comfortable travel',
  serviceTransferF1: 'Airport transfers',
  serviceTransferF2: 'Hotel-to-hotel rides',
  serviceTransferF3: 'Real-time tracking',
  serviceTransferF4: 'Fixed pricing',
  serviceOneDayTitle: 'One-day tour',
  serviceOneDayDesc: 'A full-day excursion with stops and a guide',
  serviceOneDayF1: 'Multiple stops',
  serviceOneDayF2: 'Guide driver selection',
  serviceOneDayF3: 'Voucher with route',
  serviceOneDayF4: 'Flexible schedule',
  serviceMultiDayTitle: 'Multi-day tour',
  serviceMultiDayDesc: 'Complete tourist program with hotels and overnight stays',
  serviceMultiDayF1: 'Day-by-day calendar',
  serviceMultiDayF2: 'Overnight hotels',
  serviceMultiDayF3: 'Route for each day',
  serviceMultiDayF4: 'Voucher with all details',
  featuresTitle: 'Everything you need',
  featureGpsTitle: 'Real-time GPS',
  featureGpsText: 'See the driver on the map at any moment',
  featureVoucherTitle: 'PDF voucher',
  featureVoucherText: 'Auto-generated, one click',
  featureChatTitle: 'Three-way chat',
  featureChatText: 'Company, host, driver — together',
  featureTourTitle: 'Multi-day tour',
  featureTourText: 'Full route + hotels',
  featureRatingTitle: 'Rating',
  featureRatingText: 'Verified drivers + reviews',
  featureLangTitle: '33 languages',
  featureLangText: 'International platform',
  ctaTitle1: 'Ready to',
  ctaTitle2: 'get started?',
  ctaSubtitle: 'Register, pass verification and receive or launch your first booking',
  ctaButton: 'Register now →',
  footerTagline: 'B2B ecosystem in tourism',
  footerCeo: 'Akaki Kachibaia — CEO & FOUNDER',
  footerCofounder: 'Ani Kekelia — CO-FOUNDER',
  footerContact: 'Contact us',
  footerSupportChat: 'In-app support chat',
  footerRights: '© 2025 KEKE Manager',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
};

const KA: LandingCopy = {
  ...EN,
  metaTitle: 'KEKE Manager — B2B ეკოსისტემა ტურიზმში',
  metaDescription:
    'ერთი პლატფორმა ტურისტული კომპანიებისთვის, გიდ-მძღოლებისთვის, ჰოსტებისთვის და მძღოლებისთვის. ჯავშნები, GPS, ვაუჩერი, ჩატი.',
  navHome: 'მთავარი',
  navFeatures: 'ფუნქციები',
  navRoles: 'როლები',
  navContact: 'კონტაქტი',
  signIn: 'შესვლა',
  signUp: 'დარეგისტრირდი',
  heroBadge: 'B2B ეკოსისტემა ტურიზმში',
  heroTitle1: 'ერთი პლატფორმა,',
  heroTitle2: 'უსაზღვრო შესაძლებლობები',
  heroSubtitle:
    'ტურისტული კომპანიები, გიდ-მძღოლები, მძღოლები საკუთარი ავტოტრანსპორტით (ჰოსტები) და მძღოლები ვისაც სამსახური უნდათ — ყველა ერთად, ერთ ეკოსისტემაში.',
  heroCtaPrimary: 'დაიწყე ახლავე →',
  heroCtaSecondary: '▶ ნახე როგორ მუშაობს',
  rolesTitle: '4 როლი, ერთი პლატფორმა',
  roleCompanyTitle: 'ტურისტული კომპანია',
  roleCompanyText:
    'შექმენი ჯავშანი, აირჩიე მძღოლი, აკონტროლე ფლოტი რეალურ დროში. ვაუჩერი, GPS და ჩატი — ერთად.',
  roleGuideTitle: 'გიდ-მძღოლი',
  roleGuideText:
    'მძღოლი საკუთარი ავტოტრანსპორტით, რომელიც თან არის გიდი. ფლობს ენებს და უძღვება ტურისტებს მარშრუტზე.',
  roleHostTitle: 'მძღოლი საკუთარი ავტოტრანსპორტით',
  roleHostTitleAccent: '(ჰოსტი)',
  roleHostText:
    'ფლობს ენებს საკომუნიკაციო დონეზე. გყავს რამდენიმე მანქანა — შეგიძლია იპოვო და დასვა მძღოლები შენს ფლოტში.',
  roleJobSeekerTitle: 'მძღოლი — სამსახურის ძიება',
  roleJobSeekerText:
    'გაქვს გამოცდილება, არ გყავს მანქანა? ჰოსტები ეძებენ სანდო მძღოლებს თავიანთი ფლოტისთვის.',
  servicesLabel: 'სერვისები',
  servicesTitle: '3 სერვისი ერთ პლატფორმაზე',
  servicesSubtitle: 'აირჩიე სერვისი, რომელიც გჭირდება — ჩვენ ვუძღვებით სრულ პროცესს',
  serviceTransferTitle: 'ტრანსფერი',
  serviceTransferDesc: 'A წერტილიდან B-მდე — სწრაფი, კომფორტული მგზავრობა',
  serviceTransferF1: 'აეროპორტის ტრანსფერი',
  serviceTransferF2: 'სასტუმროებს შორის გადაყვანა',
  serviceTransferF3: 'რეალურ დროში tracking',
  serviceTransferF4: 'ფიქსირებული ფასი',
  serviceOneDayTitle: 'ერთდღიანი ტური',
  serviceOneDayDesc: 'მთელი დღის ექსკურსია გაჩერებებითა და გიდით',
  serviceOneDayF1: 'მრავალი გაჩერება',
  serviceOneDayF2: 'გიდ-მძღოლის შერჩევა',
  serviceOneDayF3: 'ვაუჩერი მარშრუტით',
  serviceOneDayF4: 'მოქნილი განრიგი',
  serviceMultiDayTitle: 'მრავალდღიანი ტური',
  serviceMultiDayDesc: 'სრული ტურისტული პროგრამა სასტუმროებითა და ღამისთევით',
  serviceMultiDayF1: 'კალენდრით დღეების მართვა',
  serviceMultiDayF2: 'ღამისთევის სასტუმროები',
  serviceMultiDayF3: 'ყოველი დღის მარშრუტი',
  serviceMultiDayF4: 'ვაუჩერი ყველა დეტალით',
  featuresTitle: 'ყველაფერი, რაც გჭირდება',
  featureGpsTitle: 'Real-time GPS',
  featureGpsText: 'ნახე მძღოლი რუკაზე ნებისმიერ მომენტში',
  featureVoucherTitle: 'ვაუჩერი PDF',
  featureVoucherText: 'ავტომატური გენერაცია, ერთი დაკლიკებით',
  featureChatTitle: 'სამმხრივი ჩატი',
  featureChatText: 'კომპანია, ჰოსტი, მძღოლი — ერთად',
  featureTourTitle: 'მრავალდღიანი ტური',
  featureTourText: 'სრული მარშრუტი + სასტუმროები',
  featureRatingTitle: 'რეიტინგი',
  featureRatingText: 'გადამოწმებული მძღოლები + შეფასებები',
  featureLangTitle: '33 ენა',
  featureLangText: 'საერთაშორისო პლატფორმა',
  ctaTitle1: 'მზად ხარ',
  ctaTitle2: 'დაიწყო?',
  ctaSubtitle: 'დარეგისტრირდი, გაიარე ვერიფიკაცია და მიიღე ან გაუშვი პირველი ჯავშანი',
  ctaButton: 'დარეგისტრირდი ახლავე →',
  footerTagline: 'B2B ეკოსისტემა ტურიზმში',
  footerCeo: 'Akaki Kachibaia — CEO & FOUNDER',
  footerCofounder: 'Ani Kekelia — CO-FOUNDER',
  footerContact: 'დაგვიკავშირდით',
  footerSupportChat: 'საფორტი ჩათი აპში',
  footerRights: '© 2025 KEKE Manager',
  footerPrivacy: 'კონფიდენციალურობა',
  footerTerms: 'წესები',
};

const RU: LandingCopy = {
  ...EN,
  metaTitle: 'KEKE Manager — B2B экосистема в туризме',
  metaDescription:
    'Одна платформа для туристических компаний, гид-водителей, хостов и водителей в поиске работы. Бронирования, GPS, ваучеры, чат.',
  navHome: 'Главная',
  navFeatures: 'Функции',
  navRoles: 'Роли',
  navContact: 'Контакты',
  signIn: 'Войти',
  signUp: 'Регистрация',
  heroBadge: 'B2B экосистема в туризме',
  heroTitle1: 'Одна платформа,',
  heroTitle2: 'безграничные возможности',
  heroSubtitle:
    'Туристические компании, гид-водители, водители со своим транспортом (хосты) и водители в поиске работы — всё в одной экосистеме.',
  heroCtaPrimary: 'Начать бесплатно →',
  heroCtaSecondary: '▶ Как это работает',
  rolesTitle: '4 роли, одна платформа',
  roleCompanyTitle: 'Туристическая компания',
  roleCompanyText:
    'Создавайте бронирования, выбирайте водителей, контролируйте флот в реальном времени. Ваучер, GPS и чат — вместе.',
  roleGuideTitle: 'Гид-водитель',
  roleGuideText:
    'Водитель со своим транспортом, который также лицензированный гид. Владеет языками и ведёт туристов по маршруту.',
  roleHostTitle: 'Водитель со своим транспортом',
  roleHostTitleAccent: '(хост)',
  roleHostText:
    'Владеет языками на коммуникативном уровне. Несколько машин — найдите и назначьте водителей в свой флот.',
  roleJobSeekerTitle: 'Водитель — поиск работы',
  roleJobSeekerText:
    'Есть опыт, но нет машины? Хосты ищут надёжных водителей для своего флота.',
  servicesLabel: 'Сервисы',
  servicesTitle: '3 сервиса на одной платформе',
  servicesSubtitle: 'Выберите нужный сервис — мы проведём вас через весь процесс',
  serviceTransferTitle: 'Трансфер',
  serviceTransferDesc: 'Из точки A в точку B — быстрая, комфортная поездка',
  serviceTransferF1: 'Трансфер из аэропорта',
  serviceTransferF2: 'Поездки между отелями',
  serviceTransferF3: 'Отслеживание в реальном времени',
  serviceTransferF4: 'Фиксированная цена',
  serviceOneDayTitle: 'Однодневный тур',
  serviceOneDayDesc: 'Экскурсия на весь день с остановками и гидом',
  serviceOneDayF1: 'Несколько остановок',
  serviceOneDayF2: 'Выбор гид-водителя',
  serviceOneDayF3: 'Ваучер с маршрутом',
  serviceOneDayF4: 'Гибкий график',
  serviceMultiDayTitle: 'Многодневный тур',
  serviceMultiDayDesc: 'Полная туристическая программа с отелями и ночёвками',
  serviceMultiDayF1: 'Управление днями в календаре',
  serviceMultiDayF2: 'Отели на ночь',
  serviceMultiDayF3: 'Маршрут на каждый день',
  serviceMultiDayF4: 'Ваучер со всеми деталями',
  featuresTitle: 'Всё, что вам нужно',
  featureGpsTitle: 'GPS в реальном времени',
  featureGpsText: 'Смотрите водителя на карте в любой момент',
  featureVoucherTitle: 'PDF ваучер',
  featureVoucherText: 'Автогенерация в один клик',
  featureChatTitle: 'Трёхсторонний чат',
  featureChatText: 'Компания, хост, водитель — вместе',
  featureTourTitle: 'Многодневный тур',
  featureTourText: 'Полный маршрут + отели',
  featureRatingTitle: 'Рейтинг',
  featureRatingText: 'Проверенные водители + отзывы',
  featureLangTitle: '33 языка',
  featureLangText: 'Международная платформа',
  ctaTitle1: 'Готовы',
  ctaTitle2: 'начать?',
  ctaSubtitle: 'Зарегистрируйтесь, пройдите верификацию и получите или создайте первое бронирование',
  ctaButton: 'Зарегистрироваться →',
  footerTagline: 'B2B экосистема в туризме',
  footerContact: 'Свяжитесь с нами',
  footerSupportChat: 'Чат поддержки в приложении',
  footerRights: '© 2025 KEKE Manager',
  footerPrivacy: 'Конфиденциальность',
  footerTerms: 'Условия',
};

const HY: LandingCopy = {
  ...EN,
  metaTitle: 'KEKE Manager — B2B տուրիստական էկոհամակարգ',
  metaDescription:
    'Մեկ հարթակ տուրիստական ընկերությունների, գիդ-վարորդների, հոստերի և աշխատանք փնտրող վարորդների համար։ Ամրագրումներ, GPS, վաուչերներ, չատ։',
  navHome: 'Գլխավոր',
  navFeatures: 'Ֆունկցիաներ',
  navRoles: 'Դերեր',
  navContact: 'Կապ',
  signIn: 'Մուտք',
  signUp: 'Գրանցվել',
  heroBadge: 'B2B էկոհամակարգ տուրիզմում',
  heroTitle1: 'Մեկ հարթակ,',
  heroTitle2: 'անսահմանափակ հնարավորություններ',
  heroSubtitle:
    'Տուրիստական ընկերություններ, գիդ-վարորդներ, սեփական մեքենայով վարորդներ (հոստեր) և աշխատանք փնտրող վարորդներ — բոլորը մեկ էկոհամակարգում։',
  heroCtaPrimary: 'Սկսել անվճար →',
  heroCtaSecondary: '▶ Ինչպես է աշխատում',
  rolesTitle: '4 դեր, մեկ հարթակ',
  roleCompanyTitle: 'Տուրիստական ընկերություն',
  roleCompanyText:
    'Ստեղծեք ամրագրումներ, ընտրեք վարորդներ, վերահսկեք ֆլոտը իրական ժամանակում։ Վաուչեր, GPS և չատ — միասին։',
  roleGuideTitle: 'Գիդ-վարորդ',
  roleGuideText:
    'Սեփական մեքենայով վարորդ, ով նաև լիցenzավորված գիդ է։ Խոսում է լեզուներով և ուղեկցում է զբոսաշրջիկներին։',
  roleHostTitle: 'Վարորդ սեփական մեքենայով',
  roleHostTitleAccent: '(հոստ)',
  roleHostText:
    'Խոսում է լեզուներով հաղորդակցական մակարդակով։ Մի քանի մեքենա — գտեք և назначեք վարորդներ ձեր ֆլոտում։',
  roleJobSeekerTitle: 'Վարորդ — աշխատանքի որոնում',
  roleJobSeekerText:
    'Փորձ ունե՞ք, բայց մեքենա չկա։ Հոստերը փնտրում են հուսալի վարորդներ իրենց ֆլոտի համար։',
  servicesLabel: 'Ծառայություններ',
  servicesTitle: '3 ծառայություն մեկ հարթակում',
  servicesSubtitle: 'Ընտրեք ձեզ անհրաժեշտ ծառայությունը — մենք կուղեկցենք ամբողջ գործընթացին',
  serviceTransferTitle: 'Տրանսֆեր',
  serviceTransferDesc: 'A կետից B — արագ և հարմարավետ երթ',
  serviceTransferF1: 'Օդանավակայանի տրանսֆեր',
  serviceTransferF2: 'Հotel-to-hotel',
  serviceTransferF3: 'Հետևում իրական ժամանակում',
  serviceTransferF4: 'Фиксված գին',
  serviceOneDayTitle: 'Միօրյա տուր',
  serviceOneDayDesc: 'Ամբողջ օրվա էքսկուրսիա կանգառներով և գիդով',
  serviceOneDayF1: 'Բազմաթիվ կանգառներ',
  serviceOneDayF2: 'Գիդ-վարորդի ընտրություն',
  serviceOneDayF3: 'Վաուչեր маршруտով',
  serviceOneDayF4: 'Гибкий ժամանակացույց',
  serviceMultiDayTitle: 'Բազմօրյա տուր',
  serviceMultiDayDesc: 'Ամբողջական ծրագիր հotelներով և գիշերակացներով',
  serviceMultiDayF1: 'Օրացույցով օրերի կառավարում',
  serviceMultiDayF2: 'Գիշերակացի հotelներ',
  serviceMultiDayF3: 'Օրական маршрут',
  serviceMultiDayF4: 'Վաուչեր բոլոր մանրամասներով',
  featuresTitle: 'Ամեն ինչ, ինչ ձեզ պետք է',
  featureGpsTitle: 'GPS իրական ժամանակում',
  featureGpsText: 'Տեսեք վարորդին քարտեզի վրա ցանկացած պահի',
  featureVoucherTitle: 'PDF վաուչեր',
  featureVoucherText: 'Ավտոմատ գեներացիա, մեկ սեղմումով',
  featureChatTitle: 'Եռակողմ չատ',
  featureChatText: 'Ընկերություն, հոստ, վարորդ — միասին',
  featureTourTitle: 'Բազմօրյա տուր',
  featureTourText: 'Ամբողջական маршрут + հotelներ',
  featureRatingTitle: 'Վարկանիշ',
  featureRatingText: 'Ստուգված վարորդներ + ակնարկներ',
  featureLangTitle: '33 լեզու',
  featureLangText: 'Միջազգային հարթակ',
  ctaTitle1: 'Պատրա՞ստ եք',
  ctaTitle2: 'սկսելու',
  ctaSubtitle: 'Գրանցվեք, անցեք վերահսկում և ստացեք կամ ստեղծեք առաջին ամրագրումը',
  ctaButton: 'Գրանցվել հիմա →',
  footerTagline: 'B2B էկոհամակարգ տուրիզմում',
  footerContact: 'Կապվեք մեզ հետ',
  footerSupportChat: 'Աջակցության չատ հավելվածում',
  footerRights: '© 2025 KEKE Manager',
  footerPrivacy: 'Գաղտնիություն',
  footerTerms: 'Պայմաններ',
};

const PRIMARY_LANDING: Partial<Record<LandingLangCode, LandingCopy>> = {
  ka: KA,
  en: EN,
  ru: RU,
  hy: HY,
};

function buildLandingRegistry(): Record<LandingLangCode, LandingCopy> {
  const out = {} as Record<LandingLangCode, LandingCopy>;
  for (const { code } of LANDING_LANGUAGES) {
    out[code] = PRIMARY_LANDING[code] ?? EN;
  }
  return out;
}

const LANDING_REGISTRY = buildLandingRegistry();

export function getLandingCopy(lang: LandingLangCode): LandingCopy {
  return LANDING_REGISTRY[lang] ?? EN;
}
