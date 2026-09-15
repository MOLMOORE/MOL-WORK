; electron-builder automatically includes build/installer.nsh (see NsisTarget.js:
; packager.getResource(options.include, "installer.nsh")) and installSection.nsh
; inserts the customInstall macro at the end of the install section.
;
; Why this exists: Windows caches shell icons per (path, index, timestamp). After an
; upgrade the desktop shortcut can keep rendering the previously cached icon - which
; for this app was the older build that still had an opaque white plate behind the
; MW tile. The icon assets themselves are transparent (build/icon.ico entries all
; carry alpha=0 corners), so the only remaining cause is the stale cache. Notifying
; the shell and asking ie4uinit to republish makes the new icon show up right after
; installation, without a logoff.
!macro customInstall
  DetailPrint "Refreshing shell icon cache for the application icon"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'
  nsExec::ExecToLog '"$SYSDIR\ie4uinit.exe" -show'
!macroend

