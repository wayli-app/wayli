# Complete Supabase Storage Setup for Trip Images

This guide will set up the complete storage infrastructure for trip image uploads.

## Prerequisites

1. **Supabase Project** - You need a Supabase project with authentication enabled
2. **Environment Variables** - Make sure your environment variables are set up

## Step 1: Environment Variables

Ensure these environment variables are set in your `.env.local` file:

```bash
PUBLIC_SUPABASE_URL=your_supabase_project_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Step 2: Run Storage Policies

The storage policies are now automatically included in the main database setup script (`sql/setup-database.sql`). When you run the setup script, it will:

1. **Create the trip-images bucket** with proper settings
2. **Enable Row Level Security** on storage objects
3. **Create user-specific policies** that allow users to manage their own images
4. **Allow public read access** so images can be displayed without authentication

## Step 3: Verify Setup

After running the SQL, you should see:

1. **Bucket created**: `trip-images` bucket in your storage
2. **Policies created**: 5 policies for the storage.objects table
3. **RLS enabled**: Row Level Security is active

## How the Policies Work

### Folder Structure
Images are stored with this structure: `{user_id}/trips/{timestamp}-{filename}`

Example: `123e4567-e89b-12d3-a456-426614174000/trips/1751492222423-image.jpg`

### Security Policies

1. **Upload Policy**: Users can only upload to their own folder (`{user_id}/...`)
2. **View Policy**: Users can only view their own images
3. **Update Policy**: Users can only update their own images
4. **Delete Policy**: Users can only delete their own images
5. **Public Read**: Anyone can view images (for display purposes)

### User Isolation
- Each user's images are stored in their own folder
- Users cannot access other users' images
- The `auth.uid()` function ensures proper user isolation

## Step 4: Test the Setup

1. **Create a new trip** with an image
2. **Edit an existing trip** and add/change an image
3. **Verify the image appears** in the trip card
4. **Check the storage bucket** to see the folder structure

## Troubleshooting

### Common Issues

1. **"Bucket does not exist"**
   - Run the sql/setup-database.sql script again
   - Check that the bucket was created in Supabase Dashboard

2. **"Permission denied"**
   - Ensure RLS is enabled on storage.objects
   - Verify all policies were created successfully
   - Check that the user is authenticated

3. **"Upload timeout"**
   - Check your internet connection
   - Verify the file size is under 5MB
   - Ensure the file type is allowed (JPEG, PNG, GIF, WebP)

### Debug Steps

1. **Check bucket existence**:
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'trip-images';
   ```

2. **Check policies**:
   ```sql
   SELECT policyname FROM pg_policies
   WHERE tablename = 'objects' AND schemaname = 'storage';
   ```

3. **Test user authentication**:
   ```sql
   SELECT auth.uid();
   ```

## File Size and Type Limits

- **Maximum file size**: 5MB (5,242,880 bytes)
- **Allowed formats**: JPEG, PNG, GIF, WebP
- **Storage location**: User-specific folders in trip-images bucket

## Security Features

✅ **User isolation** - Users can only access their own images
✅ **File type validation** - Only image files allowed
✅ **Size limits** - Prevents large file uploads
✅ **Public read access** - Images can be displayed without auth
✅ **Secure uploads** - Files stored in user-specific folders

## Next Steps

After completing this setup:

1. **Test image uploads** in your application
2. **Monitor storage usage** in Supabase Dashboard
3. **Consider implementing** image optimization if needed
4. **Set up backup policies** for important images

Your trip image upload feature should now work perfectly with proper security and user isolation!