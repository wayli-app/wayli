package io.github.nimbleflux.wayli.designsystem

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * App theme preference — persisted in SharedPreferences and exposed as
 * observable Compose state so the whole app recomposes when the user
 * changes between Light, Dark, and System.
 */
class ThemeManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("wayli-theme", Context.MODE_PRIVATE)

    private val _themeMode = mutableStateOf(resolve(prefs.getString(KEY_THEME_MODE, null)))
    val themeModeState: MutableState<ThemeMode> = _themeMode

    val themeMode: ThemeMode get() = _themeMode.value

    fun setThemeMode(mode: ThemeMode) {
        prefs.edit().putString(KEY_THEME_MODE, mode.name).apply()
        _themeMode.value = mode
    }

    private fun resolve(stored: String?): ThemeMode =
        stored?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM

    companion object {
        private const val KEY_THEME_MODE = "theme_mode"
    }
}

/**
 * User-selectable theme modes.
 * - [LIGHT]: Always light theme
 * - [DARK]: Always dark theme
 * - [SYSTEM]: Follow the system dark-mode setting
 */
enum class ThemeMode(val label: String) {
    LIGHT("Light"),
    DARK("Dark"),
    SYSTEM("System"),
}
