require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BrazePlugin'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/bma342/capacitor-braze'
  s.author = package['author']
  s.source = { :git => 'https://github.com/bma342/capacitor-braze.git', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.dependency 'Capacitor'
  # Braze native SDK pins — see SDK_SURFACE.md §4 (pinning policy).
  s.dependency 'BrazeKit', '14.1.0'
  s.dependency 'BrazeUI', '14.1.0'
end
