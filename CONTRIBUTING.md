# Contributing to AIGNE Hub

We welcome contributions to AIGNE Hub! This project is part of the larger AIGNE ecosystem and follows our community guidelines.

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/blocklet/ai-kit.git
cd ai-kit

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm lint` - Run linter
- `pnpm clean` - Clean build artifacts
- `pnpm bundle` - Create production bundle

## Project Structure

```
aigne-hub/
├── blocklets/core/          # Main AIGNE Hub application
│   ├── api/                   # Backend API implementation
│   │   ├── src/
│   │   │   ├── libs/          # Shared backend libraries
│   │   │   ├── providers/     # AI provider implementations
│   │   │   ├── routes/        # API routes
│   │   │   └── store/         # Database models and migrations
│   │   └── dist/              # Built backend code
│   ├── src/                   # Frontend React application
│   │   ├── components/        # React components
│   │   ├── pages/             # Application pages
│   │   ├── libs/              # Frontend utilities
│   │   └── locales/           # Internationalization
│   ├── public/                # Static assets
│   ├── package.json
│   └── blocklet.yml           # Blocklet configuration
├── packages/                  # Shared libraries and components
└── package.json               # Workspace configuration
```

## Development Workflow

### Adding a New AI Provider

1. Create provider implementation in `api/src/providers/`
2. Add provider configuration to `api/src/providers/models.ts`
3. Update the frontend provider selection in `src/pages/config/ai-providers/`
4. Add provider logo to `public/logo/`
5. Update documentation

### Database Changes

We use Sequelize for database management. To add new tables or modify existing ones:

1. Create a new migration file in `api/src/store/migrations/`
2. Update the corresponding model in `api/src/store/models/`
3. Run the migration during development with the pre-start hook

### Frontend Development

- Built with React 19 and TypeScript
- Uses Material-UI for components
- Internationalization with custom locales system
- State management with Zustand

### API Development

- Node.js with TypeScript
- Express.js framework
- SQLite database with Sequelize ORM
- AIGNE framework integration

## Code Style

We use ESLint and Prettier for code formatting. Please ensure your code follows these standards:

```bash
# Check code style
pnpm lint

# Auto-fix code style issues
pnpm lint:fix
```

## Testing

Currently, the project uses manual testing. We welcome contributions to add automated testing:

- Unit tests for utility functions
- Integration tests for API endpoints
- E2E tests for critical user flows

## Submitting Changes

1. **Fork the repository** and create a new branch from `main`
2. **Make your changes** following the code style guidelines
3. **Test thoroughly** - ensure your changes don't break existing functionality
4. **Update documentation** if you're adding new features
5. **Create a pull request** with a clear description of your changes

### Pull Request Guidelines

- Use a clear and descriptive title
- Include a detailed description of changes made
- Reference any related issues
- Include screenshots for UI changes
- Ensure all checks pass

## Adding New Features

When adding new features:

1. **Discuss first** - Create an issue to discuss the feature before implementation
2. **Follow patterns** - Look at existing code to understand current patterns
3. **Update configuration** - Add necessary environment variables and settings
4. **Document thoroughly** - Update README and create any necessary documentation
5. **Consider backwards compatibility** - Ensure changes don't break existing deployments

## Debugging

### Backend Debugging

```bash
# Enable verbose logging
VERBOSE=true pnpm dev

# Debug specific components
DEBUG=aigne:* pnpm dev
```

### Frontend Debugging

- Use browser developer tools
- React DevTools extension recommended
- Check console for errors and warnings

## Community Guidelines

- Be respectful and inclusive
- Help others learn and grow
- Share knowledge through clear documentation
- Follow the project's coding standards
- Test your changes thoroughly

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/AIGNE-io/aigne-hub/issues)
- **Community**: [ArcBlock Community](https://community.arcblock.io/discussions/boards/aigne)
- **Email**: blocklet@arcblock.io

## License

By contributing to AIGNE Hub, you agree that your contributions will be licensed under the same terms as the project.

---

Thank you for contributing to AIGNE Hub! 🚀
