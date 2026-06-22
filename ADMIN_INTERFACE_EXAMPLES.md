# Example: Complete Admin Interface Setup for ioBroker.ecovacs-goat

## Option 1: Using JSON Configuration (Recommended)

### admin/jsonConfig.json5

```json5
{
  i18n: true,
  type: "tabs",
  items: {
    connection: {
      type: "panel",
      label: "Connection",
      icon: "data:image/svg+xml;base64,...", // optional
      items: {
        host: {
          type: "text",
          label: "MQTT Host",
          sm: 12,
          md: 6,
          required: true,
          placeholder: "192.168.1.100 or mqtt.example.com",
          help: "IP address or hostname of your MQTT broker",
          default: "localhost",
        },
        port: {
          type: "port",
          label: "MQTT Port",
          sm: 12,
          md: 6,
          default: 1883,
          help: "Default MQTT port is 1883 (1883 for unencrypted, 8883 for SSL)",
        },
        
        protocol: {
          type: "select",
          label: "Protocol",
          sm: 12,
          md: 6,
          options: [
            { label: "mqtt:// (Unencrypted)", value: "mqtt" },
            { label: "mqtts:// (SSL/TLS)", value: "mqtts" },
          ],
          default: "mqtt",
          newLine: true,
        },
        
        username: {
          type: "text",
          label: "Username",
          sm: 12,
          md: 6,
          hidden: "false",
          help: "Leave empty if MQTT broker has no authentication",
        },
        
        password: {
          type: "password",
          label: "Password",
          sm: 12,
          md: 6,
          repeat: true,
          visible: true,
          help: "Password for MQTT authentication",
        },
        
        clientId: {
          type: "text",
          label: "MQTT Client ID",
          sm: 12,
          md: 6,
          default: "ioBroker.ecovacs",
          newLine: true,
          help: "Unique identifier for this client in MQTT",
        },
        
        keepalive: {
          type: "number",
          label: "Keep-Alive Interval (seconds)",
          sm: 12,
          md: 6,
          min: 10,
          max: 300,
          default: 60,
        },
      },
    },
    
    devices: {
      type: "panel",
      label: "ECOVACS Devices",
      icon: "data:image/svg+xml;base64,...", // optional
      items: {
        deviceTable: {
          type: "table",
          label: "Registered Devices",
          sm: 12,
          items: [
            {
              attr: "id",
              title: "Device ID",
              width: "20%",
              type: "text",
              editable: false,
            },
            {
              attr: "name",
              title: "Name",
              width: "30%",
              type: "text",
              editable: true,
            },
            {
              attr: "type",
              title: "Device Type",
              width: "25%",
              type: "select",
              editable: true,
              options: [
                { label: "Vacuum", value: "vacuum" },
                { label: "Window Cleaner", value: "winbot" },
                { label: "Mop", value: "mop" },
              ],
            },
            {
              attr: "enabled",
              title: "Enabled",
              width: "15%",
              type: "checkbox",
              editable: true,
            },
          ],
          noDelete: false,
          clone: "id", // make id unique when cloning
        },
      },
    },
    
    advanced: {
      type: "panel",
      label: "Advanced Options",
      items: {
        logLevel: {
          type: "select",
          label: "Log Level",
          sm: 12,
          md: 6,
          options: [
            { label: "Debug", value: "debug" },
            { label: "Info", value: "info" },
            { label: "Warn", value: "warn" },
            { label: "Error", value: "error" },
          ],
          default: "info",
        },
        
        reconnectTimeout: {
          type: "number",
          label: "Reconnect Timeout (ms)",
          sm: 12,
          md: 6,
          min: 1000,
          max: 30000,
          default: 5000,
          help: "Time to wait before reconnecting",
        },
        
        pollInterval: {
          type: "number",
          label: "Poll Interval (seconds)",
          sm: 12,
          md: 6,
          min: 5,
          max: 600,
          default: 30,
          newLine: true,
          help: "How often to poll device status",
        },
        
        enableMetrics: {
          type: "checkbox",
          label: "Enable Metrics Collection",
          sm: 12,
          help: "Collect performance metrics",
        },
      },
    },
  },
}
```

### admin/i18n/en.json

