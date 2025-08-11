# Update Kit v3 – זרימת עדכונים מהירה (iPhone בלבד)

תאריך: 2025-08-11

## מה יש כאן?
- קבצי PWA מעודכנים (v3) עם כפתור **Export grid.json** (דמו).
- מיועד ל־Push מהאייפון לריפו GitHub, ולאחר מכן Netlify ישחרר Deploy אוטומטי.

---

## מסלול A – Working Copy (מומלץ)
1. התקן מה-App Store: **Working Copy**.
2. פתח → **Clone repository** → הדבק את ה-URL של הריפו שלך (למשל `https://github.com/<user>/Tashcez-pwa.git`).
3. פתח את ה-ZIP הזה ב-iOS → Share → **Open in Working Copy** → **Extract**.
4. **Move** את *כל הקבצים* לשורש הריפו ב-Working Copy (index.html, main.js, styles.css, sw.js, manifest.webmanifest, icons/).
5. ב-Working Copy: **Commit** → הודעה: `update: v3 + export grid.json` → **Push**.
6. אם Netlify מחובר לריפו – יחול Deploy אוטומטי, אחרת חבר אותו (ראו למטה).

## מסלול B – Safari (Desktop Mode)
1. בספארי כנס לריפו שלך → הקש על **AA** בשורת הכתובת → **Request Desktop Website**.
2. **Add file → Upload files**.
3. העלה את *כל הקבצים* מתוך ה-ZIP (לא את ה-ZIP עצמו).
4. Commit changes.

---

## חיבור Netlify לריפו (אם טרם חיברת)
1. כנס ל-**Netlify** → **Add new site → Import an existing project**.
2. התחבר ל-GitHub → בחר את הריפו שלך.
3. Build command: (ריק), Publish directory: `/`.
4. Deploy → תקבל כתובת `https://<שם>.netlify.app`.
5. פתח מהאייפון → Share → **Add to Home Screen**.

---

## בדיקה אחרי Deploy
- רענן את האפליקציה (סגור/פתח).
- כפתור **ייצא grid.json** ייצור קובץ `grid.json` להורדה (דמו).

---

## מה השלב הבא?
- נחליף את ה-Export הדמו ב-*grid.json אמיתי* שנוצר מזיהוי גריד (OpenCV.js) + סגמנטציה.
- נוסיף כפתור **שלח ל-API** שיקרא לשירות פתרון.
