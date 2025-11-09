# Security Policy

## Reporting Security Vulnerabilities

We take the security of X Account Tracker seriously. If you discover a security vulnerability, please help us protect our users by following responsible disclosure practices.

### How to Report a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send details to [your-email@example.com]
2. **GitHub Security Advisories**: Use the [GitHub Security Advisory](https://github.com/Mustard5/x-account-tracker/security/advisories/new) feature for private disclosure

### What to Include in Your Report

To help us understand and address the issue quickly, please include:

- **Type of vulnerability** (e.g., XSS, CSRF, code injection, data exposure)
- **Full paths or URLs** of source files related to the vulnerability
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact assessment** - what an attacker could accomplish
- **Suggested fix** (optional but appreciated)
- **Your contact information** for follow-up questions

### What to Expect

When you report a vulnerability, we commit to:

1. **Acknowledgment**: We'll acknowledge receipt within **48 hours**
2. **Initial Assessment**: We'll provide an initial assessment within **5 business days**
3. **Regular Updates**: We'll keep you informed as we work on a fix
4. **Credit**: We'll credit you in our security advisories (unless you prefer to remain anonymous)
5. **Disclosure Timeline**: We'll work with you on an appropriate disclosure timeline

### Our Security Response Process

1. **Validation** (1-3 days): Confirm the vulnerability exists
2. **Assessment** (1-2 days): Determine severity and impact
3. **Development** (varies): Create and test a fix
4. **Release** (1 day): Deploy the security patch
5. **Disclosure** (coordinated): Publicly disclose with your approval

### Severity Levels

We use the following severity classifications:

| Level | Description | Response Time |
|-------|-------------|---------------|
| **Critical** | Allows arbitrary code execution or data theft | 24-48 hours |
| **High** | Significant security impact but limited scope | 3-7 days |
| **Medium** | Security issue with mitigating factors | 1-2 weeks |
| **Low** | Minor security concern | 2-4 weeks |

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | ✅ Yes             |
| 1.x.x   | ⚠️ Critical fixes only |
| < 1.0   | ❌ No longer supported |

## Security Best Practices for Users

To use X Account Tracker securely:

### 1. Keep Your Extension Updated
- Enable automatic updates in your browser
- Check for updates regularly
- Review the CHANGELOG for security fixes

### 2. Verify Extension Source
- Only install from official sources:
  - GitHub releases: `https://github.com/Mustard5/x-account-tracker/releases`
  - Chrome Web Store (when available)
  - Firefox Add-ons (when available)
- Verify the publisher is **Mustard5**

### 3. Review Permissions
- The extension requires minimal permissions
- Understand what each permission does (see README)
- Report if you notice unexpected permission requests

### 4. Secure Your Ollama Instance
- Keep Ollama updated to the latest version
- Only run Ollama locally (localhost)
- Don't expose Ollama to the internet
- Use firewall rules to restrict Ollama access

### 5. Protect Your Data
- Export your data regularly
- Store backups securely
- Use encrypted storage if handling sensitive information
- Clear extension data when uninstalling

### 6. Browser Security
- Keep your browser updated
- Use strong browser security settings
- Be cautious of other installed extensions
- Use a reputable antivirus/antimalware solution

## Known Security Considerations

### Current Security Design

1. **Local Data Storage**: All data is stored locally in IndexedDB
   - Benefit: No server-side data breaches
   - Consideration: Physical access to device can access data

2. **Ollama Integration**: Connects to localhost Ollama instance
   - Benefit: All AI processing is local
   - Consideration: Requires trusting Ollama software

3. **X.com Access**: Content script runs on X/Twitter pages
   - Benefit: Enables core functionality
   - Consideration: Subject to X's security policies

4. **No Authentication**: No user accounts or external services
   - Benefit: No credential compromise risk
   - Consideration: No cloud backup without manual export

### Potential Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| XSS via user notes | Input sanitization implemented |
| Data exfiltration | No external network requests (except Ollama) |
| Privilege escalation | Minimal permissions requested |
| MITM attacks on Ollama | Localhost-only communication |

## Security Features

### Built-in Security Measures

- ✅ Content Security Policy (CSP) enforcement
- ✅ Input validation and sanitization
- ✅ No eval() or similar dangerous functions
- ✅ Minimal permission scope
- ✅ No external API calls (privacy-preserving)
- ✅ Encrypted storage capability (browser-dependent)
- ✅ No tracking or analytics

### Future Security Enhancements

- [ ] Code signing for releases
- [ ] Automated security scanning in CI/CD
- [ ] Bug bounty program (when mature)
- [ ] Third-party security audit
- [ ] Security.txt file

## Vulnerability Disclosure History

We believe in transparency. Past security issues will be listed here:

### 2025
- No vulnerabilities reported or disclosed yet

### Policy Updates
- **2025-11-09**: Initial security policy created

## Security-Related Questions

For general security questions (not vulnerability reports):
- Open a [GitHub Discussion](https://github.com/Mustard5/x-account-tracker/discussions)
- Tag with `security` label
- Check existing discussions first

## Safe Harbor

We support responsible disclosure and will not pursue legal action against security researchers who:

- Make good faith efforts to avoid privacy violations, data destruction, and service interruption
- Only interact with accounts they own or with explicit permission
- Do not exploit vulnerabilities beyond demonstrating proof of concept
- Report vulnerabilities promptly
- Keep vulnerabilities confidential until we've had time to address them

## Additional Resources

- [OWASP Browser Extension Security](https://owasp.org/www-community/vulnerabilities/Browser_extension_security)
- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Firefox Extension Security](https://extensionworkshop.com/documentation/develop/build-a-secure-extension/)

## Contact

For security concerns: [your-email@example.com]

For general issues: [GitHub Issues](https://github.com/Mustard5/x-account-tracker/issues)

---

**Thank you for helping keep X Account Tracker and its users safe!**

*Last Updated: November 9, 2025*
