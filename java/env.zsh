export JAVA_HOME=$(/usr/libexec/java_home)

# jEnv configuration.
export PATH="$HOME/.jenv/bin:$PATH"
eval "$(jenv init -)"

jenv enable-plugin maven > /dev/null 2>&1
jenv enable-plugin gradle > /dev/null 2>&1
jenv enable-plugin groovy > /dev/null 2>&1
jenv enable-plugin sbt > /dev/null 2>&1
jenv enable-plugin scala > /dev/null 2>&1
