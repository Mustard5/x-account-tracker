# Contributing to X Account Tracker

First off, thank you for considering contributing to X Account Tracker! It's people like you that make this extension better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [your-email@example.com].

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git
- A Chromium-based browser (Chrome, Edge, Brave) or Firefox
- Ollama (for testing AI features)

### Project Structure

```
x-account-tracker/
├── manifest.json          # Extension manifest (Manifest V3)
├── content.js            # Main content script
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── styles.css            # Styles for injected elements
└── icons/                # Extension icons
```

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
A clear description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]
- Extension Version: [e.g., 2.0.0]
- Ollama Version: [e.g., 0.1.0]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- A clear and descriptive title
- A detailed description of the proposed functionality
- Explain why this enhancement would be useful
- List any alternative solutions you've considered

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Simple issues perfect for newcomers
- `help wanted` - Issues where we need community help
- `documentation` - Improvements to documentation

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Mustard5/x-account-tracker.git
cd x-account-tracker
```

### 2. Install Dependencies (if any)

```bash
# Currently, this project has no build dependencies
# If you add any, document them here
```

### 3. Load Extension in Browser

**Chrome/Chromium:**
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project directory

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json`

### 4. Set Up Ollama (for AI features)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2:3b
```

## Coding Guidelines

### JavaScript Style Guide

- Use ES6+ features
- Use `const` and `let`, avoid `var`
- Use descriptive variable names
- Add comments for complex logic
- Keep functions small and focused
- Use async/await for asynchronous operations

**Example:**

```javascript
// Good
async function analyzeUserInteraction(username, interactionType) {
  const interaction = await getInteraction(username);
  return processInteraction(interaction, interactionType);
}

// Avoid
function doStuff(u, t) {
  // unclear what this does
  var x = getSomething(u);
  return doMore(x, t);
}
```

### CSS Style Guide

- Use meaningful class names with `xat-` prefix (X Account Tracker)
- Keep selectors specific to avoid conflicts
- Use CSS custom properties for theming
- Comment complex selectors

**Example:**

```css
/* Good */
.xat-badge {
  --badge-color: #10b981;
  background-color: var(--badge-color);
  border-radius: 4px;
}

/* Avoid */
.b {
  background: green;
}
```

### HTML Guidelines

- Use semantic HTML5 elements
- Include ARIA labels for accessibility
- Keep markup clean and readable
- Test with screen readers

### Commit Messages

Follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(ai): add support for mistral model

- Added Mistral 7B to available models
- Updated model selection UI
- Added configuration validation

Closes #123
```

```
fix(content): resolve badge positioning issue

Badge was overlapping with X UI elements on narrow screens.
Adjusted positioning logic to be more responsive.

Fixes #456
```

## Pull Request Process

### Before Submitting

- [ ] Test your changes thoroughly
- [ ] Update documentation if needed
- [ ] Add comments to complex code
- [ ] Ensure code follows style guidelines
- [ ] Test in both Chrome and Firefox
- [ ] Test with and without AI features enabled

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested your changes

## Screenshots (if applicable)
Add screenshots to demonstrate changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tested in Chrome
- [ ] Tested in Firefox
```

### Review Process

1. At least one maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release

## Testing Guidelines

### Manual Testing

Test these scenarios:
- Extension loads without errors
- Account tagging works on X.com
- AI features work with Ollama running
- Data export/import functions correctly
- Extension works in incognito/private mode
- No conflicts with other extensions

### Browser Testing

- Test in Chrome (latest)
- Test in Firefox (latest)
- Test in Edge (if possible)

## Documentation

### Code Comments

Add comments for:
- Complex algorithms
- Non-obvious design decisions
- API interactions
- Browser-specific workarounds

### README Updates

Update README.md when:
- Adding new features
- Changing installation steps
- Modifying configuration options
- Adding new dependencies

## Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Pull Requests**: Code contributions and reviews

### Getting Help

If you need help:
1. Check existing documentation
2. Search closed issues
3. Ask in GitHub Discussions
4. Tag maintainers in your issue

## Recognition

Contributors will be:
- Listed in README.md
- Credited in CHANGELOG.md
- Mentioned in release notes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to X Account Tracker! 🎉
