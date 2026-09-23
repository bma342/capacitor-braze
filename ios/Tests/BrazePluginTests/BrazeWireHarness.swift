import BrazeKit
import Capacitor
import Foundation
import Network
import XCTest

@testable import CapacitorBraze

// MARK: - LocalHTTPServer

/// A real HTTP/1.1 server on the loopback interface, inside the test process.
///
/// This is the C11 integration tier's substitute for the TypeScript mock
/// server the web suite runs (`test/mock-server/src/index.ts`): BrazeKit's own
/// networking connects to it over a real socket, so what the tests assert is
/// the bytes the SDK put on the wire.
///
/// **Why a socket rather than `URLProtocol`.** C11 originally specified a
/// `URLProtocol` subclass registered with `URLProtocol.registerClass`. That
/// only intercepts sessions built from `URLSessionConfiguration.default`, and
/// BrazeKit 18.2.1 exposes nothing about the session it uses — no
/// `protocolClasses` hook, no injectable configuration (verified against
/// `BrazeKit.swiftinterface`, which mentions `URLSession` nowhere). Registering
/// a protocol class would therefore be a bet on a private implementation
/// detail that a pin bump could silently void, and the failure mode is a
/// *passing* test that stopped intercepting anything. A loopback listener
/// cannot be bypassed: either the SDK connects to the endpoint it was
/// configured with, or the test times out.
///
/// **App Transport Security.** The endpoint is `http://127.0.0.1:<port>`. ATS
/// does not apply to requests to IP-literal hosts, so no `NSAllowsLocalNetworking`
/// (or any other) exception is needed in the test host's `Info.plist`.
///
/// The listener binds loopback explicitly via `requiredLocalEndpoint` rather
/// than `0.0.0.0`, so running the suite never trips the macOS
/// incoming-connections firewall prompt.
final class LocalHTTPServer: @unchecked Sendable {

    /// One request the server received, parsed far enough to assert on.
    struct Request {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data

        /// The body decoded as a JSON object. Every Braze request body is one.
        var json: [String: Any] {
            (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        }

        /// The body as text, for diagnostics and substring assertions.
        var text: String { String(data: body, encoding: .utf8) ?? "" }

        /// `events` array, or empty.
        var events: [[String: Any]] { json["events"] as? [[String: Any]] ?? [] }

        /// `attributes` array, or empty.
        var attributes: [[String: Any]] { json["attributes"] as? [[String: Any]] ?? [] }

        /// The first `events[]` entry named `name`.
        func event(_ name: String) -> [String: Any]? {
            events.first { $0["name"] as? String == name }
        }

        /// The custom event called `name`, or nil.
        ///
        /// Not `event("ce")`: Braze batches, so one request routinely carries
        /// several `ce` entries and the first is rarely the one a test means.
        /// That distinction is the difference between a stable assertion and
        /// one that fails whenever the SDK coalesces two flushes.
        func customEvent(_ name: String) -> [String: Any]? {
            events.first {
                $0["name"] as? String == "ce"
                    && ($0["data"] as? [String: Any])?["n"] as? String == name
            }
        }

        /// A header, looked up case-insensitively (HTTP header names are).
        func header(_ name: String) -> String? {
            headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
        }

        /// The user id this request is routed for.
        ///
        /// A cross-platform wire difference worth knowing: Android's
        /// `changeUser` shows up as an `attributes[].user_id` entry, while
        /// BrazeKit instead stamps `respond_with.user_id` (and every
        /// `events[]` entry). Asserting the Android shape on iOS silently
        /// never matches.
        var respondWithUserId: String? {
            (json["respond_with"] as? [String: Any])?["user_id"] as? String
        }
    }

    /// What the server answers with. `status` defaults to 200 because every
    /// Braze endpoint replies 200 on the happy path — including, notably, the
    /// SDK-Authentication failure, which rides inside a successful response.
    struct Reply {
        let status: Int
        let body: String

