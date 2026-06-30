Poprawka chmury:
- przycisk zapisu pokazuje „Zapis w chmurze”, gdy użytkownik Google jest zalogowany
- aplikacja nadal próbuje zapisu do Firestore, nawet jeśli synchronizacja startowa zwróciła błąd
- błędy Firestore są teraz pokazywane w statusie, np. permission-denied
- jeśli pojawi się permission-denied, wklej reguły z FIRESTORE_RULES.txt w Firebase Console → Firestore Database → Rules
