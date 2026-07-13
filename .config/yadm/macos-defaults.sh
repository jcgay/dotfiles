#!/usr/bin/env bash
#
# Personnalisation macOS — dérivé de https://mths.be/macos, élagué pour macOS 26 (Tahoe).
# Ré-exécutable : `bash ~/.config/yadm/macos-defaults.sh` ou via `yadm bootstrap`.
# Volontairement PAS de `set -e` : une clé obsolète ne doit pas interrompre le reste.

# Ferme Réglages Système pour ne pas écraser nos changements
osascript -e 'tell application "System Settings" to quit' 2>/dev/null || true

# Demande le mot de passe admin en amont et le garde vivant
sudo -v
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

# ⚠️ Quelques réglages ci-dessous touchent des domaines protégés par TCC
#    (com.apple.universalaccess, systemsetup). Ils échouent avec
#    « Could not write domain … ; exiting » tant que l'app du terminal
#    (Ghostty) n'a pas l'« Accès complet au disque » :
#    Réglages Système › Confidentialité et sécurité › Accès complet au disque › + Ghostty.
#    Lignes concernées marquées « [TCC] » ci-dessous.

echo "→ Application des réglages macOS…"

###############################################################################
# UI/UX général                                                               #
###############################################################################

# Coupe les sons d'interface
defaults write com.apple.systemsound "com.apple.sound.uiaudio.enabled" -int 0

# Moins de transparence (réparé depuis 26.3) — [TCC]
defaults write com.apple.universalaccess reduceTransparency -bool true

# Couleur de surlignage : vert
defaults write NSGlobalDomain AppleHighlightColor -string "0.764700 0.976500 0.568600"

# Taille des icônes de barre latérale : moyenne
defaults write NSGlobalDomain NSTableViewDefaultSizeMode -int 2

# Désactive l'animation du focus ring et accélère le redimensionnement des fenêtres
defaults write NSGlobalDomain NSUseAnimatedFocusRing -bool false
defaults write NSGlobalDomain NSWindowResizeTime -float 0.001

# Déplie les panneaux d'enregistrement / impression par défaut
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint2 -bool true

# Enregistre sur le disque (pas iCloud) par défaut
defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false

# Quitte l'app d'impression une fois les travaux terminés
defaults write com.apple.print.PrintingPrefs "Quit When Finished" -bool true

# Affiche les caractères de contrôle en notation caret dans les vues texte standard
defaults write NSGlobalDomain NSTextShowsControlCharacters -bool true

# N'arrête pas automatiquement les apps inactives
defaults write NSGlobalDomain NSDisableAutomaticTermination -bool true

# Fenêtres d'aide non flottantes
defaults write com.apple.helpviewer DevMode -bool true

# Infos (IP, hostname, version) en cliquant sur l'horloge de l'écran de login
sudo defaults write /Library/Preferences/com.apple.loginwindow AdminHostInfo HostName

# ⚠️ Supprime le dialogue « Êtes-vous sûr d'ouvrir cette app téléchargée ? »
#    Fonctionne encore, mais affaiblit l'avertissement Gatekeeper au 1er lancement.
#    Commente la ligne si tu préfères garder l'alerte.
defaults write com.apple.LaunchServices LSQuarantine -bool false

# Coupe les corrections auto (gênantes pour coder)
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

###############################################################################
# Clavier, trackpad, langue                                                   #
###############################################################################

# Toucher pour cliquer (utilisateur + écran de login)
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
# Toucher deux fois pour glisser
defaults write com.apple.AppleMultitouchTrackpad Dragging -int 1

# Accès clavier complet (Tab dans les dialogues)
defaults write NSGlobalDomain AppleKeyboardUIMode -int 3

# Zoom via Ctrl (^) + molette, suit le focus clavier — [TCC]
defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true
defaults write com.apple.universalaccess HIDScrollZoomModifierMask -int 262144
defaults write com.apple.universalaccess closeViewZoomFollowsFocus -bool true

