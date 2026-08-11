package io.github.nimbleflux.wayli.feature.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import io.github.nimbleflux.fluxbase.FluxbaseClient
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles photo upload to the Fluxbase storage bucket. Compresses images
 * client-side before uploading (matching the web app's behavior).
 */
@Singleton
class MediaUploader @Inject constructor(
    private val client: FluxbaseClient,
) {
    /**
     * Upload a photo from a content [Uri]. Compresses to JPEG (quality 85,
     * max edge 1920px) before uploading to the `trip-images` bucket.
     *
     * @return the storage path of the uploaded file.
     */
    suspend fun uploadPhoto(
        context: Context,
        uri: Uri,
        bucket: String = "trip-images",
        pathPrefix: String = "entries",
    ): Result<String> = runCatching {
        val bitmap = decodeAndCompress(context, uri, maxEdge = 1920)
        val bytes = bitmapToJpeg(bitmap, quality = 85)
        val path = "$pathPrefix/${UUID.randomUUID()}.jpg"

        val result = client.storage.from(bucket).upload(
            path = path,
            data = bytes,
            contentType = "image/jpeg",
            upsert = false,
        )
        path
    }

    /**
     * Create a signed URL for displaying a stored image.
     */
    suspend fun getSignedUrl(
        bucket: String = "trip-images",
        path: String,
        expiresIn: Int = 3600,
    ): Result<String> = runCatching {
        val result = client.storage.from(bucket).createSignedUrl(path, expiresIn)
        result.data?.signedUrl ?: throw Exception("Failed to get signed URL")
    }

    /**
     * Upload an avatar for [userId] (256px JPEG, matching the web app) and
     * return a long-lived signed URL suitable for storing on `avatar_url`.
     */
    suspend fun uploadAvatar(context: Context, uri: Uri, userId: String): Result<String> = runCatching {
        val bitmap = decodeAndCompress(context, uri, maxEdge = 256)
        val bytes = bitmapToJpeg(bitmap, quality = 85)
        val path = "$userId/avatar-${UUID.randomUUID()}.jpg"
        client.storage.from("trip-images").upload(
            path = path,
            data = bytes,
            contentType = "image/jpeg",
            upsert = false,
        )
        val signed = client.storage.from("trip-images").createSignedUrl(path, 31_536_000)
        signed.data?.signedUrl ?: throw Exception("Failed to get signed URL")
    }

    private fun decodeAndCompress(context: Context, uri: Uri, maxEdge: Int): Bitmap {
        val inputStream = context.contentResolver.openInputStream(uri)
            ?: throw Exception("Cannot open image")

        // First decode bounds to check dimensions
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(inputStream, null, options)
        inputStream.close()

        // Calculate sample size for memory efficiency
        var sampleSize = 1
        val maxDimension = maxOf(options.outWidth, options.outHeight)
        while (maxDimension / sampleSize > maxEdge * 2) {
            sampleSize *= 2
        }

        // Decode at sample size
        val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val stream2 = context.contentResolver.openInputStream(uri)!!
        val bitmap = BitmapFactory.decodeStream(stream2, null, decodeOptions)
        stream2.close()

        // Scale to max edge if still too large
        return if (bitmap != null && (bitmap.width > maxEdge || bitmap.height > maxEdge)) {
            val scale = maxEdge.toFloat() / maxOf(bitmap.width, bitmap.height)
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).toInt(),
                (bitmap.height * scale).toInt(),
                true,
            )
        } else {
            bitmap ?: throw Exception("Failed to decode image")
        }
    }

    private fun bitmapToJpeg(bitmap: Bitmap, quality: Int): ByteArray {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return stream.toByteArray()
    }
}
