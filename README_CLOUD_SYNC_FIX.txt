CLOUD SYNC FIX

Co zmieniono:
- Po zalogowaniu Google aplikacja automatycznie scala projekty lokalne i chmurowe.
- Lokalne projekty są automatycznie uploadowane do Firestore, bez pytania potwierdzeniem.
- Zapis projektu, gdy użytkownik jest zalogowany, zapisuje do chmury i lokalnej kopii.
- Pasek statusu pokazuje teraz wyraźnie: "Chmura aktywna" albo błąd chmury.
- Komunikaty błędów pokazują kod Firebase, np. permission-denied.

Jeśli po tej poprawce nadal pokazuje "permission-denied", trzeba ustawić reguły Firestore:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

Domena GitHub Pages do dodania w Firebase Auth Authorized domains:
foczyslawpl.github.io