# Répétition clavier : rapide, pas de popover d'accents
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false
defaults write NSGlobalDomain KeyRepeat -int 3
defaults write NSGlobalDomain InitialKeyRepeat -int 15

# F1–F12 en vraies touches fonction (raccourcis IDE), pas média
defaults write NSGlobalDomain com.apple.keyboard.fnState -bool true

# Langue et formats FR
defaults write NSGlobalDomain AppleLanguages -array "fr"
defaults write NSGlobalDomain AppleLocale -string "fr_FR@currency=EUR"
defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
defaults write NSGlobalDomain AppleMetricUnits -bool true

# Menu de langue sur l'écran de login
sudo defaults write /Library/Preferences/com.apple.loginwindow showInputMenu -bool true

# Fuseau horaire — [TCC] (souvent déjà réglé ; échoue en Error:-99 sans Accès complet au disque)
sudo systemsetup -settimezone "Europe/Paris" > /dev/null 2>&1 || true

###############################################################################
# Écran                                                                       #
###############################################################################

# Mot de passe immédiat après veille / économiseur
defaults write com.apple.screensaver askForPassword -int 1
defaults write com.apple.screensaver askForPasswordDelay -int 0

# Captures d'écran : Bureau, PNG, sans ombre (l'ombre ne tient plus toujours en 26)
defaults write com.apple.screencapture location -string "${HOME}/Desktop"
defaults write com.apple.screencapture type -string "png"
defaults write com.apple.screencapture disable-shadow -bool true

# Modes HiDPI (nécessite un redémarrage)
sudo defaults write /Library/Preferences/com.apple.windowserver DisplayResolutionEnabled -bool true

###############################################################################
# Finder                                                                      #
###############################################################################

defaults write com.apple.finder QuitMenuItem -bool true
defaults write com.apple.finder DisableAllAnimations -bool true

# Nouvelle fenêtre Finder → Bureau
defaults write com.apple.finder NewWindowTarget -string "PfDe"
defaults write com.apple.finder NewWindowTargetPath -string "file://${HOME}/Desktop/"

# Icônes disques/serveurs/amovibles sur le Bureau
defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool true
defaults write com.apple.finder ShowMountedServersOnDesktop -bool true
defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool true

# Extensions, barres d'état/chemin, chemin POSIX en titre
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true

# Dossiers en premier au tri par nom, recherche dans le dossier courant
defaults write com.apple.finder _FXSortFoldersFirst -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Pas d'avertissement au changement d'extension
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

# Spring loading immédiat des dossiers
defaults write NSGlobalDomain com.apple.springing.enabled -bool true
defaults write NSGlobalDomain com.apple.springing.delay -float 0

# Pas de .DS_Store sur réseau / USB
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# Vue liste par défaut
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"

# AirDrop sur toutes les interfaces
defaults write com.apple.NetworkBrowser BrowseAllInterfaces -bool true

# Affiche ~/Library et /Volumes
chflags nohidden ~/Library 2>/dev/null || true
sudo chflags nohidden /Volumes 2>/dev/null || true

# Déplie les panneaux d'infos fichier
defaults write com.apple.finder FXInfoPanesExpanded -dict \
	General -bool true \
	OpenWith -bool true \
	Privileges -bool true

###############################################################################
# Dock                                                                        #
###############################################################################

defaults write com.apple.dock tilesize -int 36
defaults write com.apple.dock orientation -string "left"
defaults write com.apple.dock mineffect -string "scale"
defaults write com.apple.dock minimize-to-application -bool true
defaults write com.apple.dock enable-spring-load-actions-on-all-items -bool true
defaults write com.apple.dock show-process-indicators -bool true
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock expose-animation-duration -float 0.1
defaults write com.apple.dock expose-group-by-app -bool false
defaults write com.apple.dock mru-spaces -bool false
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0
defaults write com.apple.dock showhidden -bool true
defaults write com.apple.dock show-recents -bool false

