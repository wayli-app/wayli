---
name: ♿ Accessibility Issue
about: Report an accessibility problem or improvement
title: '[A11Y] '
labels: ['accessibility', 'bug']
assignees: ''
---

## ♿ Accessibility Problem

A clear and concise description of the accessibility issue.

## 🔍 WCAG Guideline Violation

Which WCAG 2.1 guideline(s) does this violate?

- [ ] **1.1.1 Non-text Content** - Images missing alt text
- [ ] **1.3.1 Info and Relationships** - Semantic structure issues
- [ ] **1.4.1 Use of Color** - Information conveyed only by color
- [ ] **1.4.3 Contrast (Minimum)** - Insufficient color contrast
- [ ] **2.1.1 Keyboard** - Not keyboard accessible
- [ ] **2.1.2 No Keyboard Trap** - Keyboard trap present
- [ ] **2.4.1 Bypass Blocks** - No way to skip repetitive content
- [ ] **2.4.2 Page Titled** - Missing or inappropriate page title
- [ ] **2.4.3 Focus Order** - Focus order doesn't follow logical sequence
- [ ] **2.4.4 Link Purpose (In Context)** - Link purpose unclear
- [ ] **2.4.6 Headings and Labels** - Headings or labels unclear
- [ ] **2.4.7 Focus Visible** - No visible focus indicator
- [ ] **3.2.1 On Focus** - Context changes on focus
- [ ] **3.2.2 On Input** - Context changes on input
- [ ] **4.1.1 Parsing** - Markup validation errors
- [ ] **4.1.2 Name, Role, Value** - ARIA implementation issues
- [ ] **Other** - Please specify

## 🔄 Steps to Reproduce

1. Navigate to '...'
2. Use [screen reader/keyboard/other assistive technology]
3. Attempt to '...'
4. Observe the issue

## ✅ Expected Behavior

A clear and concise description of what should happen from an accessibility perspective.

## ❌ Actual Behavior

A clear and concise description of what actually happens.

## 🛠️ Assistive Technology Used

What assistive technology were you using when you encountered this issue?

- [ ] **Screen Reader**: [e.g. NVDA, JAWS, VoiceOver, TalkBack]
- [ ] **Keyboard Only**: No mouse, keyboard navigation only
- [ ] **Voice Control**: [e.g. Dragon NaturallySpeaking, Voice Control]
- [ ] **Switch Control**: [e.g. iOS Switch Control, Android Switch Access]
- [ ] **High Contrast Mode**: High contrast display settings
- [ ] **Zoom**: Browser zoom at 200% or higher
- [ ] **Other**: Please specify

## 🖥️ Environment

**Desktop:**
- OS: [e.g. Windows 11, macOS Ventura, Ubuntu 22.04]
- Browser: [e.g. Chrome, Firefox, Safari, Edge]
- Screen Reader: [e.g. NVDA 2023.1, JAWS 2023, VoiceOver]
- Version: [e.g. 22]

**Mobile:**
- Device: [e.g. iPhone 14, Samsung Galaxy S23]
- OS: [e.g. iOS 17, Android 14]
- Browser: [e.g. Safari, Chrome]
- Screen Reader: [e.g. VoiceOver, TalkBack]
- Version: [e.g. 22]

## 📸 Screenshots/Videos

If applicable, add screenshots or videos showing the accessibility issue.

## 🔍 Technical Details

### HTML Structure
If relevant, please share the HTML structure around the problematic element:

```html
<div class="problematic-element">
  <!-- HTML structure here -->
</div>
```

### ARIA Attributes
Are there any ARIA attributes present? Are they correct?

```html
<button aria-label="..." role="..." aria-expanded="...">
  <!-- Button content -->
</button>
```

### CSS Issues
Are there any CSS issues affecting accessibility?

```css
/* CSS that might be causing issues */
.problematic-element {
  /* CSS rules here */
}
```

## 🎯 Impact Assessment

How does this issue affect users?

- [ ] **Critical** - Completely blocks functionality
- [ ] **High** - Significantly impacts usability
- [ ] **Medium** - Creates difficulty but workable
- [ ] **Low** - Minor inconvenience

## 💡 Suggested Solution

If you have ideas for how to fix this issue, please share them:

- **Semantic HTML**: Use proper HTML elements
- **ARIA Attributes**: Add appropriate ARIA attributes
- **Keyboard Navigation**: Ensure keyboard accessibility
- **Color Contrast**: Improve color contrast
- **Focus Management**: Improve focus indicators
- **Alternative Text**: Add descriptive alt text
- **Other**: Please specify

## 🔗 Related Issues

Link any related accessibility issues:

- Related issue: #[issue number]
- Similar issue: #[issue number]

## 📝 Additional Context

Add any other context about the accessibility issue here.

## 🏷️ Labels

Please add appropriate labels:
- `accessibility` - Accessibility-related issue
- `bug` - Something isn't working
- `critical` - Critical accessibility issue
- `screen-reader` - Screen reader specific issue
- `keyboard` - Keyboard navigation issue
- `contrast` - Color contrast issue
- `semantic` - Semantic HTML issue

---

**Thank you for helping us make Wayli more accessible! ♿✨**