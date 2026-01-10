# Mathematica+ 🚀

Rozszerzenie Chrome, które ulepsza doświadczenie pracy z Wolfram Cloud Mathematica poprzez integrację z AI do generowania wzorów matematycznych, kodu Wolfram Language i wyjaśnień.

![Mathematica+](logo.png)

## ✨ Funkcje

- **Math Directive** - Generowanie wzorów matematycznych w formacie LaTeX
- **Wolfram Directive** - Tworzenie kodu w języku Wolfram Language
- **Explain Directive** - Wyjaśnienia matematyczne w prostym języku polskim
- **Renderowanie LaTeX** - Piękne wzory matematyczne z użyciem KaTeX
- **Skrót klawiszowy** - Szybkie aktywowanie przez `Ctrl+Shift+Q`
- **Bezpieczne przechowywanie tokena** - Token API zapisywany w Chrome Storage

## 📋 Wymagania

- Google Chrome (wersja 88+)
- Konto w Wolfram Cloud (wolframcloud.com)
- Access Token do API AI-One

## 🔧 Instalacja

### Dla użytkowników:

1. Pobierz najnowszą wersję Mathematica+ i rozpakuj ją
2. Otwórz Chrome i wejdź na `chrome://extensions/`
3. Włącz **"Tryb dewelopera"** (prawy górny róg)
4. Kliknij **"Załaduj rozpakowane"**
5. Wybierz folder `Mathematica+` (ten, który rozpakowałeś)
6. Ikona rozszerzenia pojawi się w pasku narzędzi Chrome

### Dla deweloperów:

```bash
# Klonuj repozytorium
git clone https://github.com/your-username/mathematica-plus.git
cd mathematica-plus

# Zainstaluj zależności
npm install

# Zbuduj projekt
npm run build

# Lub uruchom w trybie watch
npm run watch
```

Następnie załaduj folder `dist` do Chrome jak opisano powyżej.

## 🎯 Jak używać

### 1. Konfiguracja tokena

1. Kliknij ikonę rozszerzenia w pasku Chrome
2. Wprowadź swój Access Token
3. Kliknij "Zapisz Token"

### 2. Używanie dyrektyw

Otwórz notebook w Wolfram Cloud i używaj specjalnych dyrektyw:

#### Math - Wzory matematyczne
```
[Math: równanie kwadratowe]
```
Zwraca: Wzór w LaTeX (np. `$$ax^2 + bx + c = 0$$`)

#### Wolfram - Kod
```
[Wolfram: narysuj wykres funkcji sin(x)]
```
Zwraca: Kod w języku Wolfram Language

#### Explain - Wyjaśnienia
```
[Explain: twierdzenie Pitagorasa]
```
Zwraca: Proste wyjaśnienie po polsku z wzorami LaTeX

### 3. Aktywacja

Naciśnij **`Ctrl+Shift+Q`** w notebooku Wolfram Cloud, aby przetworzyć wszystkie dyrektywy.

## 🏗️ Struktura projektu

```
Mathematica+/
├── src/
│   ├── api.ts                  # Komunikacja z API
│   ├── background.ts           # Service worker
│   ├── content.ts              # Entry point content script
│   ├── contentScriptLogic.ts   # Logika przetwarzania dyrektyw
│   ├── messageHandlers.ts      # Obsługa wiadomości
│   ├── popup.ts                # Logika popup
│   ├── storage.ts              # Operacje chrome.storage
│   └── utils.ts                # Funkcje pomocnicze
├── public/
│   ├── popup.html              # UI popup
│   └── how-to-use.html         # Instrukcja użycia
├── dist/                       # Skompilowane pliki (generowane)
├── build.js                    # Skrypt budowania (esbuild)
├── manifest.json               # Manifest rozszerzenia Chrome
├── rules.json                  # Reguły CORS
├── logo.png                    # Ikona rozszerzenia
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Technologie

- **TypeScript** - Główny język
- **esbuild** - Bundler
- **KaTeX** - Renderowanie LaTeX
- **Chrome Extension Manifest V3** - API rozszerzeń
- **Chrome Storage API** - Przechowywanie danych

## 📝 Rozwój

### Dostępne skrypty

```bash
npm run build     # Buduj projekt
npm run watch     # Tryb watch (auto-rebuild)
npm run clean     # Wyczyść folder dist
```

### Architektura

- **Background Service Worker** - Obsługuje komunikację z API, zarządza tokenem
- **Content Script** - Wstrzykiwany do Wolfram Cloud, przetwarza dyrektywy
- **Popup** - Interfejs konfiguracji tokena

### Dodawanie nowych funkcji

1. Edytuj pliki w `src/`
2. Uruchom `npm run build` lub `npm run watch`
3. Przeładuj rozszerzenie w Chrome (`chrome://extensions/` → ⟳)

## 🐛 Rozwiązywanie problemów

### "Mathematica+ error" w lewym dolnym rogu

- Sprawdź czy token jest poprawny
- Upewnij się, że masz połączenie z internetem
- Zweryfikuj czy jesteś na stronie wolframcloud.com

### Dyrektywy nie są wykrywane

- Upewnij się, że używasz poprawnej składni: `[Math: ...]`, `[Wolfram: ...]`, `[Explain: ...]`

### Czcionki LaTeX nie ładują się

- Sprawdź czy w `dist/fonts/` są pliki czcionek KaTeX
- Uruchom ponownie `npm run build`

## 📄 Licencja

MIT License
