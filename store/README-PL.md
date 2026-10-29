# CarPlay Multitouch - iDrive 7 / instalacja USB przez MGU Store

Wymagane są **root oraz działający MGU Store**, zainstalowane wcześniej w aucie.
To paczka do strony USB w [MGU Store](https://github.com/robertnisipeanu/mgu-store).
Samo włożenie pendrive'a nie odblokowuje jednostki. Gdy sklep już działa, ta
instalacja nie wymaga ENET, klucza SSH na komputerze ani internetu.

## Zgodność

- iDrive 7, MGU x86-64. Program sprawdza dokładny rozmiar i SHA-256 fabrycznego
  pliku CarPlay; na innym oprogramowaniu nie przygotuje aktywacji.
- Obsługiwany `/usr/bin/carplay`: 3 484 912 bajtów, SHA-256
  `ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`.
- Wymagany `mgu-deploy` co najmniej 0.6.4. Paczka nie zawiera aktualizacji sklepu;
  w razie potrzeby zaktualizuj go wcześniej, gdy jest dostęp do internetu.
- Sama poprawka działała na G30 z bezprzewodowym Android boxem, również po
  pełnym restarcie MGU. Box nie wymaga modyfikacji. Bezpośredniego połączenia
  iPhone'a z BMW jeszcze nie potwierdzono.
- **Tę wersję instalatora USB sprawdzono lokalnie; nie przeszła jeszcze próby
  instalacji przez sklep w samochodzie.**
- Jeśli masz wersję z instalatora Windows/ENET, usuń ją tamtym instalatorem i
  wykonaj pełny restart MGU przed przejściem na USB. Sklep odmówi nadpisania
  konfiguracji należącej do innego instalatora.

## Instalacja

1. Zaparkuj auto i zapewnij stabilizowane podtrzymanie zasilania. Instalator
   wymaga świeżego odczytu 13,0-18,0 V; brak odczytu zatrzymuje przygotowanie.
2. Użyj pendrive'a rozpoznawanego przez auto i sklep, z możliwością zapisu oraz
   co najmniej 64 MB wolnego miejsca. Małe pliki tej paczki i kopii mieszczą się
   na FAT32. Nie trzeba formatować pendrive'a pod Linuksa ani dzielić go na
   partycje. Program niczego nie formatuje ani nie montuje ręcznie.
3. Wypakuj ZIP **bezpośrednio na pendrive**. Ma powstać ścieżka
   `mgu-repo/marex-carplay-multitouch/catalog.json`, a obok plik `.tgz` oraz
   `USB-INSTALL.json`. Podłącz tylko jeden pendrive z tą paczką.
4. Włóż pendrive do portu danych USB w aucie. W **MGU Store > USB** wybierz źródło
   `marex-carplay-multitouch`, następnie **CarPlay Multitouch - iDrive 7** i instalację.
5. Pendrive musi pozostać wpięty. Sprawdź wynik operacji: sukces zawiera
   **`prepared-for-next-full-boot`** oraz **`Backup verified on USB`**.
   Komunikat **`CARPLAY MULTITOUCH SETUP FAILED`** oznacza błąd przygotowania.
   Usuń przyczynę i ponów instalację albo usuń narzędzie ze sklepu. Sklep może
   pokazywać narzędzie jako zainstalowane mimo błędu skryptu po instalacji.
6. Po sukcesie wybierz **MGU Store > Settings > Restart head unit**. Paczka sama
   nie restartuje CarPlay ani MGU. Przy Android boxie wykonaj również pełny
   restart boxa, gdy MGU już się uruchomi.
7. Odczekaj co najmniej minutę od uruchomienia procesu CarPlay na kontrolę
   działania po starcie. Sprawdź zwykły dotyk i gesty multitouch. Przerwana lub
   nieudana kontrola powoduje wybór fabrycznego CarPlay przy kolejnym starcie;
   przed ponowną instalacją sprawdź przyczynę. Pendrive wyjmij po zakończeniu
   zapisów, korzystając z bezpiecznego usuwania w sklepie, jeśli jest dostępne,
   albo po pełnym wyłączeniu MGU.

## Instalacja w MGU Store ze screenami

Poniższe zrzuty pochodzą z [repozytorium autora MGU Store](https://github.com/robertnisipeanu/mgu-store/tree/7fafa44a040cdefe6a254b4964e3d497d23123ed/docs/screenshots).
Pokazują przykładowe pozycje sklepu i starsze numery wersji, a nie instalację naszej
poprawki. Nasza paczka wymaga `mgu-deploy` 0.6.4+. Obrazki są wczytywane z
repozytorium autora; pełna instrukcja tekstowa znajduje się również w ZIP-ie.

**1. Otwórz USB.** Wypakuj ZIP bezpośrednio na pendrive i włóż go do auta.
W sklepie wybierz **USB**, a następnie źródło `marex-carplay-multitouch`.
Szukaj pozycji **CarPlay Multitouch - iDrive 7**; pozycje na screenie są przykładowe.

![Zakładka USB w MGU Store, zrzut autora robertnisipeanu](https://raw.githubusercontent.com/robertnisipeanu/mgu-store/7fafa44a040cdefe6a254b4964e3d497d23123ed/docs/screenshots/usb.png)

**2. Otwórz paczkę i wybierz Install.** Screen przedstawia przykładową pozycję
autora. U siebie upewnij się, że wybrany tytuł to **CarPlay Multitouch - iDrive 7**,
następnie kliknij **Install**.

![Przykładowe szczegóły paczki i przycisk Install w MGU Store](https://raw.githubusercontent.com/robertnisipeanu/mgu-store/7fafa44a040cdefe6a254b4964e3d497d23123ed/docs/screenshots/app.png)

**3. Sprawdź wynik i wykonaj restart.** Pendrive pozostaje wpięty na czas kopii.
Sukces musi zawierać `prepared-for-next-full-boot` oraz `Backup verified on USB`.
Dopiero po sukcesie wybierz **Settings > Restart head unit** — przycisk jest
w prawym dolnym rogu ekranu poniżej. Gdy MGU wstanie, zrestartuj także Android box,
jeśli go używasz.

![Ustawienia MGU Store i Restart head unit w prawym dolnym rogu](https://raw.githubusercontent.com/robertnisipeanu/mgu-store/7fafa44a040cdefe6a254b4964e3d497d23123ed/docs/screenshots/settings.png)

**4. Usuwanie.** Wybierz **Installed**, znajdź **CarPlay Multitouch - iDrive 7**
wśród narzędzi jednostki, otwórz je, kliknij **Remove** i wykonaj pełny restart MGU.
Lista poniżej jest przykładem autora; poprawka będzie osobną pozycją.

![Przykładowa lista Installed w MGU Store](https://raw.githubusercontent.com/robertnisipeanu/mgu-store/7fafa44a040cdefe6a254b4964e3d497d23123ed/docs/screenshots/installed.png)

## Kopia i cofnięcie zmiany

Przed utworzeniem plików aktywujących poprawkę instalator zapisuje na pendrivie
katalog `CarPlay-Multitouch-Backups`. W środku jest archiwum
`<data>-<losowy identyfikator>.mgubak.gz`: fabryczny CarPlay, usługa oraz
konfiguracja i poprzedni stan tej poprawki. Zapisywane są sumy SHA-256,
uprawnienia i właściciele plików; archiwum jest ponownie odczytywane i sprawdzane.
Brak pendrive'a, miejsca lub udanego odczytu kopii zatrzymuje przygotowanie.
**To kopia plików CarPlay i konfiguracji, nie pełny zrzut MGU.** BimmerCode
wykonuje osobną kopię kodowania. Archiwum zachowaj prywatnie.

Sklep robi także własną kopię konfiguracji sprzed swojej zmiany. Kopia na USB
powstaje już po zapisaniu konfiguracji sklepu i ma to zaznaczone w metadanych.
Fabryczny plik CarPlay i fabryczna usługa pozostają na miejscu, bez nadpisania.
Paczka nie zawiera oprogramowania BMW ani kluczy prywatnych.

Usuwanie: **MGU Store > Installed > CarPlay Multitouch - iDrive 7 > Remove**,
następnie **Settings > Restart head unit**. Sklep usuwa swoją konfigurację i
katalog poprawki, a po pełnym restarcie uruchamia się fabryczny CarPlay.
Kopie na USB zostają. Nie wypakowuj archiwum bezpośrednio do `/` ani nie
przywracaj z niego konfiguracji sklepu ręcznie: mogłoby to ponownie włączyć
poprawkę. Do kopii wykonanych przez sklep służy jego mechanizm przywracania;
archiwum USB zachowaj do odzyskiwania i diagnostyki. Ta paczka nie ma osobnego
przycisku importu archiwum USB.

Instrukcja roota autora:
[cauliflowermossgrape/idrive7-8-ssh-root](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root).
Projekt poprawki:
[MareXcodemaster/idrive7-carplay-multitouch](https://github.com/MareXcodemaster/idrive7-carplay-multitouch).
