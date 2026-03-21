
# DragonCandy 🐉🍭

**AI-Powered Content Creation & Collaboration Platform**

DragonCandy is a comprehensive SaaS platform that connects small businesses with professional content creators while providing cutting-edge AI-powered editing tools for social media content creation and distribution.

---

## 🚀 What is DragonCandy?

DragonCandy revolutionizes content creation by combining:
- **AI-Assisted Editing**: Transform raw photos and videos with intelligent scene detection, auto-captioning, and visual enhancements
- **Creator Marketplace**: Connect with vetted professional creators for custom content production
- **Campaign Management**: Plan, execute, and analyze comprehensive marketing campaigns
- **Multi-Platform Publishing**: Distribute content across TikTok, Instagram, Twitter/X, YouTube, Facebook, and LinkedIn

---

## ✨ Core Features

### 🤖 AI-Powered Editing Suite
- **Smart Media Processing**: Upload videos and photos with automatic format validation
- **Scene Detection**: AI analyzes video content for optimal cutting points
- **Auto-Captioning**: Generate accurate captions and subtitles automatically
- **Visual Enhancements**: Image cleanup, filter application, and optimization
- **ChatGPT-4o Copilot**: Intelligent assistance for captions, scripting, and optimization

### 👥 Creator Marketplace
- **Vetted Creator Network**: Access to professional content creators across all niches
- **Smart Discovery**: Advanced filtering by expertise, ratings, budget, and specialization
- **Secure Collaboration**: Built-in messaging, file sharing, and escrow payments
- **Portfolio Reviews**: Browse creator portfolios, ratings, and success stories
- **KYC Verification**: Secure identity verification for all marketplace participants

### 📅 Campaign Management
- **AI Campaign Ideation**: Generate comprehensive campaign strategies with AI assistance
- **Content Calendar**: Visual planning and scheduling across multiple platforms
- **Workflow Automation**: Streamlined approval processes and automated publishing
- **Performance Tracking**: Real-time analytics and ROI measurement
- **Multi-Platform Sync**: Coordinate campaigns across all major social platforms

### 📊 Analytics & Insights
- **Performance Dashboard**: Comprehensive analytics across all connected platforms
- **ROI Tracking**: Monitor campaign performance and budget allocation
- **Engagement Metrics**: Detailed insights into audience interaction and growth
- **AI Optimization**: Smart recommendations for improving content performance

---

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript for type-safe development
- **Vite** for fast development and optimized builds
- **Tailwind CSS** for responsive, utility-first styling
- **Shadcn/UI** for consistent, accessible component library
- **React Query** for efficient data fetching and state management
- **React Router** for client-side routing

### Backend & Database
- **Supabase** for authentication, database, and real-time features
- **PostgreSQL** for robust data storage and relationships
- **Row Level Security (RLS)** for secure data access
- **Supabase Storage** for media file management

### AI & Integration Services
- **OpenAI GPT-4o** for AI copilot features and content generation
- **Stripe Connect** for secure payment processing and escrow
- **Social Media APIs** for multi-platform publishing and analytics
- **Supabase Edge Functions** for serverless backend processing

---

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ai-workflow/     # AI editing and processing components
│   ├── analytics/       # Performance tracking and ROI dashboards
│   ├── auth/           # Authentication and onboarding flows
│   ├── brand/          # Brand campaign management
│   ├── calendar/       # Content calendar and scheduling
│   ├── campaigns/      # Campaign creation and management
│   ├── content/        # Content upload and management
│   ├── dashboard/      # Role-based dashboard components
│   ├── feed/           # Social feed and content discovery
│   ├── jobs/           # Creator job marketplace
│   ├── landing/        # Marketing landing page components
│   ├── marketplace/    # Creator discovery and profiles
│   ├── media/          # Media asset management and AI editing
│   ├── messages/       # Creator-client communication
│   ├── onboarding/     # User onboarding workflows
│   ├── profile/        # User profile management
│   ├── projects/       # Project collaboration tools
│   ├── social/         # Social platform integrations
│   ├── subscription/   # Billing and subscription management
│   ├── ui/             # Base UI component library
│   └── upload/         # File upload and processing
├── contexts/            # React context providers
│   ├── auth/           # Authentication state management
│   ├── onboarding/     # Onboarding flow management
│   └── subscription/   # Subscription and billing context
├── hooks/              # Custom React hooks
├── integrations/       # External service integrations
│   └── supabase/       # Supabase client and types
├── pages/              # Application pages and routing
├── services/           # Business logic and API services
└── types/              # TypeScript type definitions

supabase/
├── functions/          # Edge functions for AI processing
│   ├── ai-enhancement/ # AI-powered content enhancement
│   ├── edit-request/   # Content editing pipeline
│   ├── social-oauth/   # Social platform authentication
│   └── stripe-connect/ # Payment processing
└── migrations/         # Database schema and updates
```

---

## 🎯 User Roles

### 🏢 Business Clients (Content Clients)
- Upload and edit content with AI assistance
- Browse and hire creators from the marketplace
- Manage campaigns and content calendars
- Track performance and ROI across platforms
- Collaborate with creators on custom projects

### 🎨 Content Creators
- Showcase portfolios and set pricing packages
- Receive job invites and project briefs
- Collaborate with clients through built-in tools
- Manage availability and project timelines
- Earn through secure escrow payment system

### 🏷️ Brands
- Access premium creator network
- Advanced campaign management tools
- Comprehensive analytics and reporting
- Priority support and custom integrations

---

## 💰 Pricing Tiers

### Basic ($9/month)
- Upload, edit, and publish content
- AI-assisted enhancements with watermarks
- Limited edits (5/month)
- Basic analytics

### Premium ($29-49/month)
- Everything in Basic
- AI campaign assistant
- Unlimited editing without watermarks
- Post performance insights
- Collaboration tools

### Pro ($99-149/month)
- Everything in Premium
- Full analytics dashboard
- Advanced ROI insights
- Reposting automation
- Top creator access
- Priority support

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase account for backend services
- OpenAI API key for AI features

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dragoncandy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Add your Supabase credentials
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Connect to Supabase**
   - Click the green Supabase button in the top right
   - Follow the setup wizard to connect your database
   - Run the provided migrations for database schema

---

## 🔧 Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Key Development Features
- **Hot Reload**: Instant updates during development
- **TypeScript**: Full type safety across the application
- **Component Library**: Consistent UI with Shadcn/UI
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Real-time Features**: Live updates via Supabase subscriptions

---

## 📈 KPIs & Success Metrics

### Pilot Phase Goals
- **Time-to-first-upload**: < 5 minutes
- **Edit approval rate**: 80%+ user satisfaction
- **Conversion to paid tier**: 15% of free users
- **Creator match rate**: 90% within 48 hours

### Platform Metrics
- User engagement and retention
- Content creation volume and quality
- Creator-client match success rate
- Revenue growth and subscription conversions

---

## 🤝 Contributing

We welcome contributions to DragonCandy! Please read our contributing guidelines and submit pull requests for any improvements.

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 📞 Support

For support, feature requests, or questions:
- 📧 Email: support@dragoncandy.com
- 💬 In-app support chat
- 📚 Documentation: [docs.dragoncandy.com](https://docs.dragoncandy.com)

---

**Built with ❤️ for creators and businesses worldwide**
