# English with Usmonov — IELTS & Multilevel mashq sayti

O'quvchilar **Reading** va **Listening** testlarini (Multilevel va IELTS) ishlaydi, natijalar saqlanadi, **leaderboard** bor.
Siz (o'qituvchi) admin paneldan Reading/Listening testlarini o'zingiz qo'shasiz. Speaking keyingi bosqichda qo'shiladi.

Ichida **25 ta tayyor test** bor: 21 ta Multilevel Reading (shu jumladan 18–21 "Interactive" — so'zni ikki marta bosganda o'zbekcha tarjima chiqadi) va 4 ta Multilevel Listening. Hammasi yuborgan simulyatorlaringizdan avtomatik o'tkazilgan va to'g'ri javoblar bilan tekshirilgan.

---

## 1. Kompyuteringizda tez ko'rish (DEMO rejimi)

Papka ichida terminal oching:

```bash
python3 -m http.server 8000
```

Brauzerda `http://localhost:8000` ni oching. (Fayl ustiga ikki marta bosish ishlamaydi, sayt `http.server` orqali ochilishi kerak.)

- O'quvchi sifatida: ism yozing, guruh kodi: **DEMO**
- O'qituvchi paneli: pastdagi **Teacher login** → parol: **admin123** (`js/config.js` da o'zgartirish mumkin)
- DEMO rejimda ma'lumotlar faqat shu brauzerda saqlanadi. O'quvchilar bir-birining natijasini ko'rishi uchun 2-bosqich (Supabase) kerak.

---

## 2. Haqiqiy ishga tushirish (bepul, ~15 daqiqa)

### A) Supabase (ma'lumotlar bazasi)
1. https://supabase.com da ro'yxatdan o'ting → **New project** (Free reja yetarli).
2. **SQL Editor → New query** ga `supabase/schema.sql` faylining hammasini qo'yib **Run** bosing.
3. **Authentication → Users → Add user**: o'zingizning email va parolingizni kiriting (bu *o'qituvchi hisobi*).
4. ⚠️ **Authentication → Sign In / Providers → "Allow new users to sign up"** ni **O'CHIRING**. Aks holda begonalar ham o'qituvchi bo'lib kirib qolishi mumkin.
5. **Project Settings → API**: `Project URL` va `anon public` kalitni nusxalang.
6. `js/config.js` ni oching va ikkalasini qo'ying:
   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'eyJ...',
   ```

### B) Saytni internetga chiqarish
Eng oson yo'l: https://app.netlify.com/drop — **butun papkani** (node_modules'siz) sahifaga tashlang. Tayyor havola beriladi.
Muqobil: Vercel, Cloudflare Pages yoki GitHub Pages (hammasi bepul, build kerak emas).

### C) Birinchi kirish
1. `https://sizning-saytingiz/#/admin` → Supabase'da yaratgan email/parolingiz bilan kiring.
2. **Groups** → guruh qo'shing (masalan `IELTS-7`). O'quvchilarga shu kodni bering.
3. **Tests → Import bundled tests** — 25 ta tayyor testni bazaga yuklaydi (bir marta).

---

## 3. Test qo'shish (Teacher panel → Tests → New test)

Har bir savol — **bitta qator**: `savol :: variantlar yoki tur :: javob`

```
Why did she leave? :: A) She was tired | B) She was late | C) She was ill :: B
The author supports the plan. :: TFNG :: Not Given
The museum is in the ___ of town. :: GAP :: centre / center
Paragraph 15 :: MATCH :: D
```

- `TFNG` = True/False/Not Given, `YNNG` = Yes/No/Not Given
- `MATCH` — qismning "Options" ro'yxatidan (A, B, C…) harf tanlash (sarlavhalar, A–J ro'yxat, xarita uchun)
- Matn ichidagi bo'sh joy: `Going into a dark [[cave]] needs courage` — javob `[[ ]]` ichida. Bir nechta to'g'ri javob `/` bilan: `[[7.30/7:30/half past seven]]`
- Savollar avtomatik 1, 2, 3… raqamlanadi. Xato bo'lsa qizil rangda qaysi qatorda ekani ko'rsatiladi.

**Listening:** bitta audio faylni yuklang (yoki `audio/` papkaga qo'yib `audio/fayl.mp3` deb yozing) va har bir qism uchun vaqtlarni (m:ss) kiriting — qismlar audio bilan birga avtomatik almashadi, o'qish/tekshirish 30 soniyalari ko'rsatiladi. Vaqtlar kiritilmasa, o'quvchi qismlarni o'zi almashtiradi.
Supabase Free rejasida bitta fayl 50 MB gacha. Fayl yuklash tugmasi faqat Supabase ulanganda ishlaydi.

## 4. Natijalar va leaderboard
- Har bir test tugagach natija bazaga yoziladi: ball, band/daraja, vaqt, har bir savol bo'yicha javoblar.
- IELTS testlar **band** (9.0 gacha), Multilevel testlar **daraja** (B1 / B2 / C1, 75 ballik shkala) bilan baholanadi. Shkala taxminiy.
- Leaderboard har bir o'quvchining *har bir test bo'yicha eng yaxshi urinishi* o'rtachasi bo'yicha tartiblanadi; section, format, test, guruh va davr (bugun/hafta) bo'yicha filtr bor.
- **Teacher panel → Results**: filtr, o'chirish, **CSV eksport**.

## 5. Telegram orqali kirish (2-bosqich, hali qo'shilmagan)
Rejasi: o'quvchi "Continue with Telegram" bosadi → bot orqali tasdiqlanadi → server (Supabase Edge Function) botning `getChatMember` orqali @EnglishwithUsmonov kanaliga a'zoligini tekshiradi → faqat a'zolar kiradi.
Buning uchun kerak: @BotFather orqali bot (token), botni kanalga admin qilish, sayt uchun HTTPS domen (`/setdomain`). Tayyor bo'lganda `js/ui.js` dagi `requireStudent()` ni almashtirish kifoya — qolgan kod o'zgarmaydi.

## 5b. Ota-onalar portali (davomat, uy vazifasi, to'lov)
Ota-ona yoki o'quvchi **`#/family`** sahifasiga (saytdagi pastki havola: "Parents · Ota-onalar") o'qituvchi bergan **12 xonali shaxsiy raqam** bilan kiradi va faqat o'z farzandining haftalik davomati, uy vazifasi va to'lov holatini ko'radi (faqat ko'rish).

