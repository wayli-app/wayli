import { supabase } from '$lib/supabase';

/**
 * Upload an image file to Supabase Storage
 */
export async function uploadTripImage(
  file: File,
  fileName?: string
): Promise<string | null> {
  try {
    console.log('🚀 [UPLOAD] Starting image upload...', {
      fileName: file.name,
      size: file.size,
      type: file.type,
      timestamp: new Date().toISOString()
    });

    // Skip authentication check - let storage policies handle it
    console.log('🔍 [UPLOAD] Skipping authentication check - letting storage policies handle auth...');

    // Generate a unique filename (simplified for now)
    const uniqueFileName = fileName || `${Date.now()}-${file.name}`;
    console.log('📝 [UPLOAD] Generated filename:', uniqueFileName);

    // Skip bucket existence check for now
    console.log('🔍 [UPLOAD] Skipping bucket existence check for testing...');
    console.log('⚠️ [UPLOAD] Assuming trip-images bucket exists...');

    // Upload directly to Supabase Storage
    console.log('📤 [UPLOAD] Starting file upload to storage...', {
      bucket: 'trip-images',
      fileName: uniqueFileName,
      fileSize: file.size,
      contentType: file.type,
      timestamp: new Date().toISOString()
    });

    const uploadStartTime = Date.now();

    console.log('🔍 [UPLOAD] Calling supabase.storage.from("trip-images").upload()...');
    const { data: uploadData, error } = await supabase.storage
      .from('trip-images')
      .upload(uniqueFileName, file, {
        contentType: file.type,
        upsert: true
      });

    const uploadEndTime = Date.now();
    console.log('⏱️ [UPLOAD] Upload completed in', uploadEndTime - uploadStartTime, 'ms');
    console.log('📊 [UPLOAD] Upload result:', {
      data: uploadData,
      error,
      timestamp: new Date().toISOString()
    });

    if (error) {
      console.error('❌ [UPLOAD] Failed to upload image to Supabase Storage:', error);
      return null;
    }

    console.log('✅ [UPLOAD] File uploaded successfully, getting public URL...');

    // Get the public URL
    console.log('🔗 [UPLOAD] Generating public URL...');
    const { data: urlData } = supabase.storage
      .from('trip-images')
      .getPublicUrl(uniqueFileName);

    console.log('✅ [UPLOAD] Public URL generated:', urlData.publicUrl);
    console.log('🎉 [UPLOAD] Image upload completed successfully!');
    return urlData.publicUrl;
  } catch (error) {
    console.error('💥 [UPLOAD] Unexpected error uploading image:', error);
    console.error('💥 [UPLOAD] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

/**
 * Delete an image from Supabase Storage
 */
export async function deleteTripImage(imageUrl: string): Promise<boolean> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Failed to get user:', userError);
      return false;
    }

    // Extract the file path from the URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = fileName;

    // Delete from Supabase Storage
    const { error } = await supabase.storage
      .from('trip-images')
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image from Supabase Storage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting image:', error);
    return false;
  }
}