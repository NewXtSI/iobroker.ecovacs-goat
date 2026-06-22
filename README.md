![Logo](admin/ecovacs-goat.png)

# ioBroker.ecovacs-goat

[![NPM version](https://img.shields.io/npm/v/iobroker.ecovacs-goat.svg)](https://www.npmjs.com/package/iobroker.ecovacs-goat)
[![Downloads](https://img.shields.io/npm/dm/iobroker.ecovacs-goat.svg)](https://www.npmjs.com/package/iobroker.ecovacs-goat)
![Number of Installations](https://iobroker.live/badges/ecovacs-goat-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/ecovacs-goat-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.ecovacs-goat.png?downloads=true)](https://nodei.co/npm/iobroker.ecovacs-goat/)

**Tests:** ![Test and Release](https://github.com/ioBrokerAdapter/ioBroker.ecovacs-goat/workflows/Test%20and%20Release/badge.svg)

## ECOVACS GOAT Adapter for ioBroker

MQTT adapter for ECOVACS GOAT series devices with automatic device discovery.

### Features

- **MQTT Communication**: Connect to ECOVACS GOAT devices using the new MQTT protocol
- **Device Discovery**: Automatically discover connected ECOVACS devices
- **Authentication**: Secure connection using username and password
- **Flexible Logging**: Configurable logging levels (debug, info, warn, error)
- **Modern Admin UI**: JSON-based configuration interface

## Installation

1. Install the adapter via ioBroker Admin Panel
2. Configure your ECOVACS credentials in the adapter settings
3. Enable automatic device discovery if desired
4. Restart the adapter

## Configuration

### Admin Settings

- **Username**: Your ECOVACS account username
- **Password**: Your ECOVACS account password  
- **Log Level**: Adapter logging level (default: info)
- **Enable Device Discovery**: Automatically scan for connected devices
- **Discovery Interval**: Scan interval in seconds (default: 60)

## External Library

This adapter requires an external MQTT library for device communication. The library will be specified once it's available and can be installed via:

```bash
npm install ecovacs-goat-lib  # Placeholder - actual package name will be provided
```

> **Note**: The adapter currently includes placeholder code for external library integration. Once the MQTT library is available, update `main.js` to include the actual library imports and device communication code.

## Development

### Setup

```bash
npm install
npm run build      # Not needed for JavaScript, but good for validation
npm run test       # Run all tests
npm run test:package  # Validate package.json and io-package.json
npm run lint       # Check code style
```

### Scripts

| Script | Description |
|--------|-------------|
| `test:package` | Validates package.json and io-package.json |
| `test:js` | Runs JavaScript tests |
| `test` | Runs all tests |
| `lint` | Checks code style with ESLint |
| `translate` | Auto-translate strings to all supported languages |
| `release` | Create new release (see release-script) |

## Troubleshooting

- **Connection Failed**: Check username/password configuration
- **No Devices Found**: Ensure devices are powered on and connected to network
- **Adapter Won't Start**: Check logs for missing dependencies or configuration errors

## License

MIT License - see LICENSE file

## Changelog

### 0.0.1

- Initial release
- Basic adapter framework with Admin UI
- Placeholder for external MQTT library integration
- Device discovery ready for implementation

---

## Deutsch / German

### ECOVACS GOAT Adapter für ioBroker

MQTT-Adapter für ECOVACS GOAT-Serie Geräte mit automatischer Geräteerkennung.

### Features

- **MQTT Kommunikation**: Verbindung zu ECOVACS GOAT Geräten über das neue MQTT-Protokoll
- **Automatische Geräteerkennung**: Entdecke verbundene ECOVACS Geräte automatisch
- **Authentifizierung**: Sichere Verbindung mit Benutzername und Passwort
- **Flexible Protokollierung**: Konfigurierbare Protokollstufen (debug, info, warn, error)
- **Modernes Admin Interface**: JSON-basierte Konfigurationsseite

### Installation

1. Installiere den Adapter über das ioBroker Admin-Panel
2. Konfiguriere deine ECOVACS-Anmeldedaten in den Adaptereinstellungen
3. Aktiviere die automatische Geräteerkennung falls gewünscht
4. Starte den Adapter neu

### Konfiguration

#### Admin-Einstellungen

- **Benutzername**: Dein ECOVACS-Kontoname
- **Passwort**: Dein ECOVACS-Kennwort
- **Protokollstufe**: Adapter-Protokollierungsstufe (Standard: info)
- **Geräteerkennung aktivieren**: Automatisch nach Geräten suchen
- **Erkennungsintervall**: Suchintervall in Sekunden (Standard: 60)

### Externe Bibliothek

Dieser Adapter benötigt eine externe MQTT-Bibliothek für die Gerätekommunikation. Die Bibliothek wird bereitgestellt, sobald sie verfügbar ist:

```bash
npm install ecovacs-goat-lib  # Platzhalter - tatsächlicher Paketname wird mitgeteilt
```

> **Hinweis**: Der Adapter enthält derzeit Platzhalter-Code für die externe Bibliothek-Integration. Sobald die MQTT-Bibliothek verfügbar ist, bitte `main.js` mit den tatsächlichen Library-Importen aktualisieren.

### Lizenz

MIT Lizenz - siehe LICENSE Datei

### Changelog

#### 0.0.1

- Erste Veröffentlichung
- Basis-Adapter-Gerüst mit Admin-Interface
- Platzhalter für externe MQTT-Bibliothek-Integration
- Geräteerkennung für spätere Implementierung vorbereitet
