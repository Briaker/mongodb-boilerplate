**Requires that MongoDB is already installed**

Change dbPath and logPath in mongod.cfg to where your log and data folders are located.

**Install service:**
"C:\Program Files\MongoDB\Server\3.6\bin\mongod.exe" --config "C:\dbs\express-api\mongod.cfg" --install --serviceName "Express API" --serviceDisplayName "Express API"

**Start service:**
net start "Express API"

**Remove service:**
"C:\Program Files\MongoDB\Server\3.6\bin\mongod.exe" --config "C:\dbs\express-api\mongod.cfg" --remove --serviceName "Express API" --serviceDisplayName "Express API"
