# Wayli

A personal travel companion application built with SvelteKit and Supabase. Track your journeys, discover new places, and create unforgettable memories.

## Features

- **Trip Management**: Create and organize your travel plans
- **Location Tracking**: Record every place you visit with precise coordinates
- **Points of Interest**: Save and rate places you want to visit
- **User Management**: Multi-user support with admin capabilities
- **Real-time Updates**: Live synchronization across devices
- **Responsive Design**: Works seamlessly on desktop and mobile

## Quick Start

### Prerequisites

- Node.js (version 16 or higher)
- A Supabase project with proper configuration

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wayli/web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with your Supabase credentials:
   ```env
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. **Set up the database**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Run the contents of `setup-database.sql`

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Complete initial setup**
   - Open your browser to `http://localhost:5173`
   - You'll be redirected to the setup page
   - Create your first admin account

## Initial Setup

For detailed setup instructions, see [SETUP.md](./SETUP.md).

The first time you run Wayli, you'll need to:
1. Create the database tables using the provided SQL script
2. Create your first admin account through the setup flow
3. Configure any additional settings

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
```

## Project Structure

```
web/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API and business logic
│   │   ├── stores/         # Svelte stores
│   │   └── types/          # TypeScript type definitions
│   ├── routes/
│   │   ├── (user)/         # Protected user routes
│   │   ├── api/            # API endpoints
│   │   └── setup/          # Initial setup flow
│   └── static/             # Static assets
├── setup-database.sql      # Database initialization script
└── SETUP.md               # Detailed setup guide
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