**Haftalik ish tartibi (o'qituvchi paneli):**
1. **Students** — guruhni tanlab, ismlarni qo'shing. Har biriga shaxsiy raqam avtomatik yaratiladi. "Taklif" tugmasi ota-onaga yuboriladigan tayyor o'zbekcha xabarni nusxalaydi. Raqam tarqalib qolsa — "Yangi raqam"; o'quvchi ketsa — "Pauza" (kirish darhol yopiladi).
2. **Attendance** — dars sanasi, mavzu va uy vazifasini kiriting; har o'quvchiga: keldi / kechikdi / kelmadi / sababli, uy vazifasi: bajardi / qisman / bajarmadi.
3. **Weekly report** — hafta bo'yicha jadval va umumiy ko'rsatkichlar. Past ko'rsatkichlar (davomat 70% dan, vazifa 50% dan kam) qizil. "Xabar" tugmasi har ota-ona uchun chiroyli o'zbekcha haftalik xabar tayyorlaydi (Telegramga joylang), CSV yuklab olish ham bor.
4. **Payments** — oylik summa va to'langan miqdorni kiriting. Onlayn to'lov yo'q, holatni o'qituvchi qo'lda kiritadi.

**Hisoblash qoidalari:** kechikish — kelgan hisoblanadi; "sababli" davomat foiziga kirmaydi; uy vazifasida faqat "bajardi" hisoblanadi; ma'lumot bo'lmasa foiz o'rniga "—".

**Ishga tushirish uchun shart:** DEMO rejimida ma'lumot faqat sizning brauzeringizda saqlanadi — boshqa telefondagi ota-ona ko'ra olmaydi. Haqiqiy foydalanish uchun Supabase'ni ulang (2-bo'lim) va **yangilangan `schema.sql` ni SQL Editor'da qayta ishga tushiring** (u xavfsiz, qayta ishlatish mumkin). Jadvallarga faqat o'qituvchi kira oladi; ota-ona faqat raqam orqali `portal_report` funksiyasidan o'z farzandining ma'lumotini oladi, noto'g'ri raqamlar urinishi cheklanadi.

## 6. Muhim cheklovlar (halol ogohlantirish)
- Test javoblari brauzerga yuklanadi (ish sayt ichida tekshiriladi), shuning uchun texnik bilimli o'quvchi javoblarni ko'rib olishi mumkin. Oddiy o'quvchilar uchun bu muammo emas; jiddiy imtihon uchun keyinroq serverda tekshirishga o'tkazish mumkin.
- Leaderboard natijalarini kod bilan soxtalashtirish nazariy jihatdan mumkin (faqat to'g'ri guruh kodi bilan). Telegram kirish bu xavfni kamaytiradi.
- Guruh kodini bilgan har kim kira oladi — kodlarni faqat o'z o'quvchilaringizga bering.
- Shaxsiy raqamlar (12 xona) parol vazifasini bajaradi: faqat ota-onaga bering, ommaviy guruhga tashlamang. Supabase'da o'qituvchi hisobi yagona bo'lsin va **ro'yxatdan o'tish (sign-ups) o'chirilgan** bo'lsin — aks holda har bir ro'yxatdan o'tgan kishi o'qituvchi hisoblanadi.
- Demo rejimidagi o'qituvchi paroli (`admin123`) ochiq — haqiqiy ma'lumot kiritishdan oldin Supabase'ga o'ting.
- Eski `results_read` qoidasi natijalarni hamma o'qiy oladigan qiladi (leaderboard uchun); ota-ona portaliga aloqasi yo'q, lekin bilib qo'ying.
- Portal SQL'i mahalliy Postgres'da sinalgan; jonli Supabase loyihangizda birinchi marta sinab ko'ring (to'g'ri raqam, noto'g'ri raqam).

## 7. Yangi simulyatorlarni qayta import qilish
```bash
npm install
node tools/import-simulators.mjs papka/yoki/fayl.html ...
```
`data/tests.json`, `audio/` va `img/` ni qayta yozadi. Keyin admin panelda **Import bundled tests**.

## 8. Fayllar
```
index.html            sahifa qobig'i
css/style.css         dizayn (qorong'u/yorug' tema)
js/config.js          SOZLAMALAR (brend, Supabase kalitlari, demo parol)
js/logic.js           savol formati, baholash, band, leaderboard (testlangan)
js/store.js           ma'lumotlar: DEMO (brauzer) yoki Supabase
js/views-student.js   bosh sahifa, testlar, test oynasi, natija, leaderboard
js/views-admin.js     o'qituvchi paneli va test muharriri
supabase/schema.sql   bazani yaratish
data/tests.json       25 ta tayyor test
audio/  img/          Listening audiolari va xaritalar
tests/                avtomatik testlar:  npm install && npm test
```
