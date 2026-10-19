# To'liq sayt paketi — Telegram kirish bilan

## 1. GitHub
Zipni oching -> repo -> Add file -> Upload files -> HAMMA fayllarni tashlang -> Commit changes.

## 2. Supabase: SQL (agar hali qilmagan bo'lsangiz)
SQL Editor -> schema.sql ichidagini to'liq qo'yib Run.

## 3. Supabase: yangi funksiya tg-auth
1. Edge Functions -> Deploy a new function -> Via Editor. Nomi: tg-auth (aynan shunday).
2. Ichiga tg-auth.ts matnini to'liq qo'ying -> Deploy.
3. Funksiya Settings'ida "Verify JWT" ni O'CHIRING (OFF) va saqlang.

## 4. Supabase: Secrets
Edge Functions -> Secrets:
- TELEGRAM_BOT_TOKEN = BotFather bergan token
- TELEGRAM_CHANNEL = @EnglishwithUsmonov

## 5. Telegramda
- Kanal @EnglishwithUsmonov -> Administrators -> @multilevelstarbot ni admin qiling.
- BotFather -> /setdomain -> @multilevelstarbot -> sayt manzilingiz (masalan username.github.io)

## 6. Tekshirish
Saytda test boshlang: "Sign in with Telegram" chiqadi. A'zo bo'lmasa "Please subscribe first".
Telegram kirishni vaqtincha o'chirish: config.js da requireChannel: false.