        init(_ body: String, status: Int = 200) {
            self.body = body
            self.status = status
        }
    }

    private let listener: NWListener
    private let queue = DispatchQueue(label: "capacitor-braze.wire-harness")
    private let lock = NSLock()
    private var captured: [Request] = []
    private var responderBox: (Request) -> Reply = { BrazeWire.defaultReply(for: $0) }

    /// Port the listener bound to. Non-zero once ``start()`` returns.
    private(set) var port: UInt16 = 0

    /// Everything the server has received, oldest first.
    var requests: [Request] {
        lock.lock()
        defer { lock.unlock() }
        return captured
    }

    /// What to answer with. Swap mid-test to script a feature-flag payload, a
    /// content-card payload or an auth error onto the next request.
    var responder: (Request) -> Reply {
        get {
            lock.lock()
            defer { lock.unlock() }
            return responderBox
        }
        set {
            lock.lock()
            responderBox = newValue
            lock.unlock()
        }
    }

    init() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        parameters.allowLocalEndpointReuse = true
        listener = try NWListener(using: parameters)
    }

    /// Binds and waits for the kernel to assign a port.
    func start() throws {
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 10) == .success, let bound = listener.port else {
            throw XCTSkip("LocalHTTPServer could not bind a loopback port.")
        }
        port = bound.rawValue
    }

    func stop() {
        listener.cancel()
    }

    /// Drops captured requests so a later assertion cannot match an earlier one.
    func clearRequests() {
        lock.lock()
        captured.removeAll()
        lock.unlock()
    }

    /// `http://127.0.0.1:<port>` — what `initialize` is pointed at.
    var endpoint: String { "http://127.0.0.1:\(port)" }

    // MARK: Connection handling

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data())
    }

    /// `NWConnection.receive`'s completion shape, named so the closure's
    /// parameters can sit on the same line as its brace.
    private typealias ReceiveHandler = (Data?, NWConnection.ContentContext?, Bool, NWError?) -> Void

    /// Reads until a complete request (headers + `Content-Length` bytes) has
    /// arrived, answers it, and closes. One request per connection: the
    /// response carries `Connection: close`, which `URLSession` honours, so
    /// there is no pipelining to reassemble.
    private func read(_ connection: NWConnection, buffer: Data) {
        let handler: ReceiveHandler = { [weak self] chunk, _, isComplete, error in
            guard let self = self else { return }
            var accumulated = buffer
            if let chunk = chunk { accumulated.append(chunk) }

            if let request = Self.parse(accumulated) {
                self.lock.lock()
                self.captured.append(request)
                let responder = self.responderBox
                self.lock.unlock()
                self.respond(connection, reply: responder(request))
                return
            }
            if error != nil || isComplete {
                connection.cancel()
                return
            }
            self.read(connection, buffer: accumulated)
        }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16, completion: handler)
    }

    /// Returns a `Request` once `raw` holds the whole thing, otherwise nil.
    private static func parse(_ raw: Data) -> Request? {
        let separator = Data("\r\n\r\n".utf8)
        guard let headerEnd = raw.range(of: separator) else { return nil }
        guard let head = String(data: raw[raw.startIndex..<headerEnd.lowerBound], encoding: .utf8) else {
            return nil
        }
        var lines = head.components(separatedBy: "\r\n")
        guard !lines.isEmpty else { return nil }
        let requestLine = lines.removeFirst().components(separatedBy: " ")
        guard requestLine.count >= 2 else { return nil }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = String(line[line.startIndex..<colon])
            let value = String(line[line.index(after: colon)...])
                .trimmingCharacters(in: .whitespaces)
            headers[name] = value
        }

        let declaredLength = headers
            .first { $0.key.caseInsensitiveCompare("Content-Length") == .orderedSame }
            .flatMap { Int($0.value) } ?? 0
        let body = raw[headerEnd.upperBound...]
        guard body.count >= declaredLength else { return nil }

        return Request(
            method: requestLine[0],
            path: requestLine[1],
            headers: headers,
            body: Data(body.prefix(declaredLength))
        )
    }

    /// Writes a minimal but *exactly* conformant HTTP/1.1 response.
    ///
    /// The status line and each header are joined with explicit `\r\n` and the
    /// head is terminated with a second `\r\n`. Do not be tempted to build this
    /// with a Swift multi-line string literal: Swift drops the newline before
    /// the closing delimiter, so the head loses its final `LF`, and `URLSession`
    /// rejects the whole exchange with `NSURLErrorCannotParseResponse` (-1017).
    /// BrazeKit then retries the same request with backoff and the events that
    /// were supposed to be on the wire never leave the queue — which reads, at
    /// the test, as "the SDK ignored my `logCustomEvent`".
    private func respond(_ connection: NWConnection, reply: Reply) {
        let payload = Data(reply.body.utf8)
        let head = [
            "HTTP/1.1 \(reply.status) \(reply.status == 200 ? "OK" : "Error")",
            "Content-Type: application/json",
            "Content-Length: \(payload.count)",
            "Connection: close",
            "",
            ""
        ].joined(separator: "\r\n")
        var response = Data(head.utf8)
        response.append(payload)
        // `isComplete: true` sends FIN once the body is written, so the client
        // sees a clean end-of-message rather than a reset. The connection is
        // torn down from the read side when the peer closes.
        connection.send(
            content: response,
            contentContext: .finalMessage,
            isComplete: true,
            completion: .contentProcessed { _ in
                connection.cancel()
            }
        )
    }
}

