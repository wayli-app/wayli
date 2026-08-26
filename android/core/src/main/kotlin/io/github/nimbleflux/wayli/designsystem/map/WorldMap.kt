package io.github.nimbleflux.wayli.designsystem.map

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * "Where I've Been" world map — a bundled low-res countries GeoJSON
 * (johan/world.geo.json, public domain) drawn on a Canvas with an
 * equirectangular projection. No map engine, no tiles, fully offline.
 * [visited] takes ISO alpha-2 codes (tracker country_code).
 */
@Composable
fun WorldMap(
    visited: Set<String>,
    modifier: Modifier = Modifier,
    baseColor: Color = Color(0xFFE2E8F0),
    highlightColor: Color = MaterialTheme.colorScheme.primary,
) {
    val context = LocalContext.current
    val countries = remember { WorldMapData.load(context) }
    val visitedA3 = remember(visited) { visited.mapNotNull { Iso.toAlpha3(it) }.toSet() }

    Canvas(
        modifier = modifier.aspectRatio(WorldMapData.ASPECT),
    ) {
        val w = size.width
        val h = size.height
        countries.forEach { country ->
            val color = if (country.iso3 in visitedA3) highlightColor else baseColor
            country.polygons.forEach { polygon ->
                drawPolygon(polygon, color, w, h)
            }
        }
    }
}

