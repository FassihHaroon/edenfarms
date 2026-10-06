/* Arabic text for the starting catalogue. Filled into empty Arabic fields on boot,
   never over text an admin has already written. */

export const CATEGORIES_AR = {
  mushrooms: { name: 'الفطر', note: 'تخصصنا' },
  vegetables: { name: 'الخضروات', note: 'من مزرعتنا' },
  herbs: { name: 'أعشاب طازجة', note: 'مقطوفة هذا الصباح' },
  honey: { name: 'عسل المزرعة', note: 'عسل سدر صافٍ' },
  boxes: { name: 'السلال', note: 'الثلاثي والصندوق والخضار' },
};

const FARM = 'مزرعة عدن، قطر';
const ORYX = 'أوريكس · مزرعة عدن';

export const PRODUCTS_AR = {
  'mush-white': {
    name: 'فطر الزر الأبيض', origin: ORYX, badge: 'تخصصنا', pack: 'عبوة 250 غ',
    taste: 'نكهة معتدلة ورقيقة ومتعددة الاستخدامات. رؤوس بيضاء متماسكة تبقى مقرمشة نيئةً وتكتسب لونًا ذهبيًا في المقلاة.',
    uses: ['السلطات', 'العجة', 'البيتزا', 'الأطباق السريعة'],
  },
  'mush-brown': {
    name: 'فطر بني', origin: ORYX, badge: 'تخصصنا', pack: 'عبوة 250 غ',
    taste: 'أغنى نكهة من الفطر الأبيض مع لمسة جوزية، وقوام لحمي يصمد في الطهي الطويل.',
    uses: ['المعكرونة', 'الريزوتو', 'اليخنات', 'الصلصات'],
  },
  'mush-porta': {
    name: 'فطر بورتابيلا', origin: ORYX, badge: 'تخصصنا', pack: '170 غ · رأسان',
    taste: 'رؤوس كبيرة مفتوحة بقوام غني يشبه اللحم. مثالية للشوي.',
    uses: ['الشوي', 'البرغر', 'المحشي', 'الباربكيو'],
  },
  peppers: { name: 'فلفل حلو أحمر وأصفر', origin: FARM, badge: 'قُطف اليوم' },
  corn: { name: 'ذرة حلوة', origin: FARM },
  chili: { name: 'فلفل أخضر حار طويل', origin: FARM },
  capsicum: { name: 'فلفل رومي أخضر وأصفر', origin: FARM },
  cucumbers: { name: 'خيار صغير', origin: FARM },
  beans: { name: 'فاصوليا خضراء', origin: FARM },
  tomatoes: { name: 'طماطم الحقل', origin: FARM },
  'cherry-tom': { name: 'طماطم كرزية على العنقود', origin: FARM },
  radish: { name: 'فجل أحمر', origin: FARM },
  coriander: { name: 'كزبرة طازجة', origin: FARM, badge: 'مقطوفة اليوم' },
  honey: { name: 'عسل السدر من مزرعة عدن', origin: FARM, badge: 'من مزرعتنا' },
};

export const BUNDLES_AR = {
  'box-trio': { name: 'ثلاثي الفطر', size: 'أبيض وبني وبورتابيلا · 3 عبوات', serves: 'كلها مقطوفة في الصباح نفسه', tag: 'تخصصنا' },
  'box-crate': { name: 'صندوق فطر الطهاة', size: '8 × 250 غ فطر أبيض · 2 كغ', serves: 'للمطاعم والحفلات والطبخات الكبيرة' },
  'box-veg': { name: 'سلة خضار عدن', size: 'فلفل وذرة وخيار وفاصوليا وكزبرة', serves: 'خضار المزرعة لأسبوع لـ 3–4 أشخاص' },
};

// Pack-size labels: exact matches first, then simple patterns ("500 g" -> "500 غ").
const UNIT_WORDS = {
  '1 pack': 'عبوة واحدة', '2 packs': 'عبوتان', '1 tray': 'صينية واحدة', '2 trays': 'صينيتان',
  '1 bunch': 'حزمة واحدة', '2 bunches': 'حزمتان', '1 jar': 'برطمان واحد', '2 jars': 'برطمانان',
  '1 pc': 'قطعة واحدة', '1 piece': 'قطعة واحدة', '1 box': 'صندوق واحد', '1 head': 'رأس واحد',
};
export function unitLabelAr(label) {
  const l = label.trim().toLowerCase();
  if (UNIT_WORDS[l]) return UNIT_WORDS[l];
  const m = l.match(/^(\d+(?:\.\d+)?)\s*(g|gm|grams?|kg|kilos?|packs?|trays?|bunch(?:es)?|jars?|cobs?|pcs?|pieces?|boxes?|heads?)$/);
  if (!m) return '';
  const words = { g: 'غ', gm: 'غ', gram: 'غ', grams: 'غ', kg: 'كغ', kilo: 'كغ', kilos: 'كغ', packs: 'عبوات', pack: 'عبوة',
    trays: 'صواني', tray: 'صينية', bunch: 'حزمة', bunches: 'حزم', jars: 'برطمانات', jar: 'برطمان', cobs: 'أكواز', cob: 'كوز',
    pc: 'قطعة', pcs: 'قطع', piece: 'قطعة', pieces: 'قطع', boxes: 'صناديق', box: 'صندوق', heads: 'رؤوس', head: 'رأس' };
  return `${m[1]} ${words[m[2]]}`;
}
