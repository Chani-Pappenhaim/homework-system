# תעודות root של נטפרי

הרשת מיירטת SSL (SSL inspection). בלי תעודות ה-root האלה, כל קריאה יוצאת מהקונטיינר
נכשלת עם `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — כולל הקריאות ל-Gemini API
(יצירת חידונים ובדיקת הגשות), שנראו בממשק כ-`Cannot reach the Gemini API: fetch failed`.

## למה הן מקומיטות ולא מורדות ב-build

ה-Dockerfile הוריד קודם את `https://netfree.link/cacert/united/x2/unix.sh`, שמתקין
**רק** את משפחת ה-root ששמה מכיל `X2`. אבל שרשרת התעודות ברשת הזו היא:

```
upload.video.google.com
  └─ NetFree Node Intermediate CA, 019 Telzar
      └─ NetFree Intermediate CA 2026#06
          └─ NetFree Root CA 1990-2200 RSA     ← בלי X2. לא הותקן.
```

לכן האימות נכשל למרות שהתעודות "הותקנו". התיקייה הזו מכילה את **שתי המשפחות**,
כך שהאימות עובד גם אם הספק או משפחת התעודות ישתנו.

יתרון נוסף: ה-build כבר לא תלוי בכך ש-`netfree.link` נגיש.

אלה תעודות root ציבוריות — אין כאן שום מידע סודי.

## לרענן את התעודות

מ-PowerShell, מייצא כל תעודת root של נטפרי ממאגר Windows לקובץ נפרד:

```powershell
$dir = "C:\tehila\homework-system\backend\certs\netfree"
$certs = Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root |
  Where-Object { $_.Subject -like "*O=NetFree*" -and $_.Subject -like "*Root CA*" } |
  Sort-Object Thumbprint -Unique
foreach ($c in $certs) {
  $cn = ([regex]::Match($c.Subject, 'CN=([^,]+)')).Groups[1].Value.Trim('"').Replace(' ','-').Replace('#','')
  $b64 = [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  $pem = "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n"
  [System.IO.File]::WriteAllText((Join-Path $dir "$cn.crt"), $pem.Replace("`r`n","`n"))
}
```

אחר כך `docker compose -p homework-app build api worker` ו-`up -d`.

## לאבחן תקלת TLS בקונטיינר

```powershell
docker compose -p homework-app exec worker node -e "https=require('https');https.get({host:'generativelanguage.googleapis.com',path:'/',rejectUnauthorized:false},r=>{let c=r.socket.getPeerCertificate(true);while(c){console.log(JSON.stringify(c.subject));if(!c.issuerCertificate||c.issuerCertificate===c)break;c=c.issuerCertificate}r.destroy()})"
```

הפקודה מדפיסה את שרשרת התעודות שהשרת מגיש. ה-issuer של החוליה האחרונה הוא ה-root
שחייב להיות בתיקייה הזו.

## הערה על פריסה לשרת

התעודות האלה רלוונטיות **רק** לרשת נטפרי. בפריסה לשרת אמיתי (Render/Oracle) הן
מיותרות אך לא מזיקות — הן פשוט מתווספות למאגר ולא משמשות.
