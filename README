# Tết Việt Service - Event Management System

A full-stack event management web application I built to help my Vietnamese community celebrate Lunar New Year 2026. This volunteer project handles everything from event registration to QR code check-ins, deployed as a Google Apps Script Web App with multi-language support.

## Overview

I developed this event management system to solve a real problem: helping community organizers manage our annual Tết celebration without the technical headaches or hosting costs. It features registration tracking, QR code-based check-in, password-protected routes, and an admin panel—all built with modern web technologies and deployed on Google's infrastructure for zero cost.

### Why I Built This

This project is close to my heart for two reasons. First, it's my way of giving back to the Vietnamese community that shaped who I am. Second, it gave me a chance to learn new technologies (SolidJS and Ark UI) while solving a real-world problem. I wanted to create something sustainable that future organizers could use even after I hand it off—not just another throwaway event website.

## Design Philosophy

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
- **Performance First**: The compilation approach meant I got great performance without spending hours optimizing.
- **Accessibility**: Ark UI's headless components gave me WCAG compliance out of the box. For a community event, accessibility isn't optional.
- **Growth Mindset**: Learning emerging frameworks keeps me adaptable. Plus, experimenting on a real project beats tutorial hell any day.

## Key Features

### Event Registration System
- Ticket availability tracking with automatic capacity management
- Dual confirmation workflow (initial and final email confirmations)
- QR code generation for contactless check-in
- Support for multiple ticket types (adult and child tickets)
- Multiple payment method tracking (e-transfer and cash)

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
- Custom Vite plugin architecture for Google Apps Script deployment
- Code splitting with dynamic route loading
- HTML minification and compression for bandwidth optimization
- CLASP integration for automated deployment
- ESLint + Prettier for code quality and consistency

### Advanced Implementation Details

#### Custom Build Pipeline
Developed a sophisticated Vite plugin system that:
- Bundles multiple SPA routes into IIFE modules for Apps Script compatibility
- Implements code compression using yEnc encoding to further reduce payload size
- Generates a manifest-based routing system for optimal performance
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

### Build Process
The build system orchestrates several tasks:
1. Compiles TypeScript to optimized JavaScript
2. Bundles each route as an independent module
3. Processes and minifies HTML templates
4. Compresses code using yEnc for size optimization
5. Generates route manifest for dynamic loading
6. Copies static assets to output directory

## Technical Highlights

### Performance Optimizations
- **Code Splitting**: Each route loads independently, reducing initial bundle size
- **Asset Compression**: yEnc encoding reduces deployed file sizes by ~20-30%
- **Minification**: HTML/CSS/JS minification for faster load times

### Browser Compatibility
- Baseline support for widely-available features (ES2020+)
- Progressive enhancement for modern features
- Polyfills for TextEncoder/TextDecoder in Apps Script environment

### Developer Experience
- TypeScript for type safety across full stack
- Comprehensive ESLint rules for code quality
- Prettier for consistent code formatting
- Path aliases for clean imports

## Real-World Impact: Tết 2026

Seeing this system run in production for our community's Tết celebration was incredibly rewarding. It handled:
- 200+ registrations with automatic capacity management (no more oversold tickets!)
- Bilingual confirmation emails in English and Vietnamese
- Smooth QR code check-ins for 200+ guests on event day

## Deployment

The application is deployed as a Google Apps Script Web App, providing:
- Zero infrastructure costs
- Built-in authentication via Google accounts
- Seamless integration with Google Workspace services

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
- **Execution Time Limits**: 6-minute maximum runtime for web requests means complex operations need careful chunking
- **Limited Debugging**: Sparse error messages and no source maps made troubleshooting painful at times
- **No WebSocket Support**: Real-time features require polling workarounds instead of proper bidirectional communication

**Security Limitations That Kept Me Up at Night:**
- **Session Management Constraints**: Using `CacheService` for sessions with arbitrary expiration times isn't as robust as Redis or proper JWT token management
- **No CORS Control**: Can't properly configure CORS policies. All Apps Script web apps are effectively wide open to cross-origin requests
- **Script Properties Visibility**: Anyone with edit access to the Google Sheet can view Script Properties where I store the admin password—there's no secrets management

These constraints forced creative problem-solving, but for a production system with growth potential, I'd choose a stack with fewer guardrails. The experience was invaluable for learning how to work within limitations, but I'm excited to explore what's possible without them.

## License

GPLv3 License - See LICENSE file for details