// MARK: - Call capture

/// A `CAPPluginCall` plus whatever the plugin did with it.
///
/// The plugin resolves asynchronously — every `@objc` entry point hops to the
/// main actor first — so a test that read `resolved` immediately would race.
/// ``settled`` is what the harness polls on.
@MainActor
final class RecordedCall {
    private(set) var resolved: [String: Any]?
    private(set) var rejection: String?
    private(set) var settled = false
    /// Every payload delivered to this call. A listener call receives many.
    private(set) var payloads: [[String: Any]] = []

    // swiftlint:disable:next implicitly_unwrapped_optional
    private(set) var call: CAPPluginCall!

    init(_ method: String, _ options: JSObject) {
        call = CAPPluginCall(
            callbackId: UUID().uuidString,
            methodName: method,
            options: options,
            success: { [weak self] result, _ in
                MainActor.assumeIsolated {
                    guard let self = self else { return }
                    self.resolved = result?.data
                    if let data = result?.data { self.payloads.append(data) }
                    self.settled = true
                }
            },
            error: { [weak self] error in
                MainActor.assumeIsolated {
                    guard let self = self else { return }
                    self.rejection = error?.message
                    self.settled = true
                }
            }
        )
    }
}

// MARK: - WireHarness

/// Thrown when a bounded poll gives up. Carries the diagnostic dump, so the
/// XCTest failure names both what never happened and what did arrive instead.
struct WireTimeout: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// A ``LocalHTTPServer`` + a real `BrazePlugin`, plus the polling helpers the
/// integration tests assert through.
///
/// Every wait is a bounded poll on material the SDK or the plugin actually
/// produced; `Task.sleep` between polls is what yields the main run loop so
/// the plugin's `DispatchQueue.main.async` hops (and BrazeKit's `@MainActor`
/// subscriber callbacks) can run. Nothing sleeps as its only synchronisation.
@MainActor
final class WireHarness {

    /// Bound on every poll. Generous; never reached on a pass.
    nonisolated static let timeout: TimeInterval = 25

    /// How long a "no traffic" assertion watches before concluding nothing is
    /// coming. Only ever used between positive controls — see
    /// `assertNoFurtherRequests`.
    nonisolated static let quietWindow: TimeInterval = 2

