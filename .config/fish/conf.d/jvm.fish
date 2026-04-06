# Java version manager (jenv)
set -gx JENV_ROOT $HOME/.jenv
fish_add_path $JENV_ROOT/bin
# Use implicit shell passing (not `-fish`, not portable across all jenv versions)
status is-interactive; and jenv init - | source

# Enable jenv plugins
jenv enable-plugin export >/dev/null 2>&1
jenv enable-plugin maven >/dev/null 2>&1
jenv enable-plugin gradle >/dev/null 2>&1
jenv enable-plugin groovy >/dev/null 2>&1
jenv enable-plugin sbt >/dev/null 2>&1
jenv enable-plugin scala >/dev/null 2>&1

# JVM tooling
set -gx GROOVY_HOME ~/.sdkman/candidates/groovy/current
set -gx GRADLE_OPTS "-Djava.awt.headless=true -Dapple.awt.UIElement=true"
set -gx SBT_OPTS "-XX:+CMSClassUnloadingEnabled -XX:MaxPermSize=256M"

# SDKMAN — requires bass (no native fish support)
# Guard: sdkman-init.sh is slow and interactive-only; crashes non-interactive subshells
set -gx SDKMAN_DIR $HOME/.sdkman
if status is-interactive
    bass source $SDKMAN_DIR/bin/sdkman-init.sh 2>/dev/null
end
