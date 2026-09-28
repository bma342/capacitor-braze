require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorBraze'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/bma342/capacitor-braze'
  s.author = package['author']
  s.source = { :git => 'https://github.com/bma342/capacitor-braze.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  # Ships PrivacyInfo.xcprivacy at the framework bundle root, per Apple's spec
  # (https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).
  # BrazeKit ships its own manifest; this one declares the plugin layer's own behavior.
  s.resource_bundles = {
    'CapacitorBraze' => ['ios/Sources/BrazePlugin/PrivacyInfo.xcprivacy']
  }
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  # L4-P03: bounded Capacitor range so future major breaking changes
  # don't silently absorb consumers' Pod installs without a plugin bump.
  # Matches the package.json peer-dep allowance for Capacitor 6, 7 or 8, and
  # the 6.0.0..<9.0.0 capacitor-swift-pm range in Package.swift.
  s.dependency 'Capacitor', '>= 6.0', '< 9.0'
  # Braze native SDK pins — see SDK_SURFACE.md §4 (pinning policy).
  s.dependency 'BrazeKit', '18.2.1'
  s.dependency 'BrazeUI', '18.2.1'
end