    let server: LocalHTTPServer
    let plugin: BrazePlugin

    private var listeners: [RecordedCall] = []

    /// Every rejection any ``invoke(_:_:_:)`` produced, for the failure dump.
    private var rejections: [String] = []

    init() throws {
        server = try LocalHTTPServer()
        try server.start()
        plugin = BrazePlugin()
    }

    /// Drops the server. Deliberately does **not** touch the SDK.
    ///
    /// Two tempting teardowns are both wrong, and both cost a debugging
    /// session to find:
    ///
    ///  - **`wipeData`** is the instance-method rename of
    ///    `wipeDataAndDisableForAppRun()` and keeps that second half: it
    ///    disables the SDK, and the disable is *persisted in the app
    ///    container*. A later launch comes up disabled until something
    ///    re-enables it (BrazeKit ships `_requestEnableSDKOnNextAppRun()` for
    ///    exactly this), so a teardown wipe poisons not just the next test but
    ///    the next *run* of the suite on the same simulator — every assertion
    ///    timing out with `Braze SDK disabled: Cannot schedule work`.
    ///  - **`disableSDK`**, because re-enabling it is what breaks. Setting
    ///    `enabled = true` on the previous instance spins it back up — BrazeKit
    ///    logs a second "Initializing Braze SDK" — and for a moment two live
    ///    `Braze` instances share one on-disk event store. The next test's
    ///    `logCustomEvent` then enqueues into a store the departing instance is
    ///    still holding, and every flush reports "no new data to flush".
    ///
    /// Leaving the old instance alone is safe: the next
    /// ``initialize(_:file:line:)`` nils `BrazePlugin.braze` before creating
    /// its replacement, which releases it. Until then it retries against a
    /// closed port, which is log noise and nothing more.
    func tearDown() async {
        server.stop()
    }

    // MARK: Driving the plugin

    /// Invokes a plugin method and waits for it to settle.
    ///
    /// Settling is not instantaneous: every `@objc` entry point hops to the
    /// main actor before it resolves, so reading `resolved` without this wait
    /// would race.
    ///
    /// `options` is a `JSObject`, not `[String: Any]`, and that is load-bearing.
    /// `CAPPluginCall`'s accessors all go through `options as? JSObject`, which
    /// is all-or-nothing: one value that is not a `JSValue` — a nested
    /// `["tier": "gold", "count": 3]` that Swift inferred as `[String: Any]`,
    /// say — makes the *whole* cast fail, so `getString("name")` returns nil and
    /// the bridge rejects with "`name` is required (string)" for a payload that
    /// plainly contains it. Typing the parameter moves that from a baffling
    /// runtime rejection to a compile error.
    @discardableResult
    func invoke(
        _ method: String,
        _ options: JSObject = [:],
        _ body: (CAPPluginCall) -> Void
    ) async throws -> RecordedCall {
        let recorded = RecordedCall(method, options)
        body(recorded.call)
        try await poll("Braze.\(method) to settle") { recorded.settled ? () : nil }
        if let rejection = recorded.rejection {
            // Not a failure in itself — a few tests assert on rejections — but
            // an unnoticed one is the usual reason a later `awaitRequest` sees
            // nothing, so it goes into the diagnostic dump.
            rejections.append("Braze.\(method): \(rejection)")
        }
        return recorded
    }

