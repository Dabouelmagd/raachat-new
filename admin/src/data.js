// بيانات تجريبية بالكامل — تُستبدل بنداءات API الحقيقية للباك إند
export const DAU = [4120,4180,4050,4290,4410,4380,4520,4610,4570,4720,4890,4830,4960,5120,5080,5230,5190,5340,5460,5420,5580,5710,5650,5820,5990,5940,6110,6280,6230,6410];
export const SIGNUPS = [["رقم التليفون",1820],["الإيميل",960],["دعوة صديق",540],["حملة إعلانية",310]];

export const USERS = [
  { id:"U-1042", name:"مريم عبد الله", contact:"01012345678", joined:"٢٠٢٦/٠٦/١٢", status:"active", wallet:1240, verified:true },
  { id:"U-1043", name:"يوسف كامل", contact:"yousef.k@mail.com", joined:"٢٠٢٦/٠٦/١٣", status:"active", wallet:310.5, verified:true },
  { id:"U-1051", name:"نور الهدى", contact:"01155550123", joined:"٢٠٢٦/٠٦/١٩", status:"active", wallet:0, verified:true },
  { id:"U-1060", name:"أحمد فتحي", contact:"01233334444", joined:"٢٠٢٦/٠٦/٢٤", status:"suspended", wallet:75, verified:true },
  { id:"U-1077", name:"سارة منير", contact:"sara.m@mail.com", joined:"٢٠٢٦/٠٧/٠٢", status:"active", wallet:520, verified:false },
  { id:"U-1081", name:"كريم عادل", contact:"01098761234", joined:"٢٠٢٦/٠٧/٠٤", status:"active", wallet:98.25, verified:true },
  { id:"U-1090", name:"هبة سليمان", contact:"01511112222", joined:"٢٠٢٦/٠٧/٠٩", status:"banned", wallet:0, verified:true },
  { id:"U-1099", name:"حساب محذوف", contact:"—", joined:"٢٠٢٦/٠٧/١١", status:"deleted", wallet:0, verified:true },
  { id:"U-1104", name:"محمود السيد", contact:"mahmoud.s@mail.com", joined:"٢٠٢٦/٠٧/١٥", status:"active", wallet:2210, verified:true },
  { id:"U-1112", name:"دينا حسام", contact:"01077778888", joined:"٢٠٢٦/٠٧/٢١", status:"active", wallet:46, verified:false },
  { id:"U-1125", name:"عمر خالد", contact:"01266667777", joined:"٢٠٢٦/٠٨/٠١", status:"active", wallet:680, verified:true },
  { id:"U-1138", name:"ليلى مصطفى", contact:"laila.m@mail.com", joined:"٢٠٢٦/٠٨/١٠", status:"active", wallet:15, verified:true },
  { id:"U-1149", name:"طارق نبيل", contact:"01044445555", joined:"٢٠٢٦/٠٩/٠٣", status:"suspended", wallet:300, verified:true },
];

export const GROUPS = [
  { id:"G-201", name:"مجموعة الشغل 💼", owner:"مريم عبد الله", members:4, reports:0, status:"active" },
  { id:"G-202", name:"فريق التصميم", owner:"نور الهدى", members:4, reports:0, status:"active" },
  { id:"G-218", name:"مطوّرين عرب", owner:"يوسف كامل", members:1280, reports:2, status:"active" },
  { id:"G-224", name:"عشّاق الكورة ⚽", owner:"محمود السيد", members:3410, reports:5, status:"active" },
  { id:"G-231", name:"عروض وخصومات", owner:"هبة سليمان", members:612, reports:9, status:"restricted" },
];
export const ROOMS = [
  { id:"R-31", name:"نقاش كورة الليلة ⚽", host:"محمود السيد", live:214, peak:402, stealth:38, status:"live" },
  { id:"R-32", name:"حكي بنات ☕", host:"سارة منير", live:88, peak:150, stealth:61, status:"live" },
  { id:"R-33", name:"أفكار مشاريع 💡", host:"عمر خالد", live:42, peak:97, stealth:12, status:"live" },
  { id:"R-34", name:"مراجعة أفلام", host:"دينا حسام", live:0, peak:64, stealth:7, status:"ended" },
];

export const REPORTS = [
  { id:"RP-901", type:"رسالة", target:"أحمد فتحي", reporter:"مريم عبد الله", reason:"إساءة لفظية", text:"«…نص الرسالة المبلّغ عنها يظهر هنا…»", where:"جروب: عشّاق الكورة", time:"منذ ١٠ دقائق", status:"open" },
  { id:"RP-902", type:"غرفة", target:"غرفة: حكي بنات ☕", reporter:"يوسف كامل", reason:"محتوى غير لائق", text:"بلاغ عن حديث صوتي أثناء الغرفة", where:"غرفة صوتية", time:"منذ ٣٥ دقيقة", status:"open" },
  { id:"RP-903", type:"Story", target:"هبة سليمان", reporter:"سارة منير", reason:"إعلان مزعج / احتيال", text:"Story تروّج لرابط خارجي مشبوه", where:"Stories", time:"منذ ساعة", status:"open" },
  { id:"RP-904", type:"مستخدم", target:"طارق نبيل", reporter:"كريم عادل", reason:"انتحال شخصية", text:"الحساب يستخدم اسم وصورة شخص آخر", where:"ملف شخصي", time:"منذ ٣ ساعات", status:"open" },
  { id:"RP-905", type:"رسالة", target:"دينا حسام", reporter:"عمر خالد", reason:"رسائل مزعجة (Spam)", text:"رسائل متكررة بروابط ترويجية", where:"محادثة خاصة", time:"أمس", status:"open" },
];

