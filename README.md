# Tết Việt Service

A full-stack event management web application I built to help my Vietnamese community celebrate Lunar New Year 2026. This volunteer project handles everything from event registration to QR code check-ins, deployed as a Google Apps Script Web App with multi-language support.

### Why I Built This

This project is close to my heart for two reasons. First, it's my way of giving back to the Vietnamese community that shaped who I am. Second, it gave me a chance to learn new ways to do things (SolidJS and Google Apps Script) while solving a real-world problem. I wanted to create something sustainable that future organizers could use even after I hand it off.

## Design Decisions

### Why Google Apps Script?

I chose Google Apps Script because I wanted this project to outlive my involvement. Here's my thinking:

- **Zero Infrastructure Cost**: Community organizations run on tight budgets. No hosting fees means they can use this year after year without worrying about expenses.
- **Easy Handoff**: Next year's organizers can literally just duplicate the Google Sheet and have a working system. No servers to configure, no databases to set up.
- **Familiar Tools**: Everyone on the organizing committee already knows Google Sheets. I didn't want them to learn a new database system just to check registrations.
- **Built-in Integration**: Native Gmail and Drive connectivity meant I could focus on features instead of fighting with API authentication.
- **Long-term Maintainability**: When I'm not around, someone with basic Google Workspace knowledge can keep this running.

### Why SolidJS and Ark UI?

Honestly? I wanted to learn something new.

- **Modern Reactivity**: I'd been curious about SolidJS's fine-grained reactivity model—how it avoids the virtual DOM entirely. This project let me dive deep into that.
- **Accessibility**: Ark UI's headless components gave me WCAG compliance out of the box.
- **Growth Mindset**: Learning emerging frameworks keeps me adaptable.

## Key Features

### Event Registration
- Ticket availability tracking with automatic capacity management
- Email confirmations
- QR code generation for contactless check-in
- Support for multiple ticket types

### Check-In Management
- Camera-based QR code scanner for fast attendee verification
- Real-time status updates and duplicate check-in prevention

### Admin Panel
- Centralized configuration management for all routes
- Dynamic route protection with password authentication
- Route-level metadata customization (ticket limits, pricing, event details)
- Real-time route status control (open/closed)

### Multi-Language Support
- Internationalization for English, French, and Vietnamese
- Locale-specific content for all user-facing modules
- Persistent user language preferences

## Technical Architecture

### Frontend Stack
- **SolidJS** - Reactive UI framework with fine-grained reactivity
- **TypeScript** - Type-safe development with comprehensive type definitions
- **TailwindCSS 4** - Utility-first styling with custom design system
- **Ark UI** - Accessible, headless component primitives
- **Vite 7** - Modern build tool with optimized bundling

### Backend Stack
- **Google Apps Script** - Server-side JavaScript runtime
- **Google Sheets API** - Structured data storage and retrieval
- **Gmail API** - Automated email confirmation system
- **Google Drive** - Asset and template management

### Build System & Tooling
- Custom Vite plugin for Google Apps Script deployment
- Code splitting with dynamic route loading
- Minification and compression for bandwidth optimization
- CLASP integration for automated deployment
- ESLint + Prettier for code quality and consistency

### Advanced Implementation Details

#### Custom Build Pipeline
Developed a custom Vite plugin system that:
- Bundles multiple SPA routes into IIFE modules for Apps Script compatibility
- Implements code compression using yEnc encoding to further reduce payload size
- Generates a manifest-based routing system for easy deployment with Apps Script
- Exposes module functions to global scope for Apps Script event handling

#### Security Architecture
- Password hashing and validation for protected routes
- Route-level access control with configurable protection rules

#### Data Persistence Strategy
- Schema-less Google Sheets integration with column-based data mapping
- Atomic operations using Google Apps Script Lock Service
- Transaction-safe concurrent write handling

## Project Structure

```
src/
├── server/              # Google Apps Script backend
│   ├── admin-panel.ts   # Admin configuration management
│   ├── registration.ts  # Event registration logic
│   ├── webapp.ts        # HTTP request routing
│   └── polyfills/       # Browser API polyfills for Apps Script
├── web/                 # Frontend application
│   ├── routes/          # Application routes (SPA pages)
│   │   ├── admin/       # Admin panel
│   │   ├── checkin/     # Check-in scanner
│   │   ├── password-protector/  # Auth gate
│   │   └── registration/        # Registration form
│   ├── ui/              # Reusable UI components
│   └── lib/             # Utility functions
└── types/               # Shared TypeScript definitions
```

## Development Workflow

### Prerequisites
- Node.js 18+
- npm 9+
- Google account with Apps Script access
- CLASP CLI configured with Google credentials

### Setup
```bash
# Install dependencies
npm install

# Build the application
npm run build

# Deploy to Google Apps Script
npm run deploy

# Lint and format code
npm run lint:fix
npm run format
```

## What's Next: Lessons Learned and Future Improvements

While Google Apps Script was a fine choice for this community project, I've hit enough limitations to appreciate what a more traditional stack offers. Here's what I'm planning to explore next:

### Moving to a Modern Full-Stack Architecture

For future iterations, I want to experiment with:
- **Vercel + SolidJS**: Edge runtime for better global performance and modern deployment workflows
- **PostgreSQL or Supabase**: Real relational database with proper schemas, migrations, and query optimization
- **Improved Security**: Better authentication (OAuth 2.0, JWTs), rate limiting, and input validation at the API layer
- **Enhanced Performance**: Server-side rendering, API routes with proper caching strategies, and real-time subscriptions via WebSockets

### Google Apps Script: The Good, The Bad, The Workarounds

Working with Apps Script taught me valuable lessons about constraint-based problem solving:

**Runtime Limitations I Encountered:**
- **ES6+ Compatibility**: No native support for modern JavaScript features like `TextEncoder`/`TextDecoder`, requiring custom polyfills
- **Not a Real API**: Google Apps Script can't return arbitrary JSON with proper HTTP status codes. Everything goes through `HtmlService` or `ContentService` with limited control over headers and response types
- **No RESTful Patterns**: Can't build proper REST endpoints with different HTTP methods (GET, POST, PUT, DELETE). All requests come through `doGet()` or `doPost()` with limited routing control
- **Limited Debugging**: Sparse error messages and no source maps made troubleshooting painful at times
- **No WebSocket Support**: Real-time features require polling instead of proper bidirectional communication

**Security Limitations:**
- **Session Management Constraints**: Using `CacheService` for sessions with arbitrary expiration times isn't as robust as Redis or proper JWT token management
- **No CORS Control**: Can't properly configure CORS policies. All Apps Script web apps are effectively wide open to cross-origin requests
- **Script Properties Visibility**: Anyone with edit access to the Google Sheet can view Script Properties where I store the admin password

These constraints forced creative problem-solving, but for a production system with growth potential, I'd choose a stack with fewer guardrails. The experience was invaluable for learning how to work within limitations, but I'm excited to explore what's possible without them.

## License

GPLv3 License - See LICENSE file for details