private fun DrawScope.drawPolygon(
    rings: List<List<Pair<Double, Double>>>,
    color: Color,
    w: Float,
    h: Float,
) {
    val path = Path()
    rings.forEach { ring ->
        ring.forEachIndexed { i, (lon, lat) ->
            val x = ((lon + 180.0) / 360.0 * w).toFloat()
            val y = ((WorldMapData.LAT_MAX - lat) / (WorldMapData.LAT_MAX - WorldMapData.LAT_MIN) * h).toFloat()
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
    }
    drawPath(path, color, style = Fill)
}

/** ISO 3166-1 alpha-2 → alpha-3 (generated from iso-codes). */
private object Iso {
    private val map: Map<String, String> = ISO23_MAPPING.split(',')
        .associate { it.substringBefore(':') to it.substringAfter(':') }

    fun toAlpha3(alpha2: String): String? = map[alpha2.uppercase()]
}

internal object WorldMapData {
    // Equirectangular crop: Antarctica excluded, far poles trimmed.
    const val LAT_MAX = 84.0
    const val LAT_MIN = -58.0
    const val ASPECT = (360.0 / (LAT_MAX - LAT_MIN)).toFloat()

    class Country(val iso3: String, val polygons: List<List<List<Pair<Double, Double>>>>)

    private val json = Json { ignoreUnknownKeys = true }

    fun load(context: android.content.Context): List<Country> = runCatching {
        val text = context.assets.open("map-styles/countries.geo.json")
            .bufferedReader().use { it.readText() }
        parse(text)
    }.getOrDefault(emptyList())

    internal fun parse(text: String): List<Country> {
        val root = json.parseToJsonElement(text) as? JsonObject ?: return emptyList()
        val features = root["features"] as? JsonArray ?: return emptyList()
        return features.mapNotNull { f ->
            val feature = f as? JsonObject ?: return@mapNotNull null
            val iso3 = (feature["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return@mapNotNull null
            if (iso3 == "ATA") return@mapNotNull null // Antarctica — outside the crop
            val geometry = feature["geometry"] as? JsonObject ?: return@mapNotNull null
            val type = (geometry["type"] as? kotlinx.serialization.json.JsonPrimitive)?.content
            val coords = geometry["coordinates"] as? JsonArray ?: return@mapNotNull null
            val polygons = when (type) {
                "Polygon" -> listOf(ringsOf(coords))
                "MultiPolygon" -> coords.mapNotNull { p -> (p as? JsonArray)?.let(::ringsOf) }
                else -> emptyList()
            }
            Country(iso3, polygons)
        }
    }

    /** Polygon coordinates → list of rings of (lon, lat). */
    private fun ringsOf(polygonCoords: JsonArray): List<List<Pair<Double, Double>>> =
        polygonCoords.mapNotNull { ring ->
            (ring as? JsonArray)?.mapNotNull { point ->
                (point as? JsonArray)?.takeIf { it.size >= 2 }?.let { arr ->
                    val lon = (arr[0] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
                    val lat = (arr[1] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
                    if (lon != null && lat != null) lon to lat else null
                }
            }?.takeIf { it.isNotEmpty() }
        }
}

private const val ISO23_MAPPING =
    "AD:AND,AE:ARE,AF:AFG,AG:ATG,AI:AIA,AL:ALB,AM:ARM,AO:AGO,AQ:ATA,AR:ARG,AS:ASM,AT:AUT,AU:AUS,AW:ABW,AX:ALA,AZ:AZE," +
        "BA:BIH,BB:BRB,BD:BGD,BE:BEL,BF:BFA,BG:BGR,BH:BHR,BI:BDI,BJ:BEN,BL:BLM,BM:BMU,BN:BRN,BO:BOL,BQ:BES,BR:BRA," +
        "BS:BHS,BT:BTN,BV:BVT,BW:BWA,BY:BLR,BZ:BLZ,CA:CAN,CC:CCK,CD:COD,CF:CAF,CG:COG,CH:CHE,CI:CIV,CK:COK,CL:CHL," +
        "CM:CMR,CN:CHN,CO:COL,CR:CRI,CU:CUB,CV:CPV,CW:CUW,CX:CXR,CY:CYP,CZ:CZE,DE:DEU,DJ:DJI,DK:DNK,DM:DMA,DO:DOM," +
        "DZ:DZA,EC:ECU,EE:EST,EG:EGY,EH:ESH,ER:ERI,ES:ESP,ET:ETH,FI:FIN,FJ:FJI,FK:FLK,FM:FSM,FO:FRO,FR:FRA,GA:GAB," +
        "GB:GBR,GD:GRD,GE:GEO,GF:GUF,GG:GGY,GH:GHA,GI:GIB,GL:GRL,GM:GMB,GN:GIN,GP:GLP,GQ:GNQ,GR:GRC,GS:SGS,GT:GTM," +
        "GU:GUM,GW:GNB,GY:GUY,HK:HKG,HM:HMD,HN:HND,HR:HRV,HT:HTI,HU:HUN,ID:IDN,IE:IRL,IL:ISR,IM:IMN,IN:IND,IO:IOT," +
        "IQ:IRQ,IR:IRN,IS:ISL,IT:ITA,JE:JEY,JM:JAM,JO:JOR,JP:JPN,KE:KEN,KG:KGZ,KH:KHM,KI:KIR,KM:COM,KN:KNA,KP:PRK," +
        "KR:KOR,KW:KWT,KY:CYM,KZ:KAZ,LA:LAO,LB:LBN,LC:LCA,LI:LIE,LK:LKA,LR:LBR,LS:LSO,LT:LTU,LU:LUX,LV:LVA,LY:LBY," +
        "MA:MAR,MC:MCO,MD:MDA,ME:MNE,MF:MAF,MG:MDG,MH:MHL,MK:MKD,ML:MLI,MM:MMR,MN:MNG,MO:MAC,MP:MNP,MQ:MTQ,MR:MRT," +
        "MS:MSR,MT:MLT,MU:MUS,MV:MDV,MW:MWI,MX:MEX,MY:MYS,MZ:MOZ,NA:NAM,NC:NCL,NE:NER,NF:NFK,NG:NGA,NI:NIC,NL:NLD," +
        "NO:NOR,NP:NPL,NR:NRU,NU:NIU,NZ:NZL,OM:OMN,PA:PAN,PE:PER,PF:PYF,PG:PNG,PH:PHL,PK:PAK,PL:POL,PM:SPM,PN:PCN," +
        "PR:PRI,PS:PSE,PT:PRT,PW:PLW,PY:PRY,QA:QAT,RE:REU,RO:ROU,RS:SRB,RU:RUS,RW:RWA,SA:SAU,SB:SLB,SC:SYC,SD:SDN," +
        "SE:SWE,SG:SGP,SH:SHN,SI:SVN,SJ:SJM,SK:SVK,SL:SLE,SM:SMR,SN:SEN,SO:SOM,SR:SUR,SS:SSD,ST:STP,SV:SLV,SX:SXM," +
        "SY:SYR,SZ:SWZ,TC:TCA,TD:TCD,TF:ATF,TG:TGO,TH:THA,TJ:TJK,TK:TKL,TL:TLS,TM:TKM,TN:TUN,TO:TON,TR:TUR,TT:TTO," +
        "TV:TUV,TW:TWN,TZ:TZA,UA:UKR,UG:UGA,UM:UMI,US:USA,UY:URY,UZ:UZB,VA:VAT,VC:VCT,VE:VEN,VG:VGB,VI:VIR,VN:VNM," +
        "VU:VUT,WF:WLF,WS:WSM,YE:YEM,YT:MYT,ZA:ZAF,ZM:ZMB,ZW:ZWE"
