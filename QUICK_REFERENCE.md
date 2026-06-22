# Quick Reference: ioBroker Admin Interface

## When to Use Each Approach

### Use JSON Configuration When:
- Creating a **new adapter** ✓ (Recommended)
- You need **standard form fields** (text, number, checkbox, select, etc.)
- You want **automatic dark mode support**
- You need **i18n translations**
- You want **minimal code** to maintain
- You need **responsive design** (mobile-friendly)
- You want **validation** built-in

### Use HTML/JS When:
- You need **highly custom UI** not supported by JSON
- You're **maintaining legacy code** that uses it
- You need **custom JavaScript behavior**
- You require **custom styling** beyond standard controls

---

## JSON Configuration Quick Start

### 1. Create jsonConfig.json5

```json5
{
  i18n: true,
  type: "tabs",
  items: {
    tab1: {
      type: "panel",
      label: "Tab 1",
      items: {
        myField: {
          type: "text",
          label: "My Field"
        }
      }
    }
  }
}
```

### 2. Update io-package.json

```json
{
  "common": {
    "adminUI": {
      "config": "json"
    }
  }
}
```

### 3. Create Translation Files (Optional but Recommended)

```
admin/i18n/
  en.json
  de.json
  fr.json
```

**admin/i18n/en.json:**
```json
{
  "Tab 1": "Tab 1",
  "My Field": "My Field"
}
```

### 4. That's It! 🎉

No HTML, no JavaScript needed. ioBroker handles:
- ✓ Save/Close buttons
- ✓ Loading/saving config
- ✓ Form validation
- ✓ Dark mode
- ✓ Responsiveness

---

## HTML/JS Quick Start

### 1. Create admin/index.html

```html
<!DOCTYPE html>
<html>
<head>
    <title>Config</title>
    <link rel="stylesheet" href="../../lib/css/materialize.css">
    <style>
        @media (prefers-color-scheme: dark) {
            body { background: #121212; color: #fff; }
            input { background: #2d2d2d; color: #fff; }
        }
    </style>
</head>
<body>
    <div>
        <label>Host:</label>
        <input id="host" type="text">
    </div>
    
    <script>
        function load(settings, onChange) {
            document.getElementById('host').value = settings?.host || '';
            document.getElementById('host').addEventListener('change', onChange);
        }
        
        function save(callback) {
            callback({
                host: document.getElementById('host').value
            });
        }
    </script>
</body>
</html>
```

### 2. Required Functions

- **`load(settings, onChange)`** - Initialize form
- **`save(callback)`** - Collect and return form data

---

## JSON Field Types Reference

```json5
// Text and Number
{ type: "text", label: "Name" }
{ type: "number", min: 0, max: 100 }
{ type: "port", min: 1, max: 65535 }
{ type: "password", repeat: true }

// Selection
{ type: "checkbox" }
{ type: "select", options: [{ label: "A", value: 1 }] }
{ type: "chips" }  // Array of values

// Advanced
{ type: "table", items: [...] }  // Editable table
{ type: "accordion", items: [...] }  // Collapsible
{ type: "jsonEditor" }  // JSON editor
{ type: "image", crop: true }  // Image upload
{ type: "file" }  // File picker

// Special
{ type: "sendTo" }  // Sends command to adapter
{ type: "objectId" }  // Pick an object ID
{ type: "instance" }  // Pick adapter instance
{ type: "user" }  // Pick system user
{ type: "room" }  // Pick room
{ type: "color" }  // Color picker
{ type: "cron" }  // CRON expression

// Layout
{ type: "header", text: "Section Title" }
{ type: "staticText", text: "Some info" }
{ type: "divider" }
{ type: "panel", items: {...} }
{ type: "tabs", items: {...} }
```

---

## Save/Close Button Behavior

| Event | HTML/JS | JSON Config |
|-------|---------|------------|
| **Page opens** | Save button DISABLED | Save button DISABLED |
| **User changes field** | Call `onChange()` to enable Save | Auto-detected, Save ENABLED |
| **User clicks Save** | Call `save()` function | Automatic save |
| **Validation fails** | Return `false` from `save()` | Can't save (red error) |
| **User clicks Close** | Asks if unsaved changes exist | Asks if unsaved changes exist |

---

## Dark Mode CSS Template

```css
/* Light mode (defaults) */
body { background: #fff; color: #333; }
input { background: #fff; color: #333; border: 1px solid #ddd; }

/* Dark mode */
@media (prefers-color-scheme: dark) {
    body { background: #121212; color: #fff; }
    input {
        background: #2d2d2d;
        color: #fff;
        border: 1px solid #444;
    }
    input:focus {
        border-color: #64b5f6;
        box-shadow: 0 0 5px rgba(100, 181, 246, 0.3);
    }
    label { color: #bbb; }
}
```

---

## Password/Sensitive Data Protection

```json
{
  "common": {
    "encryptedNative": ["password", "apiKey", "token"],
    "protectedNative": ["password"]
  }
}
```

- **encryptedNative**: Auto encrypt/decrypt
- **protectedNative**: Hidden from other adapters

---

## Common Mistakes & Fixes

### ❌ Creating Save/Close Buttons in HTML

```html
<!-- WRONG - Don't do this -->
<button id="save">Save</button>
<button id="close">Close</button>
```

