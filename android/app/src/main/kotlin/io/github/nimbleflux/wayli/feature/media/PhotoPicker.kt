package io.github.nimbleflux.wayli.feature.media

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Photo picker + uploader composable. Uses the modern ActivityResult photo picker
 * contract (PickVisualMedia) which provides a native Android photo selection
 * experience on API 33+ and falls back to the content picker on older devices.
 *
 * Shows selected photo thumbnails and an upload progress indicator.
 */
@Composable
fun PhotoPicker(
    onPhotoUploaded: (String) -> Unit,
    viewModel: MediaViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uploadState by viewModel.uploadState.collectAsState()
    val uploadedPaths by viewModel.uploadedPathsFlow.collectAsState()

    // Signed URLs for thumbnails — fetched as paths arrive.
    var signedUrls by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    LaunchedEffect(uploadedPaths) {
        val missing = uploadedPaths.filter { it !in signedUrls }
        missing.forEach { path ->
            viewModel.signedUrlFor(path)
                .onSuccess { url -> signedUrls = signedUrls + (path to url) }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            scope.launch {
                viewModel.uploadPhoto(context, uri) { path ->
                    onPhotoUploaded(path)
                }
            }
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Photos", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))

            // Uploaded thumbnails — real images via signed URLs
            if (uploadedPaths.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    uploadedPaths.take(4).forEach { path ->
                        val url = signedUrls[path]
                        if (url != null) {
                            coil.compose.AsyncImage(
                                model = url,
                                contentDescription = "Uploaded photo",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(72.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(72.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Filled.AddPhotoAlternate,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            // Upload button
            when (uploadState) {
                MediaUploadState.Idle -> {
                    IconButton(
                        onClick = {
                            photoPicker.launch(
                                androidx.activity.result.PickVisualMediaRequest(
                                    ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        },
                    ) {
                        Icon(Icons.Filled.AddPhotoAlternate, contentDescription = "Add photo")
                    }
                }
                is MediaUploadState.Uploading -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.size(8.dp))
                        Text("Uploading...", style = MaterialTheme.typography.bodySmall)
                    }
                }
                is MediaUploadState.Error -> {
                    Text(
                        "Upload failed: ${(uploadState as MediaUploadState.Error).message}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    IconButton(onClick = {
                        photoPicker.launch(
                            androidx.activity.result.PickVisualMediaRequest(
                                ActivityResultContracts.PickVisualMedia.ImageOnly,
                            ),
                        )
                    }) { Icon(Icons.Filled.AddPhotoAlternate, contentDescription = "Retry") }
                }
            }
        }
    }
}

sealed interface MediaUploadState {
    data object Idle : MediaUploadState
    data object Uploading : MediaUploadState
    data class Error(val message: String) : MediaUploadState
}

@HiltViewModel
class MediaViewModel @Inject constructor(
    private val mediaUploader: MediaUploader,
) : ViewModel() {

    val uploadState = MutableStateFlow<MediaUploadState>(MediaUploadState.Idle)

    private val _uploadedPaths = MutableStateFlow<List<String>>(emptyList())
    val uploadedPathsFlow: StateFlow<List<String>> = _uploadedPaths.asStateFlow()

    fun uploadPhoto(context: android.content.Context, uri: Uri, onDone: (String) -> Unit) {
        uploadState.value = MediaUploadState.Uploading
        viewModelScope.launch {
            mediaUploader.uploadPhoto(context, uri)
                .onSuccess { path ->
                    _uploadedPaths.value = _uploadedPaths.value + path
                    uploadState.value = MediaUploadState.Idle
                    onDone(path)
                }
                .onFailure { e ->
                    uploadState.value = MediaUploadState.Error(e.message ?: "Unknown error")
                }
        }
    }

    /** Signed URL for rendering an uploaded photo. */
    suspend fun signedUrlFor(path: String): Result<String> =
        mediaUploader.getSignedUrl(path = path)
}
