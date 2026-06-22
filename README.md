![Logo](admin/ecovacs-goat.png)

# ioBroker.ecovacs-goat

[![NPM version](https://img.shields.io/npm/v/iobroker.ecovacs-goat.svg)](https://www.npmjs.com/package/iobroker.ecovacs-goat)
[![Downloads](https://img.shields.io/npm/dm/iobroker.ecovacs-goat.svg)](https://www.npmjs.com/package/iobroker.ecovacs-goat)
![Number of Installations](https://iobroker.live/badges/ecovacs-goat-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/ecovacs-goat-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.ecovacs-goat.png?downloads=true)](https://nodei.co/npm/iobroker.ecovacs-goat/)

**Tests:** ![Test and Release](https://github.com/ioBrokerAdapter/ioBroker.ecovacs-goat/workflows/Test%20and%20Release/badge.svg)

## ECOVACS GOAT Adapter for ioBroker

MQTT adapter for ECOVACS GOAT series devices with automatic device discovery via the `node-ecovacs.js` library.

### Features

- **MQTT Communication**: Connect to ECOVACS GOAT devices using the MQTT protocol (via node-ecovacs.js)
- **Automatic Device Discovery**: Automatically discover connected ECOVACS devices on adapter startup
- **Debug Options**: Enable debugging for authentication, topics, or raw MQTT traffic
- **Device Status Monitoring**: Track battery level and device status
- **Modern Admin UI**: HTML-based configuration interface with device management

## Installation

1. Install the adapter via ioBroker Admin Panel or npm:
   ```bash
   npm install iobroker.ecovacs-goat
   ```

2. Configure your ECOVACS credentials in the adapter settings:
   - Username: Your ECOVACS account username
   - Password: Your ECOVACS account password

3. Optionally enable debug flags for troubleshooting:
   - **Debug Authentication**: Log authentication process details
   - **Debug Topics/Commands**: Log MQTT topics and commands
   - **Debug Raw Traffic**: Log raw MQTT messages

4. Save configuration and restart the adapter

5. Use the **Load Devices** button in Admin UI to discover and enable devices

## Configuration

### Admin Settings

- **ECOVACS Username**: Your ECOVACS account username
- **ECOVACS Password**: Your ECOVACS account password  
- **Debug Authentication**: Enable authentication debugging (logs in adapter)
- **Debug Topics/Commands**: Enable topic/command debugging
- **Debug Raw MQTT Traffic**: Enable raw traffic debugging

### Device Management

After saving configuration and restarting, click **Load Devices** to:
1. Connect to ECOVACS service
2. Discover available devices
3. Show device list with checkboxes
4. Select which devices to activate in ioBroker

Selected devices will be created as ioBroker states under `devices.<device_id>` with:
- `status`: Current device status
- `battery`: Battery level percentage

## Technical Details

### External Library

This adapter uses **[node-ecovacs.js](https://github.com/NewXtSI/node-ecovacs.js)** for ECOVACS device communication.

- **Repository**: https://github.com/NewXtSI/node-ecovacs.js
- **Status**: Active development
- **Note**: API may change - adapter is designed to be flexible for future updates

### Device Discovery

Device discovery occurs automatically on adapter startup. The adapter:
1. Connects to the ECOVACS service using provided credentials
2. Requests device list from service
3. Creates ioBroker states for each device
4. Shows device list in Admin UI for selection

### Debug Output

When debug flags are enabled, the adapter logs:
- **`[DEBUG-AUTH]`**: Authentication attempts and credentials handling
- **`[DEBUG-TOPICS]`**: MQTT topic subscriptions and command sending
- **`[DEBUG-MQTT]`**: Raw MQTT message payloads

View logs in ioBroker's **Admin > Logs** panel.

## Development

### Setup

```bash
npm install
npm run test:package  # Validate configuration
npm run lint          # Check code style
```

### Adapter Library Integration

The adapter includes `lib/ecovacs-client.js` as an abstraction layer for the external library:

- **Flexibility**: Easily adapt to API changes in `node-ecovacs.js`
- **Error Handling**: Graceful fallback if external library is unavailable
- **Method Detection**: Automatically tries common method names to support different versions

### File Structure

```
├── admin/
│   ├── index_m.html       # Configuration interface
│   ├── jsonConfig.json    # JSON config (alternative)
│   ├── i18n/              # Translations (EN, DE, etc.)
│   └── ecovacs-goat.png   # Adapter icon
├── lib/
│   ├── ecovacs-client.js  # External library wrapper
│   └── adapter-config.d.ts
├── main.js                # Adapter implementation
├── io-package.json        # Adapter metadata
└── package.json           # Dependencies (includes node-ecovacs.js)
```

## Troubleshooting

### Connection Failed
- Check username and password
- Verify ECOVACS account is valid
- Enable `Debug Authentication` to see connection details

### No Devices Found
- Ensure at least one ECOVACS device is registered on account
- Check network connectivity
- Restart adapter

### Library Not Found
- Run: `npm install` in adapter directory
- The `node-ecovacs.js` library is installed as dependency

### Adapter Won't Start
- Check logs in **Admin > Logs**
- Verify `package.json` dependencies are installed
- Ensure ioBroker version compatibility (requires js-controller >=6.0.11)

## License

MIT License - see LICENSE file

## Changelog

### 0.0.1

- Initial release
- Integration with node-ecovacs.js library
- Device discovery and management via Admin UI
- Debug flags for authentication, topics, and raw traffic
- Support for device status and battery monitoring
- Admin interface with device selection checkboxes

---

## Deutsch / German

### ECOVACS GOAT Adapter für ioBroker

MQTT-Adapter für ECOVACS GOAT-Serie Geräte mit automatischer Geräteerkennung über die `node-ecovacs.js` Bibliothek.

### Features

- **MQTT-Kommunikation**: Verbindung zu ECOVACS GOAT Geräten über MQTT (via node-ecovacs.js)
- **Automatische Geräteerkennung**: Entdecke verbundene ECOVACS Geräte automatisch beim Starten
- **Debug-Optionen**: Aktiviere Debugging für Authentifizierung, Topics oder Rohen MQTT-Verkehr
- **Geräte-Statusüberwachung**: Verfolge Batteriestatus und Gerätestatus
- **Modernes Admin Interface**: HTML-basierte Konfigurationsseite mit Geräteverwaltung

### Installation

1. Installiere den Adapter über ioBroker Admin oder npm:
   ```bash
   npm install iobroker.ecovacs-goat
   ```

2. Konfiguriere deine ECOVACS-Anmeldedaten:
   - Benutzername: Dein ECOVACS-Kontoname
   - Passwort: Dein ECOVACS-Kennwort

3. Optional: Aktiviere Debug-Flags zum Debuggen:
   - **Debug Authentifizierung**: Zeige Authentifizierungsdetails
   - **Debug Themen/Befehle**: Zeige MQTT-Themen und Befehle
   - **Debug Roher Verkehr**: Zeige Rohe MQTT-Meldungen

4. Speichere Konfiguration und starte Adapter neu

5. Klicke auf **Geräte laden** im Admin Interface, um Geräte zu erkennen und aktivieren

### Konfiguration

#### Admin-Einstellungen

- **ECOVACS-Benutzername**: Dein ECOVACS-Kontoname
- **ECOVACS-Passwort**: Dein ECOVACS-Kennwort
- **Debug Authentifizierung**: Authentifizierungs-Debugging aktivieren
- **Debug Themen/Befehle**: Topic/Befehls-Debugging aktivieren
- **Debug Roher MQTT-Verkehr**: Rohen Verkehr debuggen

### Geräteverwaltung

Nach dem Speichern und Neustart: Klicke **Geräte laden**, um:
1. Mit ECOVACS-Service zu verbinden
2. Verfügbare Geräte zu erkennen
3. Geräteliste mit Checkboxes anzuzeigen
4. Auswählen, welche Geräte in ioBroker aktiviert werden

### Lizenz

MIT Lizenz - siehe LICENSE Datei