✓ **Fix**: Let ioBroker manage buttons. Only create form fields.

### ❌ Not Calling onChange in HTML/JS

```javascript
// WRONG - Save button never enables
document.getElementById('host').addEventListener('change', function() {
    // Forgot to call onChange()
    console.log('Changed!');
});
```

✓ **Fix**: Always call the onChange callback:

```javascript
document.getElementById('host').addEventListener('change', function() {
    onChange();  // ← This enables Save button
});
```

### ❌ Not Supporting Dark Mode

```css
/* WRONG - Only works in light mode */
body { background: white; color: black; }
input { background: white; color: black; }
```

✓ **Fix**: Add dark mode styles:

```css
@media (prefers-color-scheme: dark) {
    body { background: #121212; color: #fff; }
    input { background: #2d2d2d; color: #fff; }
}
```

### ❌ Saving Without Validation

```javascript
// WRONG - Allows invalid data
function save(callback) {
    callback({ port: document.getElementById('port').value });
}
```

✓ **Fix**: Validate first:

```javascript
function save(callback) {
    const port = parseInt(document.getElementById('port').value);
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('Invalid port');
        return false;  // Prevent save
    }
    callback({ port });
}
```

### ❌ Not Implementing load()

```javascript
// WRONG - Form stays empty
function save(callback) {
    callback({ host: document.getElementById('host').value });
}
```

✓ **Fix**: Always implement both load() and save():

```javascript
function load(settings, onChange) {
    document.getElementById('host').value = settings?.host || '';
    document.getElementById('host').addEventListener('change', onChange);
}

function save(callback) {
    callback({ host: document.getElementById('host').value });
}
```

---

## Official Resources

### Documentation
- **JSON Configuration Guide**: 
  https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/adapterjsonconfig.md

- **Adapter Development**: 
  https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/

- **API Docs**: 
  https://github.com/ioBroker/ioBroker.docs/docs/en/dev/adapter-config.md

### Templates & Examples
- **create-adapter** (official template): 
  https://github.com/ioBroker/create-adapter

- **Example Adapters** with working configs:
  - ioBroker.admin (complex)
  - ioBroker.dwd (simple)
  - ioBroker.telegram (custom components)

### JSON Config Schema
- **Schema for VS Code validation**: 
  https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/packages/jsonConfig/schemas/jsonConfig.json

---

## Testing Your Configuration

### Test JSON Config Locally
```bash
# Build your adapter
npm run build

# Install in local ioBroker
# Then check admin interface
```

### Test Dark Mode
1. **Firefox**: DevTools → Accessibility → Check "emulate prefers-color-scheme"
2. **Chrome**: DevTools → Cmd+Shift+P → "Emulate CSS media feature prefers-color-scheme: dark"
3. **System**: Change OS dark mode setting

### Debug in Browser Console
```javascript
// In browser console while on config page

// Check if settings loaded
console.log(window.document);

// Manually test save function
save(function(settings) {
    console.log('Would save:', settings);
});

// Check for console errors
// (usually indicates load/save function issues)
```

---

## Migration Checklist

### From HTML/JS to JSON Config

- [ ] Create `admin/jsonConfig.json5`
- [ ] Copy field definitions from old form
- [ ] Create translation files (`admin/i18n/*.json`)
- [ ] Update `io-package.json` with `"adminUI": { "config": "json" }`
- [ ] Delete old `admin/index.html` (optional - keep as backup)
- [ ] Test in admin interface
- [ ] Test dark mode support
- [ ] Test all field types render correctly
- [ ] Test save/load functionality
- [ ] Test translations

---

## Version Requirements

| Feature | Min Admin Version |
|---------|------------------|
| JSON Config | 5.0.0 |
| Dark Mode | Any |
| i18n support | 5.0.0 |
| `sendTo` component | 6.0.0 |
| Tables | 5.0.0 |
| Accordion | 6.6.0 |
| iframe | 7.7.28 |
| YAML Editor | 7.7.30 |

---

## Support & Help

- **ioBroker Forum**: https://forum.iobroker.net
- **GitHub Issues**: Report bugs to ioBroker.admin repo
- **Discord**: ioBroker community Discord server
- **Telegram**: ioBroker Telegram group

---

## Summary

```
┌─────────────────────────────────────────┐
│  ioBroker Admin Interface Quick Answer │
└─────────────────────────────────────────┘

❓ How do save/close buttons work?
✓ ioBroker auto-generates them
✓ Save calls your save() function (HTML/JS)
✓ Close always available, asks about unsaved changes

❓ How do I enable the Save button?
✓ Call onChange() callback when field changes (HTML/JS)
✓ Automatic in JSON config

❓ How do I support dark mode?
✓ Use @media (prefers-color-scheme: dark) in CSS
✓ Automatic in JSON config

❓ Should I use JSON config or HTML/JS?
✓ Use JSON config (modern approach)
✓ Only use HTML/JS for legacy/custom UI

❓ How do I handle passwords?
✓ Add to encryptedNative in io-package.json
✓ ioBroker encrypts/decrypts automatically

❓ Can I add my own buttons?
✗ Don't add buttons to the config page
✓ Use sendTo type in JSON config if you need custom actions
```

---

**Remember**: For new adapters, always use **JSON Configuration**. It's simpler, more maintainable, and handles dark mode and buttons automatically!