```json
{
  "Connection": "Connection",
  "MQTT Host": "MQTT Host",
  "MQTT Port": "MQTT Port",
  "Protocol": "Protocol",
  "Username": "Username",
  "Password": "Password",
  "MQTT Client ID": "MQTT Client ID",
  "Keep-Alive Interval (seconds)": "Keep-Alive Interval (seconds)",
  "ECOVACS Devices": "ECOVACS Devices",
  "Registered Devices": "Registered Devices",
  "Device ID": "Device ID",
  "Name": "Name",
  "Device Type": "Device Type",
  "Enabled": "Enabled",
  "Advanced Options": "Advanced Options",
  "Log Level": "Log Level",
  "Reconnect Timeout (ms)": "Reconnect Timeout (ms)",
  "Poll Interval (seconds)": "Poll Interval (seconds)",
  "Enable Metrics Collection": "Enable Metrics Collection"
}
```

### admin/i18n/de.json

```json
{
  "Connection": "Verbindung",
  "MQTT Host": "MQTT Host",
  "MQTT Port": "MQTT Port",
  "Protocol": "Protokoll",
  "Username": "Benutzername",
  "Password": "Passwort",
  "MQTT Client ID": "MQTT Client ID",
  "Keep-Alive Interval (seconds)": "Keep-Alive Interval (Sekunden)",
  "ECOVACS Devices": "ECOVACS Geräte",
  "Registered Devices": "Registrierte Geräte",
  "Device ID": "Geräte-ID",
  "Name": "Name",
  "Device Type": "Gerätetyp",
  "Enabled": "Aktiviert",
  "Advanced Options": "Erweiterte Optionen",
  "Log Level": "Loglevel",
  "Reconnect Timeout (ms)": "Verbindungs-Timeout (ms)",
  "Poll Interval (seconds)": "Abfrage-Intervall (Sekunden)",
  "Enable Metrics Collection": "Metrik-Erfassung aktivieren"
}
```

### io-package.json (Update)

```json
{
  "common": {
    "adminUI": {
      "config": "json"
    },
    "encryptedNative": ["password"],
    "protectedNative": ["password"]
  }
}
```

---

## Option 2: Plain HTML/JS (If you prefer custom control)