export const TX = [
  { id:"RC-622257", user:"مريم عبد الله", service:"كهرباء", amount:267.75, fee:2.7, status:"done", time:"اليوم ١٠:٤٢" },
  { id:"RC-622104", user:"يوسف كامل", service:"شحن رصيد", amount:50, fee:0.5, status:"done", time:"اليوم ٠٩:٥٥" },
  { id:"RC-621988", user:"محمود السيد", service:"إنترنت", amount:349, fee:3.5, status:"done", time:"اليوم ٠٩:١٠" },
  { id:"RC-621870", user:"سارة منير", service:"مياه", amount:88.4, fee:0.9, status:"failed", time:"أمس ٢٣:٢٠" },
  { id:"RC-621755", user:"عمر خالد", service:"فاتورة موبايل", amount:210, fee:2.1, status:"done", time:"أمس ٢٠:٠٥" },
  { id:"RC-621640", user:"ليلى مصطفى", service:"غاز", amount:132.25, fee:1.3, status:"pending", time:"أمس ١٨:٣٠" },
  { id:"RC-621512", user:"كريم عادل", service:"تأمين", amount:1450, fee:14.5, status:"done", time:"أمس ١٢:١٥" },
  { id:"RC-621399", user:"دينا حسام", service:"تليفون أرضي", amount:76, fee:0.8, status:"refunded", time:"٢ أكتوبر" },
];
export const PROVIDERS = [
  { key:"elec", name:"كهرباء", biller:"شركة توزيع الكهرباء", on:true, fee:1.0, vol:182400 },
  { key:"water", name:"مياه", biller:"شركة مياه الشرب", on:true, fee:1.0, vol:64200 },
  { key:"gas", name:"غاز", biller:"شركة الغاز الطبيعي", on:true, fee:1.0, vol:51800 },
  { key:"net", name:"إنترنت", biller:"مزود الإنترنت المنزلي", on:true, fee:1.0, vol:143900 },
  { key:"topup", name:"شحن رصيد", biller:"شحن رصيد موبايل", on:true, fee:1.0, vol:97300 },
  { key:"mobile", name:"فاتورة موبايل", biller:"فاتورة خط محمول", on:true, fee:1.0, vol:88100 },
  { key:"landline", name:"تليفون أرضي", biller:"التليفون الأرضي", on:false, fee:1.0, vol:12600 },
  { key:"insurance", name:"تأمين", biller:"قسط تأمين", on:true, fee:1.0, vol:211500 },
];
export const OFFERS = [
  { code:"RA10", percent:10, max:30, applies:"كهرباء، مياه", expires:"٢٠٢٦/١٢/٣١", used:1284, on:true },
  { code:"NET15", percent:15, max:50, applies:"إنترنت، تليفون أرضي", expires:"٢٠٢٦/١١/٣٠", used:642, on:true },
  { code:"TOP5", percent:5, max:15, applies:"شحن رصيد، فاتورة موبايل", expires:"٢٠٢٦/١٠/٣١", used:3120, on:true },
];

