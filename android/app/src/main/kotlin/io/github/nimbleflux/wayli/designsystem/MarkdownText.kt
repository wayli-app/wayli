package io.github.nimbleflux.wayli.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Document
import org.commonmark.node.Emphasis
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

private val markdownParser: Parser by lazy {
    Parser.builder()
        .extensions(listOf(StrikethroughExtension.create()))
        .build()
}

private const val LINK_TAG = "wayli_url"

/**
 * Renders journal-entry bodies as GitHub-flavored markdown — the same subset
 * the web renders with marked (gfm + breaks): headings, emphasis, links
 * (tappable), lists, quotes, code, strikethrough, hard line breaks, and
 * images hoisted below their paragraph through [WayliAsyncImage].
 */
@Composable
fun MarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
) {
    val document = remember(markdown) { markdownParser.parse(markdown) as Document }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        RenderBlocks(document)
    }
}

@Composable
private fun RenderBlocks(parent: Node) {
    var child = parent.firstChild
    while (child != null) {
        when (child) {
            is Paragraph -> RenderParagraph(child)
            is Heading -> {
                val inline = rememberInline(child)
                MarkdownParagraphText(annotated = inline, style = when (child.level) {
                    1 -> MaterialTheme.typography.headlineSmall
                    2 -> MaterialTheme.typography.titleLarge
                    else -> MaterialTheme.typography.titleMedium
                }, fontWeight = FontWeight.Bold)
            }
            is BulletList -> RenderList(child, ordered = false)
            is OrderedList -> RenderList(child, ordered = true)
            is BlockQuote -> {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    RenderBlocks(child)
                }
            }
            is ThematicBreak -> HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            is FencedCodeBlock -> CodeBlockSurface(child.literal)
            is IndentedCodeBlock -> CodeBlockSurface(child.literal)
            is Document -> RenderBlocks(child)
            else -> RenderBlocks(child)
        }
        child = child.next
    }
}

@Composable
private fun RenderParagraph(node: Paragraph) {
    val inline = rememberInline(node)
    MarkdownParagraphText(annotated = inline, style = MaterialTheme.typography.bodyLarge)
}

/** Text with tappable link spans; inline images render below the text. */
@Composable
private fun MarkdownParagraphText(
    annotated: InlineContent,
    style: androidx.compose.ui.text.TextStyle,
    fontWeight: FontWeight? = null,
) {
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val uriHandler = LocalUriHandler.current
    Text(
        text = annotated.annotated,
        style = style,
        fontWeight = fontWeight,
        onTextLayout = { layout = it },
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(annotated.annotated) {
                detectTapGestures { position ->
                    layout?.let { l ->
                        l.getOffsetForPosition(position).let { offset ->
                            annotated.annotated.getStringAnnotations(LINK_TAG, offset, offset)
                                .firstOrNull()
                                ?.let { link -> runCatching { uriHandler.openUri(link.item) } }
                        }
                    }
                }
            },
    )
    annotated.images.forEach { url ->
        Spacer(Modifier.height(2.dp))
        WayliAsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp)),
        )
    }
}

@Composable
private fun RenderList(node: Node, ordered: Boolean) {
    var index = 0
    var child = node.firstChild
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        while (child != null) {
            if (child is ListItem) {
                index += 1
                Row {
                    Text(
                        if (ordered) "$index." else "•",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(22.dp),
                    )
                    Column(Modifier.weight(1f)) {
                        // List items wrap paragraphs (and nested lists).
                        var itemChild = child.firstChild
                        while (itemChild != null) {
                            when (itemChild) {
                                is Paragraph -> RenderParagraph(itemChild)
                                else -> RenderBlocks(itemChild)
                            }
                            itemChild = itemChild.next
                        }
                    }
                }
            }
            child = child.next
        }
    }
}

@Composable
private fun CodeBlockSurface(literal: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
            .padding(12.dp),
    ) {
        Text(
            literal.trimEnd(),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        )
    }
}

private data class InlineContent(val annotated: AnnotatedString, val images: List<String>)

@Composable
private fun rememberInline(node: Node): InlineContent {
    // Theme colors must be resolved in composition — the remember lambda
    // below is not a composable context.
    val linkColor = MaterialTheme.colorScheme.primary
    return remember(node, linkColor) { buildInline(node, linkColor) }
}

private fun buildInline(node: Node, linkColor: androidx.compose.ui.graphics.Color): InlineContent {
    val images = mutableListOf<String>()
    val annotated = buildAnnotatedString {
        appendInline(node.firstChild, images, linkColor)
    }
    return InlineContent(annotated, images)
}

private fun AnnotatedString.Builder.appendInline(
    node: Node?,
    images: MutableList<String>,
    linkColor: androidx.compose.ui.graphics.Color,
) {
    var child = node
    while (child != null) {
        val current: Node = child
        when (current) {
            is Text -> append(current.literal)
            is SoftLineBreak -> {
                // GFM `breaks: true` — single newlines render as breaks (web parity).
                append("\n")
            }
            is HardLineBreak -> append("\n")
            is Code -> withStyle(
                SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp),
            ) { append(" ${current.literal} ") }
            is Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                appendInline(current.firstChild, images, linkColor)
            }
            is StrongEmphasis -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                appendInline(current.firstChild, images, linkColor)
            }
            is Strikethrough -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) {
                appendInline(current.firstChild, images, linkColor)
            }
            is Link -> {
                pushStringAnnotation(LINK_TAG, current.destination)
                pushStyle(
                    SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                )
                appendInline(current.firstChild, images, linkColor)
                pop()
                pop()
            }
            is Image -> {
                // Hoisted below the paragraph — see MarkdownParagraphText.
                images += current.destination
            }
            else -> appendInline(current.firstChild, images, linkColor)
        }
        child = child.next
    }
}