    /// Runs the plugin's real `initialize` against ``LocalHTTPServer/endpoint``
    /// and does not return until the SDK has demonstrably reached the wire.
    ///
    /// The demonstration is the point. BrazeKit persists an opt-out in the app
    /// container, so a `wipeData` or `disableSDK` from an earlier test — or an
    /// earlier *run* of the suite on the same simulator — brings the new
    /// instance up disabled. `enableSDK` fixes that, but **not synchronously**:
    /// setting `enabled = true` makes BrazeKit re-initialize the instance (it
    /// logs a second "Initializing Braze SDK"), and anything logged during that
    /// window is dropped on the floor with no error, no rejection and no log
    /// line. The symptom is a test whose `logCustomEvent` resolves happily and
    /// whose every subsequent flush reports "no new data to flush" for the full
    /// timeout.
    ///
    /// So instead of guessing at the delay: enable, log a throwaway event, and
    /// keep retrying until that event comes back to us over HTTP. When it does,
    /// the instance is live and the test's own calls will stick. The warm-up
    /// requests stay in ``LocalHTTPServer/requests`` — they are ordinary data
    /// POSTs and no assertion in the suite matches on them.
    @discardableResult
    func initialize(
        _ extraOptions: JSObject = [:],
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws -> RecordedCall {
        var options: JSObject = [
            "apiKey": "integration-test-key",
            "endpoint": server.endpoint,
            "allowInsecureEndpoint": true,
            // Not the production default (C06 keeps logging off), but in a
            // test host it is what turns "the assertion timed out" into
            // BrazeKit's own account of which URL it tried and why it gave up.
            "enableLogging": true
        ]
        options.merge(extraOptions) { _, new in new }
        // Wipe first. BrazeKit's state — device id, event queue, session,
        // cached server config, the user the last response was routed for —
        // lives in the app container and outlives any single `Braze` instance,
        // so without this every test inherits whatever the previous one left
        // behind. That is not a theoretical tidiness concern: it is the
        // difference between a suite that passes three times running and one
        // where a slow test wedges the two after it. `wipeData` also disables
        // the SDK (see ``tearDown()``), which ``awaitLiveSdk()`` undoes.
        try await invoke("wipeData") { plugin.wipeData($0) }
        let call = try await invoke("initialize", options) { plugin.initialize($0) }
        XCTAssertNil(call.rejection, "initialize rejected: \(call.rejection ?? "")", file: file, line: line)
        try await awaitLiveSdk()
        return call
    }

    /// Re-runs `initialize` against the same endpoint **without** the warm-up
    /// handshake, replacing the live `Braze` instance with a fresh one.
    ///
    /// Only useful for the config-gated features: BrazeKit reads Feature Flags
    /// and Content Cards enablement out of the cached server config when the
    /// instance is built, so the instance that *fetched* the config can never
    /// act on it. The second instance can. Skipping the warm-up matters —
    /// logging into a just-replaced instance is how events get lost.
    func reinitialize(_ extraOptions: JSObject = [:]) async throws {
        var options: JSObject = [
            "apiKey": "integration-test-key",
            "endpoint": server.endpoint,
            "allowInsecureEndpoint": true,
            "enableLogging": true
        ]
        options.merge(extraOptions) { _, new in new }
        try await invoke("initialize", options) { plugin.initialize($0) }
    }

    /// Name of the warm-up event the last ``initialize(_:file:line:)`` used.
    /// Distinctive enough that no assertion can collide with it.
    private static func warmupName() -> String {
        "wire_warmup_\(UUID().uuidString.prefix(8))"
    }

    /// Enables the SDK and blocks until a logged event actually reaches the
    /// server, re-issuing both on every attempt. See ``initialize(_:file:line:)``.
    ///
    /// Every third attempt also replaces the instance. A `Braze` left wedged by
    /// the *previous* test — its request-token bucket drained by a retry loop,
    /// or its event store still held by a departing sibling — will not recover
    /// on its own no matter how long this waits, but a fresh instance starts
    /// clean. Re-initializing is the only self-healing step available, and
    /// without it one slow test cascades into failures in the two after it.
    private func awaitLiveSdk() async throws {
        let name = Self.warmupName()
        let deadline = Date().addingTimeInterval(WireHarness.timeout)
        var attempt = 0
        while Date() < deadline {
            attempt += 1
            if attempt > 1 && attempt % 3 == 1 {
                try await reinitialize()
            }
            try await invoke("enableSDK") { plugin.enableSDK($0) }
            try await invoke("logCustomEvent", ["name": name]) { plugin.logCustomEvent($0) }
            try await flush()
            let innerDeadline = Date().addingTimeInterval(1)
            while Date() < innerDeadline {
                if server.requests.contains(where: { $0.text.contains(name) }) { return }
                try? await Task.sleep(nanoseconds: 25_000_000)
            }
        }
        throw WireTimeout(
            "The SDK never reached the wire after initialize (warm-up event \(name) "
                + "was never delivered).\n\(dump())"
        )
    }

    /// Registers a real listener for `eventName` through Capacitor's own
    /// `addEventListener`, so the assertion covers `notifyListeners`' real
    /// dispatch path rather than a stub of it.
    func listen(_ eventName: String) -> RecordedCall {
        let recorded = RecordedCall("addListener", ["eventName": eventName])
        recorded.call.keepAlive = true
        plugin.addEventListener(eventName, listener: recorded.call)
        listeners.append(recorded)
        return recorded
    }

    /// Forces the SDK to drain its queue now rather than on its own cadence.
    func flush() async throws {
        try await invoke("requestImmediateDataFlush") { plugin.requestImmediateDataFlush($0) }
    }

    // MARK: Waiting

    /// Polls `probe` until it returns non-nil, or throws ``WireTimeout``
    /// carrying a dump of every request the server did see.
    ///
    /// Throwing rather than returning an optional is deliberate: `XCTUnwrap`
    /// takes an autoclosure, which cannot contain an `await`, so an optional
    /// return would force an unwrap dance at every call site. XCTest reports
    /// the thrown error's description, so the diagnostic survives either way.
    @discardableResult
    func poll<T>(
        _ label: String,
        timeout: TimeInterval = WireHarness.timeout,
        _ probe: () -> T?
    ) async throws -> T {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = probe() { return value }
            try? await Task.sleep(nanoseconds: 25_000_000)
        }
        throw WireTimeout("Timed out after \(Int(timeout))s waiting for \(label).\n\(dump())")
    }

