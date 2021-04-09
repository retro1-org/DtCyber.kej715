const fs = require("fs");
const http = require("http");
const PortMapper = require("./portmapper");
const StkCSI = require("./stkcsi");
const url = require("url");

const configFile = (process.argv.length > 2) ? process.argv[2] : "config.json";
const config = JSON.parse(fs.readFileSync(configFile));

const volumesFile = (process.argv.length > 3) ? process.argv[3] : "volumes.json";
let volumeMap = JSON.parse(fs.readFileSync(volumesFile));

const portMapper = new PortMapper();
if (config.portMapperUdpPort) portMapper.setUdpPort(config.portMapperUdpPort);
if (config.debug) portMapper.setDebug(config.debug);
portMapper.start();

const stkcsi = new StkCSI();
stkcsi.setVolumeMap(volumeMap);
if (config.tapeServerPort) stkcsi.setTapeServerPort(config.tapeServerPort);
if (config.tapeLibraryRoot) stkcsi.setTapeLibraryRoot(config.tapeLibraryRoot);
if (config.debug) stkcsi.setDebug(config.debug);
stkcsi.start();

const logHttpRequest = (req, status) => {
  console.log(`${new Date().toLocaleString()} HTTP ${req.socket.remoteAddress} ${status} ${req.method} ${req.url}`);
};

const httpServer = http.createServer((req, res) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, GET",
    "Access-Control-Allow-Headers": "X-Requested-With, Content-Type",
    "Access-Control-Max-Age": 2592000, // 30 days
  };
  if (req.method === "GET") {
    let u = url.parse(req.url, true);
    if (u.pathname === "/volumes") {
      let headers = {"Content-Type":"application/json"};
      Object.keys(corsHeaders).forEach(key => {
        headers[key] = corsHeaders[key];
      });
      res.writeHead(200, headers);
      res.write(JSON.stringify(stkcsi.volumeMap));
      res.end();
      logHttpRequest(req, 200);
    }
    else {
      res.writeHead(404);
      res.end();
      logHttpRequest(req, 404);
    }
  }
  else if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    logHttpRequest(req, 204);
  }
  else {
    res.writeHead(501);
    res.end();
    logHttpRequest(req, 501);
  }
});

const httpServerPort = config.httpServerPort ? config.httpServerPort : 8080;
httpServer.listen(httpServerPort);
console.log(`${new Date().toLocaleString()} HTTP server listening on port ${httpServerPort}`);

fs.watch(volumesFile, (eventType, filename) => {
  if (eventType === "change") {
    volumeMap = JSON.parse(fs.readFileSync(filename));
    Object.keys(volumeMap).forEach(key => {
      if (typeof stkcsi.volumeMap[key] !== "undefined") {
        let volume = volumeMap[key];
        let updatedAttrs = [];
        Object.keys(volume).forEach(attrName => {
          if (stkcsi.volumeMap[key][attrName] !== volume[attrName]) {
            updatedAttrs.push(attrName);
          }
          stkcsi.volumeMap[key][attrName] = volume[attrName];
        });
        if (updatedAttrs.length > 0) {
          console.log(`${new Date().toLocaleString()} Updated ${updatedAttrs.join(",")} of VSN ${key} in tape library`);
        }
      }
      else {
        stkcsi.volumeMap[key] = volumeMap[key];
        console.log(`${new Date().toLocaleString()} Added VSN ${key} to tape library`);
      }
    });
  }
});