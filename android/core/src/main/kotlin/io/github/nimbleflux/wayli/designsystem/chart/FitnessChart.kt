package io.github.nimbleflux.wayli.designsystem.chart

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One plotted value at an abstract x (epoch ms or cumulative meters). */
data class ChartPoint(val x: Double, val v: Double)

/** A line series; each series scales to its own y-range (HR + power can share). */
data class ChartSeries(
    val label: String,
    val color: Color,
    val points: List<ChartPoint>,
    val area: Boolean = false,
)

enum class ChartXAxis { TIME, DISTANCE }

private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())

private fun formatX(x: Double, axis: ChartXAxis): String = when (axis) {
    ChartXAxis.DISTANCE -> String.format(Locale.US, "%.1f km", x / 1000)
    ChartXAxis.TIME -> runCatching {
        timeFormatter.format(Instant.ofEpochMilli(x.toLong()).atZone(ZoneId.systemDefault()))
    }.getOrElse { "—" }
}

/** Nearest point index in an x-sorted series (binary search, web parity). */
private fun nearestIndex(points: List<ChartPoint>, target: Double): Int {
    if (points.isEmpty()) return 0
    var lo = 0
    var hi = points.size - 1
    while (lo < hi) {
        val mid = (lo + hi) / 2
        if (points[mid].x < target) lo = mid + 1 else hi = mid
    }
    if (lo > 0 && Math.abs(points[lo - 1].x - target) <= Math.abs(points[lo].x - target)) {
        return lo - 1
    }
    return lo
}

/**
 * Dependency-free line chart for fitness metrics (a Compose port of the web's
 * FitnessChart). Renders one or two series, each normalized to its own
 * y-range; the x axis is linear in time (epoch ms) or distance (m). Long
 * series are stride-downsampled to ~1200 points. Dragging scrubs a shared x
 * position (vertical guide, per-series dots and a tooltip); tapping reports
 * the x value via [onScrub] so the caller can e.g. pin a map marker.
 */
