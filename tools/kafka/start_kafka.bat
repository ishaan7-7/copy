@echo off

set JAVA_HOME=C:\jdk-11.0.28+6
set PATH=%JAVA_HOME%\bin;%PATH%

cd /d C:\kafka

set KAFKA_HEAP_OPTS=-Xmx512m -Xms256m

echo Starting Kafka broker (heap capped at 512m)...
bin\windows\kafka-server-start.bat config\server.properties