    /// Polls until a captured request satisfies `predicate`.
    func awaitRequest(
        _ label: String,
        _ predicate: @escaping (LocalHTTPServer.Request) -> Bool
    ) async throws -> LocalHTTPServer.Request {
        try await poll(label) { server.requests.first(where: predicate) }
    }

    /// ``awaitRequest(_:_:)``, but re-running `action` on every poll.
    ///
    /// Feature Flags and Content Cards are gated on the server config, which
    /// rides on the response to the *first* data POST — so a refresh issued
    /// immediately after `initialize` can lose the race and be dropped by the
    /// SDK. Retrying until the sync request appears removes the race without a
    /// sleep-and-hope.
    func awaitRequestRetrying(
        _ label: String,
        action: () async -> Void,
        _ predicate: @escaping (LocalHTTPServer.Request) -> Bool
    ) async throws -> LocalHTTPServer.Request {
        let deadline = Date().addingTimeInterval(WireHarness.timeout)
        while Date() < deadline {
            await action()
            let innerDeadline = Date().addingTimeInterval(1)
            while Date() < innerDeadline {
                if let match = server.requests.first(where: predicate) { return match }
                try? await Task.sleep(nanoseconds: 25_000_000)
            }
        }
        throw WireTimeout(
            "Timed out after \(Int(WireHarness.timeout))s waiting for \(label).\n\(dump())"
        )
    }