@Composable
fun FitnessChart(
    series: List<ChartSeries>,
    xAxis: ChartXAxis = ChartXAxis.TIME,
    modifier: Modifier = Modifier,
    onScrub: ((Double?) -> Unit)? = null,
) {
    val textMeasurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp)
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant

    // Stride downsample to keep drawing cheap on huge rides/runs.
    val downsampled = remember(series) {
        val maxPoints = series.maxOfOrNull { it.points.size } ?: 0
        val stride = maxOf(1, (maxPoints + 1199) / 1200)
        series.map { s ->
            if (stride == 1) s else s.copy(points = s.points.filterIndexed { i, _ -> i % stride == 0 })
        }
    }
    val ranges = remember(downsampled) {
        downsampled.map { s ->
            val min = s.points.minOfOrNull { it.v } ?: 0.0
            val max = s.points.maxOfOrNull { it.v } ?: 0.0
            Triple(min, max, (max - min).takeIf { it != 0.0 } ?: 1.0)
        }
    }
    val x0 = remember(downsampled) { downsampled.mapNotNull { it.points.firstOrNull()?.x }.minOrNull() ?: 0.0 }
    val x1 = remember(downsampled) { downsampled.mapNotNull { it.points.lastOrNull()?.x }.maxOrNull() ?: (x0 + 1) }

    var scrubX by remember { mutableStateOf<Double?>(null) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val padLeftPx = with(density) { 38.dp.toPx() }
    val padRightPx = with(density) { 46.dp.toPx() }

    fun scrubAt(position: Offset) {
        if (containerSize == IntSize.Zero || x1 <= x0) return
        val width = containerSize.width.toFloat()
        val clamped = position.x.coerceIn(padLeftPx, width - padRightPx)
        scrubX = x0 + ((clamped - padLeftPx) / (width - padLeftPx - padRightPx)) * (x1 - x0)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .onSizeChanged { containerSize = it },
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(190.dp)
                .pointerInput(downsampled, xAxis) {
                    detectDragGestures { change, _ ->
                        change.consume()
                        scrubAt(change.position)
                    }
                }
                .pointerInput(downsampled, xAxis) {
                    detectTapGestures { offset ->
                        scrubAt(offset)
                        onScrub?.invoke(scrubX)
                    }
                },
        ) {
            val padLeft = padLeftPx
            val padRight = padRightPx
            val padTop = 12.dp.toPx()
            val padBottom = 22.dp.toPx()
            val w = size.width
            val h = size.height
            val plotW = w - padLeft - padRight
            val plotH = h - padTop - padBottom

            fun px(x: Double): Float = (padLeft + ((x - x0) / (x1 - x0).coerceAtLeast(1e-9)) * plotW).toFloat()
            fun py(seriesIdx: Int, v: Double): Float {
                val (min, _, span) = ranges[seriesIdx]
                val frac = ((v - min) / span).toFloat()
                return padTop + (1f - frac) * plotH
            }

            // Horizontal grid
            for (frac in listOf(0f, 0.25f, 0.5f, 0.75f, 1f)) {
                val y = padTop + frac * plotH
                drawLine(
                    color = gridColor,
                    start = Offset(padLeft, y),
                    end = Offset(w - padRight, y),
                    strokeWidth = 1f,
                    pathEffect = if (frac == 1f) null else PathEffect.dashPathEffect(floatArrayOf(6f, 8f)),
                )
            }

            // Series lines (+ area fills)
            downsampled.forEachIndexed { i, s ->
                if (s.points.isEmpty()) return@forEachIndexed
                val line = Path()
                s.points.forEachIndexed { j, p ->
                    val pt = Offset(px(p.x), py(i, p.v))
                    if (j == 0) line.moveTo(pt.x, pt.y) else line.lineTo(pt.x, pt.y)
                }
                if (s.area) {
                    val area = Path().apply {
                        addPath(line)
                        lineTo(px(s.points.last().x), h - padBottom)
                        lineTo(px(s.points.first().x), h - padBottom)
                        close()
                    }
                    drawPath(
                        path = area,
                        brush = Brush.verticalGradient(
                            colors = listOf(s.color.copy(alpha = 0.35f), s.color.copy(alpha = 0.02f)),
                            startY = padTop,
                            endY = h - padBottom,
                        ),
                    )
                }
                drawPath(path = line, color = s.color, style = Stroke(width = 4f))
            }

            // Measured text label, anchored at x by fraction (0 left · 0.5 center · 1 right)
            fun label(text: String, x: Float, y: Float, anchor: Float) {
                val layout = textMeasurer.measure(text, labelStyle)
                drawText(
                    textLayoutResult = layout,
                    color = labelColor,
                    topLeft = Offset(x - layout.size.width * anchor, y),
                )
            }

            // Y labels: left series max/min, right series max/min
            ranges.getOrNull(0)?.let { (min, max, _) ->
                label(Math.round(max).toString(), padLeft - 6.dp.toPx(), padTop - 6.dp.toPx(), 1f)
                label(Math.round(min).toString(), padLeft - 6.dp.toPx(), h - padBottom - 10.dp.toPx(), 1f)
            }
            ranges.getOrNull(1)?.let { (min, max, _) ->
                label(Math.round(max).toString(), w - padRight + 6.dp.toPx(), padTop - 6.dp.toPx(), 0f)
                label(Math.round(min).toString(), w - padRight + 6.dp.toPx(), h - padBottom - 10.dp.toPx(), 0f)
            }

            // X labels: start / mid / end
            label(formatX(x0, xAxis), padLeft, h - padBottom + 4.dp.toPx(), 0f)
            label(formatX(x0 + (x1 - x0) / 2, xAxis), padLeft + plotW / 2, h - padBottom + 4.dp.toPx(), 0.5f)
            label(formatX(x1, xAxis), w - padRight, h - padBottom + 4.dp.toPx(), 1f)

            // Scrub guide + per-series dots
            scrubX?.let { sx ->
                val gx = px(sx)
                drawLine(
                    color = labelColor.copy(alpha = 0.4f),
                    start = Offset(gx, padTop),
                    end = Offset(gx, h - padBottom),
                    strokeWidth = 2f,
                )
                downsampled.forEachIndexed { i, s ->
                    if (s.points.isEmpty()) return@forEachIndexed
                    val nearest = s.points[nearestIndex(s.points, sx)]
                    val center = Offset(px(nearest.x), py(i, nearest.v))
                    drawCircle(color = s.color, radius = 9f, center = center)
                    drawCircle(color = Color.White, radius = 9f, center = center, style = Stroke(width = 4f))
                }
            }
        }

        // Tooltip overlay (outside the Canvas for easy text layout)
        scrubX?.let { sx ->
            val fraction = if (x1 > x0) ((sx - x0) / (x1 - x0)).toFloat() else 0f
            val xOffsetDp = with(density) { (fraction * containerSize.width * 0.86f).toDp() }
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                tonalElevation = 4.dp,
                shadowElevation = 4.dp,
                modifier = Modifier
                    .offset(x = xOffsetDp, y = 4.dp)
                    .clip(RoundedCornerShape(8.dp)),
            ) {
                Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                    Text(
                        formatX(sx, xAxis),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    downsampled.forEach { s ->
                        if (s.points.isEmpty()) return@forEach
                        val nearest = s.points[nearestIndex(s.points, sx)]
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(s.color),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "${Math.round(nearest.v)} ${s.label}",
                                style = MaterialTheme.typography.labelSmall,
                                color = s.color,
                            )
                        }
                    }
                }
            }
        }
    }
}