### admin/index.html

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECOVACS GOAT Configuration</title>
    <link rel="stylesheet" href="../../lib/css/materialize.css">
    <link rel="stylesheet" href="../../css/adapter.css">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
        html, body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }

        .section {
            margin: 30px 0;
            padding: 20px;
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .section-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #2196F3;
            color: #333;
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }

        .form-group input[type="text"],
        .form-group input[type="number"],
        .form-group input[type="password"],
        .form-group select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }

        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: #2196F3;
            box-shadow: 0 0 5px rgba(33, 150, 243, 0.3);
        }

        .form-group.inline {
            display: inline-block;
            width: calc(50% - 10px);
            margin-right: 20px;
        }

        .form-group.inline:nth-child(2n) {
            margin-right: 0;
        }

        .help-text {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            html, body {
                background-color: #121212;
                color: #fff;
            }

            .section {
                background-color: #1e1e1e;
                border-color: #333;
            }

            .section-title {
                color: #fff;
                border-bottom-color: #64b5f6;
            }

            .form-group label {
                color: #bbb;
            }

            .form-group input[type="text"],
            .form-group input[type="number"],
            .form-group input[type="password"],
            .form-group select {
                background-color: #2d2d2d;
                color: #fff;
                border-color: #444;
            }

            .form-group input:focus,
            .form-group select:focus {
                border-color: #64b5f6;
                box-shadow: 0 0 5px rgba(100, 181, 246, 0.3);
            }

            .help-text {
                color: #888;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Connection Settings -->
        <div class="section">
            <div class="section-title">Connection Settings</div>
            
            <div class="form-group">
                <label>MQTT Host *</label>
                <input id="host" type="text" placeholder="192.168.1.100">
                <div class="help-text">IP address or hostname of your MQTT broker</div>
            </div>

            <div class="form-group inline">
                <label>MQTT Port *</label>
                <input id="port" type="number" min="1" max="65535" value="1883">
            </div>

            <div class="form-group inline">
                <label>Protocol</label>
                <select id="protocol">
                    <option value="mqtt">mqtt:// (Unencrypted)</option>
                    <option value="mqtts">mqtts:// (SSL/TLS)</option>
                </select>
            </div>

            <div style="clear: both;"></div>

            <div class="form-group">
                <label>Username (optional)</label>
                <input id="username" type="text">
            </div>

            <div class="form-group">
                <label>Password (optional)</label>
                <input id="password" type="password">
            </div>

            <div class="form-group">
                <label>Client ID</label>
                <input id="clientId" type="text" value="ioBroker.ecovacs">
            </div>
        </div>

        <!-- Advanced Settings -->
        <div class="section">
            <div class="section-title">Advanced Options</div>
            
            <div class="form-group inline">
                <label>Log Level</label>
                <select id="logLevel">
                    <option value="debug">Debug</option>
                    <option value="info" selected>Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
            </div>

            <div class="form-group inline">
                <label>Reconnect Timeout (ms)</label>
                <input id="reconnectTimeout" type="number" min="1000" max="30000" value="5000">
            </div>

            <div style="clear: both;"></div>

            <div class="form-group inline">
                <label>Poll Interval (seconds)</label>
                <input id="pollInterval" type="number" min="5" max="600" value="30">
            </div>

            <div class="form-group inline">
                <label>Enable Metrics</label>
                <input id="enableMetrics" type="checkbox">
            </div>
        </div>
    </div>

    <script>
        /**
         * REQUIRED: load() function
         * Called by ioBroker when configuration page opens
         * 
         * @param {object} settings - Current adapter settings (from native field in io-package.json)
         * @param {function} onChange - Callback to signal settings changed
         */
        function load(settings, onChange) {
            if (!settings) return;

            // Load each setting into corresponding form element
            document.getElementById('host').value = settings.host || 'localhost';
            document.getElementById('port').value = settings.port || 1883;
            document.getElementById('protocol').value = settings.protocol || 'mqtt';
            document.getElementById('username').value = settings.username || '';
            document.getElementById('password').value = settings.password || '';
            document.getElementById('clientId').value = settings.clientId || 'ioBroker.ecovacs';
            document.getElementById('logLevel').value = settings.logLevel || 'info';
            document.getElementById('reconnectTimeout').value = settings.reconnectTimeout || 5000;
            document.getElementById('pollInterval').value = settings.pollInterval || 30;
            document.getElementById('enableMetrics').checked = settings.enableMetrics === true;

            // Register change handlers to enable Save button
            const inputs = document.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.addEventListener('change', onChange);
                input.addEventListener('keyup', onChange);
            });
        }

        /**
         * REQUIRED: save() function
         * Called by ioBroker when user clicks Save button
         * 
         * @param {function} callback - Call with settings object when done
         */
        function save(callback) {
            // Validation
            const host = document.getElementById('host').value.trim();
            const port = parseInt(document.getElementById('port').value);

            // Validate required fields
            if (!host) {
                alert('Host is required');
                return false;
            }

            if (isNaN(port) || port < 1 || port > 65535) {
                alert('Port must be between 1 and 65535');
                return false;
            }

            // Gather all settings
            const settings = {
                host: host,
                port: port,
                protocol: document.getElementById('protocol').value,
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value,
                clientId: document.getElementById('clientId').value.trim() || 'ioBroker.ecovacs',
                logLevel: document.getElementById('logLevel').value,
                reconnectTimeout: parseInt(document.getElementById('reconnectTimeout').value),
                pollInterval: parseInt(document.getElementById('pollInterval').value),
                enableMetrics: document.getElementById('enableMetrics').checked,
            };

            // Call the callback with settings
            // ioBroker will save these to adapter config
            callback(settings);
        }
    </script>
</body>
</html>
```

---

## Comparison

| Feature | JSON Config | HTML/JS |
|---------|------------|---------|
| **Save/Close Buttons** | Auto-generated ✓ | Auto-generated ✓ |
| **Dark Mode** | Auto ✓ | Must style manually |
| **Validation** | Built-in + custom | Manual |
| **Translations** | Easy (JSON files) | Hard (inline strings) |
| **Responsive Design** | Built-in grid (xs-xl) | Manual CSS |
| **Complexity** | Low | Medium-High |
| **Recommended** | ✓ YES | Legacy only |

---

## Accessing Settings in Your Adapter Code

### In main.js:

```javascript
class MyAdapter extends utils.Adapter {
    constructor(options) {
        super(options);
    }

    async onReady() {
        // Access configuration
        const host = this.config.host;
        const port = this.config.port;
        const protocol = this.config.protocol;
        
        console.log(`Connecting to MQTT at ${protocol}://${host}:${port}`);
    }
}
```

---

## Summary

**Recommended**: Use the **JSON Configuration** approach (Option 1). It's modern, maintainable, and handles most concerns automatically including:
- Button management
- Dark mode support
- Internationalization
- Responsive design
- Built-in validation

Only use HTML/JS (Option 2) if you need highly customized behavior.