    /// Polls for a matching request while re-issuing the flush.
    ///
    /// A single `requestImmediateDataFlush` is not enough. BrazeKit rate-limits
    /// outbound requests — the headers it sends (`X-Braze-Last-Req-Ms-Ago`,
    /// `X-Braze-Req-Tokens-Remaining`) are the token bucket behind
    /// `Braze.Configuration.Api.flushInterval`, which the plugin deliberately
    /// does not expose. Tests running back to back exhaust it, and an immediate
    /// flush that arrives too soon is *dropped, not deferred*. The symptom is
    /// unmistakable once you have seen it: alternating pass/fail down the
    /// suite, because every 25-second timeout refills the bucket for the test
    /// after it. Re-issuing the flush until the request lands is the fix, and
    /// it costs nothing when the first one goes through.
    func awaitFlushedRequest(
        _ label: String,
        _ predicate: @escaping (LocalHTTPServer.Request) -> Bool
    ) async throws -> LocalHTTPServer.Request {
        try await awaitRequestRetrying(label, action: { try? await self.flush() }, predicate)
    }

    /// Polls until `listener` has received a payload satisfying `predicate`.
    func awaitEvent(
        _ listener: RecordedCall,
        _ label: String,
        _ predicate: @escaping ([String: Any]) -> Bool
    ) async throws -> [String: Any] {
        try await poll(label) { listener.payloads.first(where: predicate) }
    }

    /// Watches for ``quietWindow`` and throws if anything new reached the
    /// server. Callers bracket this with positive controls so it cannot pass
    /// because the harness was broken.
    func assertNoFurtherRequests(_ label: String) async throws {
        let before = server.requests.count
        let deadline = Date().addingTimeInterval(WireHarness.quietWindow)
        while Date() < deadline {
            if server.requests.count > before {
                throw WireTimeout(
                    "Expected no traffic \(label), but the server received "
                        + "\(server.requests.count - before) more request(s).\n\(dump())"
                )
            }
            try? await Task.sleep(nanoseconds: 25_000_000)
        }
    }

    private func dump() -> String {
        let requests = server.requests
        var text = "Endpoint: \(server.endpoint)\n"
        text += "Captured \(requests.count) request(s):\n"
        text += requests.map { "  \($0.method) \($0.path)\n    \($0.text.prefix(1200))" }
            .joined(separator: "\n")
        if !rejections.isEmpty {
            text += "\nRejected calls:\n" + rejections.map { "  \($0)" }.joined(separator: "\n")
        }
        return text
    }
}

// MARK: - BrazeWire

/// The exact JSON Braze's backend returns, mirrored from the Android
/// integration tier's `BrazeWire` and the TypeScript mock server
/// (`test/mock-server/src/index.ts`) so all three platforms' integration tests
/// assert against the same envelopes.
enum BrazeWire {

    /// Header the SDK carries the SDK-Authentication JWT in.
    static let authHeader = "X-Braze-Auth-Signature"

