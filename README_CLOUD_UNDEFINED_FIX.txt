Poprawka chmury:
- Firestore odrzuca pola z wartością undefined. Projekt po normalizeProject miał techniczne pole cells=undefined.
- Przed zapisem do chmury aplikacja usuwa pola undefined rekurencyjnie i kasuje legacy cells.
- Dodano ignoreUndefinedProperties dla Firestore.
- Jeśli reguły Firestore są poprawne, zapis powinien wrócić do trybu chmurowego.
