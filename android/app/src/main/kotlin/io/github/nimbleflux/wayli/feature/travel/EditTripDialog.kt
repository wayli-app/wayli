package io.github.nimbleflux.wayli.feature.travel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.models.Trip

/**
 * Edit-trip dialog: title, dates (Material pickers), description, and
 * visibility (private / friends / public — web parity).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTripDialog(
    trip: Trip,
    onDismiss: () -> Unit,
    onSave: (title: String, description: String?, startDate: String, endDate: String?, visibility: String) -> Unit,
) {
    var title by remember { mutableStateOf(trip.title) }
    var description by remember { mutableStateOf(trip.description.orEmpty()) }
    var startDate by remember { mutableStateOf(trip.startDate) }
    var endDate by remember { mutableStateOf(trip.endDate) }
    var visibility by remember { mutableStateOf(trip.visibility) }
    var picking by remember { mutableStateOf<String?>(null) } // "start" | "end"

    if (picking != null) {
        val isStart = picking == "start"
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = parseDateMillis(if (isStart) startDate else (endDate ?: startDate)),
        )
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { ms ->
                        val iso = millisToIsoDate(ms)
                        if (isStart) startDate = iso else endDate = iso
                    }
                    picking = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
        ) {
            DatePicker(state = pickerState)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit trip", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { picking = "start" }, modifier = Modifier.weight(1f)) {
                        Text("From\n${formatFriendlyDate(startDate)}", maxLines = 2)
                    }
                    OutlinedButton(onClick = { picking = "end" }, modifier = Modifier.weight(1f)) {
                        Text(
                            if (endDate == null) "To\nongoing" else "To\n${formatFriendlyDate(endDate!!)}",
                            maxLines = 2,
                        )
                    }
                }
                if (endDate != null) {
                    TextButton(onClick = { endDate = null }) { Text("Make ongoing (no end date)") }
                }
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                Text("Visibility", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("private", "friends", "public").forEach { option ->
                        FilterChip(
                            selected = visibility == option,
                            onClick = { visibility = option },
                            label = { Text(option.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (title.isNotBlank()) {
                        onSave(
                            title.trim(),
                            description.trim().takeIf { it.isNotBlank() },
                            startDate,
                            endDate,
                            visibility,
                        )
                    }
                },
                enabled = title.isNotBlank(),
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