export const GRADS = [
  ["أحمر فرعوني","linear-gradient(135deg,#E1523E,#5B2621)"],["ذهبي","linear-gradient(135deg,#C9A227,#5B2621)"],
  ["مرجاني","linear-gradient(135deg,#F2795C,#5B2621)"],["قهوة","linear-gradient(135deg,#7a4a2a,#14100F)"],
  ["ليل","linear-gradient(135deg,#2b2118,#C9A227)"],["عنابي","linear-gradient(135deg,#5B2621,#14100F)"],
];
export const PLACEMENTS = { modal:"نافذة كاملة", banner:"بانر الدردشات", services:"بانر الخدمات" };
export const AUDIENCES = ["كل المستخدمين","مستخدمو المحفظة","مستخدمو الغرف الصوتية","مستخدمون جدد (7 أيام)","غير نشطين 30 يوم"];
const C=(id,advertiser,headline,body,cta,grad,placements,start,end,budget,spent,cpm,audience,priority,dailyCap,impressions,clicks,status)=>({id,advertiser,headline,body,cta,link:"https://example.com/"+id.toLowerCase(),grad,placements,start,end,budget,spent,cpm,audience,priority,dailyCap,impressions,clicks,status});
export const CAMPAIGNS = [
  C("AD-11","كافيه النيل","قهوتك الصبحية علينا ☕","اطلب أول مشروب واحصل على الثاني مجانًا طوال هذا الأسبوع.","اطلب الآن",3,{modal:true,banner:true,services:false},"2026-10-01","2026-10-31",6000,4200,87,"كل المستخدمين",2,3,48200,1930,"active"),
  C("AD-12","متجر الفرعون","خصم ٣٠٪ على الإلكترونيات","عروض نهاية الأسبوع على الموبايلات والسماعات مع شحن مجاني.","تسوّق",0,{modal:true,banner:true,services:true},"2026-10-03","2026-11-03",10000,7800,126,"مستخدمو المحفظة",3,4,61900,2850,"active"),
  C("AD-13","أكاديمية سِفر","اتعلم برمجة من الصفر 💻","دورة مكثفة بالعربي مع مشاريع عملية وشهادة إتمام.","سجّل",4,{modal:false,banner:true,services:false},"2026-09-20","2026-10-20",4000,3100,93,"مستخدمون جدد (7 أيام)",1,2,33400,1420,"active"),
  C("AD-14","تأمين الأمان","أمّن عربيتك في دقيقتين","قسّط وثيقتك على ١٢ شهر بدون فوايد.","اعرف أكتر",5,{modal:true,banner:false,services:true},"2026-10-12","2026-11-12",8000,0,0,"مستخدمو المحفظة",2,2,0,0,"pending"),
  C("AD-15","مطعم ست الحبايب","وجبة عائلية بسعر خاص 🍗","٤ أفراد + مشروبات بـ ٢٤٩ ج.م لفترة محدودة.","احجز",2,{modal:false,banner:true,services:false},"2026-09-25","2026-10-25",3000,2200,79,"كل المستخدمين",1,2,27800,960,"paused"),
  C("AD-16","رحلات واحة","إجازة نهاية الأسبوع 🌴","٣ أيام في سيوة شاملة الإقامة والمواصلات.","احجز رحلتك",1,{modal:true,banner:true,services:false},"2026-10-15","2026-11-15",5000,0,0,"كل المستخدمين",2,3,0,0,"pending"),
];
export const AD_DAILY = [5210,5380,5120,5640,5890,5470,5920,6150,6020,6380,6610,6290,6740,6900,6680,7120,7340,7010,7460,7690,7380,7810,8050,7720,8240,8460,8130,8590,8820,8710];
export const STORIES = [
  { id:"S-71", user:"مريم عبد الله", caption:"صباح الخير ☀️", views:312, time:"منذ ساعتين", reports:0 },
  { id:"S-72", user:"هبة سليمان", caption:"عرض خاص — اضغط على الرابط", views:98, time:"منذ ٤ ساعات", reports:3 },
  { id:"S-73", user:"عمر خالد", caption:"يوم تصوير جديد 📸", views:204, time:"منذ ٦ ساعات", reports:0 },
];
export const BROADCASTS = [
  { id:"N-5", title:"خدمة جديدة: دفع فواتير التأمين", audience:"كل المستخدمين", sent:"٢٠٢٦/١٠/٠٢", reach:6102, opened:"٣٨٪" },
  { id:"N-4", title:"خصم ١٠٪ على الكهرباء", audience:"مستخدمو المحفظة", sent:"٢٠٢٦/٠٩/٢٨", reach:3411, opened:"٤٦٪" },
];
export const ADMINS = [
  { id:"A-1", name:"داليا (المالك)", email:"dalia.abouelmagd@gmail.com", role:"owner", last:"الآن" },
  { id:"A-2", name:"محمد سعد", email:"m.saad@rachat.example", role:"manager", last:"منذ ساعة" },
  { id:"A-3", name:"إيمان فؤاد", email:"eman@rachat.example", role:"moderator", last:"منذ ٣ ساعات" },
  { id:"A-4", name:"رامي جابر", email:"rami@rachat.example", role:"accountant", last:"أمس" },
];
export const ROLES = { owner:"مالك", manager:"مدير", moderator:"مشرف محتوى", support:"دعم فني", accountant:"محاسب" };
export const PERMS = [
  ["المستخدمون", { owner:1, manager:1, moderator:0, support:1, accountant:0 }],
  ["الجروبات والغرف", { owner:1, manager:1, moderator:1, support:0, accountant:0 }],
  ["البلاغات", { owner:1, manager:1, moderator:1, support:0, accountant:0 }],
  ["المحتوى (Stories)", { owner:1, manager:1, moderator:1, support:0, accountant:0 }],
  ["المدفوعات", { owner:1, manager:0, moderator:0, support:0, accountant:1 }],
  ["العروض والإعلانات", { owner:1, manager:1, moderator:0, support:0, accountant:0 }],
  ["الإعدادات والأدوار", { owner:1, manager:0, moderator:0, support:0, accountant:0 }],
];
export const AUDIT_SEED = [
  { who:"محمد سعد", what:"أوقف حساب أحمد فتحي (U-1060)", when:"اليوم ٠٩:٣٠" },
  { who:"إيمان فؤاد", what:"حذف رسالة من جروب عشّاق الكورة", when:"أمس ٢١:١٠" },
  { who:"رامي جابر", what:"استرد عملية RC-621399", when:"٢ أكتوبر ١٦:٤٠" },
  { who:"داليا (المالك)", what:"فعّل الكود TOP5", when:"٣٠ سبتمبر ١١:٠٠" },
];
