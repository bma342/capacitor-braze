/**
 * Capacitor plugin interface for the Braze SDK.
 *
 * See https://github.com/bma342/capacitor-braze for full docs.
 *
 * Scope discipline: this interface only grows per the version roadmap in
 * `SDK_SURFACE.md`. New methods are scope decisions, not casual additions.
 */

/**
 * Options passed to `Braze.initialize`.
 *
 * `apiKey` is a **public Braze SDK API key** (the kind embedded in your app).
 * Never pass a REST API key here — they are different things. See SECURITY.md §1.
 */
export interface BrazeInitializeOptions {
  /** Braze SDK API key (public). */
  apiKey: string;
  /** Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Must be HTTPS in production. */
  endpoint: string;
  /** Enable verbose SDK logging. Defaults to `false`. Never enable in production. */
  enableLogging?: boolean;
  /** Enable SDK Authentication (signed JWT validation). Strongly recommended for production. */
  enableSdkAuthentication?: boolean;
  /** Allow non-HTTPS `endpoint` (for local mock-server testing only). Defaults to `false`. */
  allowInsecureEndpoint?: boolean;
}

export interface BrazeEchoOptions {
  value: string;
}

export interface BrazeEchoResult {
  value: string;
}

export interface BrazePlugin {
  /**
   * Round-trips a value through the native bridge. Used to verify plugin
   * installation and bridge health. Not a Braze SDK method.
   *
   * @example
   * const { value } = await Braze.echo({ value: 'hello' });
   * // value === 'hello'
   */
  echo(options: BrazeEchoOptions): Promise<BrazeEchoResult>;

  /**
   * Initialize the Braze SDK. Must be called before any other Braze method.
   *
   * In 0.0.1 this validates options and stores configuration on the native
   * side; the actual Braze SDK initialization wiring lands in 0.0.2.
   *
   * @example
   * await Braze.initialize({
   *   apiKey: 'YOUR-SDK-KEY',
   *   endpoint: 'sdk.iad-03.braze.com',
   *   enableSdkAuthentication: true,
   * });
   */
  initialize(options: BrazeInitializeOptions): Promise<void>;
}
