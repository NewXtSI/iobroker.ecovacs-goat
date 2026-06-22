# ioBroker Admin Interface Configuration Guide

## Overview

ioBroker provides multiple ways to create configuration interfaces for adapters:

1. **JSON Configuration** (Modern approach - recommended)
2. **Plain HTML/JS with index.html** (Legacy approach)
3. **React-based interfaces** (Using adapter-react-v5)

---

## 1. Modern Approach: JSON Configuration (Recommended)

### Structure

Create a `jsonConfig.json` or `jsonConfig.json5` file in your adapter's `admin/` directory.

### Enable in io-package.json

```json
{
  "common": {
    "adminUI": {
      "config": "json"
    }
  }
}
```

### Key Features

- **Automatically managed save/load**: ioBroker admin interface automatically handles saving and loading
- **Buttons auto-generated**: Save, Cancel, and Close buttons are automatically created and managed
- **Validation**: Built-in field validation support
- **Dark mode**: Automatically supported via Material-UI theming
- **Multi-language support**: Built-in i18n support
- **No JavaScript needed**: Configuration is declarative in JSON

### Example jsonConfig.json5

```json5
{
  i18n: true,
  type: "tabs",
  items: {
    connection: {
      type: "panel",
      label: "Connection Settings",
      items: {
        host: {
          type: "text",
          label: "Host",
          sm: 12,
          required: true,
        },
        port: {
          type: "port",
          label: "Port",
          sm: 6,
          default: 8080,
        },
        username: {
          type: "text",
          label: "Username",
          sm: 6,
        },
        password: {
          type: "password",
          label: "Password",
          sm: 6,
          repeat: true,
        },
        secure: {
          type: "checkbox",
          label: "Use Secure Connection",
          sm: 6,
        },
      },
    },
    advanced: {
      type: "panel",
      label: "Advanced Options",
      items: {
        timeout: {
          type: "number",
          label: "Timeout (ms)",
          min: 1000,
          max: 60000,
          sm: 6,
        },
        loglevel: {
          type: "select",
          label: "Log Level",
          options: [
            { label: "Debug", value: "debug" },
            { label: "Info", value: "info" },
            { label: "Warn", value: "warn" },
            { label: "Error", value: "error" },
          ],
          sm: 6,
        },
      },
    },
  },
}
```

### Available JSON Configuration Types

**Basic Input Fields:**
- `text` - Text input
- `number` - Numeric input with min/max
- `port` - Port number validation
- `password` - Password with repeat validation
- `checkbox` - Boolean checkbox
- `select` - Dropdown menu
- `chips` - Array of values

**Advanced Fields:**
- `table` - Editable table with add/delete/move
- `accordion` - Collapsible sections
- `objectId` - Object ID picker
- `instance` - Instance selector
- `user` - User selector
- `room` - Room selector
- `color` - Color picker
- `slider` - Range slider
- `datePicker` - Date selection
- `timePicker` - Time selection
- `cron` - CRON expression builder
- `image` - Image upload/display
- `file` - File selector
- `jsonEditor` - JSON editor
- `yamlEditor` - YAML editor
- `textarea` - Multi-line text (via `minRows` in text type)

**Special Components:**
- `sendTo` - Button that sends command to adapter
- `setState` - Button to set a state
- `staticText` - Read-only text
- `staticLink` - Clickable link
- `staticImage` - Static image display
- `divider` - Horizontal separator
- `header` - Section heading
- `iframe` / `iframeSendTo` - Embedded web content

---

## 2. Legacy Approach: Plain HTML/JS (Custom index.html)

### File Structure

```
admin/
  index.html      # Main configuration interface
  index_m.html    # Optional alternative (for specific admin modes)
```

