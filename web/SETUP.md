# Wayli Setup Guide

This guide will help you set up Wayli for the first time.

## Prerequisites

1. **Supabase Project**: You need a Supabase project with the following environment variables configured:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Node.js**: Make sure you have Node.js installed (version 16 or higher)

## Initial Setup Process

### 1. Application Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

### 2. First User Creation

When you first visit the application:

1. You'll be automatically redirected to `/setup`
2. Fill out the form to create your first admin account:
   - **First Name**: Your first name
   - **Last Name**: Your last name
   - **Email**: Your email address
   - **Password**: A secure password (minimum 8 characters)

3. Click "Complete Setup"

The system will automatically:
- **Initialize the database**: Create all necessary tables, policies, and security settings
- **Create your user account**: With admin privileges
- **Create your profile**: In the database with admin role
- **Set up default preferences**: Theme, language, and notification settings
- **Redirect you to the dashboard**: Ready to use

## What Gets Created Automatically

### Database Tables
- `profiles` - User profile information
- `trips` - Travel plans and itineraries
- `locations` - Places visited during trips
- `points_of_interest` - Places you want to visit
- `user_preferences` - User settings and preferences

### Security Features
- **Row Level Security (RLS)**: Enabled on all tables
- **Access Policies**: Users can only access their own data
- **Admin Policies**: Admins can view all user data
- **Automatic Profile Creation**: Trigger creates profiles for new users

### User Account
- **Admin Role**: First user automatically gets admin privileges
- **Email Confirmation**: Automatically confirmed for the first user
- **Default Preferences**: Light theme, English language, notifications enabled

## Troubleshooting

### Database Initialization Fails

If you see "Database initialization failed":

1. **Check Supabase Permissions**: Ensure your service role key has admin privileges
2. **Verify Environment Variables**: Make sure all Supabase credentials are correct
3. **Check Network**: Ensure your app can reach Supabase
4. **Manual Setup**: If automatic setup fails, you can still run the `setup-database.sql` script manually

### Setup Already Completed Error

If you see "Setup has already been completed":

1. This means users already exist in the system
2. You should use the regular login page at `/auth/signin`
3. If you need to reset the system, you'll need to delete all users from Supabase Auth

### Permission Errors

If you encounter permission errors:

1. Verify your Supabase service role key is correct
2. Check that your environment variables are properly set
3. Ensure your Supabase project has the necessary permissions

## Manual Database Setup (Fallback)

If automatic database initialization fails, you can still set up the database manually:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `setup-database.sql` into the editor
4. Run the script to create all necessary tables, policies, and triggers

## Security Notes

- The first user created automatically gets admin privileges
- Only one setup can be performed per installation
- The setup endpoint is protected and only works when no users exist
- All subsequent users will be created through the regular signup process
- Database initialization only works before the first user is created

## Next Steps

After successful setup:

1. **Explore the Dashboard**: Familiarize yourself with the interface
2. **Create Your First Trip**: Start tracking your travels
3. **Invite Users**: Share the application with others
4. **Customize Settings**: Adjust your preferences in the account settings

## Support

If you encounter any issues during setup:

1. Check the browser console for error messages
2. Verify your Supabase configuration
3. Ensure all environment variables are set correctly
4. Check the application logs for detailed error information
5. Try the manual database setup as a fallback