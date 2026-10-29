# Instalator GUI — dwa palce w CarPlay iDrive 7

Język domyślny to angielski; przycisk **English / PL** przełącza na polski.

Uruchom `iDrive7-Multitouch-Installer.exe` na Windows 10/11 z .NET Framework 4.8 i klientem OpenSSH. Nie potrzebujesz lokalnego Pythona ani Node.js. W MGU muszą być już dostępne root/SSH i Node.js 8.

1. Podłącz laptop do zaparkowanego auta przez ENET. Zapewnij stabilne zasilanie jednostki.
2. Pole klucza możesz pozostawić puste. Program szuka lokalnego klucza `id_rsa` z katalogu `data/enrollments/<VIN>` dla wykrytego auta, a następnie próbuje agenta SSH i standardowego logowania. Jeśli to się nie uda, wybierz własny klucz ręcznie. Program nie zawiera kluczy i nie wykonuje rootowania. Sam root nie zastępuje uwierzytelniania SSH.
3. Kliknij **Połącz i sprawdź**. Program odczyta VIN i IP przez ENET, sprawdzi logowanie jako root oraz zgodność pliku CarPlay. Przy pierwszym połączeniu wyświetli klucz hosta SSH; MGU może zmienić go po restarcie.
4. Wybierz folder kopii. Potwierdź postój i stabilne zasilanie. Instalacja wymaga odczytu co najmniej 13,0 V.
5. Kliknij **Zainstaluj**. Najpierw powstanie kopia na komputerze; jej pliki zostaną sprawdzone sumami SHA-256. Błąd kopii zatrzyma operację przed instalacją.
6. Domyślnie aplikacja zleci pełny restart MGU i sprawdzi rozruch. Kontrola poprawki trwa 60 sekund od uruchomienia CarPlay. Android box może wymagać osobnego restartu, aby połączyć się ponownie.

Nie generuj nowego klucza tylko po to, aby użyć instalatora. Po udanym Enable SSH / Flash narzędzie eksportuje klucz akceptowany przez tę jednostkę — standardowo `data/enrollments/<VIN>/id_rsa`. Nowa niezarejestrowana para kluczy nie da dostępu.

Jeśli nie masz roota lub odpowiedniego klucza, użyj odnośnika w oknie do [instrukcji autora odblokowania SSH](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#readme).

## Po rootowaniu: gdzie jest klucz i jak go wskazać?

Ścieżkę potwierdza [instrukcja autora narzędzia](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#the-ssh-key-and-connect-info). Klucz zapisuje narzędzie do rootowania, nie nasz instalator.

1. Po udanym **Enable SSH / Flash** w aplikacji autora zachowaj cały jej folder.
2. Jeśli używasz `MGU-SSH.exe`, otwórz folder z tym EXE, następnie **data → enrollments → VIN swojego auta**. Przy EXE zbudowanym w repozytorium jest to `dist\MGU-SSH\data\enrollments\<VIN>\`.
3. Przy uruchamianiu wersji Python/źródeł znajdziesz `data\enrollments\<VIN>\` w folderze repozytorium do rootowania.
4. W naszym instalatorze kliknij **Choose file…**, wybierz **`id_rsa` bez rozszerzenia**, a potem **Connect and check**. Odnośnik **Where is my key?** otwiera tę pomoc i przycisk wyboru pliku. Pozostawienie pustego pola nadal uruchamia wyszukiwanie automatyczne.
5. Nie wybieraj `id_rsa.pub` ani `id_rsa.pub.pem` (klucze publiczne), `id_rsa.ppk` (PuTTY) ani `data/assets/01_PRIVATE_KEY.pem` (enrollment, nie logowanie SSH). Program wyjaśnia te pomyłki przed próbą logowania.

Plik `connect.txt` obok klucza zawiera IP MGU i gotowe polecenie SSH. Jeśli nie znajdujesz eksportu, sprawdź dziennik oraz oryginalny folder aplikacji do rootowania. Samo wygenerowanie nowej pary kluczy nie da dostępu. Zachowaj klucze na swoim komputerze i nie dodawaj ich do publicznych zgłoszeń.

Uprawnienia pliku w Windows program obsługuje przez tymczasową kopię dostępną tylko dla Twojego konta, usuwaną po każdym poleceniu SSH. Nie zmienia oryginalnego klucza ani jego uprawnień.

## Kopia i powrót

Kopia `.mgubak` obejmuje **oryginalny program CarPlay, fabryczną jednostkę systemd oraz pliki i konfigurację tej poprawki**, jeśli była już zainstalowana. Zapisuje właścicieli, uprawnienia i sumy plików. Towarzyszą jej plik SHA-256 i czytelny spis zawartości. Kopia nie zawiera prywatnego klucza SSH.

**To nie jest pełny obraz ani kopia kodowania całego MGU.** Nie przywróci uszkodzonego firmware'u, bootloadera ani innych funkcji jednostki. Instalator pozostawia fabryczny `/usr/bin/carplay` nienaruszony.

- **Usuń poprawkę** tworzy kopię bieżącego stanu i usuwa wyłącznie własną instalację. Po restarcie wraca fabryczny CarPlay.
- **Przywróć kopię** sprawdza sumy, wersję i zgodność VIN z autem wykrytym przez ENET. Odtwarza poprzedni stan instalacji tej poprawki: fabryczny albo z włączoną poprawką dwóch palców. Nie wgrywa dowolnych plików z archiwum do systemu.
- **Zrób kopię** pozwala zapisać ją także osobno, bez instalacji.
- Nie usuwaj kopii z komputera przed sprawdzeniem działania. Przycisk **Otwórz kopie** pokazuje folder.

## Zgodność

Poprawka jest potwierdzona z Android AI boxem połączonym bezprzewodowo przez CarPlay. Bezpośrednie połączenie iPhone'a pozostaje niepotwierdzone. Program nie zmienia boxa i nie instaluje wersji trzech/pięciu palców.

Obsługiwana jest jedna sprawdzona wersja fabrycznego CarPlay, zgłaszająca `P18_23w44.2-1-3`, SHA-256:

`ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`

Inny hash lub obca konfiguracja usługi blokują instalację. Sam model/rocznik auta nie potwierdza zgodności.

## Budowanie

`python gui/build.py` używa kompilatora .NET Framework z Windows. EXE zawiera własny kod oraz dane łatki; nie zawiera firmware'u BMW, kopii jednostki ani kluczy prywatnych.

## Sprawdzenie nowego GUI

Przeszły testy lokalne kopii, przywracania, parserów ENET, argumentów Windows i ograniczeń danych. Pełny przebieg nowego GUI wymaga jeszcze próby na aucie; sama poprawka dwóch palców oraz bazowy mechanizm instalacji/usunięcia były już sprawdzane.
