#!/usr/bin/env ruby
# frozen_string_literal: true

# Wires `ios/PluginTests/*.swift` into a runnable XCTest bundle.
#
# A Capacitor plugin ships as a Pod (and, later, an SPM package) with no host
# app, so its XCTest bundle has nowhere to live. Rather than ask every
# maintainer to recreate a target by hand in Xcode — which is how the suite
# ended up never being compiled, let alone run — this script adds a
# `CapacitorBrazeTests` unit-test target to the demo app's project, hosted by
# `App`, with the plugin's test sources as its only members.
#
# The script is idempotent: it rebuilds the file list and settings every run,
# so re-running after adding a test file picks the new file up.
#
# Usage (from the repo root, after `npm run build` in demo/):
#
#     ruby scripts/ios-add-test-target.rb
#     cd demo/ios/App && LANG=en_US.UTF-8 pod install
#     xcodebuild test -workspace App.xcworkspace -scheme App \
#       -destination 'platform=iOS Simulator,name=iPhone 17' \
#       CODE_SIGNING_ALLOWED=NO
#
# The Podfile must nest the test target under `App` so `@testable import
# CapacitorBraze` resolves:
#
#     target 'App' do
#       capacitor_pods
#       target 'CapacitorBrazeTests' do
#         inherit! :search_paths
#       end
#     end

begin
  require 'xcodeproj'
rescue LoadError
  # Homebrew installs CocoaPods into a self-contained GEM_HOME that the system
  # Ruby does not see. CocoaPods vendors `xcodeproj`, so borrow its gem home
  # and re-exec rather than making the contributor install another gem.
  pod_bin = `command -v pod`.strip
  abort('xcodeproj gem not found and `pod` is not on PATH — run `brew install cocoapods`.') if pod_bin.empty?

  gem_home = File.read(pod_bin)[/GEM_HOME="([^"]+)"/, 1] if File.file?(pod_bin)
  abort('xcodeproj gem not found — run `gem install xcodeproj`.') if gem_home.nil?

  exec({ 'GEM_HOME' => gem_home, 'GEM_PATH' => gem_home }, RbConfig.ruby, __FILE__, *ARGV)
end

REPO_ROOT = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(REPO_ROOT, 'demo/ios/App/App.xcodeproj')
TESTS_DIR = File.join(REPO_ROOT, 'ios/PluginTests')
APP_TARGET_NAME = 'App'
TEST_TARGET_NAME = 'CapacitorBrazeTests'
DEPLOYMENT_TARGET = '15.0'

abort("Xcode project not found at #{PROJECT_PATH}") unless Dir.exist?(PROJECT_PATH)

test_sources = Dir.glob(File.join(TESTS_DIR, '*.swift')).sort
abort("No test sources found in #{TESTS_DIR}") if test_sources.empty?

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == APP_TARGET_NAME }
abort("Target '#{APP_TARGET_NAME}' not found in #{PROJECT_PATH}") if app_target.nil?

app_bundle_id = app_target
                .build_configurations
                .map { |c| c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] }
                .compact
                .first || 'dev.bma342.demo.braze'

test_target = project.targets.find { |t| t.name == TEST_TARGET_NAME }
if test_target.nil?
  test_target = project.new_target(:unit_test_bundle, TEST_TARGET_NAME, :ios, DEPLOYMENT_TARGET)
  puts "Created target #{TEST_TARGET_NAME}"
else
  puts "Target #{TEST_TARGET_NAME} already exists — refreshing sources and settings"
end

# --- Sources -----------------------------------------------------------------
# Reconciled against the directory listing on every run: references for files
# that still exist are reused (so their UUIDs — and therefore the committed
# project.pbxproj — stay byte-stable and CI's `git diff --exit-code` check
# holds), stale references are dropped, and new files are added.
group = project.main_group[TEST_TARGET_NAME] || project.main_group.new_group(TEST_TARGET_NAME)
wanted = test_sources.map { |p| Pathname.new(p).realpath.to_s }

existing = group.files.each_with_object({}) do |ref, acc|
  acc[ref.real_path.to_s] = ref
end

(existing.keys - wanted).each do |stale|
  ref = existing.delete(stale)
  test_target.source_build_phase.remove_file_reference(ref)
  ref.remove_from_project
  puts "  - #{Pathname.new(stale).relative_path_from(Pathname.new(REPO_ROOT))} (stale)"
end

wanted.each do |path|
  rel = Pathname.new(path).relative_path_from(Pathname.new(REPO_ROOT))
  if existing.key?(path)
    ref = existing[path]
    unless test_target.source_build_phase.files_references.include?(ref)
      test_target.add_file_references([ref])
    end
    puts "  = #{rel}"
  else
    ref = group.new_reference(path)
    test_target.add_file_references([ref])
    puts "  + #{rel}"
  end
end

# --- Build settings ----------------------------------------------------------
test_target.build_configurations.each do |config|
  settings = config.build_settings
  # Without an explicit PRODUCT_NAME the bundle links as `.xctest` (no stem)
  # and the build fails with "Multiple commands produce …/PlugIns/.xctest".
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle_id}.tests"
  settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  settings['SWIFT_VERSION'] = '5.0'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  settings['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/#{APP_TARGET_NAME}.app/" \
                          "$(BUNDLE_EXECUTABLE_FOLDER_PATH)/#{APP_TARGET_NAME}"
  settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
  # CI runs unsigned on the simulator; a developer signing locally can still
  # override these on the command line.
  settings['CODE_SIGNING_ALLOWED'] = 'NO'
  settings['CODE_SIGNING_REQUIRED'] = 'NO'
  settings['CODE_SIGN_IDENTITY'] = ''
end

test_target.add_dependency(app_target) unless test_target.dependencies.any? { |d| d.target == app_target }

project.save
puts "Saved #{PROJECT_PATH}"

# --- Shared scheme -----------------------------------------------------------
# The autocreated scheme is per-user and invisible to CI. A committed shared
# scheme makes `xcodebuild test -scheme App` deterministic.
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app_target)
scheme.add_build_target(test_target, false)
scheme.add_test_target(test_target)
scheme.set_launch_target(app_target)
scheme.save_as(PROJECT_PATH, APP_TARGET_NAME, true)
puts "Saved shared scheme #{APP_TARGET_NAME}.xcscheme"

puts <<~NEXT

  Next:
    cd demo/ios/App && LANG=en_US.UTF-8 pod install
    xcodebuild test -workspace App.xcworkspace -scheme #{APP_TARGET_NAME} \\
      -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
NEXT
