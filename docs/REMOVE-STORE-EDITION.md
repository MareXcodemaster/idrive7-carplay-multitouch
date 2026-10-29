# Remove the withdrawn USB / MGU Store edition

The USB edition was withdrawn after an unsuccessful vehicle trial. Use the
Windows ENET installer for further work. The Store itself is a separate project.

## English

1. In MGU Store open **Installed** and select **CarPlay Multitouch - iDrive 7**.
2. Choose **Remove** and wait for the operation to finish.
3. Fully restart the head unit when the car has stable power. This removes the
   patch override from the next CarPlay start. Reboot an Android box afterwards
   if its image does not reconnect.
4. The tool id is `marex-carplay-multitouch`. Keep the backups on your USB stick.
   Do not manually copy that edition's drop-in into the car.
5. Remove the `mgu-repo/marex-carplay-multitouch` folder from the stick to stop it
   appearing as an available USB package. Keep unrelated files and backups.
6. Use the Windows installer only after the Store edition has been removed.

## Polski

1. W MGU Store wybierz **Installed → CarPlay Multitouch - iDrive 7**.
2. Kliknij **Remove** i poczekaj na zakończenie operacji.
3. Przy stabilnym zasilaniu wykonaj pełny restart jednostki. Przy kolejnym starcie
   CarPlay nie będzie używał konfiguracji tej poprawki. Zrestartuj też box,
   jeśli jego obraz nie połączy się ponownie.
4. Identyfikator narzędzia to `marex-carplay-multitouch`. Zachowaj kopie na
   pendrivie. Nie wgrywaj ręcznie konfiguracji z wycofanej paczki.
5. Z pendrive'a usuń katalog `mgu-repo/marex-carplay-multitouch`, aby paczka nie
   pojawiała się ponownie do instalacji. Zachowaj inne pliki i backupy.
6. Dopiero po usunięciu wersji Store użyj instalatora Windows przez ENET.