# ⚠️ Vide le Dock de ses apps par défaut — utile sur une machine neuve,
#    mais réinitialise le Dock à chaque exécution. Commente si tu ne veux pas.
defaults write com.apple.dock persistent-apps -array

# Coins d'écran désactivés (0 = aucune action)
defaults write com.apple.dock wvous-tl-corner -int 0
defaults write com.apple.dock wvous-tl-modifier -int 0
defaults write com.apple.dock wvous-tr-corner -int 0
defaults write com.apple.dock wvous-tr-modifier -int 0
defaults write com.apple.dock wvous-bl-corner -int 0
defaults write com.apple.dock wvous-bl-modifier -int 0

###############################################################################
# Google Chrome                                                               #
###############################################################################

# Coupe le backswipe trop sensible (trackpad + Magic Mouse)
defaults write com.google.Chrome AppleEnableSwipeNavigateWithScrolls -bool false
defaults write com.google.Chrome AppleEnableMouseSwipeNavigateWithScrolls -bool false
# Dialogue d'impression natif, déplié
defaults write com.google.Chrome DisablePrintPreview -bool true
defaults write com.google.Chrome PMPrintingExpandedStateForPrint2 -bool true

###############################################################################
# Divers apps                                                                 #
###############################################################################

# Photos ne s'ouvre pas au branchement d'un appareil
defaults -currentHost write com.apple.ImageCapture disableHotPlug -bool true

# TextEdit en texte brut, UTF-8
defaults write com.apple.TextEdit RichText -int 0
defaults write com.apple.TextEdit PlainTextEncoding -int 4
defaults write com.apple.TextEdit PlainTextEncodingForWrite -int 4

# Messages : pas de substitutions (emoji/guillemets) ni correction continue
defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "automaticEmojiSubstitutionEnablediMessage" -bool false
defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "automaticQuoteSubstitutionEnabled" -bool false
defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "continuousSpellCheckingEnabled" -bool false

# Activity Monitor : fenêtre principale, icône = CPU, tous les process, tri CPU
defaults write com.apple.ActivityMonitor OpenMainWindow -bool true
defaults write com.apple.ActivityMonitor IconType -int 5
defaults write com.apple.ActivityMonitor ShowCategory -int 0
defaults write com.apple.ActivityMonitor SortColumn -string "CPUUsage"
defaults write com.apple.ActivityMonitor SortDirection -int 0
# Rafraîchissement plus fréquent (2 = toutes les 2 s)
defaults write com.apple.ActivityMonitor UpdatePeriod -int 2

# Time Machine : ne propose pas les nouveaux disques comme sauvegarde
defaults write com.apple.TimeMachine DoNotOfferNewDisksForBackup -bool true

###############################################################################
# Mises à jour logicielles                                                    #
###############################################################################

defaults write com.apple.SoftwareUpdate AutomaticCheckEnabled -bool true
defaults write com.apple.SoftwareUpdate ScheduleFrequency -int 1
defaults write com.apple.SoftwareUpdate AutomaticDownload -int 1
defaults write com.apple.SoftwareUpdate CriticalUpdateInstall -int 1
defaults write com.apple.commerce AutoUpdate -bool true

###############################################################################
# Confidentialité                                                             #
###############################################################################

# Désactive Apple Intelligence.
# ⚠️ Apple Silicon uniquement (Sequoia 15.3+) — sans effet sur Intel.
# ⚠️ L'ID de clé "545129924" peut changer après une mise à jour macOS.
defaults write com.apple.CloudSubscriptionFeatures.optIn "545129924" -bool false

###############################################################################
# Redémarre les apps affectées                                                #
###############################################################################

for app in "Activity Monitor" "cfprefsd" "Dock" "Finder" \
	"Google Chrome" "Photos" "SystemUIServer"; do
	killall "${app}" &> /dev/null || true
done

echo "✅  Réglages macOS appliqués. Certains nécessitent une déconnexion/redémarrage."
