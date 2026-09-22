package com.bma342.braze

import com.bma342.braze.TestSupport.uninitializedPlugin
import com.braze.models.FeatureFlag
import com.braze.models.cards.CaptionedImageCard
import com.braze.models.cards.Card
import com.braze.models.cards.ImageOnlyCard
import com.braze.models.cards.ShortNewsCard
import com.braze.models.cards.TextAnnouncementCard
import com.braze.models.inappmessage.InAppMessageFull
import com.braze.models.inappmessage.InAppMessageModal
import com.braze.models.inappmessage.InAppMessageSlideup
import com.getcapacitor.JSObject
import com.google.common.truth.Truth.assertThat
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * DTO-shape coverage (C02) for the bridge's serializers, driven against
 * **real** Braze model objects parsed from Braze's own wire JSON rather
 * than test doubles. That is the point: four of the A3 findings were
 * hardcoded DTO values justified by comments claiming an SDK accessor did
 * not exist, and only a test that reads the accessor can keep that from
 * recurring.
 *
 * The wire keys below are Braze's own short Content Card keys at 43.2.0
 * (`ca` created, `ea` expires-at, `v` viewed, `p` pinned, `cl` clicked,
 * `d` dismissed, `db` dismissible, `dm` domain, `u` url, `ar` aspect
 * ratio, `e` extras, `i` image, `tt` title, `ds` description,
 * `image_alt` alt text), confirmed empirically against the published AAR.
 * In-app message keys come from the public constants on
 * `InAppMessageBase` (`trigger_id`, `slide_from`, `icon`, `image_alt`, …).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BrazePluginSerializerTest {

    private val plugin get() = uninitializedPlugin()

    /**
     * `bo.app.v9` is the SDK's internal event-publisher interface. It is a
     * public interface, so Mockito can stand in for it; the serializers
     * never touch it.
     */
    private fun publisher(): bo.app.v9 = Mockito.mock(bo.app.v9::class.java)

    private fun cardJson(vararg extra: Pair<String, Any>): JSONObject {
        val json = JSONObject()
            .put("id", "card-1")
            .put("ca", 1_700_000_000L)
        for ((k, v) in extra) json.put(k, v)
        return json
    }

    // -------------------------------------------------------------------------
    // Content cards
    // -------------------------------------------------------------------------

    @Test
    fun `captioned image card serializes every declared field`() {
        val card = CaptionedImageCard(
            cardJson(
                "ea" to 1_800_000_000L,
                "v" to true,
                "p" to true,
                "cl" to true,
                "d" to false,
                "db" to true,
                "dm" to "example.com",
                "u" to "https://example.com/click",
                "ar" to 1.91,
                "e" to JSONObject().put("campaign", "spring"),
                "i" to "https://example.com/image.png",
                "tt" to "Title",
                "ds" to "Description",
                "image_alt" to "A picture of a thing",
            ),
        )
        val dto = requireNotNull(plugin.serializeContentCard(card))
        assertThat(dto.getString("type")).isEqualTo("captionedImage")
        assertThat(dto.getString("id")).isEqualTo("card-1")
        assertThat(dto.getString("title")).isEqualTo("Title")
        assertThat(dto.getString("description")).isEqualTo("Description")
        assertThat(dto.getString("imageUrl")).isEqualTo("https://example.com/image.png")
        assertThat(dto.getString("url")).isEqualTo("https://example.com/click")
        assertThat(dto.getString("linkText")).isEqualTo("example.com")
        assertThat(dto.getString("altImageText")).isEqualTo("A picture of a thing")
        assertThat(dto.getBool("viewed")).isTrue()
        assertThat(dto.getBool("pinned")).isTrue()
        assertThat(dto.getBool("dismissed")).isFalse()
        assertThat(dto.getBool("dismissible")).isTrue()
        assertThat(dto.getDouble("aspectRatio")).isWithin(1e-6).of(1.91)
        // Epoch seconds on the wire, epoch milliseconds in the DTO (C03).
        assertThat(dto.getLong("updated")).isEqualTo(1_700_000_000_000L)
        assertThat(dto.getLong("expiresAt")).isEqualTo(1_800_000_000_000L)
        assertThat(dto.getJSObject("extras")?.getString("campaign")).isEqualTo("spring")
    }

    @Test
    fun `card clicked reflects the SDK value rather than a hardcoded false`() {
        val clicked = CaptionedImageCard(cardJson("i" to "https://i", "tt" to "t", "ds" to "d", "cl" to true))
        val unclicked = CaptionedImageCard(cardJson("i" to "https://i", "tt" to "t", "ds" to "d"))
        assertThat(requireNotNull(plugin.serializeContentCard(clicked)).getBool("clicked")).isTrue()
        assertThat(requireNotNull(plugin.serializeContentCard(unclicked)).getBool("clicked")).isFalse()
    }

    @Test
    fun `image only card omits title and description and carries aspect ratio`() {
        val card = ImageOnlyCard(cardJson("i" to "https://example.com/i.png", "ar" to 0.5))
        val dto = requireNotNull(plugin.serializeContentCard(card))
        assertThat(dto.getString("type")).isEqualTo("imageOnly")
        assertThat(dto.getString("imageUrl")).isEqualTo("https://example.com/i.png")
        assertThat(dto.getDouble("aspectRatio")).isWithin(1e-6).of(0.5)
        assertThat(dto.has("title")).isFalse()
        assertThat(dto.has("description")).isFalse()
    }

    @Test
    fun `an unset aspect ratio serializes as JSON null`() {
        val card = ImageOnlyCard(cardJson("i" to "https://example.com/i.png"))
        val dto = requireNotNull(plugin.serializeContentCard(card))
        assertThat(dto.get("aspectRatio")).isEqualTo(JSObject.NULL)
    }

    @Test
    fun `both classic variants emit an explicit null aspect ratio`() {
        // `aspectRatio` is declared non-optional on BrazeClassicContentCard,
        // and neither Android classic subclass carries the hint.
        val shortNews = ShortNewsCard(cardJson("i" to "https://i", "ds" to "d", "tt" to "t"))
        val textOnly = TextAnnouncementCard(cardJson("ds" to "d", "tt" to "t"))
        for (card in listOf<Card>(shortNews, textOnly)) {
            val dto = requireNotNull(plugin.serializeContentCard(card))
            assertThat(dto.getString("type")).isEqualTo("classic")
            assertThat(dto.get("aspectRatio")).isEqualTo(JSObject.NULL)
        }
    }

    @Test
    fun `never-expiring and never-updated sentinels become JSON null`() {
        // The SDK uses -1 for "never expires"; `created` is 0 when unset.
        val card = ImageOnlyCard(JSONObject().put("id", "c").put("ca", 0L).put("i", "https://i"))
        val dto = requireNotNull(plugin.serializeContentCard(card))
        assertThat(dto.get("updated")).isEqualTo(JSObject.NULL)
        assertThat(dto.get("expiresAt")).isEqualTo(JSObject.NULL)
    }

    @Test
    fun `the cards list maps the never-fetched timestamp sentinel to null`() {
        val card = ImageOnlyCard(cardJson("i" to "https://i"))
        val never = plugin.serializeContentCardsList(listOf(card), -1L)
        assertThat(never.get("lastUpdated")).isEqualTo(JSObject.NULL)
        assertThat(never.getJSONArray("cards").length()).isEqualTo(1)

        val fetched = plugin.serializeContentCardsList(listOf(card), 1_700_000_000L)
        assertThat(fetched.getLong("lastUpdated")).isEqualTo(1_700_000_000_000L)
    }

    // -------------------------------------------------------------------------
    // In-app messages
    // -------------------------------------------------------------------------

    @Test
    fun `slideup serializes triggerId as id and reports the real slideFrom`() {
        val message = InAppMessageSlideup(
            JSONObject()
                .put("is_test_send", false)
                .put("trigger_id", "trigger-77")
                .put("message", "Hello")
                .put("slide_from", "TOP")
                .put("icon", "fa-bell")
                .put("image_alt", "banner alt")
                .put("extras", JSONObject().put("k", "v"))
                .put("click_action", "URI")
                .put("uri", "https://example.com/go")
                .put("use_webview", true),
            publisher(),
        )
        val dto = plugin.serializeInAppMessage(message)
        assertThat(dto.getString("type")).isEqualTo("slideup")
        assertThat(dto.getString("id")).isEqualTo("trigger-77")
        assertThat(dto.getString("slideFrom")).isEqualTo("top")
        assertThat(dto.getString("icon")).isEqualTo("fa-bell")
        assertThat(dto.getString("imageAltText")).isEqualTo("banner alt")
        assertThat(dto.getString("message")).isEqualTo("Hello")
        assertThat(dto.getJSObject("extras")?.getString("k")).isEqualTo("v")
        val clickAction = requireNotNull(dto.getJSObject("clickAction"))
        assertThat(clickAction.getString("type")).isEqualTo("url")
        assertThat(clickAction.getString("uri")).isEqualTo("https://example.com/go")
        assertThat(clickAction.getBool("useWebView")).isTrue()
    }

    @Test
    fun `slideup defaults to bottom when the campaign does not specify`() {
        val message = InAppMessageSlideup(
            JSONObject().put("is_test_send", false).put("message", "Hi"),
            publisher(),
        )
        val dto = plugin.serializeInAppMessage(message)
        assertThat(dto.getString("slideFrom")).isEqualTo("bottom")
        assertThat(dto.get("id")).isEqualTo(JSObject.NULL)
        assertThat(dto.getJSObject("clickAction")?.getString("type")).isEqualTo("none")
    }

    @Test
    fun `modal and full carry header, buttons and alt text`() {
        val json = JSONObject()
            .put("is_test_send", false)
            .put("trigger_id", "t-1")
            .put("header", "Header")
            .put("message", "Body")
            .put("image_alt", "modal alt")
            .put(
                "btns",
                org.json.JSONArray().put(
                    JSONObject()
                        .put("id", 3)
                        .put("text", "Go")
                        .put("click_action", "URI")
                        .put("uri", "https://example.com/b")
                        .put("use_webview", false),
                ),
            )
        for ((message, expectedType) in listOf(
            InAppMessageModal(JSONObject(json.toString()), publisher()) to "modal",
            InAppMessageFull(JSONObject(json.toString()), publisher()) to "full",
        )) {
            val dto = plugin.serializeInAppMessage(message)
            assertThat(dto.getString("type")).isEqualTo(expectedType)
            assertThat(dto.getString("id")).isEqualTo("t-1")
            assertThat(dto.getString("header")).isEqualTo("Header")
            assertThat(dto.getString("message")).isEqualTo("Body")
            assertThat(dto.getString("imageAltText")).isEqualTo("modal alt")
            val buttons = dto.getJSONArray("buttons")
            assertThat(buttons.length()).isEqualTo(1)
            val button = buttons.getJSONObject(0)
            assertThat(button.getInt("id")).isEqualTo(3)
            assertThat(button.getString("text")).isEqualTo("Go")
            assertThat(button.getJSONObject("clickAction").getString("uri"))
                .isEqualTo("https://example.com/b")
        }
    }

    @Test
    fun `a control in-app message short-circuits to the control variant`() {
        val message = InAppMessageSlideup(
            JSONObject()
                .put("is_test_send", false)
                .put("is_control", true)
                .put("trigger_id", "t-control"),
            publisher(),
        )
        val dto = plugin.serializeInAppMessage(message)
        assertThat(dto.getString("type")).isEqualTo("control")
        assertThat(dto.getString("id")).isEqualTo("t-control")
        // Control messages carry no renderable payload.
        assertThat(dto.has("message")).isFalse()
        assertThat(dto.has("slideFrom")).isFalse()
    }

    // -------------------------------------------------------------------------
    // Feature flags
    // -------------------------------------------------------------------------

    /**
     * `FeatureFlag`'s constructors are `internal` to the SDK, so the
     * fixture is built reflectively. The alternative — round-tripping the
     * SDK's own encoder — is exactly the thing under test.
     */
    private fun featureFlag(id: String, enabled: Boolean, properties: String, tracking: String): FeatureFlag {
        val ctor = FeatureFlag::class.java.getDeclaredConstructor(
            String::class.java,
            java.lang.Boolean.TYPE,
            JSONObject::class.java,
            String::class.java,
        )
        ctor.isAccessible = true
        return ctor.newInstance(id, enabled, JSONObject(properties), tracking)
    }

    @Test
    fun `feature flag DTO has exactly id, enabled and properties`() {
        val flag = featureFlag(
            id = "new-checkout",
            enabled = true,
            properties = """{"color":{"type":"string","value":"blue"},"n":{"type":"number","value":3}}""",
            tracking = "internal-impression-token",
        )
        val dto = plugin.serializeFeatureFlag(flag)
        assertThat(dto.keys().asSequence().toSet()).containsExactly("id", "enabled", "properties")
        assertThat(dto.getString("id")).isEqualTo("new-checkout")
        assertThat(dto.getBool("enabled")).isTrue()
        val properties = requireNotNull(dto.getJSObject("properties"))
        assertThat(properties.getJSObject("color")?.getString("value")).isEqualTo("blue")
        assertThat(properties.getJSObject("n")?.getString("type")).isEqualTo("number")
    }

    @Test
    fun `feature flag DTO never leaks the SDK's internal fts tracking token`() {
        val flag = featureFlag("f", false, "{}", "SECRET-FTS-TOKEN")
        // The SDK's own encoder does emit it; the bridge must not.
        assertThat(flag.forJsonPut().has("fts")).isTrue()
        val dto = plugin.serializeFeatureFlag(flag)
        assertThat(dto.has("fts")).isFalse()
        assertThat(dto.toString()).doesNotContain("SECRET-FTS-TOKEN")
    }

    // -------------------------------------------------------------------------
    // Event property conversion
    // -------------------------------------------------------------------------

    @Test
    fun `event properties accept every scalar type`() {
        val input = JSObject()
            .put("s", "text")
            .put("i", 3)
            .put("l", 9_007_199_254_740_991L)
            .put("d", 1.25)
            .put("b", true)
        val result = plugin.brazePropertiesFrom(input)
        assertThat(result).isInstanceOf(BrazePlugin.PropertiesResult.Ok::class.java)
        assertThat((result as BrazePlugin.PropertiesResult.Ok).properties).isNotNull()
    }

    @Test
    fun `event properties report the offending key for non-scalars`() {
        val cases = mapOf(
            "nested" to JSONObject().put("a", 1),
            "list" to org.json.JSONArray().put(1),
            "nothing" to JSONObject.NULL,
        )
        for ((key, value) in cases) {
            val result = plugin.brazePropertiesFrom(JSObject().put("ok", 1).put(key, value))
            assertThat(result).isInstanceOf(BrazePlugin.PropertiesResult.Invalid::class.java)
            assertThat((result as BrazePlugin.PropertiesResult.Invalid).key).isEqualTo(key)
        }
    }

    @Test
    fun `an empty or absent property bag yields no BrazeProperties`() {
        assertThat((plugin.brazePropertiesFrom(null) as BrazePlugin.PropertiesResult.Ok).properties)
            .isNull()
        assertThat(
            (plugin.brazePropertiesFrom(JSObject()) as BrazePlugin.PropertiesResult.Ok).properties,
        ).isNull()
    }
}
