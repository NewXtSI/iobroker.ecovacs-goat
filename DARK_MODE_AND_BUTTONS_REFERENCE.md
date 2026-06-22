# Technical Reference: Save/Close Button Management & Dark Mode

## How ioBroker Manages Save/Close Buttons

### Automatic Button Generation

The ioBroker admin interface **automatically generates and manages** the configuration buttons:

1. **Save Button** (Green checkmark ✓)
   - Appears when configuration has changed
   - Disabled by default
   - Enabled when `onChange()` callback is invoked (HTML/JS approach)
   - Calls the `save()` function when clicked

2. **Close/Cancel Button** (X)
   - Always visible
   - Closes configuration without saving
   - Asks for confirmation if changes exist

3. **Enable/Disable Toggle**
   - Managed by ioBroker
   - Based on adapter lifecycle

### You Do NOT Define These Buttons

**Incorrect** (Don't do this):
```html
<!-- DON'T add save/close buttons yourself -->
<button id="save">Save</button>
<button id="close">Close</button>
```

**Correct** (ioBroker handles it):
```html
<!-- Just create your form, buttons are auto-generated -->
<form>
    <input id="host" type="text">
    <input id="port" type="number">
</form>
```

---

## Save Button Enable/Disable Behavior

### HTML/JS Approach

The Save button is **disabled** until the user makes a change:

```javascript
function load(settings, onChange) {
    // onChange is the callback that signals a change
    
    document.getElementById('host').addEventListener('change', function() {
        // When user changes this field, call onChange
        // This enables the Save button
        onChange();
    });
    
    document.getElementById('port').addEventListener('change', function() {
        onChange();
    });
}
```

**Flow:**
1. Page loads → Save button is DISABLED
2. User changes a field → onChange() called → Save button becomes ENABLED
3. User clicks Save → save() function is called
4. save() calls callback(settings) → changes are saved

### JSON Configuration Approach

**Automatic**: ioBroker tracks all field changes automatically
- No need to call onChange()
- No need to implement load()/save() functions
- Save button manages itself

---

## Validation & Save Prevention

### How to Prevent Saving with Errors

#### HTML/JS Approach

**Return `false` to prevent save:**

```javascript
function save(callback) {
    const port = parseInt(document.getElementById('port').value);
    
    // Validation check
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('Invalid port number');
        return false;  // ← Prevents save
    }
    
    // If valid, proceed with save
    callback({
        port: port
    });
}
```

**Or don't call the callback:**

```javascript
function save(callback) {
    const host = document.getElementById('host').value;
    
    if (!host) {
        alert('Host is required');
        // Don't call callback → save is prevented
        return;
    }
    
    callback({ host: host });
}
```

#### JSON Configuration Approach

Use the `validator` property:

```json5
{
  port: {
    type: "port",
    min: 1,
    max: 65535,
    validator: "data.port >= 1024",  // Custom validation
    validatorErrorText: "Port must be >= 1024",
    validatorNoSaveOnError: true     // Prevent save on error
  }
}
```

---

## Dark Mode Support

### How Dark Mode Works in Browsers

Modern browsers support the `prefers-color-scheme` CSS media query:

```css
/* Light mode (default) */
body {
    background-color: white;
    color: black;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    body {
        background-color: #121212;
        color: white;
    }
}
```

**User can control this in:**
- Windows: Settings → Personalization → Colors
- macOS: System Preferences → General → Appearance
- Linux: Depends on desktop environment
- Browsers: Developer tools or system settings

### ioBroker Dark Mode Colors (Official Palette)

The official ioBroker admin interface uses these colors for dark mode:

```css
/* Dark mode colors */
@media (prefers-color-scheme: dark) {
    /* Backgrounds */
    :root {
        --color-bg-primary: #121212;      /* Main background */
        --color-bg-secondary: #1e1e1e;    /* Cards, panels */
        --color-bg-tertiary: #2d2d2d;     /* Input fields */
    }
    
    /* Text colors */
    :root {
        --color-text-primary: #ffffff;    /* Main text */
        --color-text-secondary: #bbb;     /* Secondary text */
        --color-text-tertiary: #888;      /* Disabled text */
    }
    
    /* Accent colors */
    :root {
        --color-accent: #64b5f6;          /* Blue accent */
        --color-error: #ff5252;           /* Error red */
        --color-success: #81c784;         /* Success green */
    }
    
    /* Borders */
    :root {
        --color-border: #333;             /* Dividers, borders */
        --color-border-focus: #64b5f6;    /* Focus state */
    }
}
```

### Complete Dark Mode Example

```css
/* ============================================
   Light Mode (default)
   ============================================ */

body {
    background-color: #ffffff;
    color: #333333;
    font-family: sans-serif;
}

.panel {
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    color: #333;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.panel-title {
    color: #333;
    border-bottom-color: #2196f3;
}

input, textarea, select {
    background-color: #ffffff;
    color: #333;
    border: 1px solid #ddd;
}

input:focus, textarea:focus, select:focus {
    border-color: #2196f3;
    box-shadow: 0 0 5px rgba(33, 150, 243, 0.3);
}

label {
    color: #666;
}

.help-text {
    color: #999;
}

/* ============================================
   Dark Mode
   ============================================ */

@media (prefers-color-scheme: dark) {
    body {
        background-color: #121212;
        color: #ffffff;
    }

    .panel {
        background-color: #1e1e1e;
        border: 1px solid #333;
        color: #fff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    .panel-title {
        color: #fff;
        border-bottom-color: #64b5f6;
    }

    input, textarea, select {
        background-color: #2d2d2d;
        color: #fff;
        border: 1px solid #444;
    }

    input:focus, textarea:focus, select:focus {
        border-color: #64b5f6;
        box-shadow: 0 0 5px rgba(100, 181, 246, 0.3);
    }

    label {
        color: #bbb;
    }

    .help-text {
        color: #888;
    }

    /* Specific element dark mode colors */
    table {
        background-color: #1a1a1a;
    }

    th {
        background-color: #2d2d2d;
        color: #aaa;
    }

    tr:hover {
        background-color: #252525;
    }

    code {
        background-color: #2d2d2d;
        color: #64b5f6;
    }

    .info-box {
        background-color: #1a237e;
        border-left-color: #64b5f6;
        color: #90caf9;
    }

    hr, .divider {
        border-color: #333;
    }

    button {
        background-color: #2d2d2d;
        color: #fff;
        border-color: #444;
    }

    button:hover {
        background-color: #383838;
    }

    button:focus {
        border-color: #64b5f6;
    }
}
```

### Testing Dark Mode in Development

**In Firefox:**
1. Open DevTools (F12)
2. Click the "..." menu
3. Select "Enable Browser Toolbox"
4. Go to Settings
5. Find "Color Scheme" preference simulator

**In Chrome/Chromium:**
1. Open DevTools (F12)
2. Press Ctrl+Shift+P (or Cmd+Shift+P on Mac)
3. Type "Emulate CSS media feature prefers-color-scheme"
4. Select "prefers-color-scheme: dark"

**In VS Code (Live Preview):**
```html
<!-- Add test button to switch modes -->
<button onclick="document.documentElement.style.colorScheme = 
    document.documentElement.style.colorScheme === 'dark' ? 'light' : 'dark'">
    Toggle Dark Mode
</button>
```

---

## JSON Configuration Dark Mode

### Automatic Dark Mode

JSON configurations using Material-UI automatically support dark mode:

```json5
{
  // No additional work needed!
  // Material-UI handles dark mode automatically
  type: "tabs",
  items: {
    settings: {
      type: "panel",
      items: {
        host: {
          type: "text",
          label: "Host"
        }
      }
    }
  }
}
```

Material-UI provides dark mode for:
- Text inputs ✓
- Checkboxes ✓
- Select dropdowns ✓
- Tables ✓
- Buttons ✓
- Cards/Panels ✓
- Everything else ✓

### Custom Styling in JSON Configuration

If you need custom styles for dark mode:

```json5
{
  myCustomField: {
    type: "text",
    label: "Custom Field",
    style: {
      // Light mode styles (React notation)
      marginLeft: 10,
      padding: 8,
      backgroundColor: "#f0f0f0"
    },
    darkStyle: {
      // Dark mode styles (React notation)
      backgroundColor: "#2d2d2d",
      color: "#fff"
    }
  }
}
```

Note: Use camelCase for CSS properties (marginLeft not margin-left)

---

## Password Handling

### Encryption in Configuration

**Passwords and sensitive data should be encrypted:**

In `io-package.json`:

```json
{
  "common": {
    "encryptedNative": ["password", "apiKey", "token", "secret"],
    "protectedNative": ["password", "apiKey"]
  }
}
```

**What this does:**
- `encryptedNative`: Data is automatically encrypted when saved, decrypted when loaded
- `protectedNative`: Data is only accessible to the adapter and admin, not to other adapters

**In your code:**

```javascript
// You receive decrypted value
const password = this.config.password;

// No need to decrypt it yourself
// ioBroker handles it automatically
```

### HTML/JS Password Field Best Practice

```html
<!-- HTML -->
<div class="form-group">
    <label>Password</label>
    <input id="password" type="password">
</div>

<!-- JavaScript -->
<script>
function load(settings, onChange) {
    // Password field gets pre-filled with encrypted value
    // (or empty if no password set)
    document.getElementById('password').value = settings.password || '';
    
    document.getElementById('password').addEventListener('change', onChange);
}

function save(callback) {
    const password = document.getElementById('password').value;
    
    // Don't validate/sanitize password
    // Just pass it as-is to ioBroker
    callback({
        password: password
    });
}
</script>
```

---

## Error Handling

### Save Errors

If save fails, you can show an error:

```javascript
function save(callback) {
    try {
        const port = parseInt(document.getElementById('port').value);
        
        if (isNaN(port)) {
            alert('Port must be a valid number');
            return false;
        }
        
        callback({ port: port });
    } catch (error) {
        alert('Error: ' + error.message);
        return false;
    }
}
```

### Form Validation

```javascript
const ValidationRules = {
    port: (value) => {
        const num = parseInt(value);
        if (isNaN(num)) return 'Must be a number';
        if (num < 1 || num > 65535) return 'Must be between 1 and 65535';
        return null;
    },
    
    email: (value) => {
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.test(value)) return 'Invalid email address';
        return null;
    },
    
    host: (value) => {
        if (!value || value.trim() === '') return 'Host is required';
        return null;
    }
};

function validate() {
    let hasErrors = false;
    
    Object.keys(ValidationRules).forEach(fieldName => {
        const element = document.getElementById(fieldName);
        if (!element) return;
        
        const error = ValidationRules[fieldName](element.value);
        
        if (error) {
            console.error(`${fieldName}: ${error}`);
            hasErrors = true;
        }
    });
    
    return !hasErrors;
}

function save(callback) {
    if (!validate()) {
        return false;
    }
    
    callback({
        port: parseInt(document.getElementById('port').value),
        email: document.getElementById('email').value,
        host: document.getElementById('host').value
    });
}
```

---

## Best Practices Summary

1. **Use JSON Configuration** for new adapters
2. **Always implement dark mode** in HTML/JS approaches
3. **Validate before saving** in HTML/JS
4. **Call onChange() on every change** in HTML/JS
5. **Protect sensitive data** with encryptedNative
6. **Test in both light and dark modes**
7. **Use standard ioBroker colors** for consistency
8. **Don't reinvent the buttons** - let ioBroker manage them
