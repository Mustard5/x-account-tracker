# Changelog

All notable changes to the X Account Tracker extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-09

### Added
- AI-powered sentiment analysis using local Ollama integration
- Content analysis feature to analyze post content for sentiment
- Pattern recognition to learn from user interactions
- Topic extraction to automatically detect topics from posts
- Auto-suggest tags feature for intelligent tagging recommendations
- Configurable AI settings in popup interface
- Support for multiple AI models (Llama 3.2, Llama 3.1, Mistral)
- AI analysis caching in IndexedDB
- Interaction tracking for pattern recognition
- Detailed AI reasoning display in tagging interface
- Test connection button for Ollama validation

### Changed
- Upgraded to Manifest V3 for better browser compatibility
- Improved badge positioning and styling
- Enhanced tagging menu with AI suggestions
- Refactored database schema to version 7 with AI support
- Updated popup interface with AI Settings tab
- Improved visual feedback for AI processing

### Fixed
- Fixed badge positioning conflicts with X UI elements
- Resolved click event propagation issues in tagging menu
- Fixed JSON parsing errors in AI response handling
- Improved error handling for Ollama connection failures

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Basic account tracking functionality
- Manual sentiment tagging (agree, disagree, mixed, expert, biased, neutral)
- Topic tagging system
- Notes functionality for accounts
- Export/Import data features
- Visual badges for tracked accounts
- Hover-to-tag interface
- Local IndexedDB storage
- Support for X.com and twitter.com domains
- Chrome and Firefox compatibility

### Features
- Simple and clean UI
- Privacy-focused local data storage
- No external server dependencies
- Fast and lightweight
- Custom styling for X/Twitter integration

## [Unreleased]

### Planned Features
- Support for additional AI models
- Advanced filtering and search capabilities
- CSV and Markdown export formats
- Optional cross-browser sync
- Customizable sentiment categories
- Analytics dashboard
- Bulk operations for account management
- Tag hierarchy and relationships
- Historical tracking of sentiment changes
- Integration with other social media platforms

### Under Consideration
- Cloud backup options (optional)
- Team/shared tracking features
- Browser sync via GitHub Gist
- Mobile browser support
- API for external integrations

---

## Version History

- **2.0.0** - Major update with AI features
- **1.0.0** - Initial stable release

## Migration Guide

### Upgrading from 1.x to 2.0

1. **Automatic Database Migration**: The extension will automatically upgrade your database from version 6 to version 7 when you first run version 2.0.0.

2. **Backup Your Data**: Before upgrading, export your data using the old version:
   - Click the extension icon
   - Click "Export Data"
   - Save the JSON file

3. **Install New Version**: Update to version 2.0.0

4. **Verify Data**: Check that your tracked accounts are still present

5. **Configure AI** (Optional): 
   - Install Ollama
   - Pull a model: `ollama pull llama3.2:3b`
   - Open AI Settings in the extension popup
   - Enable AI features

### Breaking Changes

- Database schema updated (automatic migration included)
- New permissions required for Ollama localhost access
- Icon file format changed from .jpg to .png (update your files accordingly)

## Support

For issues or questions about specific versions:
- Check the [Issues](https://github.com/Mustard5/x-account-tracker/issues) page
- Review [Closed Issues](https://github.com/Mustard5/x-account-tracker/issues?q=is%3Aissue+is%3Aclosed)
- Start a [Discussion](https://github.com/Mustard5/x-account-tracker/discussions)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
