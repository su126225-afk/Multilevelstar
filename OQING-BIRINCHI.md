# English with Usmonov — to'liq sayt paketi

Bu paketda hamma narsa bor: Reading, Listening, Writing (AI tekshiruv), Vocabulary Marathon,
online kurslar bloki, telefon uchun qulay ko'rinish va yangi dizayn.

## A) GitHub'ga joylash (2 daqiqa)
1. Zipni kompyuteringizda oching (Extract) — ichida 28 ta fayl chiqadi.
2. GitHub'da saytingiz repositorysiga kiring → **Add file → Upload files**.
3. Ochilgan papkadagi **hamma fayllarni** (papkaning o'zini emas) oynaga tashlang.
   Bir xil nomli fayllar avtomatik almashadi.
4. Pastda **Commit changes** bosing.
5. 1–2 daqiqa kuting (Actions bo'limida yashil belgi chiqadi), keyin saytda Ctrl+F5 bosing.

## B) Supabase'da bir marta (1 daqiqa)
1. supabase.com/dashboard → loyihangiz → **SQL Editor → New query**.
2. `schema.sql` faylini ochib, ichidagini to'liq nusxalab qo'ying → **Run**.
   (Qayta ishga tushirish xavfsiz, mavjud ma'lumotlar o'chmaydi. Bu yangi
   Vocabulary jadvallari va Writing'dagi `max_words` ustunini qo'shadi.)

## C) Writing AI funksiyasini yangilash (faqat bir marta)
1. Supabase → **Edge Functions → check-writing → Code**.
2. `check-writing.ts` ichidagini to'liq nusxalab eski kodning o'rniga qo'ying → **Deploy**.
3. Verify JWT o'chiq (OFF) bo'lib qolishi kerak. `GEMINI_API_KEY` Secrets'da turibdi — tegmang.

## D) Teacher panelda (https://…/#/admin)
- **Writing** → eski Multilevel tasklar bo'lsa o'chiring → "Import Multilevel Writing Sets 1–3"
  (endi 50 / 120–150 / 180–200 so'z chegaralari bilan).
- **Vocabulary** → "Import sample exams" (Topics 11–20 va 41–50). Yangi imtihon: "New exam",
  so'zlarni `english | uzbek | topic` ko'rinishida qatorma-qator yozing.

## E) Tekshiring
- Telefonda test oching: matn va savollar bir ekranda, o'rtasidan surib sozlanadi.
- Test paytida yuqorida **Online courses** tugmasi → @SARDOR_USM0NOV.
- **Vocabulary → Exams** → imtihon yeching → **Marathon leaderboard**da natija chiqadi.

## Muhim
- `config.js` ichida Supabase manzili va *publishable* kalit bor — bu ochiq bo'lishi xavfsiz.
  Gemini kalitini hech qachon faylga yozmang.
- Kurs matni, narx va havolani `config.js` dagi `coursesText`, `telegramPersonalUrl` orqali o'zgartirasiz.
- O'quvchilar ism + guruh kodi bilan kiradi (guruh kodi — parol vazifasida).
