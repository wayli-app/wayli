# Wayli - Location Tracking App

A SvelteKit + Supabase application for location tracking and trip management.

## Features

- User authentication and authorization
- Location tracking with OwnTracks integration
- Trip management and planning
- Points of interest
- Background job processing with configurable workers
- Admin dashboard for user and system management

## Background Job System

The application includes a configurable background job processing system that can handle various tasks:

### Job Types

- **Reverse Geocoding**: Convert coordinates to human-readable addresses
- **Trip Cover Generation**: Generate cover photos for trips using AI
- **Statistics Update**: Calculate travel summaries and reports
- **Photo Import**: Import and process photo data
- **Data Cleanup**: Clean up old or invalid data
- **User Analysis**: Analyze user behavior and patterns

### Real-time Job Notifications

The system uses **Supabase Realtime** for immediate job detection:

- **Instant Processing**: Jobs are picked up within milliseconds of creation
- **Reduced Latency**: No more waiting for polling intervals
- **Lower Database Load**: Eliminates constant polling queries
- **Better Scalability**: More workers don't increase database load
- **Fallback Protection**: Polling continues as backup if real-time fails
- **Automatic Setup**: Realtime channels are automatically created and configured
- **Connection Management**: Automatic reconnection with exponential backoff

#### Channel Setup

Realtime channels are automatically initialized during:
- **First User Setup**: When creating the initial admin account
- **Worker Manager Startup**: When starting the worker system
- **Individual Worker Startup**: When each worker connects

The system includes a `RealtimeSetupService` that:
- Tests realtime connectivity during initialization
- Creates unique channels for each worker
- Handles connection failures gracefully
- Provides realtime status monitoring

#### Monitoring and Testing

The admin interface provides:
- **Realtime Status**: Connection health and availability
- **Configuration Info**: Supabase URL and realtime support status
- **Test Functionality**: Verify realtime is working correctly
- **Latency Metrics**: Compare realtime vs polling performance

#### Troubleshooting

If realtime is not working:
1. Check Supabase project settings for realtime enablement
2. Verify network connectivity to Supabase
3. Check browser console for connection errors
4. Use the "Test Realtime" button in admin interface
5. Workers will automatically fall back to polling mode

### Worker Configuration

The number of workers and their behavior can be configured using environment variables:

```bash
# Number of concurrent workers (default: 2)
MAX_WORKERS=4

# How often workers poll for new jobs in milliseconds (default: 5000)
# Note: With real-time enabled, this is used as fallback only
WORKER_POLL_INTERVAL=3000

# Maximum time a job can run before timeout in milliseconds (default: 300000)
JOB_TIMEOUT=600000

# Number of retry attempts for failed jobs (default: 3)
RETRY_ATTEMPTS=5

# Delay between retry attempts in milliseconds (default: 60000)
RETRY_DELAY=30000
```

### Worker Management

Admins can manage workers through the Server Admin Settings page:

1. **Start/Stop Workers**: Control the worker system
2. **Configure Worker Count**: Dynamically adjust the number of workers
3. **Real-time Configuration**: Update polling intervals, timeouts, and retry settings
4. **Monitor Status**: View active workers and their current jobs
5. **Real-time Progress**: Track job progress in real-time
6. **Worker Health**: Monitor worker heartbeats and connection status

### Job Queue Features

- **Priority System**: Jobs can have low, normal, high, or urgent priority
- **Progress Tracking**: Real-time progress updates for running jobs
- **Error Handling**: Failed jobs are marked with error details
- **Job Cancellation**: Running or queued jobs can be cancelled
- **Timeout Protection**: Jobs that exceed the timeout are automatically failed
- **Worker Health Monitoring**: Workers send heartbeats to track their status
- **Real-time Notifications**: Immediate job pickup via Supabase Realtime
- **Graceful Degradation**: Falls back to polling if real-time fails

## Job Queue System

The application includes a robust job queue system for handling background tasks with real-time updates and duplicate prevention.

### Features

- **Real-time Status Updates**: Jobs show live progress and status changes via Server-Sent Events
- **Duplicate Prevention**: Users cannot create multiple jobs of the same type simultaneously
- **Configurable Workers**: Dynamic worker count adjustment with start/stop controls
- **Retry Logic**: Automatic retry with configurable attempts and delays
- **Priority System**: Jobs can be queued with different priority levels
- **Progress Tracking**: Real-time progress updates with percentage completion
- **Error Handling**: Comprehensive error reporting and recovery

### Job Types

- **Reverse Geocoding**: Full refresh or missing points only
- **Trip Cover Generation**: AI-powered cover photo generation
- **Statistics Update**: Travel summaries and chart generation
- **Photo Import**: Import from various sources
- **Data Cleanup**: Database optimization and duplicate removal
- **User Analysis**: Behavior pattern analysis

### Live Updates

The jobs page provides real-time status updates through:

1. **Server-Sent Events (SSE)**: Primary real-time communication
2. **Fallback Polling**: Automatic fallback if SSE connection fails
3. **Visual Indicators**: Live progress bars and status icons
4. **Connection Status**: Shows whether live updates are active

### Duplicate Prevention

The system prevents users from creating multiple jobs of the same type:

- **Active Job Detection**: Checks for queued or running jobs of the same type
- **UI Feedback**: Disables buttons and shows active job status
- **API Protection**: Server-side validation prevents duplicate creation
- **Status Display**: Shows current job progress and estimated completion

### Testing

```bash
# Test job creation and execution
npm run test:jobs

# Test realtime notifications
npm run test:realtime

# Test live updates functionality
npm run test:live-updates
```

## Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Set up your environment variables
4. Run the database setup script
5. Start the development server: `bun run dev`

## Environment Variables

Create a `.env` file with the following variables:

```bash
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Worker configuration
MAX_WORKERS=2
WORKER_POLL_INTERVAL=5000
JOB_TIMEOUT=300000
RETRY_ATTEMPTS=3
RETRY_DELAY=60000
```

## Database Setup

Run the database setup script to create all necessary tables and policies:

```sql
-- Run sql/setup-database.sql in your Supabase SQL editor
```

## Development

- **Frontend**: SvelteKit with TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Melt UI
- **Job Processing**: Custom worker system with configurable concurrency

## Deployment

The application can be deployed to any platform that supports Node.js. The worker system will automatically start with the configured number of workers.

For production deployments, consider:

- Setting appropriate worker counts based on your server resources
- Configuring job timeouts based on your job complexity
- Monitoring worker health and job completion rates
- Setting up alerts for failed jobs or worker issues

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
├── sql/setup-database.sql      # Database initialization script
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
