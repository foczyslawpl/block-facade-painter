# Block Facade Painter — GitHub Pages

To jest statyczna wersja aplikacji gotowa do publikacji na GitHub Pages.

## Szybki deploy przez stronę GitHub

1. Utwórz nowe repozytorium na GitHub.
   - Najprościej: `block-facade-painter`
   - Jeżeli chcesz adres główny konta, nazwij repo: `<twoj-login>.github.io`
2. Wejdź do repozytorium i kliknij `Add file` → `Upload files`.
3. Wrzuć wszystkie pliki z tej paczki do głównego katalogu repozytorium.
4. Kliknij `Commit changes`.
5. Wejdź w `Settings` → `Pages`.
6. Wybierz `Deploy from a branch`.
7. Branch: `main`, folder: `/root`.
8. Zapisz. Publikacja może potrwać kilka minut.

## Adres strony

Dla repo `block-facade-painter` adres będzie zwykle:

`https://<twoj-login>.github.io/block-facade-painter/`

Dla repo `<twoj-login>.github.io` adres będzie:

`https://<twoj-login>.github.io/`

## Firebase

Po publikacji dodaj domenę GitHub Pages w Firebase:

Firebase Console → Authentication → Settings → Authorized domains

Dodaj np.:

`<twoj-login>.github.io`

Nie dodawaj `https://` ani ścieżki `/block-facade-painter/`.