### HTML/JS Pattern

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Adapter Configuration</title>
    <link rel="stylesheet" href="../../lib/css/materialize.css">
    <link rel="stylesheet" href="../../css/adapter.css">
    <style>
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            body { background-color: #121212; color: #fff; }
            input { background-color: #2d2d2d; color: #fff; }
        }
    </style>
</head>
<body>
    <div id="adapter-config">
        <!-- Your form elements here -->
        <div>
            <label>Host:</label>
            <input id="host" type="text" />
        </div>
        <div>
            <label>Port:</label>
            <input id="port" type="number" />
        </div>
    </div>

    <script>
        // This object comes from ioBroker admin interface
        // It contains the current adapter settings
        // Load the settings when page loads
        function load(settings, onChange) {
            // settings = the current adapter configuration object
            // onChange = callback to trigger when settings change
            
            if (!settings) return;
            
            // Load each setting into corresponding form element
            document.getElementById('host').value = settings.host || '';
            document.getElementById('port').value = settings.port || 8080;
            
            // Register change handlers
            document.getElementById('host').addEventListener('change', onChange);
            document.getElementById('port').addEventListener('change', onChange);
        }

        // Save function - called when user clicks Save button
        function save(callback) {
            // Gather all values from form
            const settings = {
                host: document.getElementById('host').value,
                port: parseInt(document.getElementById('port').value),
            };
            
            // Return the settings object via callback
            callback(settings);
        }
    </script>
</body>
</html>
```

### How Save/Load Buttons Work (Legacy HTML)

**The save() and load() functions are special interface functions:**

1. **`load(settings, onChange)`**
   - Called automatically by ioBroker when the configuration page opens
   - `settings` parameter: Object containing current adapter configuration
   - `onChange` parameter: Callback function to signal form has changed
   - **Purpose**: Populate form fields with current values

2. **`save(callback)`**
   - Called when user clicks the "Save" button
   - **Must** call the callback function with an object containing the new settings
   - **Must not** call callback if there are validation errors
   - **Return false** from the function to prevent save
   - **Purpose**: Collect form values and send them to ioBroker

3. **Buttons are auto-generated** by ioBroker admin interface
   - Save button (green checkmark)
   - Close/Cancel button (X)
   - Enable/Disable buttons are automatic
   - You do NOT define these buttons in HTML

### Calling onChange()

Call the `onChange` callback whenever a setting changes:

```javascript
function load(settings, onChange) {
    document.getElementById('host').addEventListener('change', function(e) {
        // onChange tells ioBroker that config changed
        // This typically enables the Save button
        onChange();
    });
}
```

---

## 3. Dark Mode Support

### JSON Configuration

Dark mode is **automatically handled** by Material-UI. No additional work needed.

### Plain HTML/JS

Use CSS media queries:

```css
@media (prefers-color-scheme: dark) {
    body {
        background-color: #121212;
        color: #ffffff;
    }
    
    input, textarea, select {
        background-color: #2d2d2d;
        color: #ffffff;
        border-color: #444444;
    }
    
    input:focus, textarea:focus, select:focus {
        border-color: #64b5f6;
        box-shadow: 0 0 5px rgba(100, 181, 246, 0.3);
    }
    
    label {
        color: #bbbbbb;
    }
    
    .panel {
        background-color: #1e1e1e;
        border-color: #333333;
    }
}

/* Light mode defaults */
input, textarea, select {
    background-color: #ffffff;
    color: #333333;
    border: 1px solid #dddddd;
}
```

---

## 4. Configuration Storage and Access

### How ioBroker Stores Config

Configuration is stored in the `system.adapter.ADAPTER_NAME.INSTANCE_NUMBER` object:

```json
{
  "_id": "system.adapter.myAdapter.0",
  "common": {
    "name": "myAdapter",
    ...
  },
  "native": {
    "host": "localhost",
    "port": 8080,
    "username": "admin",
    "password": "encrypted_value"
  }
}
```

### Access in Adapter Code

```javascript
// In your main.js
class MyAdapter extends utils.Adapter {
    constructor(options) {
        super(options);
        
        // Access configuration via this.config
        const host = this.config.host;     // "localhost"
        const port = this.config.port;     // 8080
        const username = this.config.username;
    }
}
```

---

## 5. Best Practices

### For JSON Configuration

1. **Use jsonConfig.json5 format** - Allows comments
2. **Enable i18n** - Add `"i18n": true` at root
3. **Create translation files**:
   ```
   admin/i18n/
     en.json
     de.json
     fr.json
   ```
4. **Use layout options** (xs, sm, md, lg, xl) for responsive design
5. **Validate input** with `validator` property
6. **Use conditional display** with `hidden` and `disabled` for dynamic forms
7. **Protect sensitive data** - Use `encryptedNative` in io-package.json:
   ```json
   {
     "common": {
       "encryptedNative": ["password", "token", "apiKey"]
     }
   }
   ```

### For HTML/JS Configuration

1. **Always provide load() function** - Required
2. **Always provide save() function** - Required
3. **Call onChange() on every change** - Enables Save button
4. **Validate before saving** - Return false or don't call callback
5. **Handle missing settings gracefully** - Use defaults
6. **Support dark mode** - Use media queries
7. **Use materialize CSS** - Consistent with ioBroker style
8. **Test in both light and dark modes**

---

## 6. Validation Examples

### JSON Configuration

```json5
{
  port: {
    type: "port",
    min: 1,
    max: 65535,
    label: "Port",
    validator: "data.port >= 1024", // Custom validation
    validatorErrorText: "Port must be >= 1024"
  },
  email: {
    type: "text",
    label: "Email",
    validator: "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/", // Regex validation
  }
}
```

### HTML/JS Configuration

```javascript
function save(callback) {
    const host = document.getElementById('host').value;
    const port = parseInt(document.getElementById('port').value);
    
    // Validation
    if (!host || host.trim() === '') {
        alert('Host is required');
        return false;  // Prevent save
    }
    
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('Port must be between 1 and 65535');
        return false;
    }
    
    // If validation passes, save
    callback({
        host: host,
        port: port
    });
}
```

---

## 7. Migration from HTML to JSON

If you're converting from HTML to JSON:

1. **Create jsonConfig.json5** with same fields
2. **Update io-package.json**:
   ```json
   {
     "common": {
       "adminUI": {
         "config": "json"
       }
     }
   }
   ```
3. **Keep existing index.html** as fallback (optional)
4. **Remove custom save/load functions** - No longer needed
5. **Test configuration loading/saving**

---

## 8. Example: Complete JSON Configuration

See [jsonConfig.json5 example in your project](admin/jsonConfig.json) for:
- Multi-tab layout
- Form validation
- Conditional fields
- Dark mode support
- Internationalization

---

## 9. Resources

- **Official Documentation**: https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/adapterjsonconfig.md
- **JSON Configuration Schema**: https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/packages/jsonConfig/schemas/jsonConfig.json
- **Example Adapters**:
  - ioBroker.admin (complex configuration)
  - ioBroker.dwd (simple configuration)
  - ioBroker.telegram (custom components)
  - ioBroker.pushbullet (custom components)

---

## Key Takeaways

| Aspect | JSON Config | HTML/JS |
|--------|------------|---------|
| **Save/Close Buttons** | Auto-generated ✓ | Auto-generated ✓ |
| **Dark Mode** | Automatic ✓ | Manual (CSS) |
| **Validation** | Built-in | Manual |
| **Internationalization** | Built-in | Manual |
| **Ease of Development** | Easy | Complex |
| **Customization** | Limited | Unlimited |
| **Recommended** | **YES** | Legacy only |

**For new adapters**: Use **JSON Configuration**. It's simpler, more maintainable, and automatically handles most concerns.
