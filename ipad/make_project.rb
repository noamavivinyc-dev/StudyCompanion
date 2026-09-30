require "xcodeproj"

root = File.expand_path(__dir__)
project_path = File.join(root, "StudyCapture.xcodeproj")
project = Xcodeproj::Project.new(project_path)
project.root_object.attributes["LastSwiftUpdateCheck"] = "2700"
project.root_object.attributes["LastUpgradeCheck"] = "2700"

target = project.new_target(:application, "StudyCapture", :ios, "27.0")
group = project.main_group.new_group("StudyCapture", "StudyCapture")
%w[StudyCaptureApp.swift ContentView.swift CaptureController.swift].each do |name|
  target.add_file_references([group.new_file(name)])
end
group.new_file("Info.plist")

target.build_configurations.each do |config|
  settings = config.build_settings
  settings["PRODUCT_BUNDLE_IDENTIFIER"] = "com.studycompanion.capture"
  settings["PRODUCT_NAME"] = "Study Capture"
  settings["INFOPLIST_FILE"] = "StudyCapture/Info.plist"
  settings["SWIFT_VERSION"] = "6.0"
  settings["IPHONEOS_DEPLOYMENT_TARGET"] = "27.0"
  settings["TARGETED_DEVICE_FAMILY"] = "1,2"
  settings["CODE_SIGN_STYLE"] = "Automatic"
  settings["ASSETCATALOG_COMPILER_APPICON_NAME"] = ""
  settings["GENERATE_INFOPLIST_FILE"] = "NO"
  settings["ENABLE_PREVIEWS"] = "YES"
end

project.save