    /// A well-formed, empty answer for whichever endpoint `request` targeted.
    ///
    /// Every endpoint gets its own envelope rather than a blanket
    /// `{"message":"success"}`, because BrazeKit decodes each one strictly: a
    /// server-config body returned to `/content_cards/sync` is an "HTTP
    /// decoding error", and a failed sync is retried with backoff, which burns
    /// through the request-rate budget (`X-Braze-Req-Tokens-Remaining`) that
    /// the *rest* of the test still needs. Tests override only the endpoint
    /// they care about and fall back here for the others.
    static func defaultReply(for request: LocalHTTPServer.Request) -> LocalHTTPServer.Reply {
        if request.path.contains("feature_flags/sync") {
            return .init(#"{"message":"success","feature_flags":[]}"#)
        }
        if request.path.contains("content_cards/sync") {
            // BrazeKit logs an "HTTP decoding error" for this endpoint whatever
            // we answer with — the Android-shaped `{cards, full_sync}` envelope
            // and a bare `{"message":"success"}` are both rejected, and the
            // bare ack is rejected *more* often. The iOS Content Cards sync
            // response shape is the open half of that story; see the note above
            // the Content Cards test. This is the quieter of the two.
            return .init(contentCardsSync(cards: ""))
        }
        return .init(serverConfig())
    }

    /// Monotonic source for the config's `time`. See ``serverConfig()``.
    private static let configTime = ConfigTimeCounter()

    /// The server-config envelope, which rides on a `/api/v3/data/` response
    /// and is what switches Feature Flags and Content Cards on.
    /// `refresh_rate_limit: 0` removes the client-side throttle so a test can
    /// refresh immediately after initialize.
    ///
    /// `time` is `now + n`, strictly increasing per call, rather than plain
    /// `now`. The SDK caches the config it last applied and ignores any
    /// envelope whose `time` is not *newer* — and iOS keeps that cache in the
    /// app container across `Braze` instances, so two tests landing in the same
    /// wall-clock second would leave the second one with Feature Flags and
    /// Content Cards still disabled and its refresh silently dropped.
    /// The three `*_blacklist` arrays are **required**, and that is not a
    /// detail you can guess. BrazeKit decodes a data response as a strict
    /// `Codable`, so a `config` block missing any non-optional member fails the
    /// *whole* response with "Unable to decode either 'Error' or
    /// 'DataResponse'" — the config is dropped, Feature Flags and Content Cards
    /// stay disabled, and the only symptom is "Unable to perform feature flags
    /// operation, the feature flags feature is disabled" on every refresh.
    /// A `config` of just `{"time": N}` fails exactly the same way.
    ///
    /// The member list, recovered from the shipped binary's coding keys in
    /// declaration order, is: `time`, `events_blacklist`, `attributes_blacklist`,
    /// `purchases_blacklist`, `messaging_session_timeout`, `geofences`,
    /// `ephemeral_events`, `content_cards`, `feature_flags`, `banners`,
    /// `global_request_rate_limit`, `request_backoff`, `sdk_debugger`. The
    /// shape below is the smallest one verified to decode; adding the remaining
    /// members with guessed sub-shapes breaks it again, so leave them out.
    static func serverConfig() -> String {
        """
        {"message":"success",
         "config":{"time":\(configTime.next()),
           "events_blacklist":[],
           "attributes_blacklist":[],
           "purchases_blacklist":[],
           "messaging_session_timeout":1800,
           "feature_flags":{"enabled":true,"refresh_rate_limit":0},
           "content_cards":{"enabled":true,"refresh_rate_limit":0}}}
        """
    }

    /// A `/api/v3/feature_flags/sync` response.
    static func featureFlagsSync(id: String, enabled: Bool, properties: String = "{}") -> String {
        """
        {"message":"success","feature_flags":[{"id":"\(id)","enabled":\(enabled),"properties":\(properties)}]}
        """
    }

    /// A `/api/v3/content_cards/sync` response. Top-level `cards` + `full_sync`;
    /// per-card keys are Braze's wire names, with `tp` selecting the variant.
    static func contentCardsSync(cards: String) -> String {
        #"{"message":"success","full_sync":true,"cards":[\#(cards)]}"#
    }

    /// A `short_news` (classic-with-image) card.
    static func shortNewsCard(id: String, title: String, description: String) -> String {
        """
        {"id":"\(id)","tp":"short_news","ca":1700000000,"tt":"\(title)","ds":"\(description)",
         "u":"https://example.test/click","i":"https://example.test/image.png"}
        """
    }

    /// The SDK-Authentication failure envelope, delivered inside an otherwise
    /// successful `/api/v3/data/` response.
    static func authError(userId: String, signature: String, code: Int = 401,
                          reason: String = "bad signature") -> String {
        """
        {"message":"success",
         "auth_error":{"error_code":\(code),"reason":"\(reason)","signature":"\(signature)",
           "user_id":"\(userId)","request_time":\(Int(Date().timeIntervalSince1970 * 1000))}}
        """
    }
}

/// Hands out strictly increasing unix-second values, from any thread.
/// The server answers on its own queue, so this has to be safe there.
final class ConfigTimeCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var offset = 0

    func next() -> Int {
        lock.lock()
        defer { lock.unlock() }
        offset += 1
        return Int(Date().timeIntervalSince1970) + offset
    }
}
