# ---- Kotlinx Serialization ----
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ---- Fluxbase SDK models (keep @Serializable data classes) ----
-keep class io.github.nimbleflux.wayli.models.** { *; }
-keep class io.github.nimbleflux.fluxbase.** { *; }

# ---- Room ----
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# ---- Hilt ----
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.lifecycle.HiltViewModel { *; }

# ---- Coroutines ----
-dontwarn kotlinx.coroutines.**

# ---- EncryptedSharedPreferences ----
-keep class androidx.security.crypto.** { *; }
