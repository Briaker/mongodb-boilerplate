Install MongoDB for windows
Change dbPath and logPath in mongod.cfg

Run command to install service:
"C:\Program Files\MongoDB\Server\3.6\bin\mongod.exe" --config "C:\dbs\express-api\mongod.cfg" --install --serviceName "Express API" --serviceDisplayName "Express API"

To remove service:
"C:\Program Files\MongoDB\Server\3.6\bin\mongod.exe" --config "C:\dbs\express-api\mongod.cfg" --remove --serviceName "Express API" --serviceDisplayName "Express API"

net start "Express API"