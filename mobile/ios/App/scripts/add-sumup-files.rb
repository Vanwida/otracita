#!/usr/bin/env ruby
# -----------------------------------------------------------------------------
# add-sumup-files.rb — registra los archivos del plugin SumUp Tap to Pay y el
# entitlements file dentro del .pbxproj. Idempotente: si ya están, no hace nada.
#
# Por qué: `cap add ios` genera el proyecto vacío. Cuando añadimos a mano
# SumupTapToPayPlugin.swift, SumupTapToPayPlugin.m y App.entitlements al
# directorio ios/App/App/, Xcode no los compila hasta que están listados en
# el .pbxproj. Este script lo automatiza usando la gema `xcodeproj`.
# -----------------------------------------------------------------------------

require 'xcodeproj'

project_path = File.expand_path('../App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

target = project.targets.find { |t| t.name == 'App' } or abort('No target App')
app_group = project.main_group.find_subpath('App', false) or abort('No group App/')

files_to_add = [
  { path: 'App/SumupTapToPayPlugin.swift', kind: :source },
  { path: 'App/SumupTapToPayPlugin.m',     kind: :source },
  { path: 'App/App.entitlements',          kind: :resource_optional },
]

added = []
files_to_add.each do |f|
  basename = File.basename(f[:path])

  # Skip if already registered (search by path, not by name, to avoid dupes)
  existing = project.files.find { |pf| pf.path == basename || pf.real_path.to_s.end_with?("/#{basename}") }
  if existing
    puts "skip (already in project): #{basename}"
    next
  end

  ref = app_group.new_reference(basename)
  ref.set_source_tree('<group>')
  if f[:kind] == :source
    target.add_file_references([ref])
  end
  # Entitlements is referenced via CODE_SIGN_ENTITLEMENTS build setting,
  # not as a build phase artifact — so we just register the file group entry.
  added << basename
end

project.save
puts "done. added: #{added.join(', ')}" if added.any?
puts "no changes" if added.empty?
