export GROOVY_HOME=~/.sdkman/candidates/groovy/current
export GRADLE_OPTS="-Djava.awt.headless=true -Dapple.awt.UIElement=true"

export SBT_OPTS="-XX:+CMSClassUnloadingEnabled -XX:MaxPermSize=256M"

jenv enable-plugin export > /dev/null 2>&1
jenv enable-plugin maven > /dev/null 2>&1
jenv enable-plugin gradle > /dev/null 2>&1
jenv enable-plugin groovy > /dev/null 2>&1
jenv enable-plugin sbt > /dev/null 2>&1
jenv enable-plugin scala > /dev/null 2>&1
