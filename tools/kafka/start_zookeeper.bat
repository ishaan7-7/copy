@echo off

set JAVA_HOME=C:\jdk-11.0.28+6
set PATH=%JAVA_HOME%\bin;%PATH%

cd /d C:\kafka

set KAFKA_HEAP_OPTS=-Xmx256m -Xms128m

echo Starting Zookeeper (heap capped at 256m)...
bin\windows\zookeeper-server-start.bat config\zookeeper.properties
