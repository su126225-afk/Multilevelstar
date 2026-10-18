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

## 4b. Writing (AI tekshiruv) — Gemini ulash

Writing bo'limi o'quvchi yozgan matnni Google Gemini orqali tekshiradi (band/daraja, xatolar, tavsiyalar). Gemini kaliti **faqat Supabase serverida** saqlanadi, brauzerga yoki GitHub'ga tushmaydi.

1. **Kalit olish:** https://aistudio.google.com/apikey → *Create API key* (bepul). Kalitni hech kimga yubormang.
2. **Bazani yangilash:** Supabase → *SQL Editor* → `schema.sql` faylining to'liq matnini qayta joylab *Run* qiling (xavfsiz, qayta ishlatsa bo'ladi). Yangi jadvallar paydo bo'ladi: `writing_tasks`, `writing_submissions`, `activity`.
3. **Funksiya yaratish:** Supabase → *Edge Functions* → *Deploy a new function* → *Via Editor*. Nomi: `check-writing`. Ichiga `check-writing.ts` (strukturali zipda `supabase/functions/check-writing/index.ts`) matnini joylang → *Deploy*.
4. **Kalitni sirlarga qo'shish:** *Edge Functions → Secrets* → `GEMINI_API_KEY` = sizning kalitingiz. (Ixtiyoriy: `GEMINI_MODEL` = masalan `gemini-3.5-flash-lite`; band bo'lsa funksiya o'zi zaxira modellarga o'tadi.)
5. Teacher panel → **Writing** → *Add 3 sample tasks* yoki o'zingizning topshiriqlaringizni qo'shing.

Bepul tarifda kunlik limit bor: bir vaqtda ko'p o'quvchi tekshirsa "AI is busy" chiqishi mumkin, bir daqiqadan so'ng qayta urinadi. Faqat to'g'ri guruh kodi kiritgan o'quvchilar AI'dan foydalana oladi.

## 4c. Saytda o'tkazilgan vaqt

Sayt o'quvchi **haqiqatan faol** bo'lgan vaqtni sanaydi (tab ochiq va oxirgi 1 daqiqada sichqoncha/klaviatura harakati bor; test ishlayotganda doim hisoblanadi). O'quvchi o'z sahifasida (*My results*) umumiy soat va oxirgi 14 kun grafigini, teacher panelda (*Students*) hammaning vaqti, faol kunlari, testlari va CSV eksportini ko'radi. Leaderboard ostida "Most active students" jadvali bor.

## 4d. Test paytida qulayliklar

Reading/Listening oynasida: matnni belgilab **highlight** (sariq/yashil/pushti, o'chirish), o'rtadagi chiziqni sudrab **panel o'lchami**, yuqoridagi **☰** menyuda rang (Dark / Light / High contrast), matn o'lchami (80–200 %) va ovoz balandligi. Tanlovlar eslab qolinadi.

## 5. Telegram orqali kirish (2-bosqich, hali qo'shilmagan)
Rejasi: o'quvchi "Continue with Telegram" bosadi → bot orqali tasdiqlanadi → server (Supabase Edge Function) botning `getChatMember` orqali @EnglishwithUsmonov kanaliga a'zoligini tekshiradi → faqat a'zolar kiradi.
Buning uchun kerak: @BotFather orqali bot (token), botni kanalga admin qilish, sayt uchun HTTPS domen (`/setdomain`). Tayyor bo'lganda `js/ui.js` dagi `requireStudent()` ni almashtirish kifoya — qolgan kod o'zgarmaydi.

## 6. Muhim cheklovlar (halol ogohlantirish)
- Test javoblari brauzerga yuklanadi (ish sayt ichida tekshiriladi), shuning uchun texnik bilimli o'quvchi javoblarni ko'rib olishi mumkin. Oddiy o'quvchilar uchun bu muammo emas; jiddiy imtihon uchun keyinroq serverda tekshirishga o'tkazish mumkin.
- Leaderboard natijalarini kod bilan soxtalashtirish nazariy jihatdan mumkin (faqat to'g'ri guruh kodi bilan). Telegram kirish bu xavfni kamaytiradi.
- Guruh kodini bilgan har kim kira oladi — kodlarni faqat o'z o'quvchilaringizga bering.

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
